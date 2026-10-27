import { useEffect, useRef, useState } from "react";
import { useCritters } from "@/hooks/useCritters";
import { useSettings } from "@/hooks/useSettings";
import { useT } from "@/i18n";
import { CRITTER_FOR } from "@/hooks/useCritters";
import type { Theme } from "@/hooks/useTheme";
import { TALK_SECONDS, hush, rehome, spawnActor, speak, step, type Actor } from "@/world/actor";
import { measureWorld } from "@/world/measure";
import { ART, SPRITES, type CritterKind } from "@/world/sprites";
import { buildWorld, type WorldInput } from "@/world/world";

/**
 * Sprites are drawn on a 16x16 grid and face RIGHT. Where each one touches
 * the ground, and how big its body is, lives in world/sprites.ts.
 */

/** Outline shared by every critter: thin, dark, rounded. */
const INK = { stroke: "#1d1428", strokeWidth: 0.55, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const SOFT = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Eye with a catch-light, so every face looks alive at 32px. */
const Eye = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#221a2e" />
    <circle cx={cx + r * 0.35} cy={cy - r * 0.38} r={r * 0.38} fill="#fff" />
  </g>
);

const Owl = () => (
  <svg viewBox="0 0 16 16">
    <path d="M3.4 3.4 L3 0.4 L5.8 2.3 Z" fill="#767887" {...INK} />
    <path d="M13.6 3.4 L14 0.4 L11.2 2.3 Z" fill="#767887" {...INK} />
    <path d="M2.8 7.8 C1.6 9.4 1.8 11.9 3.3 13.1 C3.8 11.2 3.8 9.4 2.8 7.8 Z" fill="#9b9eac" {...INK} />
    <path d="M8.5 1.6 C12.6 1.6 14.6 4.4 14.6 8.4 C14.6 12.4 12.4 14.6 8.5 14.6 C4.6 14.6 2.4 12.4 2.4 8.4 C2.4 4.4 4.4 1.6 8.5 1.6 Z" fill="#c4c7d3" {...INK} />
    <path d="M4.2 4.2 C5.4 2.8 7 2.3 8.5 2.3" stroke="#e3e5ee" strokeWidth="0.7" {...SOFT} />
    <ellipse cx="8.5" cy="10.9" rx="4" ry="3.3" fill="#eef0f5" />
    <g stroke="#a3a6b4" strokeWidth="0.45" {...SOFT}>
      <path d="M6.3 10 l0.7 0.6 0.7 -0.6" /><path d="M8.8 10 l0.7 0.6 0.7 -0.6" />
      <path d="M7.5 11.8 l0.7 0.6 0.7 -0.6" /><path d="M6.3 13.2 l0.7 0.5 0.7 -0.5" /><path d="M8.8 13.2 l0.7 0.5 0.7 -0.5" />
    </g>
    <circle cx="6.4" cy="6.4" r="2.35" fill="#f7f8fb" stroke="#a3a6b4" strokeWidth="0.35" />
    <circle cx="10.8" cy="6.4" r="2.35" fill="#f7f8fb" stroke="#a3a6b4" strokeWidth="0.35" />
    <Eye cx={6.8} cy={6.5} r={1.25} />
    <Eye cx={11.2} cy={6.5} r={1.25} />
    <path d="M8.1 7.7 L9.5 7.7 L8.8 9.3 Z" fill="#f2a93b" {...INK} strokeWidth={0.4} />
    <g className="arm">
      <path d="M14.3 7.4 C15.7 8.8 15.8 11.6 14.3 12.9 C13.7 11 13.6 9.2 14.3 7.4 Z" fill="#9b9eac" {...INK} />
    </g>
    <g className="leg-l"><rect x="4.6" y="14.2" width="2.7" height="1.8" rx="0.8" fill="#f2a93b" {...INK} strokeWidth={0.4} /></g>
    <g className="leg-r"><rect x="9.7" y="14.2" width="2.7" height="1.8" rx="0.8" fill="#f2a93b" {...INK} strokeWidth={0.4} /></g>
  </svg>
);

const Crab = () => (
  <svg viewBox="0 0 16 16">
    <g stroke="#b83a1c" strokeWidth="0.75" {...SOFT}>
      <path d="M4.6 9.8 L3.2 11.4 L2.6 14" /><path d="M2.6 8.6 L1 10 L0.6 11.8" />
      <path d="M11.4 9.8 L12.8 11.4 L13.4 14" /><path d="M13.4 8.6 L15 10 L15.4 11.8" />
    </g>
    <g className="leg-l" stroke="#b83a1c" strokeWidth="0.75" {...SOFT}>
      <path d="M6.2 10.2 L5.4 12 L5.2 14" /><path d="M3.6 9.4 L2.2 10.8 L1.6 13" />
    </g>
    <g className="leg-r" stroke="#b83a1c" strokeWidth="0.75" {...SOFT}>
      <path d="M9.8 10.2 L10.6 12 L10.8 14" /><path d="M12.4 9.4 L13.8 10.8 L14.4 13" />
    </g>
    <path d="M5.5 4.6 L5.5 2" stroke="#c8431f" strokeWidth="0.8" {...SOFT} />
    <path d="M10.5 4.6 L10.5 2" stroke="#c8431f" strokeWidth="0.8" {...SOFT} />
    <circle cx="5.5" cy="1.5" r="1.3" fill="#fff" {...INK} strokeWidth={0.4} />
    <circle cx="10.5" cy="1.5" r="1.3" fill="#fff" {...INK} strokeWidth={0.4} />
    <circle cx="5.9" cy="1.5" r="0.6" fill="#221a2e" /><circle cx="10.9" cy="1.5" r="0.6" fill="#221a2e" />
    <path d="M2.2 6.8 C0.6 6.4 0 4.6 0.6 3.2 C1.2 2 2.6 2 2.9 3 L1.9 4 C2.5 4.6 2.7 5.6 2.2 6.8 Z" fill="#e4532c" {...INK} />
    <path d="M2 7.2 C2 4.6 4.8 3.6 8 3.6 C11.2 3.6 14 4.6 14 7.2 C14 9.4 11.6 10.4 8 10.4 C4.4 10.4 2 9.4 2 7.2 Z" fill="#e4532c" {...INK} />
    <path d="M2.6 8.2 C4 9.6 12 9.6 13.4 8.2 C12.6 9.8 3.4 9.8 2.6 8.2 Z" fill="#b8401f" />
    <path d="M4 5.6 C5.4 4.6 7 4.3 8.4 4.4" stroke="#ff9c72" strokeWidth="0.7" {...SOFT} />
    <circle cx="10.9" cy="5.9" r="0.5" fill="#ff8a5e" /><circle cx="11.9" cy="7.2" r="0.35" fill="#ff8a5e" />
    <path d="M7 7.9 q1 0.7 2 0" stroke="#221a2e" strokeWidth="0.45" {...SOFT} />
    <circle cx="5.3" cy="7.6" r="0.55" fill="#ff9aa0" opacity="0.8" /><circle cx="10.7" cy="7.6" r="0.55" fill="#ff9aa0" opacity="0.8" />
    <g className="arm">
      <path d="M13.8 6.8 C15.4 6.4 16 4.6 15.4 3.2 C14.8 2 13.4 2 13.1 3 L14.1 4 C13.5 4.6 13.3 5.6 13.8 6.8 Z" fill="#e4532c" {...INK} />
    </g>
  </svg>
);

const Penguin = () => (
  <svg viewBox="0 0 16 16">
    <path d="M3.9 7 C2.4 8.4 2 10.7 2.6 12.3 C3.5 11.3 3.9 9.6 3.9 7 Z" fill="#2c2c3a" {...INK} />
    <path d="M8.5 1.2 C11.6 1.2 13.2 3.6 13.2 6.6 L13.4 11 C13.4 13.4 11.4 14.6 8.5 14.6 C5.6 14.6 3.6 13.4 3.6 11 L3.8 6.6 C3.8 3.6 5.4 1.2 8.5 1.2 Z" fill="#2c2c3a" {...INK} />
    <path d="M5.6 3.2 C6.4 2.2 7.4 1.9 8.5 1.9" stroke="#55556a" strokeWidth="0.6" {...SOFT} />
    <path d="M8.5 5.2 C10.8 5.2 11.8 7 11.8 9.3 C11.8 12 10.6 13.8 8.5 13.8 C6.4 13.8 5.2 12 5.2 9.3 C5.2 7 6.2 5.2 8.5 5.2 Z" fill="#fbfbff" />
    <path d="M5.3 6.4 C5.1 4.2 6.4 3.2 8.5 3.8 C10.6 3.2 11.9 4.2 11.7 6.4 C10.6 7 6.4 7 5.3 6.4 Z" fill="#fbfbff" />
    <path d="M10.6 9 C10.8 10.8 10.2 12.4 9 13.2" stroke="#dcdcea" strokeWidth="0.6" {...SOFT} />
    <Eye cx={7.3} cy={4.9} r={0.75} />
    <Eye cx={10.3} cy={4.9} r={0.75} />
    <path d="M8.2 5.9 L10.4 6.3 L8.2 7 Z" fill="#f2a03c" {...INK} strokeWidth={0.35} />
    <circle cx="6.3" cy="6.4" r="0.5" fill="#ffb3c1" opacity="0.85" /><circle cx="11.2" cy="6.4" r="0.5" fill="#ffb3c1" opacity="0.85" />
    <g className="arm">
      <path d="M13.1 7 C14.6 8 15.3 10 14.9 11.9 C14 11.1 13.4 9.4 13.1 7 Z" fill="#3a3a4c" {...INK} />
    </g>
    <g className="leg-l"><ellipse cx="6.2" cy="15.1" rx="1.7" ry="0.85" fill="#f2a03c" {...INK} strokeWidth={0.4} /></g>
    <g className="leg-r"><ellipse cx="10.8" cy="15.1" rx="1.7" ry="0.85" fill="#f2a03c" {...INK} strokeWidth={0.4} /></g>
  </svg>
);

const Squirrel = () => (
  <svg viewBox="0 0 16 16">
    <path d="M5.2 12.8 C1.4 13.2 -0.1 10 0.4 7.2 C0.9 4.4 2.4 2.4 4.6 2.7 C3.3 4.3 3.4 6 4.7 7.2 C5.8 8.3 6 10.7 5.2 12.8 Z" fill="#c4672a" {...INK} />
    <path d="M2 5 C1.3 6.7 1.3 8.9 2.5 10.7" stroke="#f0a864" strokeWidth="0.8" {...SOFT} />
    <g className="leg-l"><ellipse cx="7.3" cy="15.1" rx="1.6" ry="0.85" fill="#a9521c" {...INK} strokeWidth={0.4} /></g>
    <g className="leg-r"><ellipse cx="11" cy="15.1" rx="1.6" ry="0.85" fill="#a9521c" {...INK} strokeWidth={0.4} /></g>
    <ellipse cx="9" cy="11.5" rx="3.6" ry="3.2" fill="#d77d38" {...INK} />
    <ellipse cx="9.7" cy="11.9" rx="2.1" ry="2.3" fill="#f6cf9c" />
    <path d="M7 4.1 L6.5 1.2 L8.9 3.2 Z" fill="#a9521c" {...INK} />
    <path d="M11 3.4 L12.1 1 L12.9 3.9 Z" fill="#a9521c" {...INK} />
    <ellipse cx="9.7" cy="6.4" rx="3.8" ry="3.2" fill="#d77d38" {...INK} />
    <path d="M7.2 4.2 C8.2 3.5 9.6 3.3 10.8 3.6" stroke="#f0a864" strokeWidth="0.6" {...SOFT} />
    <ellipse cx="12.1" cy="7.5" rx="1.6" ry="1.2" fill="#f6cf9c" />
    <circle cx="13.5" cy="7" r="0.5" fill="#221a2e" />
    <Eye cx={8.6} cy={5.9} r={0.75} />
    <Eye cx={11.3} cy={5.8} r={0.8} />
    <circle cx="10.4" cy="7.6" r="0.5" fill="#ff9aa0" opacity="0.8" />
    <g className="arm">
      <path d="M11.4 8.6 C12.7 8.8 13.3 9.9 12.9 10.9 C12 10.7 11.4 9.8 11.4 8.6 Z" fill="#c4672a" {...INK} />
    </g>
  </svg>
);

/** Halloween's critter: a little sheet ghost with rosy cheeks and an "o"
 *  mouth. The two outer tatters of its hem are its legs, so they flutter as
 *  it floats along. */
const Ghost = () => (
  <svg viewBox="0 0 16 16">
    <g className="leg-l"><path d="M2.6 12 L5.9 12 L5.3 14.6 C4.7 15.8 3.2 15.8 2.6 14.8 Z" fill="#ece8fb" {...INK} /></g>
    <path d="M5.6 12 L11 12 L10.4 14.6 C9.6 15.7 7 15.7 6.2 14.6 Z" fill="#f6f3ff" {...INK} />
    <g className="leg-r"><path d="M10.7 12 L14 12 L14 14.8 C13.4 15.8 11.9 15.8 11.3 14.6 Z" fill="#ece8fb" {...INK} /></g>
    <path d="M2.6 13.4 L2.6 7.2 C2.6 3.6 4.8 1.2 8.3 1.2 C11.8 1.2 14 3.6 14 7.2 L14 13.4 Z" fill="#f6f3ff" />
    <path d="M2.6 13.4 L2.6 7.2 C2.6 3.6 4.8 1.2 8.3 1.2 C11.8 1.2 14 3.6 14 7.2 L14 13.4" {...INK} fill="none" />
    <path d="M3.5 6 C3.3 8.4 3.5 11 3.7 13.2" stroke="#d9d3ef" strokeWidth="1" {...SOFT} />
    <path d="M5.4 2.9 C6.3 2.2 7.3 1.9 8.3 1.9" stroke="#ffffff" strokeWidth="0.7" {...SOFT} />
    <path d="M2.8 8.6 C1.6 8.8 1 9.8 1.4 10.8 C2 10.6 2.6 10 2.8 9.4 Z" fill="#ece8fb" {...INK} />
    <ellipse cx="7.8" cy="6.4" rx="0.95" ry="1.3" fill="#221a2e" />
    <ellipse cx="11.4" cy="6.4" rx="0.95" ry="1.3" fill="#221a2e" />
    <circle cx="8.1" cy="5.9" r="0.38" fill="#fff" /><circle cx="11.7" cy="5.9" r="0.38" fill="#fff" />
    <ellipse cx="6.5" cy="8.5" rx="0.75" ry="0.45" fill="#ffadc6" />
    <ellipse cx="12.7" cy="8.5" rx="0.75" ry="0.45" fill="#ffadc6" />
    <ellipse cx="9.6" cy="9.4" rx="0.7" ry="0.9" fill="#221a2e" />
    <g className="arm">
      <path d="M13.8 7.6 C15.2 7 16 5.6 15.6 4.5 C14.8 4.7 14 5.7 13.8 7 Z" fill="#f6f3ff" {...INK} />
    </g>
  </svg>
);

const ART_FOR: Record<CritterKind, () => JSX.Element> = {
  owl: Owl, crab: Crab, penguin: Penguin, squirrel: Squirrel, ghost: Ghost,
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
  say: HTMLDivElement;
}

/**
 * World units to screen pixels. The FOOT point of the sprite (not the
 * bottom of its image) lands on the actor's position; positions snap to
 * the sprite's own pixel grid so the art never smears.
 */
function paint(els: Els, a: Actor, input: WorldInput, saying: boolean) {
  const unit = input.unit;
  const s = unit / ART;
  const meta = SPRITES[a.kind];
  const X = (x: number) => input.table.left + x * unit;
  const Y = (y: number) => input.table.surface - y * unit;
  const snap = (v: number) => Math.round(v / s) * s;

  const left = snap(X(a.x) - meta.foot.x * s);
  // a flier hovers over whatever it is on, except while coming up from
  // behind the table's edge (the clip there is measured from the feet)
  const lift = meta.hover && a.mode !== "rise" && a.mode !== "sink" ? meta.hover * s : 0;
  const top = snap(Y(a.y) - meta.foot.y * s - lift);
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

  // a flier needs no thread: it simply floats down from the top, and away
  if (a.thread && !a.sp.flies) {
    const ax = X(a.thread.x);
    const ay = Y(a.thread.top);
    const hands = top + meta.top * s + s;
    thread.style.display = "block";
    thread.style.transform = `translate3d(${ax - 1}px, ${ay}px, 0)${a.angle ? ` rotate(${a.angle.toFixed(2)}deg)` : ""}`;
    thread.style.height = `${Math.max(0, hands - ay)}px`;
  } else {
    thread.style.display = "none";
  }

  // The speech bubble rises from the head; its big part is kept on screen.
  if (saying && a.visible) {
    // the top of the head, wherever the body has been turned to
    let hx = X(a.x);
    let hy = top + meta.top * s;
    if (a.angle && a.pivot) {
      const px = X(a.pivot.x);
      const py = Y(a.pivot.y);
      const r = (a.angle * Math.PI) / 180;
      const dx = hx - px;
      const dy = hy - py;
      hx = px + dx * Math.cos(r) - dy * Math.sin(r);
      hy = py + dx * Math.sin(r) + dy * Math.cos(r);
    }
    els.say.style.display = "block";
    els.say.style.transform = `translate3d(${Math.round(hx)}px, ${Math.round(hy)}px, 0)`;
    const big = els.say.lastElementChild as HTMLElement | null;
    if (big) {
      // The balloon rises on the side the critter faces — unless it would
      // not fit there, then on the other. The two small dots lead towards
      // it (CSS mirrors them by data-side) and its tail comes down onto the
      // bigger dot, wherever the balloon had to be nudged to stay on screen.
      const w = big.offsetWidth;
      const fits = (side: number) => (side > 0 ? hx - 6 + w <= input.stage.width - 8 : hx + 6 - w >= 8);
      const side = fits(a.facing) ? a.facing : fits(-a.facing) ? -a.facing : a.facing;
      els.say.dataset.side = String(side);
      const dot = side > 0 ? 11 : -11; // centre of the bigger dot, from the head
      const want = side > 0 ? -6 : 6 - w;
      const left = Math.round(Math.max(8 - hx, Math.min(input.stage.width - 8 - w - hx, want)));
      big.style.left = `${left}px`;
      big.style.setProperty("--tail-x", `${Math.round(Math.max(8, Math.min(w - 22, dot - left - 7)))}px`);
      // and below the top of the screen: it slides down beside the critter
      big.style.bottom = `${Math.round(Math.min(40, hy - 10 - big.offsetHeight))}px`;
    }
  } else {
    els.say.style.display = "none";
  }

  // One-shot effects: a puff of smoke, a burst of sparkles.
  for (const f of a.fx.splice(0)) {
    const el = document.createElement("div");
    el.className = `fx fx-${f.kind}`;
    el.style.transform = `translate3d(${X(f.x)}px, ${Y(f.y) - lift}px, 0)`;
    if (f.kind === "boo") {
      const word = document.createElement("b");
      word.textContent = "BOO!";
      el.appendChild(word);
    } else {
      for (let i = 0; i < 6; i++) el.appendChild(document.createElement("i"));
    }
    els.fx.appendChild(el);
    window.setTimeout(() => el.remove(), f.kind === "boo" ? 2400 : 900);
  }
}

/** What the rival just said, for a critter to deliver. */
export interface Saying {
  id: number;
  text: string;
}

/**
 * The critters' stage for one board. The board is the table; everything
 * tagged data-world on the page is the rest of the world. The stage is a
 * fixed layer above the page chrome: the boxes and the title are scenery
 * behind the critters, so they walk and jump in front of them, and stand
 * on top of them. Pointer events pass straight through, so a critter never
 * gets in the way of a tap — except its speech bubble, which is tapped away.
 *
 * `say` summons a critter to deliver a message; `onHeard` fires when the
 * bubble is tapped (or the critter gives up holding it).
 */
export function Critters({ theme, say, onHeard }: { theme: Theme; say?: Saying | null; onHeard?: (id: number) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const actorEl = useRef<HTMLDivElement>(null);
  const flipEl = useRef<HTMLDivElement>(null);
  const threadEl = useRef<HTMLSpanElement>(null);
  const fxEl = useRef<HTMLDivElement>(null);
  const sayEl = useRef<HTMLDivElement>(null);
  const actorRef = useRef<Actor | null>(null);
  const { critters } = useSettings();
  const t = useT();
  const [onStage, setOnStage] = useState(false);
  const { spawn, done } = useCritters(theme, critters, say && !onStage ? { key: say.id, routine: "speak" } : null);
  const sayRef = useRef({ say, onHeard });
  sayRef.current = { say, onHeard };

  // A message for a critter that is already here: it delivers it on the spot.
  const sayId = say?.id;
  useEffect(() => {
    if (sayId !== undefined && actorRef.current) speak(actorRef.current);
  }, [sayId]);

  useEffect(() => {
    if (!spawn) return;
    const table = stage.current?.parentElement;
    const els = { actor: actorEl.current!, flip: flipEl.current!, thread: threadEl.current!, fx: fxEl.current!, say: sayEl.current! };
    let input = table ? measureWorld(table) : null;
    let world = input ? buildWorld(input) : null;
    const actor = world ? spawnActor(world, spawn.kind, Math.random, spawn.routine) : null;
    if (!table || !input || !world || !actor) {
      done(false);
      return;
    }
    actorRef.current = actor;
    setOnStage(true);
    let heldId: number | undefined;
    let held = 0;
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
      els.say.style.display = "none";
      actorRef.current = null;
      setOnStage(false);
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
      const pending = sayRef.current.say;
      paint(els, actor, input!, Boolean(pending));
      // Held up long enough without being tapped: that counts as
      // delivered, so nobody is summoned for it again.
      if (pending?.id !== heldId) {
        heldId = pending?.id;
        held = 0;
      } else if (pending && (held += dt) > TALK_SECONDS) {
        hush(actor);
        sayRef.current.onHeard?.(pending.id);
      }
      if (debug) debug.__ctcCritter = { world, actor, input };
      if (!alive) return finish();
      raf = requestAnimationFrame(tick);
    };
    paint(els, actor, input, Boolean(sayRef.current.say));
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(remeasure);
    ro.observe(table);
    ro.observe(document.documentElement);
    const poll = window.setInterval(remeasure, 1000);
    window.addEventListener("resize", remeasure);
    document.fonts?.ready.then(remeasure).catch(() => undefined);

    return () => {
      finished = true;
      actorRef.current = null;
      setOnStage(false);
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.clearInterval(poll);
      window.removeEventListener("resize", remeasure);
      els.thread.style.display = "none";
      els.actor.style.visibility = "hidden";
      els.say.style.display = "none";
    };
  }, [spawn, done]);

  const Sprite = spawn ? ART_FOR[spawn.kind] : null;
  return (
    <div className="critter-stage" ref={stage} aria-hidden={say ? undefined : "true"}>
      <span className="thread" ref={threadEl} />
      <div className="actor" ref={actorEl} style={{ visibility: "hidden" }}>
        <div className={`actor-flip gait-${spawn?.kind ?? "owl"}`} ref={flipEl}>
          {Sprite && <Sprite />}
        </div>
      </div>
      {/* a small dot, a bigger dot, then the balloon. A following message
          only changes the words: nothing pops in again. */}
      <div className="say" ref={sayEl} style={{ display: "none" }}>
        <i className="say-dot d1" />
        <i className="say-dot d2" />
        <button type="button" className="say-bubble" aria-label={say ? t("bubble_label", { text: say.text }) : undefined}
          onClick={() => {
            if (!say) return;
            if (actorRef.current) hush(actorRef.current);
            onHeard?.(say.id);
          }}>
          <span>{say?.text}</span>
        </button>
      </div>
      <div ref={fxEl} />
    </div>
  );
}

/**
 * A win: the theme's critter jumps for joy on top of the result card while
 * fireworks go off around it. With characters switched off, just fireworks.
 */
export function Cheer({ theme }: { theme: Theme }) {
  const { critters } = useSettings();
  const kind = CRITTER_FOR[theme];
  const Sprite = ART_FOR[kind];
  const rocket = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2;
      return <i key={i} style={{ "--bx": `${Math.round(Math.cos(angle) * 46)}px`, "--by": `${Math.round(Math.sin(angle) * 46)}px` } as React.CSSProperties} />;
    });
  return (
    <div className="cheer" aria-hidden="true">
      <span className="firework f1">{rocket(12)}</span>
      <span className="firework f2">{rocket(12)}</span>
      <span className="firework f3">{rocket(12)}</span>
      {critters && (
        <div className="cheer-critter">
          <div className={`actor-flip gait-${kind}`}><Sprite /></div>
        </div>
      )}
    </div>
  );
}
