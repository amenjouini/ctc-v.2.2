import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorld, planArc, standRange, type WorldInput } from "../src/world/world";
import { isValidPlacement, rehome, spawnActor, step, type Actor, type Intent, type Routine } from "../src/world/actor";
import { SPRITES, bodyOf, type CritterKind } from "../src/world/sprites";

/** Deterministic randomness so a failure can be replayed. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const U = 32;
/** A desktop solo page, shaped like the real layout: title and boxes in
 *  the header, a body of room above the header, around and under the board. */
const desktop: WorldInput = {
  unit: U,
  table: { left: 132, right: 852, surface: 172, bottom: 760, ring: 4 },
  stage: { width: 1280, height: 800 },
  props: [
    { id: "tries", left: 610, right: 700, top: 88, bottom: 132 },
    { id: "best", left: 708, right: 800, top: 88, bottom: 132 },
    { id: "quit", left: 900, right: 960, top: 88, bottom: 132 },
  ],
  letters: "Cracktheode".split("").map((_, i) => ({
    id: `l${i}`, index: i, left: 140 + i * 30, right: 166 + i * 30,
    top: i % 3 === 1 ? 92 : 86, bottom: 122,
  })),
};
/** A small phone with no reserved space: the header sits right on the table. */
const cramped: WorldInput = {
  unit: U,
  table: { left: 12, right: 308, surface: 60, bottom: 556, ring: 3 },
  stage: { width: 320, height: 568 },
  props: [
    { id: "best", left: 12, right: 100, top: 10, bottom: 50 },
    { id: "quit", left: 200, right: 308, top: 10, bottom: 50 },
  ],
  letters: [],
};
/** The same table with a real (solid) obstacle on it. */
const walled: WorldInput = {
  ...desktop,
  props: [{ id: "wall", left: 400, right: 440, top: 120, bottom: 176, solid: true }],
  letters: [],
};

test("the crab's contact point is where its legs end, not the image's bottom row", () => {
  assert.equal(SPRITES.crab.foot.y, 14);
  assert.equal(SPRITES.owl.foot.y, 16);
  assert.ok(bodyOf("crab").h < bodyOf("owl").h);
});

test("boxes and letters are scenery behind the critters: the table stays whole", () => {
  const w = buildWorld(cramped)!;
  const table = w.surfaces.filter((s) => s.kind === "table");
  assert.equal(table.length, 1, "nothing on the page blocks the table");
  assert.equal(table[0].x1 - table[0].x0, (308 - 12) / U);
});

test("a solid obstacle still cuts the table", () => {
  assert.equal(buildWorld(walled)!.surfaces.filter((s) => s.kind === "table").length, 2);
});

test("box tops and letter tops are places to stand when there is headroom", () => {
  const w = buildWorld(desktop)!;
  const boxes = w.surfaces.filter((s) => s.kind === "box").map((s) => s.on);
  assert.ok(boxes.includes("tries") && boxes.includes("best"));
  assert.ok(!boxes.includes("quit"), "past the table's end is not part of this world");
  assert.equal(w.surfaces.filter((s) => s.kind === "letter").length, 11);
  assert.equal(buildWorld(cramped)!.surfaces.filter((s) => s.kind !== "table").length, 0, "no headroom on the small phone");
});

test("letters with room beneath them are grips", () => {
  const w = buildWorld(desktop)!;
  assert.equal(w.grips.length, 11);
  assert.ok(w.grips.every((g, i) => i === 0 || g.x > w.grips[i - 1].x));
});

test("a tour needs a body's room all the way round the table", () => {
  const w = buildWorld(desktop)!;
  assert.ok(w.tour);
  assert.ok(Math.abs(w.tour!.y0 - -(760 - 172) / U) < 1e-9);
  assert.equal(buildWorld(cramped)!.tour, null, "12px gutters: no room down the sides");
});

test("jumps pass up through scenery but never through something solid", () => {
  const w = buildWorld(desktop)!;
  const tries = w.objects.find((o) => o.id === "tries")!;
  const under = (tries.rect.x0 + tries.rect.x1) / 2;
  const body = { ...bodyOf("owl"), maxUp: 2.9 };
  assert.ok(planArc(w, { x: under, y: 0 }, { x: under, y: tries.rect.y1 }, body), "straight up through a box onto its top");
  const ww = buildWorld(walled)!;
  const wall = ww.objects[0];
  assert.equal(planArc(ww, { x: wall.rect.x0 - 0.5, y: 0 }, { x: wall.rect.x1 + 0.5, y: 0 }, body, 0.05), null, "not through a wall");
});

interface Run {
  a: Actor | null;
  left: boolean;
  intents: Intent[];
}

function simulate(input: WorldInput, kind: CritterKind, seed: number, routine?: Routine, seconds = 120): Run {
  const r = rng(seed);
  const world = buildWorld(input)!;
  const a = spawnActor(world, kind, r, routine);
  if (!a) return { a: null, left: false, intents: [] };
  let left = false;
  for (let tick = 0; tick < seconds * 60; tick++) {
    if (!step(world, a, 1 / 60, r)) {
      left = true;
      break;
    }
    assert.ok(isValidPlacement(world, a), `${kind} seed ${seed} invalid at tick ${tick}: ${a.mode} x=${a.x.toFixed(2)} y=${a.y.toFixed(2)} ${a.log.join(" > ")}`);
    if (a.visible && a.mode !== "tour") {
      assert.ok(a.x >= -0.2 && a.x <= world.width + 0.2, "stays over the table");
      assert.ok(a.y >= -a.body.h - 0.1, "never sinks into the table");
    }
  }
  return { a, left, intents: [...a.did] };
}

test("critters stay physically valid and always leave (property run)", () => {
  const kinds: CritterKind[] = ["owl", "crab", "penguin", "squirrel", "ghost"];
  let runs = 0;
  for (const input of [desktop, cramped, walled]) {
    for (const kind of kinds) {
      for (let seed = 1; seed <= 10; seed++) {
        const { a, left } = simulate(input, kind, seed * 7 + kind.length);
        if (!a) continue;
        runs++;
        assert.ok(left, `${kind} seed ${seed} should leave on its own (${a.log.join(" > ")})`);
      }
    }
  }
  assert.ok(runs >= 100);
});

test("a visit is a mix: no action twice in a row, several different ones", () => {
  let varied = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { intents } = simulate(desktop, "owl", seed);
    for (let i = 1; i < intents.length; i++) assert.notEqual(intents[i], intents[i - 1], `seed ${seed}: ${intents.join(",")}`);
    if (new Set(intents).size >= 3) varied++;
  }
  assert.ok(varied >= 12, `most visits do at least three different things (${varied}/20)`);
});

test("every kind of action happens on a roomy desktop", () => {
  const seen = new Set<Intent>();
  for (const kind of ["owl", "squirrel", "crab"] as CritterKind[]) {
    for (let seed = 1; seed <= 25; seed++) simulate(desktop, kind, seed).intents.forEach((i) => seen.add(i));
  }
  for (const i of ["climb", "letters", "swing", "tour", "wave", "trick"] as Intent[]) assert.ok(seen.has(i), `never saw ${i}`);
});

test("a tour goes all the way round and comes back to where it started", () => {
  const r = rng(11);
  const world = buildWorld(desktop)!;
  const a = spawnActor(world, "crab", r, "tour")!;
  let startX: number | null = null;
  const angles = new Set<number>();
  for (let tick = 0; tick < 120 * 60; tick++) {
    step(world, a, 1 / 60, r);
    if (a.mode === "tour") {
      startX ??= a.x;
      angles.add(Math.round(((a.angle % 360) + 360) % 360));
    }
    if (a.log.includes("tour complete")) break;
  }
  assert.ok(a.log.includes("tour complete"));
  assert.ok(Math.abs(a.x - startX!) < 0.05, "back at its starting point");
  assert.equal(a.y, 0);
  for (const angle of [0, 90, 180, 270]) assert.ok(angles.has(angle), `walked a side at ${angle}°`);
});

test("a blocked critter turns back instead of walking through", () => {
  let saw = false;
  for (let seed = 1; seed <= 60 && !saw; seed++) {
    if (simulate(walled, "penguin", seed, "walk", 30).a?.log.includes("blocked: turning back")) saw = true;
  }
  assert.ok(saw);
});

test("a resize keeps a critter on the same spot of the table", () => {
  const r = rng(3);
  const w1 = buildWorld(desktop)!;
  const a = spawnActor(w1, "owl", r, "walk")!;
  for (let i = 0; i < 60; i++) step(w1, a, 1 / 60, r);
  a.mode = "pose";
  a.dur = 5;
  a.t = 0;
  a.x = w1.width * 0.3;
  a.frac = 0.3;
  const w2 = buildWorld(cramped)!;
  rehome(w1, w2, a);
  assert.ok(Math.abs(a.x / w2.width - 0.3) < 0.02);
  assert.equal(a.y, 0);
});

test("stand ranges keep the whole body on the surface", () => {
  const [a, b] = standRange({ id: "s", kind: "table", x0: 2, x1: 5, y: 0, on: "table" }, 0.4);
  assert.equal(a, 2.4);
  assert.equal(b, 4.6);
});
