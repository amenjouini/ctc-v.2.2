import { useSyncExternalStore } from "react";

/**
 * The installable app: a service worker (public/sw.js) that keeps the game's
 * files so it opens instantly and solo play works offline, and the browser's
 * "install" prompt, kept until the player asks for it from the menu.
 */
export function registerWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* no offline mode; the game still works */
    });
  });
}

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Hold the browser's own banner back; the menu offers it instead.
    e.preventDefault();
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function standalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad Safari never fire the prompt; they need the Share menu. */
function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export type InstallWay = "prompt" | "ios" | null;

/** How this browser can install the game right now, if at all. */
export function useInstall(): { way: InstallWay; install: () => Promise<void> } {
  const way = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    (): InstallWay => (standalone() ? null : deferred ? "prompt" : iosSafari() ? "ios" : null),
  );
  const install = async () => {
    if (!deferred) return;
    const p = deferred;
    deferred = null;
    await p.prompt();
    await p.userChoice.catch(() => undefined);
    notify();
  };
  return { way, install };
}
