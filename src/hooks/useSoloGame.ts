import { useCallback, useEffect, useState } from "react";
import {
  CODE_LENGTH,
  describe,
  generateCode,
  isValidCode,
  scoreGuess,
  type Code,
  type Verdict,
} from "@shared/engine";

export interface SoloTurn {
  guess: Code;
  verdict: Verdict;
}

const BEST_KEY = "ctc.best";
const REVEAL_KEY = "ctc.reveals";
const GAME_KEY = "ctc.solo";
export const REVEALS_PER_DAY = 3;

function readBest(): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

interface Budget {
  date: string;
  used: number;
}

/** The player's own calendar day — the budget resets at their midnight,
 *  not at midnight UTC. */
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readBudget(): Budget {
  const today = localDay();
  try {
    const raw = localStorage.getItem(REVEAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as Budget) : null;
    if (parsed && parsed.date === today) return parsed;
  } catch {
    /* ignore */
  }
  return { date: today, used: 0 };
}

interface Saved {
  code: Code;
  turns: SoloTurn[];
  revealed: boolean;
  ruledOut: Record<string, boolean>;
}

/** An unfinished board survives a refresh or the phone killing the tab. */
function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!isValidCode(s.code) || !Array.isArray(s.turns)) return null;
    // Re-score rather than trust what was stored.
    const turns = s.turns
      .filter((t) => isValidCode(t.guess))
      .map((t) => ({ guess: t.guess, verdict: scoreGuess(t.guess, s.code) }));
    if (turns.some((t) => t.verdict.exact === CODE_LENGTH)) return null;
    return { code: s.code, turns, revealed: Boolean(s.revealed), ruledOut: s.ruledOut ?? {} };
  } catch {
    return null;
  }
}

export function useSoloGame() {
  const [saved] = useState(readSaved);
  const [code, setCode] = useState<Code>(() => saved?.code ?? generateCode());
  const [turns, setTurns] = useState<SoloTurn[]>(saved?.turns ?? []);
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(saved?.revealed ?? false);
  const [best, setBest] = useState<number | null>(readBest);
  const [budget, setBudget] = useState<Budget>(readBudget);
  const [ruledOut, setRuledOut] = useState<Record<string, boolean>>(saved?.ruledOut ?? {});
  const [newBest, setNewBest] = useState(false);

  useEffect(() => {
    try {
      if (solved) localStorage.removeItem(GAME_KEY);
      else localStorage.setItem(GAME_KEY, JSON.stringify({ code, turns, revealed, ruledOut } satisfies Saved));
    } catch {
      /* ignore */
    }
  }, [code, turns, revealed, ruledOut, solved]);

  // Dev aid only: the answer, in the console. Never in a production build.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug(`[dev] solo code ${code.join("")}`);
  }, [code]);

  const submit = useCallback(
    (guess: Code) => {
      if (solved || !isValidCode(guess)) return;
      const verdict = scoreGuess(guess, code);
      const next = [...turns, { guess, verdict }];
      setTurns(next);

      if (verdict.exact === CODE_LENGTH) {
        setSolved(true);
        if (!revealed && (best === null || next.length < best)) {
          setNewBest(true);
          setBest(next.length);
          try {
            localStorage.setItem(BEST_KEY, String(next.length));
          } catch {
            /* ignore */
          }
        }
      }
    },
    [solved, code, turns, revealed, best],
  );

  const reveal = useCallback(() => {
    if (revealed || solved) return;
    const b = readBudget();
    if (REVEALS_PER_DAY - b.used <= 0) return;
    const next = { ...b, used: b.used + 1 };
    try {
      localStorage.setItem(REVEAL_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setBudget(next);
    setRevealed(true);
  }, [revealed, solved]);

  const newGame = useCallback(() => {
    setBudget(readBudget());
    setCode(generateCode());
    setTurns([]);
    setSolved(false);
    setRevealed(false);
    setRuledOut({});
    setNewBest(false);
  }, []);

  const toggleRuledOut = useCallback((d: string) => {
    setRuledOut((prev) => ({ ...prev, [d]: !prev[d] }));
  }, []);

  const last = turns[turns.length - 1];
  return {
    code,
    turns,
    solved,
    revealed,
    best,
    newBest,
    ruledOut,
    toggleRuledOut,
    submit,
    reveal,
    newGame,
    revealsLeft: REVEALS_PER_DAY - budget.used,
    readout: last ? describe(last.verdict) : "",
  };
}
