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

interface Conn {
  socket: WebSocket;
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
  if (!room) {
    if (!msg.create) return sendError(conn, "no_room", "No table with that code is open.");
    if (rooms.size >= MAX_ROOMS) return sendError(conn, "busy", "The server is full right now. Try again shortly.");
    room = R.createRoom(code, Date.now());
    rooms.set(code, room);
  } else if (msg.create && !tokenMatches) {
    return sendError(conn, "room_exists", "That table code is already taken.");
  }

  const res = R.join(room, { name: msg.name, token: msg.token, resume: msg.resume }, Date.now(), () =>
    crypto.randomBytes(18).toString("base64url"),
  );
  if (!res.ok) return sendError(conn, res.code, res.reason);

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

/** Everything the built client loads: its own files, Google Fonts, and the
 *  game socket. Inline styles are framer-motion's animated style attributes. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
  ".txt": "text/plain; charset=utf-8",
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
  const headers: http.OutgoingHttpHeaders = {
    "Content-Type": TYPES[path.extname(target)] ?? "application/octet-stream",
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  };
  if (target.endsWith(".html")) {
    headers["Content-Security-Policy"] = CSP;
    headers["X-Frame-Options"] = "DENY";
  }
  if (req.headers["x-forwarded-proto"] === "https") headers["Strict-Transport-Security"] = "max-age=15552000";
  res.writeHead(200, headers);
  if (req.method === "HEAD") return void res.end();
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0];
  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, sockets: wss.clients.size }));
    return;
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
    const fwd = req.headers["x-forwarded-host"];
    const host = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0].trim() || req.headers.host;
    const ok = originAllowed(origin, host, ALLOWED_ORIGINS);
    if (!ok) console.warn(`[crack-the-code] refused socket from origin ${origin}`);
    return ok;
  },
});

wss.on("connection", (socket) => {
  const conn: Conn = {
    socket,
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
