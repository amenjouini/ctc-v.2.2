import { useSyncExternalStore } from "react";

/**
 * Small preferences, kept on the device and shared live by every component
 * that reads them (the menu changes one, the whole game reacts).
 */
export interface Settings {
  /** the wandering characters */
  critters: boolean;
  lang: "en" | "fr";
}

const KEY = "ctc.settings";

function deviceLang(): Settings["lang"] {
  try {
    return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
  } catch {
    return "en";
  }
}

function read(): Settings {
  const defaults: Settings = { critters: true, lang: deviceLang() };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    const merged = { ...defaults, ...saved };
    if (merged.lang !== "en" && merged.lang !== "fr") merged.lang = defaults.lang;
    return merged;
  } catch {
    return defaults;
  }
}

let current = read();
const listeners = new Set<() => void>();

function apply() {
  try {
    document.documentElement.lang = current.lang;
  } catch {
    /* not in a browser */
  }
}
apply();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: lasts for this visit only */
  }
  apply();
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
