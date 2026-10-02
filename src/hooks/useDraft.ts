import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CODE_LENGTH, isValidCode, type Code } from "@shared/engine";
import { dialogs } from "./dialogs";

/**
 * The four-slot composer. Shared by the solo board, the online board and the
 * secret-setting screen — the rules for what may be typed are identical in
 * all three, so they live in one place.
 */
export function useDraft() {
  const [slots, setSlots] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [slot, setSlot] = useState(0);

  /**
   * NOTE: the cursor advance must happen OUTSIDE the state updater.
   * React 18 StrictMode deliberately invokes updater functions twice to
   * surface impurity — so a setSlot() call nested inside setSlots() fired
   * twice and the cursor jumped two places, which is why the second slot
   * was always skipped. Updaters must be pure.
   */
  const place = useCallback(
    (d: string) => {
      if (slot === 0 && d === "0") return;
      if (slots.includes(d)) return;
      const next = [...slots];
      next[slot] = d;
      setSlots(next);
      setSlot(Math.min(slot + 1, CODE_LENGTH - 1));
    },
    [slot, slots],
  );

  /** Wipes the row. With only four slots this beats backspacing. */
  const clear = useCallback(() => {
    setSlots(Array(CODE_LENGTH).fill(""));
    setSlot(0);
  }, []);

  /** Single-digit delete, bound to the Backspace key only. Pure, for the
   *  same reason as place(). */
  const backspace = useCallback(() => {
    const next = [...slots];
    if (next[slot] !== "") {
      next[slot] = "";
    } else if (slot > 0) {
      next[slot - 1] = "";
      setSlot(slot - 1);
    }
    setSlots(next);
  }, [slot, slots]);

  const load = useCallback((code: Code) => {
    setSlots([...code]);
    setSlot(CODE_LENGTH - 1);
  }, []);

  const complete = useMemo(() => isValidCode(slots), [slots]);
  const used = useMemo(() => slots.filter(Boolean), [slots]);

  const isBlocked = useCallback(
    (d: string) => used.includes(d) || (slot === 0 && d === "0"),
    [used, slot],
  );

  return { slots, slot, setSlot, place, clear, backspace, load, complete, used, isBlocked };
}

type Draft = ReturnType<typeof useDraft>;

/**
 * Physical-keyboard play, identical on every board. Keys are ignored while
 * a dialog is open or a text field has focus — otherwise typing a name
 * would fire guesses, and Backspace would stop working in the field.
 */
export function useGameKeys(draft: Draft, submit: () => void, enabled: boolean) {
  const latest = useRef({ draft, submit, enabled });
  latest.current = { draft, submit, enabled };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { draft: d, submit: fire, enabled: on } = latest.current;
      if (!on || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (dialogs.anyOpen) return;

      if (e.key >= "0" && e.key <= "9" && e.key.length === 1) d.place(e.key);
      else if (e.key === "Backspace") d.backspace();
      else if (e.key === "Delete" || e.key === "Escape") d.clear();
      else if (e.key === "Enter") {
        // A full code always fires, wherever focus happens to be. Otherwise
        // a focused button outside the board (Guide, New code) keeps its
        // own Enter; on the board itself Enter means Fire, never "press
        // the digit I last clicked again".
        if (!d.complete && t?.tagName === "BUTTON" && !t.closest(".board")) return;
        fire();
      } else if (e.key === "ArrowLeft") d.setSlot(Math.max(0, d.slot - 1));
      else if (e.key === "ArrowRight") d.setSlot(Math.min(CODE_LENGTH - 1, d.slot + 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
