import { motion, useReducedMotion } from "framer-motion";
import type { Verdict } from "@shared/engine";

/** The guess row slides in over 0.22s; the marks wait for it to land. */
const AFTER_ROW = 0.25;

/**
 * Only what was earned: one mark per hit — solid for right slot, hollow for
 * wrong slot — and nothing for a miss. No hits at all reads as a single
 * muted dash, never as empty slots.
 *
 * The marks still pack two over two, never in a line: a row of marks beside
 * a row of four digits gets read as "this mark is that digit", which it is
 * not. Fill style carries the meaning as well as hue, so it survives
 * colourblindness. The capsule grows with what it holds.
 *
 * On a new guess the marks pop in one by one (0 → 1.2 → 1) after the row
 * has landed; with reduced motion they are simply there.
 */
export function BarMarks({ verdict, animate = true }: { verdict: Verdict; animate?: boolean }) {
  const reduce = useReducedMotion();
  const kinds: string[] = [...Array(verdict.exact).fill("exact"), ...Array(verdict.misplaced).fill("near")];
  const pop = animate && !reduce;

  if (!kinds.length) {
    return (
      <span className="bars is-empty" aria-hidden="true">
        <span className="bars-none">&ndash;</span>
      </span>
    );
  }

  return (
    <span className="bars" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${Math.min(2, kinds.length)}, var(--bar-w))` }}>
      {kinds.map((kind, i) => (
        <motion.span
          key={i}
          className={`bar ${kind}`}
          initial={pop ? { scale: 0 } : false}
          animate={{ scale: pop ? [0, 1.2, 1] : 1 }}
          transition={pop ? { duration: 0.3, times: [0, 0.6, 1], delay: AFTER_ROW + i * 0.2, ease: "easeOut" } : { duration: 0 }}
        />
      ))}
    </span>
  );
}

export function BarSwatch({ kind }: { kind: "exact" | "near" | "absent" }) {
  return <span className={`bar ${kind}`} style={{ flex: "none" }} />;
}
