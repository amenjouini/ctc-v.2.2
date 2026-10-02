import { useCallback, useEffect, useRef, useState } from "react";
import type { Code } from "@shared/engine";
import {
  FATAL_ERRORS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type RoomView,
  type ServerMessage,
} from "@shared/protocol";

export type Link = "connecting" | "live" | "lost" | "closed";

/**
 * Where the room server lives. In development Vite proxies /ws, and in a
 * single-origin deploy the server serves the client itself, so the default
 * is the page's own origin. A split deploy (static host + separate server)
 * sets VITE_WS_URL at build time.
 */
export function socketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return configured;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/**
 * Seat tokens. sessionStorage is per tab and survives a refresh, so it is a
 * "hard" claim: this tab owned the seat. localStorage is shared by every
 * tab, so it is only a "soft" claim — enough to get back in after closing
 * the tab, never enough to kick out another live tab.
 */
const tokenKey = (room: string) => `ctc.seat.${room}`;
function readToken(room: string): { token?: string; resume?: "hard" | "soft" } {
  try {
    const hard = sessionStorage.getItem(tokenKey(room));
    if (hard) return { token: hard, resume: "hard" };
    const soft = localStorage.getItem(tokenKey(room));
    if (soft) return { token: soft, resume: "soft" };
  } catch {
    /* storage blocked: every visit is a new player */
  }
  return {};
}
function writeToken(room: string, token: string) {
  try {
    sessionStorage.setItem(tokenKey(room), token);
    localStorage.setItem(tokenKey(room), token);
  } catch {
    /* ignore */
  }
}
/** This device already holds (or held) a seat at the table. */
export function hasSeat(room: string): boolean {
  return Boolean(readToken(room).token);
}

function dropToken(room: string) {
  try {
    sessionStorage.removeItem(tokenKey(room));
    localStorage.removeItem(tokenKey(room));
  } catch {
    /* ignore */
  }
}

export interface RoomError {
  code: ErrorCode;
  reason: string;
  /** reconnecting cannot fix it */
  fatal: boolean;
}

interface Options {
  room: string;
  name: string;
  /** this client is opening a new table rather than joining one */
  create: boolean;
  /** false holds the connection until the player has chosen a name */
  enabled: boolean;
}

/**
 * Owns the socket and reduces server events into state.
 *
 * The client is a thin renderer: it never scores a guess and never holds the
 * opponent's secret. Everything it displays came from the server.
 */
export function useRoom({ room, name, create, enabled }: Options) {
  const [view, setView] = useState<RoomView | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [error, setError] = useState<RoomError | null>(null);
  /** an action is in flight; the UI holds input until the server answers */
  const [pending, setPending] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const createRef = useRef(create);
  const reopening = useRef(false);

  useEffect(() => {
    createRef.current = create;
  }, [create]);

  useEffect(() => {
    if (!enabled || !room) return;
    setView((v) => (v && v.code !== room ? null : v));
    setError(null);
    setLink("connecting");
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let pongTimer: number | undefined;

    const connect = () => {
      window.clearTimeout(retryTimer);
      if (stopped) return;
      const sock = new WebSocket(socketUrl());
      ws.current = sock;

      sock.onopen = () => {
        const claim = readToken(room);
        const msg: ClientMessage = {
          t: "join",
          v: PROTOCOL_VERSION,
          room,
          name: nameRef.current,
          ...claim,
          create: createRef.current || reopening.current,
        };
        sock.send(JSON.stringify(msg));
      };

      sock.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === "pong") {
          window.clearTimeout(pongTimer);
          return;
        }
        if (msg.t === "error") {
          setPending(false);
          if (msg.code === "room_exists" && reopening.current) {
            // Someone reopened the table first; just join it.
            reopening.current = false;
            createRef.current = false;
            sock.send(JSON.stringify({ t: "join", v: PROTOCOL_VERSION, room, name: nameRef.current, ...readToken(room) }));
            return;
          }
          const fatal = FATAL_ERRORS.includes(msg.code);
          setError({ code: msg.code, reason: msg.reason, fatal });
          if (fatal) {
            stopped = true;
            setLink("closed");
            if (msg.code === "no_room" || msg.code === "room_full") dropToken(room);
            sock.close();
          }
          return;
        }
        if (msg.t === "joined") {
          writeToken(room, msg.token);
          attempt = 0;
          // From here on a reconnect is a resume, never a fresh create.
          createRef.current = false;
          reopening.current = false;
          setLink("live");
          setError(null);
        }
        setPending(false);
        setView(msg.view);
      };

      sock.onclose = () => {
        if (ws.current === sock) ws.current = null;
        window.clearTimeout(pongTimer);
        setPending(false);
        if (stopped) return;
        setLink("lost");
        // The room holds our seat and our secret, so a reconnect resumes the
        // match exactly where it stopped. Back off so a dead server is not
        // hammered by every open tab at once.
        const delay = Math.min(8000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
        attempt++;
        retryTimer = window.setTimeout(connect, delay);
      };

      sock.onerror = () => sock.close();
    };

    /** A phone waking up, or the network coming back: check the socket is
     *  really alive instead of waiting for a timeout that may take minutes. */
    const probe = () => {
      if (stopped || document.visibilityState === "hidden") return;
      const sock = ws.current;
      if (!sock || sock.readyState === WebSocket.CLOSED || sock.readyState === WebSocket.CLOSING) {
        attempt = 0;
        connect();
        return;
      }
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ t: "ping" } satisfies ClientMessage));
        window.clearTimeout(pongTimer);
        pongTimer = window.setTimeout(() => sock.close(), 4000);
      }
    };

    // Deferred a tick so React StrictMode's mount/unmount/mount in
    // development never opens a socket that is immediately abandoned.
    retryTimer = window.setTimeout(connect, 0);
    window.addEventListener("online", probe);
    document.addEventListener("visibilitychange", probe);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(pongTimer);
      window.removeEventListener("online", probe);
      document.removeEventListener("visibilitychange", probe);
      ws.current?.close();
      ws.current = null;
    };
  }, [room, enabled, epoch]);

  // Transient refusals ("not your turn") fade on their own.
  useEffect(() => {
    if (!error || error.fatal) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const sock = ws.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return false;
    sock.send(JSON.stringify(msg));
    return true;
  }, []);

  const act = useCallback(
    (msg: ClientMessage) => {
      const ok = send(msg);
      if (ok) setPending(true);
      return ok;
    },
    [send],
  );

  const setSecret = useCallback((code: Code) => act({ t: "setSecret", code }), [act]);
  const guess = useCallback((g: Code) => act({ t: "guess", guess: g }), [act]);
  const rematch = useCallback(() => send({ t: "rematch" }), [send]);

  /** Give up the seat for good, so the rival is told at once. */
  const leave = useCallback(() => {
    send({ t: "leave" });
    dropToken(room);
  }, [send, room]);

  /** Start over after a fatal error — optionally reopening a closed table. */
  const retry = useCallback((reopen = false) => {
    reopening.current = reopen;
    setError(null);
    setView(null);
    setLink("connecting");
    setEpoch((e) => e + 1);
  }, []);

  return { view, link, error, pending, setSecret, guess, rematch, leave, retry };
}
