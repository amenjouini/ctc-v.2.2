/**
 * The room rules, as a pure state machine. No sockets, no timers, no clock
 * of its own — the caller passes `now` in. The server wraps this in a
 * transport; tests drive it directly; a future host (a Durable Object, a
 * Redis-backed worker) could wrap it just the same.
 *
 * Turn order resolves in PAIRS: the first mover guesses, then the other
 * seat, and only then can the match end. Without that, whoever moved first
 * would win a meaningful share of close games purely by going first.
 */

import { CODE_LENGTH, isValidCode, scoreGuess, type Code } from "./engine";
import type { ErrorCode, Outcome, Phase, PlayerInfo, Resume, RoomView, Seat, Turn } from "./protocol";

export const SEATS: readonly Seat[] = ["host", "guest"];

export interface Seated {
  seat: Seat;
  name: string;
  /** proves ownership of the seat across reconnects; never shown to the other player */
  token: string;
  connected: boolean;
  /** when the last socket dropped; null while connected */
  droppedAt: number | null;
  secret: Code | null;
  wantsRematch: boolean;
}

export interface RoomState {
  code: string;
  players: Partial<Record<Seat, Seated>>;
  phase: Phase;
  round: number;
  turn: Seat;
  history: Turn[];
  /** the round in which each seat cracked the other's code */
  crackedBy: Partial<Record<Seat, number>>;
  /** alternates each rematch so neither seat keeps the first move */
  firstMover: Seat;
  /** last time any socket was attached; drives the empty-room sweep */
  lastSeen: number;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode; reason: string };

const fail = (code: ErrorCode, reason: string) => ({ ok: false as const, code, reason });

export function other(seat: Seat): Seat {
  return seat === "host" ? "guest" : "host";
}

export function createRoom(code: string, now: number): RoomState {
  return {
    code,
    players: {},
    phase: "lobby",
    round: 1,
    turn: "host",
    history: [],
    crackedBy: {},
    firstMover: "host",
    lastSeen: now,
  };
}

/** Back to a fresh match with whoever is seated. Secrets are wiped. */
function resetMatch(room: RoomState, flipFirstMover: boolean) {
  room.round = 1;
  room.history = [];
  room.crackedBy = {};
  if (flipFirstMover) room.firstMover = other(room.firstMover);
  room.turn = room.firstMover;
  for (const s of SEATS) {
    const p = room.players[s];
    if (p) {
      p.secret = null;
      p.wantsRematch = false;
    }
  }
  room.phase = room.players.host && room.players.guest ? "setup" : "lobby";
}

export interface JoinRequest {
  name: string;
  token?: string;
  resume?: Resume;
}

/**
 * Seat a socket. A seat is only ever handed to the holder of its token, so
 * a dropped player cannot have their seat — or their secret — taken by
 * whoever else has the room code.
 */
export function join(
  room: RoomState,
  req: JoinRequest,
  now: number,
  mintToken: () => string,
): Result<{ seat: Seat; token: string; resumed: boolean; displaced: boolean }> {
  if (req.token) {
    const seat = SEATS.find((s) => room.players[s]?.token === req.token);
    const p = seat ? room.players[seat] : undefined;
    if (seat && p && !(p.connected && req.resume === "soft")) {
      const displaced = p.connected;
      p.connected = true;
      p.droppedAt = null;
      if (req.name) p.name = req.name;
      room.lastSeen = now;
      return { ok: true, seat, token: p.token, resumed: true, displaced };
    }
  }

  const free = SEATS.find((s) => !room.players[s]);
  if (!free) return fail("room_full", "That table already has two players.");

  room.players[free] = {
    seat: free,
    name: req.name || (free === "host" ? "Host" : "Guest"),
    token: mintToken(),
    connected: true,
    droppedAt: null,
    secret: null,
    wantsRematch: false,
  };
  room.lastSeen = now;
  // A newcomer never inherits a finished or half-played match.
  if (room.players.host && room.players.guest) resetMatch(room, false);
  return { ok: true, seat: free, token: room.players[free]!.token, resumed: false, displaced: false };
}

/** The socket dropped. The seat — and its secret — is held for a grace period. */
export function disconnect(room: RoomState, seat: Seat, now: number) {
  const p = room.players[seat];
  if (!p) return;
  p.connected = false;
  p.droppedAt = now;
  room.lastSeen = now;
}

/** The player walked away on purpose, or their grace period ran out. */
export function leave(room: RoomState, seat: Seat) {
  if (!room.players[seat]) return;
  delete room.players[seat];
  resetMatch(room, false);
}

export function setSecret(room: RoomState, seat: Seat, code: Code): Result {
  const me = room.players[seat];
  if (!me) return fail("not_now", "You are not seated at this table.");
  if (room.phase !== "setup") return fail("not_now", "Secrets are set before the match starts.");
  if (me.secret) return fail("not_now", "Your secret is already locked in.");
  if (!isValidCode(code)) return fail("bad_code", "That is not a legal code.");
  me.secret = [...code];
  if (room.players.host?.secret && room.players.guest?.secret) {
    room.phase = "play";
    room.turn = room.firstMover;
  }
  return { ok: true };
}

/** The second mover closes every round. Only then may the match end. */
function endTurn(room: RoomState) {
  if (room.turn === room.firstMover) {
    room.turn = other(room.firstMover);
    return;
  }
  if (Object.keys(room.crackedBy).length > 0) {
    room.phase = "over";
    return;
  }
  room.round++;
  room.turn = room.firstMover;
}

export function guess(room: RoomState, seat: Seat, g: Code): Result {
  if (room.phase !== "play") return fail("not_now", "The match is not in play.");
  // Also what makes a double-tap harmless: the second copy arrives after
  // the turn has passed and is refused.
  if (room.turn !== seat) return fail("not_now", "It is not your turn.");
  const defender = room.players[other(seat)];
  if (!defender?.secret) return fail("not_now", "Your rival has not set a code.");
  if (!isValidCode(g)) return fail("bad_code", "That is not a legal guess.");

  // The server scores it. Neither client ever sees the other's secret.
  const verdict = scoreGuess(g, defender.secret);
  room.history.push({ by: seat, guess: [...g], verdict, round: room.round });
  if (verdict.exact === CODE_LENGTH && room.crackedBy[seat] === undefined) {
    room.crackedBy[seat] = room.round;
  }
  endTurn(room);
  return { ok: true };
}

/** Both players must ask. Idempotent, so a double-tap or a race is harmless. */
export function requestRematch(room: RoomState, seat: Seat): Result {
  const me = room.players[seat];
  if (!me || room.phase !== "over") return fail("not_now", "There is no finished match to replay.");
  me.wantsRematch = true;
  if (room.players.host?.wantsRematch && room.players.guest?.wantsRematch) resetMatch(room, true);
  return { ok: true };
}

/** Seats whose owner has been gone longer than the grace period. */
export function expiredSeats(room: RoomState, now: number, graceMs: number): Seat[] {
  return SEATS.filter((s) => {
    const p = room.players[s];
    return p && !p.connected && p.droppedAt !== null && now - p.droppedAt > graceMs;
  });
}

export function isDeserted(room: RoomState, now: number, ttlMs: number): boolean {
  const live = SEATS.some((s) => room.players[s]?.connected);
  return !live && now - room.lastSeen > ttlMs;
}

function info(p: Seated): PlayerInfo {
  return { name: p.name, connected: p.connected, ready: Boolean(p.secret), wantsRematch: p.wantsRematch };
}

export function viewFor(room: RoomState, seat: Seat): RoomView {
  const me = room.players[seat]!;
  const them = room.players[other(seat)];

  const outcome: Outcome | null =
    room.phase !== "over"
      ? null
      : room.crackedBy[seat] !== undefined && room.crackedBy[other(seat)] !== undefined
        ? "draw"
        : room.crackedBy[seat] !== undefined
          ? "win"
          : "loss";

  return {
    code: room.code,
    seat,
    phase: room.phase,
    round: room.round,
    turn: room.turn,
    firstMover: room.firstMover,
    you: info(me),
    opponent: them ? info(them) : null,
    yourSecret: me.secret,
    yourHunt: room.history.filter((h) => h.by === seat),
    theirHunt: room.history.filter((h) => h.by !== seat),
    outcome,
    revealedSecrets:
      room.phase === "over" && room.players.host?.secret && room.players.guest?.secret
        ? { host: room.players.host.secret, guest: room.players.guest.secret }
        : null,
  };
}
