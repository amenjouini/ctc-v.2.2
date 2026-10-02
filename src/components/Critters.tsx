import { useEffect, useRef } from "react";
import { useCritters } from "@/hooks/useCritters";
import type { Theme } from "@/hooks/useTheme";
import { rehome, spawnActor, step, type Actor } from "@/world/actor";
import { measureWorld } from "@/world/measure";
import { ART, SPRITES, type CritterKind } from "@/world/sprites";
import { buildWorld, type WorldInput } from "@/world/world";

/**
 * Sprites are drawn on a 16x16 grid and face RIGHT. Where each one touches
 * the ground, and how big its body is, lives in world/sprites.ts.
 */

const Owl = () => (
  <svg viewBox="0 0 16 16">
    <rect x="2" y="0" width="2" height="3" fill="#8e9099" />
    <rect x="12" y="0" width="2" height="3" fill="#8e9099" />
    <rect x="2" y="2" width="12" height="8" fill="#d8dbe2" />
    <rect x="2" y="2" width="12" height="2" fill="#f0f2f6" />
    <rect x="3" y="4" width="10" height="5" fill="#f4f5f8" />
    <rect x="3" y="4" width="4" height="4" fill="#fff" />
    <rect x="9" y="4" width="4" height="4" fill="#fff" />
    <rect x="4" y="5" width="2" height="2" fill="#3a3f4c" />
    <rect x="10" y="5" width="2" height="2" fill="#3a3f4c" />
    <rect x="7" y="7" width="2" height="2" fill="#e8a83c" />
    <rect x="3" y="10" width="10" height="4" fill="#c9ccd4" />
    <rect x="4" y="10" width="8" height="4" fill="#e4e7ec" />
    <rect x="5" y="11" width="6" height="1" fill="#a9acb6" />
    <rect x="5" y="13" width="6" height="1" fill="#a9acb6" />
    <g className="arm">
      <rect x="12" y="9" width="2" height="4" fill="#b4b7c1" />
      <rect x="13" y="8" width="2" height="3" fill="#d8dbe2" />
    </g>
    <rect x="2" y="9" width="2" height="4" fill="#b4b7c1" />
    <g className="leg-l"><rect x="4" y="14" width="3" height="2" fill="#e8a83c" /></g>
    <g className="leg-r"><rect x="9" y="14" width="3" height="2" fill="#e8a83c" /></g>
  </svg>
);

const Crab = () => (
  <svg viewBox="0 0 16 16">
    <rect x="5" y="1" width="1" height="3" fill="#d9401f" />
    <rect x="10" y="1" width="1" height="3" fill="#d9401f" />
    <rect x="4" y="0" width="3" height="2" fill="#fff" />
    <rect x="9" y="0" width="3" height="2" fill="#fff" />
    <rect x="5" y="0" width="1" height="1" fill="#1a1a22" />
    <rect x="10" y="0" width="1" height="1" fill="#1a1a22" />
    <rect x="2" y="4" width="12" height="6" fill="#e8502c" />
    <rect x="2" y="4" width="12" height="1" fill="#ff7a50" />
    <rect x="3" y="9" width="10" height="1" fill="#b32e14" />
    <rect x="6" y="8" width="4" height="1" fill="#ffb08a" />
    <g className="arm">
      <rect x="14" y="5" width="2" height="2" fill="#e8502c" />
      <rect x="14" y="2" width="2" height="3" fill="#ff7a50" />
    </g>
    <rect x="0" y="5" width="2" height="2" fill="#e8502c" />
    <rect x="0" y="2" width="2" height="3" fill="#ff7a50" />
<g className="leg-l">
    <rect x="4" y="10" width="2" height="2" fill="#d9401f" />
    <rect x="2" y="12" width="4" height="2" fill="#b32e14" />
</g>

<g className="leg-r">
    <rect x="10" y="10" width="2" height="2" fill="#d9401f" />
    <rect x="10" y="12" width="4" height="2" fill="#b32e14" />
</g>
  </svg>
);

const Penguin = () => (
  <svg viewBox="0 0 16 16">
    <rect x="4" y="1" width="8" height="7" fill="#25252e" />
    <rect x="5" y="3" width="6" height="4" fill="#fff" />
    <rect x="5" y="3" width="2" height="2" fill="#25252e" />
    <rect x="9" y="3" width="2" height="2" fill="#25252e" />
    <rect x="7" y="6" width="2" height="2" fill="#f2a03c" />
    <rect x="3" y="8" width="10" height="6" fill="#25252e" />
    <rect x="5" y="8" width="6" height="6" fill="#fff" />
    <g className="arm">
      <rect x="12" y="8" width="2" height="5" fill="#25252e" />
      <rect x="13" y="7" width="2" height="3" fill="#3a3a48" />
    </g>
    <rect x="2" y="8" width="2" height="5" fill="#25252e" />
    <g className="leg-l"><rect x="4" y="14" width="3" height="2" fill="#f2a03c" /></g>
    <g className="leg-r"><rect x="9" y="14" width="3" height="2" fill="#f2a03c" /></g>
  </svg>
);

const Squirrel = () => (
  <svg viewBox="0 0 16 16">
    <rect x="11" y="1" width="2" height="2" fill="#b85a22" />
    <rect x="5" y="1" width="2" height="2" fill="#b85a22" />
    <rect x="4" y="3" width="10" height="6" fill="#d97a2e" />
    <rect x="4" y="3" width="10" height="1" fill="#f0a254" />
    <rect x="11" y="5" width="2" height="2" fill="#fff" />
    <rect x="7" y="5" width="2" height="2" fill="#fff" />
    <rect x="11" y="5" width="1" height="2" fill="#1f140c" />
    <rect x="7" y="5" width="1" height="2" fill="#1f140c" />
    <rect x="5" y="9" width="8" height="5" fill="#d97a2e" />
    <rect x="6" y="10" width="6" height="3" fill="#f5c08a" />
    <g className="arm">
      <rect x="4" y="9" width="2" height="3" fill="#d97a2e" />
      <rect x="3" y="8" width="2" height="2" fill="#f0a254" />
    </g>
    <rect x="1" y="4" width="3" height="8" fill="#b85a22" />
    <rect x="0" y="3" width="3" height="7" fill="#f0a254" />
    <rect x="0" y="5" width="2" height="4" fill="#ffd6a0" />
    <g className="leg-l"><rect x="5" y="14" width="3" height="2" fill="#b85a22" /></g>
    <g className="leg-r"><rect x="10" y="14" width="3" height="2" fill="#b85a22" /></g>
  </svg>
);

const ART_FOR: Record<CritterKind, () => JSX.Element> = {
  owl: Owl, crab: Crab, penguin: Penguin, squirrel: Squirrel,
};

/** Re-measure only when the layout actually moved, so a walk is never
 *  re-planned for nothing. */
function signature(input: WorldInput): string {
  const r = (n: number) => Math.round(n);
  return [
    input.unit, r(input.table.left), r(input.table.right), r(input.table.surface), r(input.table.bottom),
    r(input.stage.width), r(input.stage.height),
    ...input.props.map((p) => `${p.id}:${r(p.left)},${r(p.top)},${r(p.right)},${r(p.bottom)}`),
    ...input.letters.map((l) => `${r(l.left)},${r(l.top)}`),
  ].join("|");
}

interface Els {
  actor: HTMLDivElement;
  flip: HTMLDivElement;
  thread: HTMLSpanElement;
  fx: HTMLDivElement;
}

/**
 * World units to screen pixels. The FOOT point of the sprite (not the
 * bottom of its image) lands on the actor's position; positions snap to
 * the sprite's own pixel grid so the art never smears.
 */
function paint(els: Els, a: Actor, input: WorldInput) {
  const unit = input.unit;
  const s = unit / ART;
  const meta = SPRITES[a.kind];
  const X = (x: number) => input.table.left + x * unit;
  const Y = (y: number) => input.table.surface - y * unit;
  const snap = (v: number) => Math.round(v / s) * s;

  const left = snap(X(a.x) - meta.foot.x * s);
  const top = snap(Y(a.y) - meta.foot.y * s);
  const { actor, flip, thread } = els;

  actor.style.visibility = a.visible ? "visible" : "hidden";
  actor.style.transformOrigin = a.pivot
    ? `${X(a.pivot.x) - left}px ${Y(a.pivot.y) - top}px`
    : `${meta.foot.x * s}px ${meta.foot.y * s}px`;
  actor.style.transform = `translate3d(${left}px, ${top}px, 0)${a.angle ? ` rotate(${a.angle.toFixed(2)}deg)` : ""}`;
  // Coming up from (or going back down behind) the table's edge: the part
  // below the surface is hidden by the table itself.
  const below = top + unit - input.table.surface;
  actor.style.clipPath = (a.mode === "rise" || a.mode === "sink") && below > 0 ? `inset(0 0 ${below}px 0)` : "";
  flip.style.transform = a.facing < 0 ? "scaleX(-1)" : "";
  flip.style.transformOrigin = `${meta.foot.x * s}px 50%`;
  actor.dataset.pose = a.pose;
  actor.dataset.mode = a.mode;
  actor.dataset.moving = String(a.moving);

  if (a.thread) {
    const ax = X(a.thread.x);
    const ay = Y(a.thread.top);
    const hands = top + meta.top * s + s;
    thread.style.display = "block";
    thread.style.transform = `translate3d(${ax - 1}px, ${ay}px, 0)${a.angle ? ` rotate(${a.angle.toFixed(2)}deg)` : ""}`;
    thread.style.height = `${Math.max(0, hands - ay)}px`;
  } else {
    thread.style.display = "none";
  }

  // One-shot effects: a puff of smoke, a burst of sparkles.
  for (const f of a.fx.splice(0)) {
    const el = document.createElement("div");
    el.className = `fx fx-${f.kind}`;
    el.style.transform = `translate3d(${X(f.x)}px, ${Y(f.y)}px, 0)`;
    for (let i = 0; i < 6; i++) el.appendChild(document.createElement("i"));
    els.fx.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }
}

/**
 * The critters' stage for one board. The board is the table; everything
 * tagged data-world on the page is the rest of the world. The stage is a
 * fixed layer above the page chrome: the boxes and the title are scenery
 * behind the critters, so they walk and jump in front of them, and stand
 * on top of them. Pointer events pass straight through, so a critter never
 * gets in the way of a tap.
 */
export function Critters({ theme }: { theme: Theme }) {
  const stage = useRef<HTMLDivElement>(null);
  const actorEl = useRef<HTMLDivElement>(null);
  const flipEl = useRef<HTMLDivElement>(null);
  const threadEl = useRef<HTMLSpanElement>(null);
  const fxEl = useRef<HTMLDivElement>(null);
  const { spawn, done } = useCritters(theme);

  useEffect(() => {
    if (!spawn) return;
    const table = stage.current?.parentElement;
    const els = { actor: actorEl.current!, flip: flipEl.current!, thread: threadEl.current!, fx: fxEl.current! };
    let input = table ? measureWorld(table) : null;
    let world = input ? buildWorld(input) : null;
    const actor = world ? spawnActor(world, spawn.kind, Math.random, spawn.routine) : null;
    if (!table || !input || !world || !actor) {
      done(false);
      return;
    }
    let sig = signature(input);
    let raf = 0;
    let finished = false;
    const debug = import.meta.env.DEV ? (window as unknown as { __ctcCritter?: unknown }) : null;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      els.actor.style.visibility = "hidden";
      els.thread.style.display = "none";
      done(true);
    };

    const remeasure = () => {
      const next = measureWorld(table);
      if (!next) return finish(); // the board went away (another tab of the room)
      const nextSig = signature(next);
      if (nextSig === sig) return;
      const nextWorld = buildWorld(next);
      if (!nextWorld) return finish();
      rehome(world!, nextWorld, actor);
      world = nextWorld;
      input = next;
      sig = nextSig;
    };

    let last = performance.now();
    const tick = (now: number) => {
      // Clamped so a backgrounded tab does not teleport the critter.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const alive = step(world!, actor, dt, Math.random);
      paint(els, actor, input!);
      if (debug) debug.__ctcCritter = { world, actor, input };
      if (!alive) return finish();
      raf = requestAnimationFrame(tick);
    };
    paint(els, actor, input);
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(remeasure);
    ro.observe(table);
    ro.observe(document.documentElement);
    const poll = window.setInterval(remeasure, 1000);
    window.addEventListener("resize", remeasure);
    document.fonts?.ready.then(remeasure).catch(() => undefined);

    return () => {
      finished = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.clearInterval(poll);
      window.removeEventListener("resize", remeasure);
      els.thread.style.display = "none";
      els.actor.style.visibility = "hidden";
    };
  }, [spawn, done]);

  const Sprite = spawn ? ART_FOR[spawn.kind] : null;
  return (
    <div className="critter-stage" ref={stage} aria-hidden="true">
      <span className="thread" ref={threadEl} />
      <div className="actor" ref={actorEl} style={{ visibility: "hidden" }}>
        <div className={`actor-flip gait-${spawn?.kind ?? "owl"}`} ref={flipEl}>
          {Sprite && <Sprite />}
        </div>
      </div>
      <div ref={fxEl} />
    </div>
  );
}
