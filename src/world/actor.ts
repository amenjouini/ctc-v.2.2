/**
 * A critter: where it is, what it is doing, and what it means to do next.
 * Pure logic in world units (see world.ts) — the renderer only reads it.
 *
 * Behaviour is a short queue of tasks ("walk to x", "jump onto that box",
 * "wave"). When the queue runs dry the critter looks at the world as it is
 * NOW and picks something it can do from where it stands — and something
 * different from what it has just done, so every visit is a mix: a tour of
 * the table, a climb along the title, a swing under its letters, a hop onto
 * a box, a wave, a magic trick.
 *
 * Every move is checked against the world before it is taken: walks stay on
 * a surface, jumps are ballistic arcs under the top of the screen, a critter
 * whose footing goes falls under gravity until it lands, and the tour
 * follows the table's outline with the feet always on the frame.
 */

import { bodyOf, type CritterKind } from "./sprites";
import {
  PHYS,
  arcAt,
  bodyAt,
  hitsSomething,
  planArc,
  standRange,
  surfaceBelow,
  type Arc,
  type Grip,
  type Surface,
  type World,
} from "./world";

export type Intent = "stroll" | "explore" | "climb" | "letters" | "swing" | "tour" | "wave" | "trick";
export type Routine = "walk" | "box" | "letters" | "swing" | "tour" | "dangle" | "trick" | "peek" | "speak";
export type Pose = "stand" | "walk" | "air" | "hang" | "wave" | "trick" | "look" | "talk" | "boo";

/** How long a critter holds up a message if nobody taps it away. */
const TALK_S = 20;
export type Mode =
  | "rise" | "sink" | "descend" | "settle" | "ascend"
  | "walk" | "rest" | "jump" | "fall" | "hang" | "swing" | "tour"
  | "pose" | "vanish" | "gone";

export interface Species {
  /** units / s while moving */
  speed: number;
  /** stop-and-go: distance per dash (0 = steady) */
  burst: number;
  /** highest step up it will jump */
  maxUp: number;
  /** walks sideways and never turns round (crab) */
  sideways: boolean;
  /** how much it likes each thing (0 = never) */
  weights: Record<Intent, number>;
  /** floats instead of walking: no thread, and it sinks slowly when it drops */
  flies?: boolean;
  /** its trick is a peek-a-boo: hides behind its hand, then pops out — BOO! */
  peekaboo?: boolean;
}

/** How long the peek-a-boo lasts; the pop comes just past halfway. */
const BOO_S = 2.2;
/** A flier never drops faster than this, units / s. */
const FLOAT_FALL = 2.4;

export const SPECIES: Record<CritterKind, Species> = {
  owl: { speed: 1.3, burst: 0, maxUp: 2.9, sideways: false,
    weights: { stroll: 1, explore: 1, climb: 3, letters: 3, swing: 2, tour: 3, wave: 2, trick: 3 } },
  penguin: { speed: 0.9, burst: 0, maxUp: 2.9, sideways: false,
    weights: { stroll: 2, explore: 2, climb: 1, letters: 1, swing: 1, tour: 3, wave: 3, trick: 2 } },
  squirrel: { speed: 3, burst: 1.6, maxUp: 3.2, sideways: false,
    weights: { stroll: 1, explore: 1, climb: 3, letters: 3, swing: 3, tour: 3, wave: 1, trick: 2 } },
  crab: { speed: 2.2, burst: 1.3, maxUp: 3, sideways: true,
    weights: { stroll: 1, explore: 2, climb: 2, letters: 2, swing: 2, tour: 4, wave: 2, trick: 3 } },
  // a small sheet ghost: floats about, haunts the letters, plays peek-a-boo.
  // It has no hands to swing by and no feet to walk round the table on.
  ghost: { speed: 1.2, burst: 0, maxUp: 3.2, sideways: false, flies: true, peekaboo: true,
    weights: { stroll: 2, explore: 3, climb: 3, letters: 3, swing: 0, tour: 0, wave: 2, trick: 4 } },
};

/** How far the arms reach above the head when hanging. */
const ARM = 0.12;
/** How far above the surface a critter on a thread stops swinging. */
const HOVER = 0.15;
/** Most a critter on a thread sways sideways while it settles. */
const SWAY = 0.25;
/** Seconds to turn round a corner of the table. */
const CORNER = 0.3;
/** Walking pace on the tour, relative to the species' own… */
const TOUR_PACE = 0.8;
/** …but a whole lap never takes longer than this, on any size of board. */
const TOUR_MAX_S = 25;

type Task =
  | { k: "walk"; x: number }
  | { k: "jump"; to: { x: number; y: number }; land: string | null; lift: number; grip?: Grip }
  | { k: "pose"; pose: "stand" | "wave" | "trick" | "look" | "talk" | "boo"; dur: number; face?: 1 | -1 }
  | { k: "swing"; grips: Grip[] }
  | { k: "tour"; dir: 1 | -1 }
  | { k: "drop" }
  | { k: "climbOut" }
  | { k: "sink" }
  | { k: "ascend" }
  | { k: "vanish"; to: { x: number; surface: Surface } | null };

export interface FX {
  id: number;
  kind: "puff" | "sparkle" | "boo";
  x: number;
  y: number;
}

interface TourState {
  dir: 1 | -1;
  /** units / s */
  pace: number;
  /** where on the table it set off, as a fraction of the table */
  startFrac: number;
  /** distance walked along the outline */
  s: number;
  total: number;
}

export interface Actor {
  kind: CritterKind;
  sp: Species;
  body: { h: number; hw: number };
  /** feet, world units, before any rotation */
  x: number;
  y: number;
  facing: 1 | -1;
  mode: Mode;
  /** seconds spent in the current mode, and how long it lasts */
  t: number;
  dur: number;
  surface: string | null;
  /** where on the surface, 0..1 — what survives a resize */
  frac: number;
  queue: Task[];
  /** decisions left before it leaves */
  budget: number;
  /** what it has done this visit, to keep the mix varied */
  did: Intent[];
  pose: Pose;
  moving: boolean;
  visible: boolean;
  /** body rotation in degrees about `pivot` (hanging, thread, tour) */
  angle: number;
  pivot: { x: number; y: number } | null;
  /** thread from the top of the stage to the hands, while on one */
  thread: { x: number; top: number } | null;
  arc?: Arc;
  landOn?: string | null;
  grip?: Grip;
  swing?: { grips: Grip[]; i: number };
  tour?: TourState;
  fall?: { vy: number };
  walk?: { target: number; dash: number };
  from?: number;
  to?: number;
  next?: { x: number; surface: Surface } | null;
  forced?: Intent;
  forcedTries?: number;
  fx: FX[];
  fxSeq: number;
  log: string[];
}

export type Rng = () => number;

const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (u: number) => 1 - (1 - clamp(u, 0, 1)) ** 2;

/** What critters did on recent visits, across visits, so the next one
 *  leans towards something else. */
const recent: Intent[] = [];

function surfaceById(world: World, id: string | null) {
  return id ? world.surfaces.find((s) => s.id === id) ?? null : null;
}

function note(a: Actor, msg: string) {
  a.log.push(msg);
  if (a.log.length > 40) a.log.shift();
}

function puff(a: Actor, kind: FX["kind"], x = a.x, y = a.y + a.body.h / 2) {
  a.fx.push({ id: ++a.fxSeq, kind, x, y });
}

// ------------------------------------------------------------------ routes

interface Hop {
  take: number;
  land: { x: number; y: number };
  to: Surface;
}

const hopCache = new WeakMap<World, Map<string, Hop | null>>();

/** One jump from somewhere on `a` to somewhere on `b`, if any is possible. */
function findHop(world: World, a: Surface, b: Surface, actor: Actor): Hop | null {
  let cache = hopCache.get(world);
  if (!cache) hopCache.set(world, (cache = new Map()));
  const key = `${actor.kind}|${a.id}>${b.id}`;
  if (cache.has(key)) return cache.get(key)!;

  const body = { ...actor.body, maxUp: actor.sp.maxUp };
  const [a0, a1] = standRange(a, actor.body.hw);
  const [b0, b1] = standRange(b, actor.body.hw);
  let found: Hop | null = null;
  outer: for (const lx of [(b0 + b1) / 2, b0, b1]) {
    for (const off of [0, 0.7, 1.1, 1.6, 2.2, 0.35, 2.9]) {
      for (const dir of [-1, 1]) {
        const take = clamp(lx - dir * off, a0, a1);
        if (Math.abs(take - lx) < 0.05 && Math.abs(a.y - b.y) < 0.05) continue;
        if (planArc(world, { x: take, y: a.y }, { x: lx, y: b.y }, body)) {
          found = { take, land: { x: lx, y: b.y }, to: b };
          break outer;
        }
      }
    }
  }
  cache.set(key, found);
  return found;
}

/** Walks and jumps from where the actor stands to surface `goal`. */
function route(world: World, actor: Actor, goal: Surface): Task[] | null {
  const start = surfaceById(world, actor.surface);
  if (!start) return null;
  if (start.id === goal.id) return [];
  const prev = new Map<string, { from: string; hop: Hop }>();
  const seen = new Set([start.id]);
  const queue = [start];
  while (queue.length) {
    const s = queue.shift()!;
    if (s.id === goal.id) break;
    for (const t of world.surfaces) {
      if (seen.has(t.id)) continue;
      const hop = findHop(world, s, t, actor);
      if (!hop) continue;
      seen.add(t.id);
      prev.set(t.id, { from: s.id, hop });
      queue.push(t);
    }
  }
  if (!prev.has(goal.id)) return null;
  const hops: Hop[] = [];
  for (let id = goal.id; id !== start.id; id = prev.get(id)!.from) hops.unshift(prev.get(id)!.hop);
  return hops.flatMap((h): Task[] => [
    { k: "walk", x: h.take },
    { k: "jump", to: h.land, land: h.to.id, lift: 0.4 },
  ]);
}

/** Back down to the table from wherever it is. */
function homeTasks(world: World, a: Actor): Task[] {
  const here = surfaceById(world, a.surface);
  if (!here || here.kind === "table") return [];
  for (const t of world.surfaces.filter((s) => s.kind === "table")) {
    const path = route(world, a, t);
    if (path) return path;
  }
  return [];
}

// --------------------------------------------------------------- choosing

function strollTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  const s = surfaceById(world, a.surface);
  if (!s) return null;
  const [r0, r1] = standRange(s, a.body.hw);
  if (r1 - r0 < 1) return null;
  let x = between(rng, r0, r1);
  if (Math.abs(x - a.x) < 0.8) x = a.x < (r0 + r1) / 2 ? r1 : r0;
  return [{ k: "walk", x }, { k: "pose", pose: "look", dur: between(rng, 0.5, 1) }];
}

/** Head for somewhere on the table. If something solid is in the way the
 *  critter goes over it when it can, and otherwise walks up to it, takes a
 *  look, and turns back. */
function exploreTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  const s = surfaceById(world, a.surface);
  if (!s || s.kind !== "table") return null;
  const goalX = between(rng, a.body.hw, world.width - a.body.hw);
  const [r0, r1] = standRange(s, a.body.hw);
  if (goalX >= r0 && goalX <= r1) {
    return Math.abs(goalX - a.x) < 2 ? null : [{ k: "walk", x: goalX }, { k: "pose", pose: "look", dur: 0.6 }];
  }
  const dir: 1 | -1 = goalX > a.x ? 1 : -1;
  const beyond = world.surfaces
    .filter((t) => t.kind === "table" && t.id !== s.id && (dir > 0 ? t.x0 >= s.x1 : t.x1 <= s.x0))
    .sort((p, q) => Math.abs(p.x0 - s.x0) - Math.abs(q.x0 - s.x0))[0];
  const path = beyond ? route(world, a, beyond) : null;
  if (path) {
    const [b0, b1] = standRange(beyond!, a.body.hw);
    return [...path, { k: "walk", x: between(rng, b0, b1) }, { k: "pose", pose: "look", dur: 0.6 }];
  }
  // Blocked: up to the obstacle, a look at it, and back the other way.
  const edge = dir > 0 ? r1 : r0;
  if (Math.abs(edge - a.x) < 0.3) return null;
  note(a, "blocked: turning back");
  return [
    { k: "walk", x: edge },
    { k: "pose", pose: "look", dur: 0.9, face: dir },
    { k: "walk", x: between(rng, r0, r1) },
  ];
}

/** Up onto one of the boxes (Tries, Best…), a look round. */
function climbTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  const here = surfaceById(world, a.surface);
  if (!here) return null;
  const boxes = world.surfaces.filter((t) => t.kind === "box" && t.id !== here.id).sort(() => rng() - 0.5);
  for (const t of boxes) {
    const path = route(world, a, t);
    if (!path || path.length > 6) continue;
    const [t0, t1] = standRange(t, a.body.hw);
    return [
      ...path,
      { k: "walk", x: between(rng, t0, t1) },
      { k: "pose", pose: rng() < 0.5 ? "wave" : "look", dur: 1.3 },
    ];
  }
  return null;
}

/** Up onto the title and along it, letter to letter. */
function lettersTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  const tops = world.surfaces.filter((s) => s.kind === "letter").sort((p, q) => (p.index ?? 0) - (q.index ?? 0));
  if (tops.length < 2) return null;
  const startAt = Math.floor(rng() * Math.max(1, tops.length - 2));
  for (let i = startAt; i < tops.length - 1; i++) {
    const first = tops[i];
    const path = route(world, a, first);
    if (!path) continue;
    const tasks: Task[] = [...path];
    // Hop along the letters, as far as it can, two to five of them.
    const ghost: Actor = { ...a, surface: first.id };
    const want = 2 + Math.floor(rng() * 4);
    let count = 0;
    for (let j = i + 1; j < tops.length && count < want; j++) {
      const hop = findHop(world, surfaceById(world, ghost.surface)!, tops[j], ghost);
      if (!hop) break;
      tasks.push({ k: "walk", x: hop.take }, { k: "jump", to: hop.land, land: tops[j].id, lift: 0.4 });
      ghost.surface = tops[j].id;
      count++;
    }
    if (!count) continue;
    tasks.push({ k: "pose", pose: rng() < 0.5 ? "wave" : "trick", dur: 1.4 });
    return tasks;
  }
  return null;
}

/** Monkey bars along the title: jump up to a letter, swing hand over hand
 *  to the next ones, drop back down onto the table. */
function swingTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  const s = surfaceById(world, a.surface);
  if (!s || s.kind !== "table" || world.grips.length < 2) return null;
  const runs: Grip[][] = [];
  let run: Grip[] = [];
  for (const g of world.grips) {
    const last = run[run.length - 1];
    if (last && g.index === last.index + 1 && Math.abs(g.x - last.x) <= PHYS.gripSpacing && Math.abs(g.y - last.y) < 0.35) run.push(g);
    else {
      if (run.length >= 2) runs.push(run);
      run = [g];
    }
  }
  if (run.length >= 2) runs.push(run);
  const body = { ...a.body, maxUp: a.sp.maxUp };
  const [r0, r1] = standRange(s, a.body.hw);
  for (const r of runs.sort(() => rng() - 0.5)) {
    const dir = rng() < 0.5 ? 1 : -1;
    const bars = (dir > 0 ? r : [...r].reverse()).slice(0, 3 + Math.floor(rng() * 4));
    const first = bars[0];
    const last = bars[bars.length - 1];
    const hangY = first.y - a.body.h - ARM;
    const below = surfaceBelow(world, last.x, last.y - a.body.h - ARM);
    if (!below || below.kind !== "table") continue;
    for (const off of [0.6, 1, 1.4, 1.9, 0]) {
      const take = clamp(first.x - dir * off, r0, r1);
      if (planArc(world, { x: take, y: s.y }, { x: first.x, y: hangY }, body, 0)) {
        return [
          { k: "walk", x: take },
          { k: "jump", to: { x: first.x, y: hangY }, land: null, lift: 0, grip: first },
          { k: "swing", grips: bars },
          { k: "drop" },
        ];
      }
    }
  }
  return null;
}

/** All the way round the table, feet on the frame, and back to the start. */
function tourTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  const s = surfaceById(world, a.surface);
  if (!world.tour || !s || s.kind !== "table") return null;
  return [{ k: "tour", dir: rng() < 0.5 ? 1 : -1 }, { k: "pose", pose: "wave", dur: 1.2 }];
}

/** A small flourish between journeys: a wave or the species' own trick. */
function flourish(a: Actor, rng: Rng): Task {
  if (rng() < 0.5) return { k: "pose", pose: "wave", dur: 1.3 };
  return a.sp.peekaboo ? { k: "pose", pose: "boo", dur: BOO_S } : { k: "pose", pose: "trick", dur: 1.3 };
}

function trickTasks(world: World, a: Actor, rng: Rng): Task[] | null {
  if (a.sp.peekaboo && rng() < 0.7) return [{ k: "pose", pose: "boo", dur: BOO_S }];
  if (rng() < 0.5) return [{ k: "pose", pose: "trick", dur: 1.8 }];
  // The vanishing act: gone in a puff, back in a puff somewhere else.
  const spots = world.surfaces.filter((s) => s.id !== a.surface && s.x1 - s.x0 >= 1);
  if (!spots.length) return [{ k: "pose", pose: "trick", dur: 1.8 }];
  const s = spots[Math.floor(rng() * spots.length)];
  const [s0, s1] = standRange(s, a.body.hw);
  return [{ k: "pose", pose: "trick", dur: 0.8 }, { k: "vanish", to: { x: between(rng, s0, s1), surface: s } }];
}

function exitTasks(world: World, a: Actor, rng: Rng): Task[] {
  const s = surfaceById(world, a.surface);
  if (s?.kind === "table") return [{ k: "sink" }];
  if (s && rng() < 0.6) {
    const down = homeTasks(world, a);
    if (down.length) return [...down, { k: "sink" }];
  }
  if (a.y + a.body.h < world.ceiling && !hitsSomething(world, bodyAt(a.x, a.y, a.body.hw, world.ceiling - a.y))) {
    return [{ k: "ascend" }];
  }
  return [{ k: "vanish", to: null }];
}

const PLANNERS: Record<Intent, (w: World, a: Actor, r: Rng) => Task[] | null> = {
  stroll: strollTasks,
  explore: exploreTasks,
  climb: climbTasks,
  letters: lettersTasks,
  swing: swingTasks,
  tour: tourTasks,
  wave: () => [{ k: "pose", pose: "wave", dur: 1.8 }],
  trick: trickTasks,
};

/** Things that go somewhere, as opposed to gestures made on the spot. */
const JOURNEYS: Intent[] = ["climb", "letters", "swing", "tour", "explore", "stroll"];

function decide(world: World, a: Actor, rng: Rng): Task[] {
  if (a.budget <= 0) return exitTasks(world, a, rng);
  a.budget--;

  const choose = (i: Intent, tasks: Task[]) => {
    a.did.push(i);
    recent.push(i);
    if (recent.length > 8) recent.shift();
    note(a, i);
    // Between journeys, a flourish now and then, so the mix keeps moving.
    if (JOURNEYS.includes(i) && i !== "tour" && rng() < 0.35) tasks.push(flourish(a, rng));
    return tasks;
  };

  if (a.forced) {
    const intent = a.forced;
    const plan = PLANNERS[intent](world, a, rng);
    a.forcedTries = (a.forcedTries ?? 0) + 1;
    if (plan?.length || a.forcedTries >= 3) a.forced = undefined;
    if (plan?.length) {
      note(a, "forced");
      return choose(intent, plan);
    }
  }

  // Never the same thing twice running, less of what it already did this
  // visit and of what recent visitors did, and some chance on top so it
  // never feels scripted.
  const last = a.did[a.did.length - 1];
  const options = (Object.keys(PLANNERS) as Intent[])
    .filter((i) => i !== last && a.sp.weights[i] > 0)
    .map((i) => {
      let w = a.sp.weights[i] * (0.6 + rng() * 0.8);
      if (a.did.includes(i)) w *= 0.15;
      w *= 1 / (1 + recent.filter((r) => r === i).length);
      return { i, w };
    })
    .sort((p, q) => q.w - p.w);
  for (const { i } of options) {
    const tasks = PLANNERS[i](world, a, rng);
    if (tasks?.length) return choose(i, tasks);
  }
  return [{ k: "pose", pose: "look", dur: 1 }];
}

// ----------------------------------------------------------------- spawning

const ROUTINE_INTENT: Partial<Record<Routine, Intent>> = {
  walk: "explore", box: "climb", letters: "letters", swing: "swing", tour: "tour", trick: "trick",
};

/**
 * A critter enters, or null when this world has nowhere to put one (a
 * hidden board, a screen with no room above the table at all). It comes up
 * from behind the table's edge, or down on a thread from the top of the
 * screen.
 */
export function spawnActor(world: World, kind: CritterKind, rng: Rng, routine?: Routine): Actor | null {
  const body = bodyOf(kind);
  const sp = SPECIES[kind];
  const a: Actor = {
    kind, sp, body, x: 0, y: 0, facing: 1, mode: "rise", t: 0, dur: 0.7, surface: null, frac: 0,
    queue: [], budget: 3 + Math.floor(rng() * 3), did: [], pose: "stand", moving: false, visible: true,
    angle: 0, pivot: null, thread: null, fx: [], fxSeq: 0, log: [],
    forced: routine ? ROUTINE_INTENT[routine] : undefined,
  };

  const tables = world.surfaces.filter((s) => s.kind === "table" && s.x1 - s.x0 >= 1.2);
  const drops = world.surfaces.flatMap((s) => {
    const [s0, s1] = standRange(s, body.hw);
    const spots = [];
    for (let i = 0; i < 6; i++) {
      const x = s0 + ((s1 - s0) * (i + 0.5)) / 6;
      // the whole corridor down from the top, plus room to sway
      if (!hitsSomething(world, bodyAt(x, s.y, body.hw + SWAY, world.ceiling - s.y))) spots.push({ s, x });
    }
    return spots;
  });

  let entrance: "rise" | "peek" | "descend" | null =
    routine === "dangle" ? "descend" : routine === "peek" ? "peek" : routine ? "rise" : null;
  if (routine === "speak") {
    // It has come to deliver a message: up onto the table, and say it.
    a.queue = [{ k: "pose", pose: "talk", dur: TALK_S }];
    a.budget = 2;
  }
  if (!entrance) {
    const r = rng();
    entrance = r < 0.15 && tables.length ? "peek" : r < 0.7 && tables.length ? "rise" : drops.length ? "descend" : tables.length ? "rise" : null;
  }
  if ((entrance === "rise" || entrance === "peek") && !tables.length) entrance = drops.length ? "descend" : null;
  if (entrance === "descend" && !drops.length) entrance = tables.length ? "rise" : null;
  if (!entrance) return null;

  if (entrance === "descend") {
    const { s, x } = drops[Math.floor(rng() * drops.length)];
    a.x = x;
    a.surface = s.id;
    a.frac = s.kind === "table" ? x / world.width : (x - s.x0) / Math.max(0.001, s.x1 - s.x0);
    a.mode = "descend";
    a.from = world.ceiling + 0.1;
    // Swing to a stop just clear of the surface, then touch down — feet
    // never sweep through what they are about to stand on.
    a.to = s.y + HOVER;
    a.y = a.from;
    a.dur = Math.max(0.8, (a.from - a.to) / 3.2);
    a.thread = { x, top: world.ceiling };
    a.pose = "hang";
    note(a, "enter: thread");
  } else {
    const s = tables[Math.floor(rng() * tables.length)];
    const [s0, s1] = standRange(s, body.hw);
    a.x = between(rng, s0, s1);
    a.surface = s.id;
    a.y = -body.h - 0.05;
    a.mode = "rise";
    a.from = a.y;
    a.to = entrance === "peek" ? -body.h * 0.45 : 0;
    if (entrance === "peek") {
      // A peek and a wave — and half the time it climbs right out after all.
      a.queue = [{ k: "pose", pose: "wave", dur: 2 }];
      if (rng() < 0.5) {
        a.budget = 0;
        a.queue.push({ k: "sink" });
      } else {
        a.queue.push({ k: "climbOut" });
      }
    }
    note(a, `enter: ${entrance}`);
  }
  a.facing = a.x < world.width / 2 ? 1 : -1;
  remember(world, a);
  return a;
}

// ------------------------------------------------------------------ the tour

interface Leg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** body rotation while on this leg, degrees */
  angle: number;
  len: number;
}

/**
 * The outline of the table as five legs, starting and ending at the
 * critter's spot on the top. Clockwise: along the top to the right, down
 * the right side (feet against the frame), back along the underside upside
 * down, up the left side, and along the top to where it began.
 * Anticlockwise mirrors it.
 */
function tourLegs(world: World, startX: number, dir: 1 | -1): Leg[] {
  const t = world.tour!;
  const TL = { x: t.x0, y: 0 };
  const TR = { x: t.x1, y: 0 };
  const BR = { x: t.x1, y: t.y0 };
  const BL = { x: t.x0, y: t.y0 };
  const start = { x: clamp(startX, t.x0, t.x1), y: 0 };
  const pts = dir > 0 ? [start, TR, BR, BL, TL, start] : [start, TL, BL, BR, TR, start];
  const angles = dir > 0 ? [0, 90, 180, 270, 360] : [0, -90, -180, -270, -360];
  return pts.slice(0, -1).map((p, i) => {
    const q = pts[i + 1];
    return { ax: p.x, ay: p.y, bx: q.x, by: q.y, angle: angles[i], len: Math.hypot(q.x - p.x, q.y - p.y) };
  });
}

/** Where `ts.s` along the tour puts the feet, and which way up. */
function tourAt(world: World, ts: TourState, pace: number) {
  const legs = tourLegs(world, ts.startFrac * world.width, ts.dir);
  const cornerLen = CORNER * pace;
  let s = ts.s;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (s <= L.len) {
      const u = L.len ? s / L.len : 1;
      return { x: L.ax + (L.bx - L.ax) * u, y: L.ay + (L.by - L.ay) * u, angle: L.angle, done: false };
    }
    s -= L.len;
    if (i < legs.length - 1) {
      if (s <= cornerLen) {
        // turning round the corner, feet planted on it
        const next = legs[i + 1];
        return { x: L.bx, y: L.by, angle: L.angle + (next.angle - L.angle) * (s / cornerLen), done: false };
      }
      s -= cornerLen;
    }
  }
  const end = legs[legs.length - 1];
  return { x: end.bx, y: end.by, angle: 0, done: true };
}

function tourTotal(world: World, ts: TourState, pace: number) {
  return tourLegs(world, ts.startFrac * world.width, ts.dir).reduce((n, L) => n + L.len, 0) + 4 * CORNER * pace;
}

// ------------------------------------------------------------------ physics

function remember(world: World, a: Actor) {
  const s = surfaceById(world, a.surface);
  if (!s) return;
  a.frac = s.kind === "table" ? a.x / world.width : (a.x - s.x0) / Math.max(0.001, s.x1 - s.x0);
}

function face(a: Actor, dir: number) {
  if (!a.sp.sideways && dir !== 0) a.facing = dir > 0 ? 1 : -1;
}

function begin(world: World, a: Actor, rng: Rng) {
  if (!a.queue.length) a.queue = decide(world, a, rng);
  const task = a.queue.shift()!;
  a.t = 0;
  a.moving = false;
  a.angle = 0;
  a.pivot = null;
  switch (task.k) {
    case "walk": {
      const s = surfaceById(world, a.surface);
      const [r0, r1] = s ? standRange(s, a.body.hw) : [a.x, a.x];
      const target = clamp(task.x, r0, r1);
      a.mode = "walk";
      a.walk = { target, dash: a.sp.burst };
      a.pose = "walk";
      face(a, target - a.x);
      return;
    }
    case "jump": {
      const arc = planArc(world, { x: a.x, y: a.y }, task.to, { ...a.body, maxUp: a.sp.maxUp }, task.lift);
      if (!arc) {
        // The world changed under the plan; think again from here.
        note(a, "jump no longer possible");
        a.queue = [];
        a.mode = "pose";
        a.pose = "look";
        a.dur = 0.5;
        return;
      }
      a.mode = "jump";
      a.arc = arc;
      a.landOn = task.land;
      a.grip = task.grip;
      a.dur = arc.T;
      a.pose = "air";
      a.surface = null;
      face(a, task.to.x - a.x);
      return;
    }
    case "pose":
      a.mode = "pose";
      a.pose = task.pose;
      a.dur = task.dur;
      if (task.face) face(a, task.face);
      if (task.pose === "trick") puff(a, "sparkle", a.x, a.y + a.body.h + 0.2);
      // the "BOO!" is timed by CSS to land on the pop, just past halfway
      if (task.pose === "boo") puff(a, "boo", a.x + a.facing * 0.3, a.y + a.body.h + 0.25);
      return;
    case "swing":
      a.mode = "swing";
      a.swing = { grips: task.grips, i: 0 };
      a.dur = 0.55;
      a.pose = "hang";
      face(a, task.grips.length > 1 ? task.grips[1].x - task.grips[0].x : a.facing);
      return;
    case "tour": {
      if (!world.tour) {
        a.mode = "pose";
        a.pose = "look";
        a.dur = 0.4;
        return;
      }
      const ts: TourState = { dir: task.dir, pace: a.sp.speed * TOUR_PACE, startFrac: a.x / world.width, s: 0, total: 0 };
      ts.total = tourTotal(world, ts, ts.pace);
      if (ts.total / ts.pace > TOUR_MAX_S) {
        ts.pace = ts.total / TOUR_MAX_S;
        ts.total = tourTotal(world, ts, ts.pace);
      }
      a.tour = ts;
      a.mode = "tour";
      a.pose = "walk";
      a.moving = true;
      a.facing = task.dir;
      a.surface = null;
      return;
    }
    case "drop":
      a.mode = "fall";
      a.fall = { vy: 0 };
      a.pose = "air";
      a.surface = null;
      return;
    case "climbOut":
      // from a peek, all the way up onto the table before anything else
      a.mode = "rise";
      a.from = a.y;
      a.to = 0;
      a.dur = 0.4;
      a.pose = "stand";
      return;
    case "sink":
      a.mode = "sink";
      a.from = a.y;
      a.to = -a.body.h - 0.05;
      a.dur = 0.6;
      a.pose = "stand";
      return;
    case "ascend":
      a.mode = "ascend";
      a.thread = { x: a.x, top: world.ceiling };
      a.from = a.y;
      a.to = world.ceiling + 0.2;
      a.dur = Math.max(0.8, (world.ceiling - a.y) / 3.2) + 0.4;
      a.pose = "stand";
      a.surface = null;
      return;
    case "vanish":
      a.mode = "vanish";
      a.next = task.to;
      a.dur = 0.5;
      puff(a, "puff");
      return;
  }
}

function hangFeet(a: Actor, gx: number, gy: number) {
  return { x: gx, y: gy - a.body.h - ARM };
}

/**
 * Advance one actor by dt seconds. Returns false once it has left.
 */
export function step(world: World, a: Actor, dt: number, rng: Rng): boolean {
  a.t += dt;
  const u = a.dur > 0 ? a.t / a.dur : 1;

  switch (a.mode) {
    case "gone":
      return false;

    case "rise":
    case "sink": {
      a.y = a.from! + (a.to! - a.from!) * ease(u);
      if (u >= 1) {
        a.y = a.to!;
        if (a.mode === "sink") {
          a.mode = "gone";
          return false;
        }
        begin(world, a, rng);
      }
      return true;
    }

    case "descend": {
      a.y = a.from! + (a.to! - a.from!) * ease(u);
      if (u >= 1) {
        a.y = a.to!;
        a.mode = "settle";
        a.t = 0;
        a.dur = 1.3;
      }
      return true;
    }

    case "settle": {
      // A damped pendulum on the thread; the period follows its length.
      const len = Math.max(0.5, a.thread!.top - (a.y + a.body.h));
      const period = 2 * Math.PI * Math.sqrt(len / PHYS.gravity) * 2;
      a.pivot = { x: a.thread!.x, y: a.thread!.top };
      // Sway no further sideways than the clear air beside it allows.
      const reach = len + a.body.h;
      const amp = Math.min(8, (Math.atan(SWAY / reach) * 180) / Math.PI);
      a.angle = amp * Math.exp(-a.t / 0.5) * Math.sin((2 * Math.PI * a.t) / period);
      // the last stretch: lowered onto its feet once the swing has died
      const settleY = a.to!;
      if (a.t > a.dur - 0.25) a.y = settleY - HOVER * clamp((a.t - (a.dur - 0.25)) / 0.2, 0, 1);
      if (u >= 1) {
        a.y = settleY - HOVER;
        a.thread = null;
        a.pivot = null;
        a.angle = 0;
        a.pose = "stand";
        remember(world, a);
        begin(world, a, rng);
      }
      return true;
    }

    case "ascend": {
      // A beat for the thread to come down, then up and away.
      const climb = Math.max(0, a.t - 0.4) / Math.max(0.01, a.dur - 0.4);
      a.y = a.from! + (a.to! - a.from!) * clamp(climb, 0, 1) ** 1.5;
      a.pose = a.y - a.from! > 0.1 ? "hang" : "stand";
      if (u >= 1) {
        a.mode = "gone";
        return false;
      }
      return true;
    }

    case "walk": {
      const w = a.walk!;
      const dir = Math.sign(w.target - a.x);
      const left = Math.abs(w.target - a.x);
      const stepLen = Math.min(left, a.sp.speed * dt);
      a.x += dir * stepLen;
      a.moving = stepLen > 0;
      if (a.sp.burst) {
        w.dash -= stepLen;
        if (w.dash <= 0 && left - stepLen > 0.05) {
          a.mode = "rest";
          a.t = 0;
          a.dur = between(rng, 0.2, 0.45);
          a.moving = false;
          a.pose = "stand";
          return true;
        }
      }
      remember(world, a);
      if (left - stepLen <= 1e-4) {
        a.x = w.target;
        begin(world, a, rng);
      }
      return true;
    }

    case "rest": {
      if (u >= 1) {
        a.mode = "walk";
        a.walk!.dash = a.sp.burst * between(rng, 0.7, 1.3);
        a.pose = "walk";
      }
      return true;
    }

    case "tour": {
      const ts = a.tour!;
      if (!world.tour) {
        // the room round the table went away (rotation, resize): let go
        a.mode = "fall";
        a.fall = { vy: 0 };
        a.angle = 0;
        a.pivot = null;
        return true;
      }
      ts.s += ts.pace * dt;
      const p = tourAt(world, ts, ts.pace);
      a.x = p.x;
      a.y = p.y;
      a.angle = p.angle;
      a.pivot = { x: p.x, y: p.y };
      a.moving = true;
      if (p.done) {
        a.angle = 0;
        a.pivot = null;
        const s = surfaceBelow(world, a.x, 0.01);
        if (!s) {
          a.mode = "fall";
          a.fall = { vy: 0 };
          return true;
        }
        const [r0, r1] = standRange(s, a.body.hw);
        a.x = clamp(a.x, r0, r1);
        a.y = 0;
        a.surface = s.id;
        note(a, "tour complete");
        remember(world, a);
        begin(world, a, rng);
      }
      return true;
    }

    case "jump": {
      const p = arcAt(a.arc!, Math.min(a.t, a.arc!.T));
      a.x = p.x;
      a.y = p.y;
      if (a.t >= a.arc!.T) {
        if (a.grip) {
          const g = a.grip;
          a.grip = undefined;
          const f = hangFeet(a, g.x, g.y);
          a.x = f.x;
          a.y = f.y;
          a.pose = "hang";
          a.mode = "hang";
          a.pivot = { x: g.x, y: g.y };
          a.t = 0;
          a.dur = 0.35;
          return true;
        }
        a.surface = a.landOn ?? surfaceBelow(world, a.x, a.y + 0.01)?.id ?? null;
        a.pose = "stand";
        remember(world, a);
        begin(world, a, rng);
      }
      return true;
    }

    case "hang": {
      a.angle = -a.facing * 10 * Math.exp(-a.t / 0.15) * Math.cos(a.t * 18);
      if (u >= 1) begin(world, a, rng);
      return true;
    }

    case "swing": {
      const sw = a.swing!;
      const g0 = sw.grips[sw.i];
      const g1 = sw.grips[sw.i + 1];
      if (!g1) {
        a.angle = 0;
        begin(world, a, rng);
        return true;
      }
      // Hand over hand: the grip slides along a shallow arc, the body
      // trails behind and then swings through underneath.
      const v = clamp(u, 0, 1);
      const hx = g0.x + (g1.x - g0.x) * v;
      const hy = g0.y + (g1.y - g0.y) * v + 0.12 * Math.sin(Math.PI * v);
      const f = hangFeet(a, hx, hy);
      a.x = f.x;
      a.y = f.y;
      a.pivot = { x: hx, y: hy };
      a.angle = a.facing * 22 * -Math.cos(Math.PI * v);
      if (v >= 1) {
        sw.i++;
        a.t = 0;
      }
      return true;
    }

    case "fall": {
      const f = a.fall!;
      const before = a.y;
      f.vy -= PHYS.gravity * dt;
      if (a.sp.flies) f.vy = Math.max(f.vy, -FLOAT_FALL);
      a.y += f.vy * dt;
      // Land on whatever the whole footprint meets first, not just what is
      // under its centre — a body does not slip through a crack.
      const x0 = a.x - a.body.hw * 0.8;
      const x1 = a.x + a.body.hw * 0.8;
      const tops = world.objects
        .filter((o) => o.solid && o.rect.x0 < x1 && o.rect.x1 > x0 && o.rect.y1 <= before + 1e-6)
        .map((o) => o.rect.y1);
      const ground = world.surfaces
        .filter((sf) => sf.x0 < x1 && sf.x1 > x0 && sf.y <= before + 1e-6)
        .sort((p, q) => q.y - p.y)[0];
      const floorY = Math.max(ground?.y ?? -Infinity, ...tops);
      if (floorY > -Infinity && a.y <= floorY) {
        a.y = floorY;
        if (ground && Math.abs(ground.y - floorY) < 1e-6) {
          const [r0, r1] = standRange(ground, a.body.hw);
          a.x = clamp(a.x, r0, r1);
          a.surface = ground.id;
          a.pose = "stand";
          remember(world, a);
          begin(world, a, rng);
        } else {
          // Landed somewhere with no room to stand: off it goes, by magic.
          a.queue = [{ k: "vanish", to: null }];
          begin(world, a, rng);
        }
      } else if (a.y < -a.body.h - 0.5) {
        a.mode = "gone";
        return false;
      }
      return true;
    }

    case "pose": {
      if (u >= 1) begin(world, a, rng);
      return true;
    }

    case "vanish": {
      if (a.t > 0.18) a.visible = false;
      if (u >= 1) {
        if (!a.next) {
          a.mode = "gone";
          return false;
        }
        a.x = a.next.x;
        a.y = a.next.surface.y;
        a.surface = a.next.surface.id;
        a.visible = true;
        a.next = undefined;
        remember(world, a);
        puff(a, "puff");
        a.queue.unshift({ k: "pose", pose: "wave", dur: 1.2 });
        begin(world, a, rng);
      }
      return true;
    }
  }
}

/** How long a message is held up if nobody taps it away, seconds. */
export const TALK_SECONDS = TALK_S;

/**
 * A message has arrived while this critter is on stage: it delivers it from
 * where it is. On its feet it stops and holds the message up; mid-jump or
 * mid-tour it carries on and the bubble simply goes with it.
 */
export function speak(a: Actor) {
  if (a.mode === "walk" || a.mode === "rest" || a.mode === "pose") {
    a.queue = [];
    a.mode = "pose";
    a.pose = "talk";
    a.t = 0;
    a.dur = TALK_S;
    a.moving = false;
    a.budget = Math.max(a.budget, 1);
  }
}

/** The message has been read: the critter stops holding it up. */
export function hush(a: Actor) {
  if (a.mode === "pose" && a.pose === "talk") a.t = a.dur;
}

/**
 * The world was re-measured (resize, rotation, the layout shifted). Put the
 * critter back on the same spot of the same thing — the same fraction along
 * the table, or of the box or letter it was standing on, or the same point
 * of its tour. Anything mid-air lets go and falls onto whatever is now
 * below it.
 */
export function rehome(old: World, next: World, a: Actor) {
  const scaleX = (x: number) => (x / old.width) * next.width;
  const grounded = a.mode === "walk" || a.mode === "rest" || a.mode === "pose" || a.mode === "rise" || a.mode === "sink";
  const was = surfaceById(old, a.surface);

  if (a.mode === "tour" && a.tour) {
    if (next.tour) {
      const frac = a.tour.s / Math.max(0.001, a.tour.total);
      a.tour.total = tourTotal(next, a.tour, a.tour.pace);
      a.tour.s = frac * a.tour.total;
      return;
    }
    // No room to go round any more: off it goes in a puff.
    a.queue = [];
    a.angle = 0;
    a.pivot = null;
    a.mode = "vanish";
    a.next = null;
    a.t = 0;
    a.dur = 0.5;
    puff(a, "puff");
    return;
  }

  if (grounded && was) {
    const same =
      was.kind === "table"
        ? surfaceBelow(next, a.frac * next.width, 0.01)
        : next.surfaces.find((s) => s.on === was.on) ?? null;
    if (same && (same.kind === "table") === (was.kind === "table")) {
      a.x = same.kind === "table" ? a.frac * next.width : same.x0 + a.frac * (same.x1 - same.x0);
      const [r0, r1] = standRange(same, a.body.hw);
      a.x = clamp(a.x, r0, r1);
      if (a.mode !== "rise" && a.mode !== "sink") a.y = same.y;
      a.surface = same.id;
      if (a.mode === "walk" || a.mode === "rest") {
        // the old target is in the old geometry; re-plan from here
        a.queue = [];
        a.mode = "pose";
        a.pose = "look";
        a.t = 0;
        a.dur = 0.3;
      }
      return;
    }
  }
  if (a.mode === "vanish" || a.mode === "gone") return;
  // On its way down a thread: carry on down to the same thing, re-aimed.
  if ((a.mode === "descend" || a.mode === "settle") && was) {
    const same = next.surfaces.find((s) => s.on === was.on);
    if (same) {
      const [r0, r1] = standRange(same, a.body.hw);
      a.x = clamp(was.kind === "table" ? scaleX(a.x) : same.x0 + a.frac * (same.x1 - same.x0), r0, r1);
      if (!hitsSomething(next, bodyAt(a.x, same.y, a.body.hw + SWAY, next.ceiling - same.y))) {
        a.surface = same.id;
        a.to = same.y + HOVER;
        a.from = Math.min(a.from!, next.ceiling + 0.1);
        a.thread = { x: a.x, top: next.ceiling };
        if (a.mode === "settle") a.y = a.to;
        return;
      }
    }
  }
  // Lost its footing: let gravity sort it out.
  a.x = clamp(scaleX(a.x), a.body.hw, next.width - a.body.hw);
  a.y = Math.max(0, Math.min(a.y, next.ceiling - a.body.h));
  a.queue = [];
  a.thread = null;
  a.pivot = null;
  a.angle = 0;
  a.surface = null;
  a.mode = "fall";
  a.fall = { vy: 0 };
  a.pose = "air";
}

/** Read-only check used by tests: is the actor somewhere physically valid? */
export function isValidPlacement(world: World, a: Actor): boolean {
  if (!a.visible || a.mode === "gone") return true;
  if (a.mode === "rise" || a.mode === "sink") return true; // behind the table edge
  if (a.mode === "tour") {
    // feet on the table's outline
    const t = world.tour;
    if (!t) return false;
    const e = 1e-3;
    const onTop = Math.abs(a.y) < e && a.x >= t.x0 - e && a.x <= t.x1 + e;
    const onBottom = Math.abs(a.y - t.y0) < e && a.x >= t.x0 - e && a.x <= t.x1 + e;
    const onSide = (Math.abs(a.x - t.x0) < e || Math.abs(a.x - t.x1) < e) && a.y <= e && a.y >= t.y0 - e;
    return onTop || onBottom || onSide;
  }
  const grounded = a.mode === "walk" || a.mode === "rest" || a.mode === "pose";
  if (grounded) {
    const s = surfaceById(world, a.surface);
    if (!s || a.x < s.x0 - 1e-3 || a.x > s.x1 + 1e-3) return false;
    // standing on it — or, peeking, half hidden behind the table's edge
    const peeking = s.kind === "table" && a.y < 0 && a.y >= -a.body.h - 0.06;
    if (Math.abs(a.y - s.y) > 1e-3 && !peeking) return false;
    if (peeking) return true;
  }
  if (a.mode === "swing" || a.mode === "hang" || a.mode === "settle" || a.mode === "descend" || a.mode === "ascend") return true;
  if (a.y < -1e-3) return false; // never inside the table
  return !hitsSomething(world, bodyAt(a.x, a.y, a.body.hw * 0.85, a.body.h * 0.9));
}
