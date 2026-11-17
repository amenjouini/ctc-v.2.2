/**
 * The game's sounds, made on the spot with the Web Audio API: no files to
 * download, nothing to license, and they match the pixel-art style (square
 * and triangle waves, like an old handheld).
 *
 * Browsers only allow sound after the player has touched the page, so the
 * audio context is created on the first sound, which always follows a tap
 * or a key. The Sound setting in the menu turns everything off.
 */
import { currentSettings } from "@/hooks/useSettings";

export type Cue = "tap" | "erase" | "fire" | "near" | "miss" | "win" | "lose" | "message";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One short note: frequency in Hz, start and length in seconds from now. */
function note(a: AudioContext, freq: number, start: number, length: number, type: OscillatorType = "square", volume = 0.05) {
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // a quick attack and a fall-off, so notes never click
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

const CUES: Record<Cue, (a: AudioContext) => void> = {
  tap: (a) => note(a, 660, 0, 0.05, "square", 0.025),
  erase: (a) => note(a, 220, 0, 0.08, "square", 0.03),
  fire: (a) => { note(a, 440, 0, 0.06); note(a, 660, 0.06, 0.08); },
  // a guess with something right in it
  near: (a) => { note(a, 523, 0, 0.09, "triangle", 0.08); note(a, 784, 0.09, 0.14, "triangle", 0.08); },
  // nothing at all in it
  miss: (a) => note(a, 196, 0, 0.16, "triangle", 0.08),
  win: (a) => [523, 659, 784, 1047].forEach((f, i) => note(a, f, i * 0.1, i === 3 ? 0.4 : 0.12, "square", 0.045)),
  lose: (a) => [392, 330, 262].forEach((f, i) => note(a, f, i * 0.14, i === 2 ? 0.35 : 0.14, "triangle", 0.08)),
  message: (a) => { note(a, 880, 0, 0.05, "triangle", 0.06); note(a, 1175, 0.05, 0.08, "triangle", 0.06); },
};

export function play(cue: Cue) {
  if (!currentSettings().sound) return;
  const a = audio();
  if (!a) return;
  try {
    CUES[cue](a);
  } catch {
    /* sound is a nicety; never let it break a move */
  }
}

/** The sound for a scored guess. */
export function playVerdict(v: { exact: number; misplaced: number }, cracked: boolean) {
  play(cracked ? "win" : v.exact + v.misplaced > 0 ? "near" : "miss");
}
