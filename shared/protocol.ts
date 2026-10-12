/**
 * Every message on the wire, as a discriminated union. Both ends import
 * this, so a typo becomes a compile error rather than a 2am bug.
 *
 * The server is authoritative: it holds BOTH secrets and does ALL scoring.
 * Clients send intent and receive truth — a secret never crosses the wire
 * until the match is over, which makes cheating impossible rather than
 * merely detectable.
 *
 * Nothing here touches the DOM or a socket implementation, so a native
 * client can speak the same protocol by porting this one file.
 */

import { CODE_LENGTH, isRoomCode, type Code, type Verdict } from "./engine";

/** Bumped whenever a message shape changes incompatibly. A stale client
 *  (an old tab, an app build that has not updated) is told to refresh
 *  instead of failing in confusing ways. */
export const PROTOCOL_VERSION = 3;

export const NAME_MAX = 18;
/** longest chat message, and how many the room remembers */
export const CHAT_MAX = 60;
export const CHAT_KEEP = 30;

export type Seat = "host" | "guest";
export type Phase = "lobby" | "setup" | "play" | "over";
export type Outcome = "win" | "loss";

export interface Turn {
  by: Seat;
  guess: Code;
  verdict: Verdict;
  round: number;
}

export interface PlayerInfo {
  name: string;
  /** a live socket is attached right now */
  connected: boolean;
  /** has locked in a secret for this match */
  ready: boolean;
  /** has asked for a rematch after the match ended */
  wantsRematch: boolean;
}

/** One line of table talk, as one player sees it. */
export interface ChatLine {
  id: number;
  /** you said it (otherwise your rival did) */
  mine: boolean;
  text: string;
}

/** What one client is allowed to know about the match. */
export interface RoomView {
  code: string;
  seat: Seat;
  phase: Phase;
  round: number;
  turn: Seat;
  /** who opens every round of this match */
  firstMover: Seat;
  you: PlayerInfo;
  /** null while the other seat is empty */
  opponent: PlayerInfo | null;
  /** your own secret, echoed back so a refresh can restore it */
  yourSecret: Code | null;
  /** your guesses at their code */
  yourHunt: Turn[];
  /** their guesses at your code */
  theirHunt: Turn[];
  /** table talk with the current rival, oldest first */
  chat: ChatLine[];
  /** only populated once phase === "over" */
  outcome: Outcome | null;
  revealedSecrets: { host: Code; guest: Code } | null;
}

/**
 * "hard" resumes a seat even if another socket still holds it — that other
 * socket is a zombie from the same tab (a phone that slept, a refresh that
 * raced the old close). "soft" only resumes a seat nobody is using, so a
 * second tab in the same browser joins as a new player instead of kicking
 * the first one out.
 */
export type Resume = "hard" | "soft";

export type ClientMessage =
  | {
      t: "join";
      v: number;
      room: string;
      name: string;
      token?: string;
      resume?: Resume;
      /** true only when this client is opening a brand-new table */
      create?: boolean;
    }
  | { t: "setSecret"; code: Code }
  | { t: "guess"; guess: Code }
  | { t: "rematch" }
  | { t: "chat"; text: string }
  | { t: "leave" }
  | { t: "ping" };

export type ErrorCode =
  | "bad_message"
  | "version"
  | "bad_room"
  | "no_room"
  | "room_exists"
  | "room_full"
  | "replaced"
  | "busy"
  | "bad_code"
  | "not_now"
  | "rate_limited";

/** Errors after which reconnecting to the same room cannot help. */
export const FATAL_ERRORS: readonly ErrorCode[] = [
  "version",
  "bad_room",
  "no_room",
  "room_exists",
  "room_full",
  "replaced",
  "busy",
];

export type ServerMessage =
  | { t: "joined"; view: RoomView; token: string }
  | { t: "state"; view: RoomView }
  | { t: "error"; code: ErrorCode; reason: string }
  | { t: "pong" };

/** Strip control characters and collapse whitespace; never trust text
 *  from the network. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanName(raw: unknown): string {
  return cleanText(raw, NAME_MAX);
}

/** Four single-character strings. Whether they form a LEGAL code is the
 *  room's call (so it can answer "not a legal code" rather than ignore it). */
function asFour(raw: unknown): Code | null {
  if (!Array.isArray(raw) || raw.length !== CODE_LENGTH) return null;
  if (!raw.every((d) => typeof d === "string" && d.length === 1)) return null;
  return raw as Code;
}

/**
 * The only way a byte from the network becomes a ClientMessage. Anything
 * that does not match a known shape exactly is rejected here, so the room
 * logic never sees a half-formed message.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;

  switch (o.t) {
    case "join": {
      if (typeof o.v !== "number" || typeof o.room !== "string") return null;
      if (o.token !== undefined && (typeof o.token !== "string" || o.token.length > 64)) return null;
      if (o.resume !== undefined && o.resume !== "hard" && o.resume !== "soft") return null;
      return {
        t: "join",
        v: o.v,
        room: o.room.slice(0, 16),
        name: cleanName(o.name),
        token: o.token as string | undefined,
        resume: o.resume as Resume | undefined,
        create: o.create === true,
      };
    }
    case "setSecret": {
      const code = asFour(o.code);
      return code ? { t: "setSecret", code } : null;
    }
    case "guess": {
      const guess = asFour(o.guess);
      return guess ? { t: "guess", guess } : null;
    }
    case "chat": {
      const text = cleanText(o.text, CHAT_MAX);
      return text ? { t: "chat", text } : null;
    }
    case "rematch":
    case "leave":
    case "ping":
      return { t: o.t };
    default:
      return null;
  }
}

export { isRoomCode };
