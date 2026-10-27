import { useCallback, useEffect, useRef, useState } from "react";
import type { Routine } from "@/world/actor";
import type { CritterKind } from "@/world/sprites";
import type { Theme } from "./useTheme";

export type { CritterKind };

export const CRITTER_FOR: Record<Theme, CritterKind> = {
  dusk: "owl",
  beach: "crab",
  snow: "penguin",
  autumn: "squirrel",
  halloween: "ghost",
};

export interface Spawn {
  id: number;
  kind: CritterKind;
  /** development only: force what the critter does first */
  routine?: Routine;
}

const ROUTINES: Routine[] = ["walk", "box", "letters", "swing", "tour", "dangle", "trick", "peek"];

/** Development only: ?critter=walk|box|letters|swing|tour|dangle|trick|peek summons one
 *  quickly and makes it do that, so the motion can be checked on demand. */
function forced(): Routine | undefined {
  if (!import.meta.env.DEV) return undefined;
  const r = new URLSearchParams(location.search).get("critter") as Routine | null;
  return r && ROUTINES.includes(r) ? r : undefined;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * When a critter appears — one at a time, never on a hidden tab, never
 * under reduced motion. WHAT it does is up to the critter and the world it
 * finds (see world/actor.ts). The next one is scheduled only once the
 * current one has actually left (`done`).
 */
export function useCritters(theme: Theme, enabled = true, summon?: { key: number | string; routine: Routine } | null) {
  const [spawn, setSpawn] = useState<Spawn | null>(null);
  const seq = useRef(0);
  const timer = useRef<number>();

  const schedule = useCallback(
    (delay: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (document.hidden) return schedule(4000);
        setSpawn({ id: ++seq.current, kind: CRITTER_FOR[theme], routine: forced() });
      }, delay);
    },
    [theme],
  );

  useEffect(() => {
    setSpawn(null);
    if (!enabled || reducedMotion()) return;
    schedule(forced() ? 500 : 6000 + Math.random() * 8000);
    return () => window.clearTimeout(timer.current);
  }, [schedule, enabled]);

  // Something happened that a critter should turn up for right now (a
  // message to deliver): it replaces whoever is on stage.
  const summonKey = summon?.key;
  const summonRoutine = summon?.routine;
  useEffect(() => {
    if (summonKey === undefined || !summonRoutine || !enabled || reducedMotion()) return;
    window.clearTimeout(timer.current);
    setSpawn({ id: ++seq.current, kind: CRITTER_FOR[theme], routine: summonRoutine });
  }, [summonKey, summonRoutine, enabled, theme]);

  /** `left` is false when the world had no room for one at all. */
  const done = useCallback(
    (left = true) => {
      setSpawn(null);
      schedule(forced() ? 1500 : left ? 11000 + Math.random() * 13000 : 8000);
    },
    [schedule],
  );

  return { spawn, done };
}
