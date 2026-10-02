import { motion } from "framer-motion";
import { CODE_LENGTH, type Verdict } from "@shared/engine";

/**
 * Four marks, two over two.
 *
 * A square cluster cannot be read against a horizontal row of four digits,
 * which is the whole point — real players kept mapping mark-to-digit when
 * the feedback sat in a line. Fill style carries the meaning as well as hue,
 * so it survives colourblindness, and all three variants share one box.
 */
export function BarMarks({ verdict, animate = true }: { verdict: Verdict; animate?: boolean }) {
  const kinds: string[] = [
    ...Array(verdict.exact).fill("exact"),
    ...Array(verdict.misplaced).fill("near"),
    ...Array(CODE_LENGTH - verdict.exact - verdict.misplaced).fill("absent"),
  ];

  return (
    <span className="bars" aria-hidden="true">
      {kinds.map((kind, i) => (
        <motion.span
          key={i}
          className={`bar ${kind}`}
          initial={animate ? { scale: 0.3, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, delay: animate ? 0.15 + i * 0.07 : 0, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

export function BarSwatch({ kind }: { kind: "exact" | "near" | "absent" }) {
  return <span className={`bar ${kind}`} style={{ flex: "none" }} />;
}
