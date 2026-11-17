/**
 * The daily puzzle: one code per calendar day, the same for every player, so
 * people can compare and share how they did. Pure functions only.
 *
 * The code is worked out from the date, so it needs no server, and anyone
 * who reads this file can compute it. That is fine while results are just
 * shared for fun; a ranked daily leaderboard must score on the server.
 */
import { CODE_LENGTH, generateCode, type Code, type Verdict } from "./engine";

/** Puzzle #1. Never change it: every later number is counted from it. */
export const DAILY_EPOCH = "2026-11-17";

/** A day as YYYY-MM-DD in the player's own time zone (their midnight). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayIndex(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The puzzle's number: #1 on the first day, counting up from there. */
export function dailyNumber(key: string): number {
  return dayIndex(key) - dayIndex(DAILY_EPOCH) + 1;
}

/** Days from one day to another (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return dayIndex(b) - dayIndex(a);
}

/** FNV-1a: a string to a 32-bit seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, well-mixed seeded generator. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's code. Same day, same code, on every device. */
export function dailyCode(key: string): Code {
  return generateCode(seeded(hash(`crack-the-code:daily:${key}`)));
}

/** Milliseconds until the player's next midnight, when a new puzzle opens. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** At most this many rows in a shared result; a long hunt ends with "…". */
export const SHARE_ROWS = 10;

/**
 * One row of squares per try: green for each right digit in the right slot,
 * yellow for each right digit in the wrong slot, black for the rest. Counts
 * only, never positions, exactly like the bars on the board.
 */
export function shareRow(v: Verdict): string {
  return "🟩".repeat(v.exact) + "🟨".repeat(v.misplaced) + "⬛".repeat(CODE_LENGTH - v.exact - v.misplaced);
}

export function shareGrid(verdicts: Verdict[]): string {
  const rows = verdicts.slice(0, SHARE_ROWS).map(shareRow);
  if (verdicts.length > SHARE_ROWS) rows.push("…");
  return rows.join("\n");
}

export interface DailyStats {
  played: number;
  streak: number;
  maxStreak: number;
  /** average tries over every solved day, one decimal */
  average: number | null;
  /** how many days were solved in 1–3, 4, 5, … 9, and 10 or more tries */
  spread: { label: string; count: number }[];
}

export const SPREAD = ["1-3", "4", "5", "6", "7", "8", "9", "10+"];

function bucket(tries: number): number {
  if (tries <= 3) return 0;
  if (tries >= 10) return SPREAD.length - 1;
  return tries - 3;
}

/**
 * Statistics from the record of solved days (day key -> tries). The current
 * streak survives until the end of the day after the last solve, so it does
 * not drop to zero in the morning before today's puzzle is played.
 */
export function dailyStats(history: Record<string, number>, today: string): DailyStats {
  const days = Object.keys(history).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const spread = SPREAD.map((label) => ({ label, count: 0 }));
  let total = 0;
  let maxStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    const n = history[d];
    total += n;
    spread[bucket(n)].count++;
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
    prev = d;
  }
  const last = days[days.length - 1];
  const streak = last && daysBetween(last, today) <= 1 ? run : 0;
  return {
    played: days.length,
    streak,
    maxStreak,
    average: days.length ? Math.round((total / days.length) * 10) / 10 : null,
    spread,
  };
}
