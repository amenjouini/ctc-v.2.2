/**
 * Pure game rules. No DOM, no network, no framework.
 * The server imports this to score guesses authoritatively; the client
 * imports it to validate input before sending. One source of truth.
 */

export const CODE_LENGTH = 4;
export const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type Digit = (typeof DIGITS)[number];
export type Code = Digit[];
export interface Verdict {
  /** right digit, right slot */
  exact: number;
  /** right digit, wrong slot */
  misplaced: number;
}

/**
 * Four distinct digits, never leading with zero.
 * Fisher-Yates over the whole digit set, then a targeted swap when zero
 * lands first — a re-roll would bias the distribution, a swap does not.
 */
export function generateCode(): Code {
  const pool = [...DIGITS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (pool[0] === "0") {
    let swapAt = -1;
    for (let k = 1; k < CODE_LENGTH; k++) {
      if (pool[k] !== "0") {
        swapAt = k;
        break;
      }
    }
    if (swapAt === -1) swapAt = 1;
    [pool[0], pool[swapAt]] = [pool[swapAt], pool[0]];
  }
  return pool.slice(0, CODE_LENGTH) as Code;
}

/**
 * Bulls and cows. Exact matches are consumed on the first pass so a single
 * secret digit can never be counted twice.
 */
export function scoreGuess(guess: Code, code: Code): Verdict {
  const g: (string | null)[] = [...guess];
  const c: (string | null)[] = [...code];
  let exact = 0;
  let misplaced = 0;

  for (let i = 0; i < CODE_LENGTH; i++) {
    if (g[i] === c[i]) {
      exact++;
      g[i] = null;
      c[i] = null;
    }
  }
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (g[i] === null) continue;
    const at = c.indexOf(g[i]);
    if (at !== -1) {
      misplaced++;
      c[at] = null;
    }
  }
  return { exact, misplaced };
}

export function isValidCode(input: readonly string[]): input is Code {
  if (!Array.isArray(input) || input.length !== CODE_LENGTH) return false;
  if (input[0] === "0") return false;
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (!(DIGITS as readonly string[]).includes(input[i])) return false;
    if (input.indexOf(input[i]) !== i) return false;
  }
  return true;
}

const WORDS = ["No", "One", "Two", "Three", "Four"];

/** A count as a word ("Two"), for any text that sits near a code. */
export function spell(n: number): string {
  return WORDS[Math.max(0, Math.min(WORDS.length - 1, n))];
}

/**
 * Always spelled out, never figures. A numeral sitting beside a four-digit
 * guess reads as another digit of the code — that confused real players.
 */
export function describe(v: Verdict): string {
  if (v.exact === CODE_LENGTH) return "Cracked it.";
  if (v.exact === 0 && v.misplaced === 0)
    return "Nothing here. Four digits ruled out at once.";
  const parts: string[] = [];
  if (v.exact > 0) parts.push(`${WORDS[v.exact].toLowerCase()} in the right slot`);
  if (v.misplaced > 0)
    parts.push(`${WORDS[v.misplaced].toLowerCase()} in the code but elsewhere`);
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

/** Unambiguous alphabet — no 0/O, no 1/I/L. Misread codes are the most
 *  common failure in share-a-code multiplayer. */
const ROOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 5;

export function makeRoomCode(len = ROOM_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ROOM_ALPHABET.charAt(Math.floor(Math.random() * ROOM_ALPHABET.length));
  }
  return out;
}

export function normaliseRoom(raw: string): string {
  return (typeof raw === "string" ? raw : "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

/** A code this game could have issued: right length, right alphabet. */
export function isRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return false;
  return true;
}
