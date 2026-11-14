/**
 * What the world needs to know about each sprite: where it touches the
 * ground, how big it is, and where it holds on — in the sprite's own art
 * pixels. The renderer puts FOOT exactly on the surface, not the bottom of
 * the image, so a sprite whose feet stop short of the last row never hovers.
 *
 * Every sprite is drawn into the same critter-sized box (one world unit);
 * `grid` is how many art pixels span it. Hand-drawn pixel art is 32x32 and
 * its numbers are read off the pixels themselves (see pixelArt.ts).
 */

import { PIXEL_ART, measureArt } from "./pixelArt";

export type CritterKind = "owl" | "crab" | "penguin" | "fox" | "ghost";

export interface SpriteMeta {
  /** art pixels across the critter's box */
  grid: number;
  /** contact point with the ground */
  foot: { x: number; y: number };
  /** topmost painted row */
  top: number;
  /** leftmost / rightmost painted columns (+1) */
  left: number;
  right: number;
  /** drawn this many art px above its feet: a flier hovers over what it is on */
  hover?: number;
}

/** The grid of the older 16x16 sprites. */
export const ART = 16;

const fromPixels = (kind: keyof typeof PIXEL_ART): SpriteMeta => ({ grid: PIXEL_ART[kind].width, ...measureArt(PIXEL_ART[kind]) });

export const SPRITES: Record<CritterKind, SpriteMeta> = {
  owl: fromPixels("owl"),
  crab: fromPixels("crab"),
  penguin: fromPixels("penguin"),
  fox: fromPixels("fox"),
  // a flier: drawn 6 art pixels above what it is over
  ghost: { ...fromPixels("ghost"), hover: 6 },
};

/** Body size in world units (1 unit = the whole sprite box). */
export function bodyOf(kind: CritterKind) {
  const s = SPRITES[kind];
  return {
    h: (s.foot.y - s.top) / s.grid,
    hw: Math.max(s.foot.x - s.left, s.right - s.foot.x) / s.grid,
  };
}
