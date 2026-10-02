/**
 * The one place the world touches the DOM: it reads the page and hands
 * world.ts plain rectangles.
 *
 * Elements opt in with a data attribute instead of being found by class
 * names or positions:
 *   data-world="box"     a gauge, a button, a bar: something to stand on,
 *                        in the background (critters pass in front of it)
 *   data-world="letter"  one letter of the title: to stand on, or hang from
 * Add data-world-solid to a box to make it a real obstacle instead.
 * The table is the board the critters belong to.
 */

import type { PxRect, WorldInput } from "./world";

function cssPx(name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function visible(r: DOMRect) {
  return r.width > 0 && r.height > 0;
}

let canvas: HTMLCanvasElement | null = null;

/** How far a text-shadow paints outside the glyph, per side. The title's
 *  pixel outline and drop shadow are part of each letter you can see. */
function shadowReach(cs: CSSStyleDeclaration) {
  const out = { left: 0, right: 0, top: 0, bottom: 0 };
  if (!cs.textShadow || cs.textShadow === "none") return out;
  // "rgb(16, 10, 32) -3px 0px 0px, ..." — the colour can contain commas
  for (const m of cs.textShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/g)) {
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    const blur = parseFloat(m[3] ?? "0");
    out.left = Math.max(out.left, blur - x);
    out.right = Math.max(out.right, blur + x);
    out.top = Math.max(out.top, blur - y);
    out.bottom = Math.max(out.bottom, blur + y);
  }
  return out;
}

/** The painted box of one letter: its glyph ink plus its shadow, not the
 *  line box around it (which is half empty space). */
function letterRect(el: HTMLElement): PxRect | null {
  const r = el.getBoundingClientRect();
  if (!visible(r)) return null;
  const ch = el.textContent ?? "";
  const cs = getComputedStyle(el);
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let top = r.top;
  let bottom = r.bottom;
  if (ctx) {
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(ch);
    if (m.fontBoundingBoxAscent && m.actualBoundingBoxAscent !== undefined) {
      const baseline = r.top + m.fontBoundingBoxAscent;
      top = baseline - m.actualBoundingBoxAscent;
      bottom = baseline + m.actualBoundingBoxDescent;
    }
  }
  const s = shadowReach(cs);
  return { left: r.left - s.left, right: r.right + s.right, top: top - s.top, bottom: bottom + s.bottom };
}

/**
 * Read the world around `table`. Returns null when the table is not on
 * screen (a hidden tab), so no critter is ever placed on nothing.
 */
export function measureWorld(table: HTMLElement): WorldInput | null {
  const t = table.getBoundingClientRect();
  if (!visible(t)) return null;
  const px = cssPx("--px", 4);
  const unit = cssPx("--crit", 32);

  const props: WorldInput["props"] = [];
  document.querySelectorAll<HTMLElement>('[data-world="box"]').forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (!visible(r)) return;
    props.push({
      id: el.dataset.worldId ?? `box-${i}`,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      solid: el.hasAttribute("data-world-solid"),
    });
  });

  const letters: WorldInput["letters"] = [];
  document.querySelectorAll<HTMLElement>('[data-world="letter"]').forEach((el, i) => {
    const r = letterRect(el);
    if (r) letters.push({ id: `letter-${i}`, index: i, ...r });
  });

  return {
    unit,
    // A .frame's ink outline is a box-shadow ring --px wide outside the
    // border: its top is the surface feet rest on, its outer edge is what
    // a touring critter walks round.
    table: { left: t.left, right: t.right, surface: t.top - px, bottom: t.bottom + px, ring: px },
    stage: { width: window.innerWidth, height: window.innerHeight },
    props,
    letters,
  };
}
