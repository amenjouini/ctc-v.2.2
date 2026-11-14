import { useEffect, useRef, useState } from "react";
import { useCritters } from "@/hooks/useCritters";
import { useSettings } from "@/hooks/useSettings";
import { useT } from "@/i18n";
import { CRITTER_FOR } from "@/hooks/useCritters";
import type { Theme } from "@/hooks/useTheme";
import { TALK_SECONDS, hush, rehome, spawnActor, speak, step, type Actor } from "@/world/actor";
import { measureWorld } from "@/world/measure";
import { EYES, OUTFITS, PIXEL_ART, framesFor, scale2x, type AnimState, type Grid, type PixelArt, type PixelKind } from "@/world/pixelArt";
import { SPRITES, type CritterKind } from "@/world/sprites";
import { buildWorld, type WorldInput } from "@/world/world";

/**
 * Every critter is pixel art (world/pixelArt.ts, drawn from assets/*.json),
 * facing RIGHT. Where each one touches the ground, and how big its body is,
 * lives in world/sprites.ts.
 *
 * A critter moves the way pixel-art games do it: each movement (standing,
 * walking, waving, crouching, landing, in the air) is a short run of drawn
 * frames, played by FramePlayer below. Each picture is built once: Scale2x
 * (twice the pixels, stair-steps rounded off) and drawn as square pixels into
 * the 32px critter box. On top sit the closed eyes (flashed to blink) and the
 * theme outfit.
 */
function pixelSprite(kind: PixelKind) {
  const art: PixelArt = PIXEL_ART[kind];
  const W = art.width, H = art.height;
  const { images, states } = framesFor(kind);
  const toGrid = (rows: string[]): Grid => rows.map((r) => [...r].map((ch) => (ch === "." ? "" : art.palette[ch] ?? "")));
  const rects = (g: Grid) => {
    const out: JSX.Element[] = [];
    g.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const col = row[x];
        let w = 1;
        while (x + w < row.length && row[x + w] === col) w++;
        if (col) out.push(<rect key={`${x},${y}`} x={x} y={y} width={w} height={1} fill={col} />);
        x += w;
      }
    });
    return out;
  };

  // every picture any movement uses
  const used = [...new Set(Object.values(states).flatMap((s) => s.frames))];
  const pictures = used.map((name) => ({ name, rects: rects(scale2x(toGrid(images[name] ?? images.base))) }));

  // the eyes closed: the base picture with each eye turned into a lid
  const eyes = EYES[kind];
  const closed = toGrid(art.rows);
  for (const [x0, y0, x1, y1] of eyes.boxes) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (eyes.chars.includes(art.rows[y][x])) closed[y][x] = y === y1 ? eyes.line : eyes.lid;
  }
  const shut = scale2x(closed);
  const lids = rects(shut.map((row, y) => row.map((col, x) =>
    eyes.boxes.some(([x0, y0, x1, y1]) => x >= x0 * 2 && x <= x1 * 2 + 1 && y >= y0 * 2 && y <= y1 * 2 + 1) ? col : "")));

  const outfit: Grid = Array.from({ length: H }, () => Array<string>(W).fill(""));
  for (const o of OUTFITS[kind]) o.rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch !== ".") outfit[o.y + dy][o.x + dx] = o.palette[ch];
  }));
  const dressed = rects(scale2x(outfit));

  const first = states.idle.frames[0];
  const Sprite = () => {
    // each critter blinks on its own clock
    const [blinkDelay] = useState(() => `${(-Math.random() * 4).toFixed(2)}s`);
    return (
      <svg className="pixel-art" viewBox={`0 0 ${W * 2} ${H * 2}`} shapeRendering="crispEdges"
        style={{ "--blink-delay": blinkDelay } as React.CSSProperties}>
        {pictures.map((p) => (
          <g key={p.name} className="frame" data-img={p.name} style={{ display: p.name === first ? "inline" : "none" }}>{p.rects}</g>
        ))}
        <g className="lids">{lids}</g>
        <g className="outfit">{dressed}</g>
      </svg>
    );
  };
  return Sprite;
}

const ART_FOR: Record<CritterKind, () => JSX.Element> = {
  owl: pixelSprite("owl"), crab: pixelSprite("crab"), penguin: pixelSprite("penguin"), fox: pixelSprite("fox"), ghost: pixelSprite("ghost"),
};

/** Which movement a critter is in, from what the world says it is doing. */
function animOf(a: Actor): AnimState {
  if (a.pose === "slide") return "slide";
  if (a.pose === "boo") return "boo";
  if (a.pose === "crouch") return "crouch";
  if (a.pose === "land") return "land";
  if (a.mode === "jump" || a.mode === "fall" || a.pose === "air" || a.pose === "hang") return "air";
  if (a.pose === "wave" || a.pose === "trick") return "wave";
  if (a.moving) return "walk";
  return "idle";
}

/**
 * Plays a critter's frames: shows one picture at a time for the movement
 * it is in, at that movement's speed, and drops the whole critter by the
 * frame's bob. A movement starts again from its first frame whenever it
 * changes.
 */
class FramePlayer {
  private pictures = new Map<string, SVGGElement>();
  private svg: SVGSVGElement | null = null;
  private shown = "";
  private state: AnimState | "" = "";
  private since = 0;

  constructor(root: Element, private kind: PixelKind) {
    this.svg = root.querySelector("svg.pixel-art");
    root.querySelectorAll<SVGGElement>("g.frame").forEach((g) => {
      this.pictures.set(g.dataset.img ?? "", g);
      if (g.style.display !== "none") this.shown = g.dataset.img ?? "";
    });
  }

  show(state: AnimState, now: number) {
    if (!this.svg) return;
    if (state !== this.state) { this.state = state; this.since = now; }
    const spec = framesFor(this.kind).states[state];
    const n = Math.max(spec.frames.length, spec.bob?.length ?? 1, spec.shift?.length ?? 1);
    const i = Math.floor(((now - this.since) / 1000) * spec.fps) % n;
    const name = spec.frames[i % spec.frames.length];
    if (name !== this.shown) {
      const next = this.pictures.get(name);
      if (next) {
        const prev = this.pictures.get(this.shown);
        if (prev) prev.style.display = "none";
        next.style.display = "inline";
        this.shown = name;
      }
    }
    const bob = spec.bob ? spec.bob[i % spec.bob.length] : 0;
    const dx = spec.shift ? spec.shift[i % spec.shift.length] : 0;
    this.svg.style.translate = bob || dx ? `${dx}px ${bob}px` : "";
  }
}

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
  const meta = SPRITES[a.kind];
  // one art pixel, in screen px: a 32x32 sprite in a 32px box is exactly 1
  const s = unit / meta.grid;
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
    const player = new FramePlayer(els.flip, actor.kind);
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
      player.show(animOf(actor), now);
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
