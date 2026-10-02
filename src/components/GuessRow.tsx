import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CODE_LENGTH, describe, type Code, type Verdict } from "@shared/engine";
import { BarMarks } from "./BarMarks";

interface Props {
  guess: Code;
  verdict: Verdict;
  ordinal: number;
  /** an opponent's attempt on your code, rendered a shade cooler */
  theirs?: boolean;
  onLoad?: (guess: Code) => void;
}

export function GuessRow({ guess, verdict, ordinal, theirs, onLoad }: Props) {
  const won = verdict.exact === CODE_LENGTH;
  const label = `Try ${ordinal}: ${guess.join(" ")}. ${describe(verdict)}`;
  const clickable = Boolean(onLoad) && !won;

  const body = (
    <>
      <span className="flex gap-[clamp(4px,0.8vh,7px)]">
        {guess.map((d, i) => (
          <span className="digit" key={i}>
            {d}
          </span>
        ))}
      </span>
      <BarMarks verdict={verdict} />
    </>
  );

  const cls = `row ${won ? "is-win" : ""} ${theirs ? "is-them" : ""}`;

  return (
    <motion.div
      role="listitem"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {clickable ? (
        <button type="button" className={cls} aria-label={`${label} Press to reuse these digits.`}
          title="Reuse these digits" onClick={() => onLoad?.(guess)}>
          {body}
        </button>
      ) : (
        <div className={cls} aria-label={label}>
          {body}
        </div>
      )}
    </motion.div>
  );
}

/**
 * The guess history. Newest at the bottom, and it scrolls itself there
 * whenever a row arrives — on a phone only two or three rows fit, and the
 * one that just landed is the one the player needs to read.
 */
export function Ledger({
  turns, empty, theirs, onLoad, label,
}: {
  turns: { guess: Code; verdict: Verdict }[];
  empty: React.ReactNode;
  theirs?: boolean;
  onLoad?: (guess: Code) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: turns.length > 1 ? "smooth" : "auto" });
  }, [turns.length]);

  return (
    <div ref={ref} className="inset ledger" role="list" aria-label={label}>
      {turns.length === 0 ? (
        <div className="ledger-empty" role="listitem">{empty}</div>
      ) : (
        turns.map((t, i) => (
          <GuessRow key={i} guess={t.guess} verdict={t.verdict} ordinal={i + 1} theirs={theirs} onLoad={onLoad} />
        ))
      )}
    </div>
  );
}
