import { useCallback, useEffect, useMemo, useState } from "react";
import { CODE_LENGTH, isValidCode, scoreGuess, type Code } from "@shared/engine";
import { dailyCode, dailyNumber, dailyStats, dayKey } from "@shared/daily";
import type { SoloTurn } from "./useSoloGame";

const KEY = "ctc.daily";

interface Stored {
  /** day key -> tries, for every daily solved on this device */
  history: Record<string, number>;
  /** today's board, so a refresh or a closed tab picks up where it was */
  current?: { day: string; guesses: string[]; ruledOut: Record<string, boolean> };
}

function read(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Stored>;
    const history: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.history ?? {})) if (Number.isInteger(v) && v > 0) history[k] = v;
    return { history, current: s.current };
  } catch {
    return { history: {} };
  }
}

function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: this visit only */
  }
}

/** Today's daily on this device: tried, solved, or not started. */
export function dailyStatus(): { number: number; solved: boolean; tries: number | null; streak: number } {
  const today = dayKey();
  const s = read();
  return { number: dailyNumber(today), solved: today in s.history, tries: s.history[today] ?? null, streak: dailyStats(s.history, today).streak };
}

/**
 * The daily puzzle: everyone's code for today. No reveals and no new code;
 * a solved day stays solved, and goes into the streak and the statistics.
 */
export function useDailyGame() {
  const [today] = useState(dayKey);
  const code = useMemo(() => dailyCode(today), [today]);
  const [stored, setStored] = useState(read);

  const [turns, setTurns] = useState<SoloTurn[]>(() => {
    const c = stored.current;
    if (!c || c.day !== today || !Array.isArray(c.guesses)) return [];
    // Re-score rather than trust what was stored.
    return c.guesses
      .map((g) => [...String(g)])
      .filter(isValidCode)
      .map((guess) => ({ guess, verdict: scoreGuess(guess, code) }));
  });
  const [ruledOut, setRuledOut] = useState<Record<string, boolean>>(() =>
    stored.current?.day === today ? stored.current.ruledOut ?? {} : {},
  );
  const solved = today in stored.history || turns.some((t) => t.verdict.exact === CODE_LENGTH);

  useEffect(() => {
    setStored((prev) => {
      const next = { ...prev, current: { day: today, guesses: turns.map((t) => t.guess.join("")), ruledOut } };
      write(next);
      return next;
    });
  }, [today, turns, ruledOut]);

  const submit = useCallback(
    (guess: Code) => {
      if (solved || !isValidCode(guess)) return;
      const verdict = scoreGuess(guess, code);
      const next = [...turns, { guess, verdict }];
      setTurns(next);
      if (verdict.exact === CODE_LENGTH) {
        setStored((prev) => {
          if (today in prev.history) return prev;
          const done = { ...prev, history: { ...prev.history, [today]: next.length } };
          write(done);
          return done;
        });
      }
    },
    [solved, code, turns, today],
  );

  const toggleRuledOut = useCallback((d: string) => {
    setRuledOut((prev) => ({ ...prev, [d]: !prev[d] }));
  }, []);

  const stats = useMemo(() => dailyStats(stored.history, today), [stored.history, today]);

  return {
    code,
    turns,
    solved,
    ruledOut,
    toggleRuledOut,
    submit,
    today,
    number: dailyNumber(today),
    /** tries it took today, once solved */
    tries: stored.history[today] ?? (solved ? turns.length : null),
    stats,
  };
}
