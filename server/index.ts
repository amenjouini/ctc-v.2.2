/**
 * Authoritative room server — the transport around shared/room.ts.
 *
 * One process serves:
 *   GET  /healthz   liveness for the host platform
 *   WS   /ws        the game protocol (shared/protocol.ts)
 *   GET  /*         the built web client from dist/, if present
 *
 * so a single deploy gives players one origin (no CORS, no mixed content).
 * The client can also point at a separate server via VITE_WS_URL.
 *
 * Environment:
 *   PORT               listen port (default 8787)
 *   HOST               bind address (default 0.0.0.0)
 *   ALLOWED_ORIGINS    extra origins allowed to open a socket, comma-
 *                      separated, e.g. https://play.example.com. Unset =
 *                      same origin only (the page this server serves).
 *                      "*" = any origin.
 *   STATIC_DIR         built client to serve (default ./dist when it exists)
 *   SEAT_GRACE_MS      how long a dropped player's seat is held (default 3 min)
 *   MAX_ROOMS          refuse new tables beyond this (default 5000)
 *   TRUST_PROXY        1 = read the player's address from X-Forwarded-For
 *                      (default on when running on Render)
 *   MAX_SOCKETS_PER_IP open sockets one address may hold (default 12)
 *   JOIN_FAILS_PER_IP  wrong table codes one address may try per 10 minutes
 *                      before joining is refused for a while (default 20)
 *   HEALTH_KEY         /healthz?key=... also shows table and socket counts
 *   CONNECT_SRC        extra socket origins for the page's security policy,
 *                      when the client talks to a server elsewhere
 *                      (e.g. wss://rooms.example.com)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { isRoomCode, normaliseRoom } from "../shared/engine";
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ErrorCode,
  type Seat,
  type ServerMessage,
} from "../shared/protocol";
import * as R from "../shared/room";
import { OpenCount, WindowLimit, clientIp } from "./limits";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const SEAT_GRACE_MS = Number(process.env.SEAT_GRACE_MS ?? 1000 * 60 * 3);
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 5000);
/** rooms with no live socket are swept after this long */
const EMPTY_ROOM_TTL_MS = 1000 * 60 * 30;
const HEARTBEAT_MS = 20_000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Per-socket flood control: a burst of RATE_BURST, refilled at RATE_PER_SEC. */
const RATE_BURST = 20;
const RATE_PER_SEC = 5;

/**
 * Table codes are short enough to guess, so guessing is made slow: each
 * address holds a few sockets at most, each socket is closed after a handful
 * of wrong codes, and an address that keeps missing is refused for a while.
 */
const TRUST_PROXY = (process.env.TRUST_PROXY ?? (process.env.RENDER ? "1" : "0")) === "1";
const ipSockets = new OpenCount(Number(process.env.MAX_SOCKETS_PER_IP ?? 12));
const joinFails = new WindowLimit(Number(process.env.JOIN_FAILS_PER_IP ?? 20), 10 * 60_000);
const FAILS_PER_SOCKET = 6;
/** error and feedback reports, per address */
const reports = new WindowLimit(20, 10 * 60_000);
const HEALTH_KEY = process.env.HEALTH_KEY ?? "";
/** what a wrong guess at a table code looks like */
const PROBE_ERRORS: readonly ErrorCode[] = ["no_room", "room_exists", "room_full"];

interface Conn {
  socket: WebSocket;
  ip: string;
  /** wrong table codes tried on this socket */
  fails: number;
  room: string | null;
  seat: Seat | null;
  alive: boolean;
  tokens: number;
  refilledAt: number;
  strikes: number;
}

const rooms = new Map<string, R.RoomState>();
const conns = new Set<Conn>();
/** which socket currently speaks for each seat */
const sockets = new Map<string, Partial<Record<Seat, Conn>>>();

function send(conn: Conn | undefined, msg: ServerMessage) {
  if (conn && conn.socket.readyState === WebSocket.OPEN) conn.socket.send(JSON.stringify(msg));
}

function sendError(conn: Conn, code: ErrorCode, reason: string) {
  send(conn, { t: "error", code, reason });
}

/** A refused join. Wrong codes count against the socket and the address. */
function refuseJoin(conn: Conn, code: ErrorCode, reason: string) {
  sendError(conn, code, reason);
  if (!PROBE_ERRORS.includes(code)) return;
  joinFails.hit(conn.ip, Date.now());
  if (++conn.fails >= FAILS_PER_SOCKET) conn.socket.close(1008, "too many wrong codes");
}

function broadcast(room: R.RoomState) {
  const seats = sockets.get(room.code) ?? {};
  for (const seat of R.SEATS) {
    if (room.players[seat] && seats[seat]) send(seats[seat], { t: "state", view: R.viewFor(room, seat) });
  }
}

function detach(conn: Conn) {
  if (!conn.room || !conn.seat) return;
  const seats = sockets.get(conn.room);
  if (seats?.[conn.seat] === conn) delete seats[conn.seat];
  conn.room = null;
  conn.seat = null;
}

function rateOk(conn: Conn): boolean {
  const now = Date.now();
  conn.tokens = Math.min(RATE_BURST, conn.tokens + ((now - conn.refilledAt) / 1000) * RATE_PER_SEC);
  conn.refilledAt = now;
  if (conn.tokens < 1) return false;
  conn.tokens -= 1;
  return true;
}

function onJoin(conn: Conn, msg: Extract<ReturnType<typeof parseClientMessage>, { t: "join" }>) {
  if (msg.v !== PROTOCOL_VERSION) {
    return sendError(conn, "version", "The game has been updated. Refresh the page to keep playing.");
  }
  const code = normaliseRoom(msg.room);
  if (!isRoomCode(code)) return sendError(conn, "bad_room", "That is not a valid table code.");

  // A socket belongs to one seat at a time. Re-joining the same table just
  // resyncs; joining a different one lets go of the old seat first.
  if (conn.room === code && conn.seat) {
    const current = rooms.get(code);
    const p = current?.players[conn.seat];
    if (current && p) return send(conn, { t: "joined", view: R.viewFor(current, conn.seat), token: p.token });
  }
  if (conn.room) onLeaveSocket(conn);

  let room = rooms.get(code);
  const tokenMatches = Boolean(room && msg.token && R.SEATS.some((s) => room!.players[s]?.token === msg.token));
  // A player reclaiming their own seat is never held back; anyone else from
  // an address that has missed too often waits.
  if (!tokenMatches && joinFails.blocked(conn.ip, Date.now())) {
    return sendError(conn, "too_many", "Too many wrong table codes. Wait a few minutes and try again.");
  }
  if (!room) {
    if (!msg.create) return refuseJoin(conn, "no_room", "No table with that code is open.");
    if (rooms.size >= MAX_ROOMS) return sendError(conn, "busy", "The server is full right now. Try again shortly.");
    room = R.createRoom(code, Date.now());
    rooms.set(code, room);
  } else if (msg.create && !tokenMatches) {
    return refuseJoin(conn, "room_exists", "That table code is already taken.");
  }

  const res = R.join(room, { name: msg.name, token: msg.token, resume: msg.resume }, Date.now(), () =>
    crypto.randomBytes(18).toString("base64url"),
  );
  if (!res.ok) return refuseJoin(conn, res.code, res.reason);

  const seats = sockets.get(code) ?? {};
  sockets.set(code, seats);
  const previous = seats[res.seat];
  if (previous && previous !== conn) {
    // Same player, newer socket (a refresh, a phone waking up). The old one
    // is told why it lost the seat and is closed.
    sendError(previous, "replaced", "This table was opened in another tab or window.");
    previous.room = null;
    previous.seat = null;
    previous.socket.close(4000, "replaced");
  }
  seats[res.seat] = conn;
  conn.room = code;
  conn.seat = res.seat;

  send(conn, { t: "joined", view: R.viewFor(room, res.seat), token: res.token });
  broadcast(room);
}

/** The socket went away without saying goodbye; hold the seat. */
function onLeaveSocket(conn: Conn) {
  const room = conn.room ? rooms.get(conn.room) : undefined;
  const seat = conn.seat;
  const seats = conn.room ? sockets.get(conn.room) : undefined;
  const owned = seat && seats?.[seat] === conn;
  detach(conn);
  if (room && seat && owned) {
    R.disconnect(room, seat, Date.now());
    broadcast(room);
  }
}

function handle(conn: Conn, raw: string) {
  const msg = parseClientMessage(raw);
  if (!msg) return sendError(conn, "bad_message", "That message was not understood.");

  if (msg.t === "ping") return send(conn, { t: "pong" });
  if (msg.t === "join") return onJoin(conn, msg);

  const room = conn.room ? rooms.get(conn.room) : undefined;
  const seat = conn.seat;
  if (!room || !seat) return sendError(conn, "not_now", "Join a table first.");

  let res: R.Result;
  switch (msg.t) {
    case "setSecret":
      res = R.setSecret(room, seat, msg.code);
      break;
    case "guess":
      res = R.guess(room, seat, msg.guess);
      break;
    case "rematch":
      res = R.requestRematch(room, seat);
      break;
    case "chat":
      res = R.say(room, seat, msg.text);
      break;
    case "leave":
      detach(conn);
      R.leave(room, seat);
      broadcast(room);
      return;
  }
  if (!res.ok) {
    sendError(conn, res.code, res.reason);
    // Always follow a refusal with the truth, so a client that acted on a
    // stale view snaps back to the real state.
    send(conn, { t: "state", view: R.viewFor(room, seat) });
    return;
  }
  broadcast(room);
}

// ---------------------------------------------------------------- HTTP

/**
 * Everything the built client loads comes from this server: its files, its
 * font, and the game socket on this same host (named explicitly, since older
 * Safari does not count ws:/wss: as 'self'). Inline styles are
 * framer-motion's animated style attributes.
 */
const CONNECT_EXTRA = (process.env.CONNECT_SRC ?? "").split(/[\s,]+/).filter(Boolean);
function csp(host: string | undefined, https: boolean): string {
  const sockets = host && /^[a-z0-9.:[\]-]+$/i.test(host) ? [`${https ? "wss" : "ws"}://${host}`] : [];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    ["connect-src 'self'", ...sockets, ...CONNECT_EXTRA].join(" "),
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function publicHost(req: http.IncomingMessage): string | undefined {
  const fwd = req.headers["x-forwarded-host"];
  return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0].trim() || req.headers.host;
}

const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? "dist");
const HAS_STATIC = fs.existsSync(path.join(STATIC_DIR, "index.html"));
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = path.resolve(STATIC_DIR, "." + rel);
  // No escaping the static root.
  const inside = file === STATIC_DIR || file.startsWith(STATIC_DIR + path.sep);
  const exists = inside && fs.existsSync(file) && fs.statSync(file).isFile();
  // Unknown paths are client-side routes (/room/ABCDE) — serve the app.
  const target = exists ? file : path.join(STATIC_DIR, "index.html");
  const hashed = exists && rel.startsWith("/assets/");
  const https = req.headers["x-forwarded-proto"] === "https";
  const headers: http.OutgoingHttpHeaders = {
    "Content-Type": TYPES[path.extname(target)] ?? "application/octet-stream",
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
  if (target.endsWith(".html")) {
    headers["Content-Security-Policy"] = csp(publicHost(req), https);
    headers["X-Frame-Options"] = "DENY";
  }
  if (https) headers["Strict-Transport-Security"] = "max-age=15552000";
  res.writeHead(200, headers);
  if (req.method === "HEAD") return void res.end();
  fs.createReadStream(target).pipe(res);
}

/**
 * POST /api/report: a crash in a player's browser, or a note from the
 * feedback form. Written to the server log as one JSON line, which is where
 * the host's log viewer (or a log drain) picks it up. Nothing is stored here.
 */
const REPORT_MAX = 4 * 1024;
function onReport(req: http.IncomingMessage, res: http.ServerResponse) {
  const ip = clientIp(req.headers, req.socket.remoteAddress, TRUST_PROXY);
  const done = (status: number) => res.writeHead(status, { "Cache-Control": "no-store" }).end();
  const origin = req.headers.origin;
  if (!originAllowed(origin, publicHost(req), ALLOWED_ORIGINS)) return done(403);
  if (!reports.hit(ip, Date.now())) return done(429);
  let body = "";
  let size = 0;
  req.setEncoding("utf8");
  req.on("data", (chunk: string) => {
    size += chunk.length;
    if (size > REPORT_MAX) {
      done(413);
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on("end", () => {
    if (res.headersSent) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return done(400);
    }
    const r = parsed as Record<string, unknown>;
    const kind = r.kind === "feedback" ? "feedback" : r.kind === "error" ? "error" : null;
    if (!kind) return done(400);
    // Only plain short strings are kept; the address is not logged.
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    console.log(
      `[crack-the-code] ${kind} ` +
        JSON.stringify({
          message: clip(r.message, 1500),
          stack: clip(r.stack, 2000),
          page: clip(r.page, 200),
          version: clip(r.version, 40),
          lang: clip(r.lang, 8),
          ua: clip(req.headers["user-agent"], 200),
        }),
    );
    done(204);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const pathname = url.pathname;
  if (pathname === "/healthz") {
    // Counts only for whoever holds the key: they say how busy the game is.
    const full = HEALTH_KEY && url.searchParams.get("key") === HEALTH_KEY;
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(full ? { ok: true, rooms: rooms.size, sockets: wss.clients.size } : { ok: true }));
    return;
  }
  if (pathname === "/api/report") {
    if (req.method !== "POST") return void res.writeHead(405, { Allow: "POST" }).end();
    return onReport(req, res);
  }
  if (HAS_STATIC && (req.method === "GET" || req.method === "HEAD")) return serveStatic(req, res);
  res.writeHead(404, { "Content-Type": "text/plain" }).end("Crack the Code room server");
});

/**
 * Which pages may open a game socket. Browsers always send Origin, so this
 * is what stops some other website from opening sockets to this server in
 * its visitors' browsers. By default only the page this server itself
 * serves is allowed (same host), which is right for the one-service deploy
 * with no configuration at all. A client hosted elsewhere is added with
 * ALLOWED_ORIGINS. Non-browser clients (a future native app, tests) send no
 * Origin and are allowed: there are no cookies or ambient credentials for
 * them to abuse — a seat is only ever reclaimed with its own token.
 */
function originAllowed(origin: string | undefined, host: string | undefined, allowed: string[]): boolean {
  if (allowed.includes("*") || origin === undefined) return true;
  if (allowed.includes(origin)) return true;
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 4 * 1024,
  verifyClient: ({ origin, req }: { origin?: string; req: http.IncomingMessage }) => {
    // Behind a proxy the public host arrives in X-Forwarded-Host.
    const ok = originAllowed(origin, publicHost(req), ALLOWED_ORIGINS);
    if (!ok) console.warn(`[crack-the-code] refused socket from origin ${origin}`);
    return ok;
  },
});

wss.on("connection", (socket, req) => {
  const ip = clientIp(req.headers, req.socket.remoteAddress, TRUST_PROXY);
  if (!ipSockets.take(ip)) {
    socket.close(1008, "too many connections");
    return;
  }
  const conn: Conn = {
    socket,
    ip,
    fails: 0,
    room: null,
    seat: null,
    alive: true,
    tokens: RATE_BURST,
    refilledAt: Date.now(),
    strikes: 0,
  };

  conns.add(conn);
  socket.on("pong", () => (conn.alive = true));

  socket.on("message", (data, isBinary) => {
    conn.alive = true;
    if (isBinary) return;
    if (!rateOk(conn)) {
      if (++conn.strikes > 50) socket.close(1008, "flood");
      else sendError(conn, "rate_limited", "Slow down a little.");
      return;
    }
    try {
      handle(conn, String(data));
    } catch (err) {
      // A bug in one message must never take down every other table.
      console.error("[crack-the-code] handler error", err);
      sendError(conn, "bad_message", "Something went wrong handling that.");
    }
  });

  socket.on("close", () => {
    conns.delete(conn);
    ipSockets.give(ip);
    try {
      onLeaveSocket(conn);
    } catch (err) {
      console.error("[crack-the-code] close error", err);
    }
  });
  socket.on("error", () => socket.terminate());
});

// Half-open sockets (a phone that lost signal) never fire "close" on their
// own; a missed ping frees the seat's socket so the opponent sees the drop.
const heartbeat = setInterval(() => {
  for (const conn of conns) {
    if (!conn.alive) {
      conn.socket.terminate();
      continue;
    }
    conn.alive = false;
    conn.socket.ping();
  }
}, HEARTBEAT_MS);

const sweep = setInterval(() => {
  const now = Date.now();
  joinFails.sweep(now);
  reports.sweep(now);
  for (const [code, room] of rooms) {
    const expired = R.expiredSeats(room, now, SEAT_GRACE_MS);
    if (expired.length) {
      for (const s of expired) R.leave(room, s);
      broadcast(room);
    }
    if (R.isDeserted(room, now, EMPTY_ROOM_TTL_MS) || (!room.players.host && !room.players.guest)) {
      rooms.delete(code);
      sockets.delete(code);
    }
  }
}, 10_000);

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(sweep);
  for (const ws of wss.clients) ws.close(1012, "restarting");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(PORT, HOST, () => {
  console.log(
    `[crack-the-code] listening on http://${HOST}:${PORT} (ws path /ws${HAS_STATIC ? `, serving ${STATIC_DIR}` : ""})`,
  );
  console.log(
    `[crack-the-code] sockets accepted from: same origin${
      ALLOWED_ORIGINS.includes("*") ? " + ANY origin (ALLOWED_ORIGINS=*)" : ALLOWED_ORIGINS.length ? ` + ${ALLOWED_ORIGINS.join(", ")}` : " only"
    }`,
  );
});
