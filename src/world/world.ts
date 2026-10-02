/**
 * The critters' world, as plain geometry. No DOM, no React.
 *
 * Units: one unit = one character height. The origin is the LEFT end of the
 * table's top surface; x grows to the right, y grows UP. So a character
 * standing on the table has y = 0 whatever the viewport, and x / width is
 * the same spot on the table on a phone and on a desktop. The table's own
 * sides and underside are at negative y.
 *
 * Depth: the table is the floor and nothing passes through it. The page's
 * boxes and title letters stand BEHIND the critters' plane, as one-way
 * platforms: a critter walks and jumps in front of them, can jump up
 * through them from below, and lands on their tops. Anything marked solid
 * (none of the page's elements today) is a real obstacle and is walked
 * around, over, or turned back from.
 *
 * From the measured rectangles this file derives:
 *   surfaces  stretches you can stand on (table, box tops, letter tops),
 *             each with a body's headroom under the top of the screen
 *   grips     letter undersides you can hang from
 *   tour      the outline of the table, if there is a body's room around it
 *             to walk all the way round
 */

export interface Box {
  x0: number;
  x1: number;
  /** bottom */
  y0: number;
  /** top */
  y1: number;
}

export type PropKind = "box" | "letter";

export interface WorldObject {
  id: string;
  kind: PropKind;
  rect: Box;
  /** a real obstacle; otherwise a one-way platform behind the critters */
  solid: boolean;
}

export type SurfaceKind = "table" | "box" | "letter";

export interface Surface {
  id: string;
  kind: SurfaceKind;
  x0: number;
  x1: number;
  y: number;
  /** "table", or the id of the object this is the top of */
  on: string;
  /** reading order, for letters */
  index?: number;
}

export interface Grip {
  id: string;
  /** reading order within the title */
  index: number;
  x: number;
  /** underside of the letter */
  y: number;
}

/** The outside of the table's frame: top edge at y = 0, underside at y0. */
export interface Tour {
  x0: number;
  x1: number;
  y0: number;
}

export interface World {
  /** px per unit; the renderer's business, carried for convenience */
  unit: number;
  /** length of the table in units */
  width: number;
  /** top of the visible stage, in units above the table */
  ceiling: number;
  objects: WorldObject[];
  surfaces: Surface[];
  grips: Grip[];
  tour: Tour | null;
}

export interface PxRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface WorldInput {
  /** px per unit (the rendered character height) */
  unit: number;
  table: {
    left: number;
    right: number;
    /** y of the walkable top line */
    surface: number;
    /** y of the outline's bottom edge */
    bottom: number;
    /** thickness of the outline outside the border box, px */
    ring: number;
  };
  /** the visible stage, px */
  stage: { width: number; height: number };
  props: (PxRect & { id: string; solid?: boolean })[];
  letters: (PxRect & { id: string; index: number })[];
}

export const PHYS = {
  /** units / s² — a cartoon gravity, about 1000 px/s² at 32px a unit */
  gravity: 30,
  /** room a body needs above whatever it stands on */
  headroom: 1.05,
  /** shortest stretch worth standing on (a letter top can be narrower) */
  minStand: 0.9,
  minLetter: 0.4,
  /** farthest a jump travels sideways */
  jumpAcross: 3.4,
  /** farthest apart two letters can be to swing from one to the next */
  gripSpacing: 1.8,
} as const;

const EPS = 1e-3;

export function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;
}

/** [a,b] with every cut removed. */
export function subtract(span: [number, number], cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [span];
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([a, b]): [number, number][] => {
      if (c1 <= a || c0 >= b) return [[a, b]];
      const keep: [number, number][] = [];
      if (c0 - a > EPS) keep.push([a, c0]);
      if (b - c1 > EPS) keep.push([c1, b]);
      return keep;
    });
  }
  return out;
}

export function buildWorld(input: WorldInput): World | null {
  const { unit, table } = input;
  if (!(unit > 0)) return null;
  const width = (table.right - table.left) / unit;
  if (width < 2) return null;

  const toX = (px: number) => (px - table.left) / unit;
  const toY = (py: number) => (table.surface - py) / unit;
  const rect = (r: PxRect): Box => ({ x0: toX(r.left), x1: toX(r.right), y0: toY(r.bottom), y1: toY(r.top) });

  const objects: WorldObject[] = [
    ...input.props.map((p) => ({ id: p.id, kind: "box" as const, rect: rect(p), solid: p.solid === true })),
    ...input.letters.map((l) => ({ id: l.id, kind: "letter" as const, rect: rect(l), solid: false })),
  ].filter((o) => o.rect.x1 - o.rect.x0 > EPS && o.rect.y1 - o.rect.y0 > EPS && o.rect.y1 > 0);
  const solids = objects.filter((o) => o.solid);

  const ceiling = toY(0);
  const H = PHYS.headroom;
  const surfaces: Surface[] = [];
  const blockedAbove = (x0: number, x1: number, y: number, self?: WorldObject) =>
    solids.filter((p) => p !== self && overlaps(p.rect, { x0, x1, y0: y, y1: y + H })).map((p): [number, number] => [p.rect.x0, p.rect.x1]);

  // The table top, minus anything solid in a standing body's way.
  if (ceiling >= H) {
    subtract([0, width], blockedAbove(0, width, 0)).forEach(([a, b], i) => {
      if (b - a >= PHYS.minStand) surfaces.push({ id: `table:${i}`, kind: "table", x0: a, x1: b, y: 0, on: "table" });
    });
  }

  // Tops of boxes and letters, over the table, with room to stand.
  for (const o of objects) {
    const y = o.rect.y1;
    if (y < 0.2 || y + H > ceiling) continue;
    const min = o.kind === "letter" ? PHYS.minLetter : PHYS.minStand;
    const span: [number, number] = [Math.max(0, o.rect.x0), Math.min(width, o.rect.x1)];
    subtract(span, blockedAbove(o.rect.x0, o.rect.x1, y, o)).forEach(([a, b], i) => {
      if (b - a >= min) {
        const index = o.kind === "letter" ? input.letters.find((l) => l.id === o.id)?.index : undefined;
        surfaces.push({ id: `${o.id}:${i}`, kind: o.kind, x0: a, x1: b, y, on: o.id, index });
      }
    });
  }

  // Letter undersides with a body's room to hang beneath them.
  const grips: Grip[] = [];
  for (const l of input.letters) {
    const o = objects.find((p) => p.id === l.id);
    if (!o) continue;
    const x = (o.rect.x0 + o.rect.x1) / 2;
    const y = o.rect.y0;
    if (x < 0.5 || x > width - 0.5 || y - H < 0.2) continue;
    if (solids.some((p) => overlaps(p.rect, { x0: x - 0.4, x1: x + 0.4, y0: y - H, y1: y - 0.01 }))) continue;
    grips.push({ id: l.id, index: l.index, x, y });
  }
  grips.sort((a, b) => a.index - b.index);

  // The way round the outside of the table, if a body fits all the way round
  // on screen: one body of clear space beyond each side and underneath.
  const ring = table.ring / unit;
  const depth = (table.bottom - table.surface) / unit;
  const room =
    (table.left - table.ring) / unit >= 1 &&
    (input.stage.width - (table.right + table.ring)) / unit >= 1 &&
    (input.stage.height - table.bottom) / unit >= 1;
  const tour = room && ceiling >= H && depth > 1 ? { x0: -ring, x1: width + ring, y0: -depth } : null;

  return { unit, width, ceiling, objects, surfaces, grips, tour };
}

/** Where a body of half-width hw can stand on s. */
export function standRange(s: Surface, hw: number): [number, number] {
  const a = s.x0 + hw;
  const b = s.x1 - hw;
  return a <= b ? [a, b] : [(s.x0 + s.x1) / 2, (s.x0 + s.x1) / 2];
}

export function bodyAt(x: number, y: number, hw: number, h: number): Box {
  return { x0: x - hw, x1: x + hw, y0: y, y1: y + h };
}

export function hitsSomething(world: World, body: Box, ignore?: string): boolean {
  return world.objects.some((o) => o.solid && o.id !== ignore && overlaps(o.rect, body));
}

/** The highest surface at x that is at or below y. */
export function surfaceBelow(world: World, x: number, y: number): Surface | null {
  let best: Surface | null = null;
  for (const s of world.surfaces) {
    if (x >= s.x0 - EPS && x <= s.x1 + EPS && s.y <= y + EPS && (!best || s.y > best.y)) best = s;
  }
  return best;
}

export interface Arc {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  /** flight time, s */
  T: number;
}

export function arcAt(a: Arc, t: number): { x: number; y: number } {
  return { x: a.x0 + a.vx * t, y: a.y0 + a.vy * t - (PHYS.gravity * t * t) / 2 };
}

/**
 * A ballistic jump from `from` to `to` (feet positions), or null when it
 * cannot be made: too high, too far, under the top of the screen, or
 * through something solid. `lift` is how far the apex clears the higher
 * end; 0 means "arrive at the top of the jump", as when catching a ledge.
 */
export function planArc(
  world: World,
  from: { x: number; y: number },
  to: { x: number; y: number },
  body: { hw: number; h: number; maxUp: number },
  lift = 0.4,
): Arc | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dy > body.maxUp + EPS || Math.abs(dx) > PHYS.jumpAcross) return null;
  const g = PHYS.gravity;
  // A lower, flatter arc when the top of the screen is close.
  for (const l of lift > 0 ? [lift, lift / 2, 0.08] : [0]) {
    const apex = Math.max(from.y, to.y) + l + (l > 0 ? Math.abs(dx) * 0.06 : 0);
    if (apex + body.h > world.ceiling) continue;
    const vy = Math.sqrt(2 * g * Math.max(0, apex - from.y));
    const T = vy / g + Math.sqrt((2 * Math.max(0, apex - to.y)) / g);
    if (T < 0.05) continue;
    const arc: Arc = { x0: from.x, y0: from.y, vx: dx / T, vy, T };
    let clear = true;
    for (let i = 1; i < 16 && clear; i++) {
      const p = arcAt(arc, (T * i) / 16);
      if (hitsSomething(world, bodyAt(p.x, p.y, body.hw * 0.9, body.h * 0.95))) clear = false;
    }
    if (clear) return arc;
  }
  return null;
}
