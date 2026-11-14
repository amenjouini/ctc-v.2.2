/**
 * The critters' pixel art. The owl, fox, crab and penguin live in
 * assets/critters.json exactly as the artist delivered them; the ghost lives
 * in assets/ghost.json, drawn in the same style. Both are 32x32, rows[y][x] is
 * a palette key, "." is transparent, light from the top-left. The game draws
 * straight from these files: change the JSON, not this module.
 *
 * Everything else here is built on top of that art without changing it: the
 * animation frames, the eyelids for blinking, the theme outfits, and the edge
 * smoothing the game draws them with.
 */
import critters from "../../assets/critters.json";
import ghost from "../../assets/ghost.json";
import frames from "../../assets/critter-frames.json";

export interface PixelArt {
  width: number;
  height: number;
  palette: Record<string, string>;
  rows: string[];
}

export const PIXEL_ART: Record<"owl" | "fox" | "crab" | "penguin" | "ghost", PixelArt> = {
  owl: critters.owl,
  fox: critters.fox,
  crab: critters.crab,
  penguin: critters.penguin,
  ghost: ghost.ghost,
};

export type PixelKind = keyof typeof PIXEL_ART;

/**
 * Animation frames (assets/critter-frames.json): per critter, extra pictures
 * in its own palette, and per movement the pictures to play in order, how
 * fast, and an optional bob (pixels the whole critter drops on each frame).
 * "base" is the critter's picture in its own art file. A critter or a
 * movement with no frames yet falls back to its base picture with a gentle
 * bob, so every critter always has every movement.
 */
export type AnimState = "idle" | "walk" | "wave" | "crouch" | "land" | "air" | "slide" | "boo";
/** bob: pixels the whole critter drops on each frame; shift: pixels it moves
 *  sideways (towards the way it faces). Both move the outfit with it. */
export interface AnimSpec { fps: number; frames: string[]; bob?: number[]; shift?: number[] }
export interface CritterFrames { images: Record<string, string[]>; states: Record<AnimState, AnimSpec> }

const FALLBACK: Record<AnimState, AnimSpec> = {
  idle: { fps: 1.25, frames: ["base"], bob: [0, 1] },
  walk: { fps: 8, frames: ["base"], bob: [0, 1] },
  wave: { fps: 4, frames: ["base"], bob: [0, 1] },
  crouch: { fps: 1, frames: ["base"], bob: [1] },
  land: { fps: 1, frames: ["base"], bob: [1] },
  air: { fps: 1, frames: ["base"] },
  slide: { fps: 1, frames: ["base"] },
  boo: { fps: 1, frames: ["base"] },
};

export function framesFor(kind: PixelKind): CritterFrames {
  const own = (frames as Record<string, { images?: Record<string, string[]>; states?: Partial<Record<AnimState, AnimSpec>> }>)[kind];
  return {
    images: { base: PIXEL_ART[kind].rows, ...(own?.images ?? {}) },
    states: { ...FALLBACK, ...(own?.states ?? {}) },
  };
}

/**
 * Blinking: inside each eye box, the eye's own pixels (`chars`) close into a
 * lid of the face colour with a dark line along the bottom row.
 */
export const EYES: Record<PixelKind, { boxes: [number, number, number, number][]; chars: string; lid: string; line: string }> = {
  owl: { boxes: [[11, 11, 13, 13], [18, 11, 20, 13]], chars: "klm", lid: "#fbfaff", line: "#323849" },
  crab: { boxes: [[10, 8, 14, 10], [17, 8, 21, 10]], chars: "fgh", lid: "#ea5232", line: "#4b1515" },
  penguin: { boxes: [[13, 9, 14, 10], [17, 9, 18, 10]], chars: "hi", lid: "#f6f7fc", line: "#16151f" },
  fox: { boxes: [[16, 13, 17, 16], [20, 13, 21, 16]], chars: "nop", lid: "#ec8730", line: "#2b1710" },
  ghost: { boxes: [[13, 12, 15, 16], [19, 12, 21, 16]], chars: "gb", lid: "#dcd5ef", line: "#3d3460" },
};

/**
 * A small outfit per scene, pixel art at the same 32x32 scale, worn on top:
 * the dusk owl's nightcap, the beach crab's sunglasses, the snow penguin's
 * scarf, the autumn fox's leaf and the
 * Halloween ghost's witch hat.
 */
export interface Outfit { x: number; y: number; rows: string[]; palette: Record<string, string> }
export const OUTFITS: Record<PixelKind, Outfit[]> = {
  owl: [{ x: 9, y: 1, rows: ["...........WW.", ".........bbWW.", "......Bbbbbb..", "...BBbbbbbbd..", "..Bbbbbbbbbd..", ".wwwwwwwwwwww."],
    palette: { b: "#3a4fa8", B: "#6a84e0", d: "#26357a", W: "#fff6c8", w: "#e9e4f7" } }],
  crab: [{ x: 10, y: 8, rows: ["KsKKKkkKsKKK", "KKKKK..KKKKK", ".KKK....KKK."], palette: { K: "#1b1a2e", k: "#1b1a2e", s: "#8da0e0" } }],
  penguin: [
    { x: 9, y: 15, rows: ["RRrRRrRRrRRrRR", "SSSSSSSSSSSSSS"], palette: { R: "#d63a48", r: "#ffe1e4", S: "#9e2235" } },
    { x: 18, y: 17, rows: ["RRr", "RrR", "SSS"], palette: { R: "#d63a48", r: "#ffe1e4", S: "#9e2235" } },
  ],
  fox: [{ x: 15, y: 7, rows: ["..L.", ".LLl", "LLll", ".s.."], palette: { L: "#e8742a", l: "#b83c1a", s: "#5c2f14" } }],
  ghost: [{ x: 9, y: 0, rows: ["..........ab...", ".........abba..", "........abcca..", ".......abccca..", "......abcccca..", ".....aooooooa..", "..aabbcccccccaa.", ".aaaaaaaaaaaaaaa"],
    palette: { a: "#1a1230", b: "#6a54a8", c: "#3e2d6e", o: "#ff8a2a" } }],
};

/** A sprite as a grid of colours, "" for transparent. */
export type Grid = string[][];

/**
 * Scale2x: every pixel becomes four, and stair-step edges are rounded off by
 * copying a neighbour where two neighbours agree. The result is still pixel
 * art, at twice the detail.
 */
export function scale2x(g: Grid): Grid {
  const h = g.length, w = g[0].length;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? "" : g[y][x]);
  const o: Grid = Array.from({ length: h * 2 }, () => Array<string>(w * 2).fill(""));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = g[y][x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    o[2 * y][2 * x] = C === A && C !== D && A !== B ? A : P;
    o[2 * y][2 * x + 1] = A === B && A !== C && B !== D ? B : P;
    o[2 * y + 1][2 * x] = D === C && D !== B && C !== A ? C : P;
    o[2 * y + 1][2 * x + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return o;
}

/**
 * Where a piece of art touches the ground and how big its body is, read off
 * the pixels themselves: the bounding box of every painted pixel, and the
 * middle of the bottom painted row as the contact point.
 */
export function measureArt(art: PixelArt) {
  let top = art.height, bottom = -1, left = art.width, right = -1;
  art.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    left = Math.min(left, x); right = Math.max(right, x);
  }));
  const last = [...art.rows[bottom]].flatMap((ch, x) => (ch === "." ? [] : [x]));
  return {
    foot: { x: (last[0] + last[last.length - 1] + 1) / 2, y: bottom + 1 },
    top,
    left,
    right: right + 1,
  };
}
