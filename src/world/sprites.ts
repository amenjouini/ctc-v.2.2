/**
 * What the world needs to know about each sprite: where it touches the
 * ground, how big it is, and where it holds on. All in the sprite's own
 * 16x16 art pixels. The renderer puts FOOT exactly on the surface — not the
 * bottom of the image, which is why a sprite whose legs stop short of the
 * last row (the crab's end at row 14) no longer hovers above the table.
 */

export type CritterKind = "owl" | "crab" | "penguin" | "squirrel" | "ghost";

export interface SpriteMeta {
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

export const ART = 16;

export const SPRITES: Record<CritterKind, SpriteMeta> = {
  owl: { foot: { x: 8, y: 16 }, top: 0, left: 2, right: 15 },
  crab: { foot: { x: 8, y: 14 }, top: 0, left: 0, right: 16 },
  penguin: { foot: { x: 8, y: 16 }, top: 1, left: 2, right: 15 },
  squirrel: { foot: { x: 9, y: 16 }, top: 1, left: 0, right: 14 },
  ghost: { foot: { x: 8, y: 16 }, top: 1, left: 1, right: 16, hover: 3 },
};

/** Body size in world units (1 unit = ART px of sprite). */
export function bodyOf(kind: CritterKind) {
  const s = SPRITES[kind];
  return {
    h: (s.foot.y - s.top) / ART,
    hw: Math.max(s.foot.x - s.left, s.right - s.foot.x) / ART,
  };
}
