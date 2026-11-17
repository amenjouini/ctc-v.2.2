/**
 * What the game tells its makers, and nothing else.
 *
 * Crashes: an uncaught error in a player's browser is sent to this game's own
 * server (/api/report), which writes it to the server log. No address, no
 * name, no board.
 *
 * Usage: page views and a few named events ("daily_share"), sent only when
 * an analytics service is configured at build time, in the Plausible event
 * format (Plausible, or a compatible one like a self-hosted Plausible or
 * Umami's Plausible endpoint). These services use no cookies and store no
 * personal data, so the game needs no consent banner for them. Unset = off.
 *
 *   VITE_ANALYTICS_URL     e.g. https://plausible.io/api/event
 *   VITE_ANALYTICS_DOMAIN  the site as registered there, e.g. crackthecode.game
 *
 * The server's security policy must allow that address: set CONNECT_SRC on
 * the server to its origin (e.g. https://plausible.io).
 */
const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL as string | undefined;
const ANALYTICS_DOMAIN = import.meta.env.VITE_ANALYTICS_DOMAIN as string | undefined;
export const VERSION = (import.meta.env.VITE_VERSION as string | undefined) ?? "dev";

/** Room codes are private: the page address is sent without them. */
function cleanUrl(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/^\/room\/[^/]+/, "/room/_");
}

export function track(name: string, props?: Record<string, string | number | boolean>) {
  if (!ANALYTICS_URL || !ANALYTICS_DOMAIN || import.meta.env.DEV) return;
  try {
    void fetch(ANALYTICS_URL, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ name, url: cleanUrl(), domain: ANALYTICS_DOMAIN, referrer: document.referrer || null, props }),
    }).catch(() => {});
  } catch {
    /* never let counting break the game */
  }
}

export function trackPage() {
  track("pageview");
}

/** Send one report to this server. Fire and forget. */
export function report(kind: "error" | "feedback", fields: { message: string; stack?: string }): Promise<boolean> {
  try {
    return fetch("/api/report", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...fields, page: cleanUrl(), version: VERSION, lang: document.documentElement.lang }),
    }).then((r) => r.ok, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

let sent = 0;
/** Crashes, at most a few per visit so a loop cannot flood the log. */
export function watchErrors() {
  if (import.meta.env.DEV) return;
  const send = (message: string, stack?: string) => {
    if (sent++ >= 5) return;
    void report("error", { message, stack });
  };
  window.addEventListener("error", (e) => {
    // A failed script or image load has no message; only real errors count.
    if (e.message) send(e.message, e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    send(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  });
}
