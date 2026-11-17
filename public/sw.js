/*
 * Crack the Code's service worker: the game opens instantly and solo play
 * works offline.
 *
 *  - The page itself: network first (players always get the newest version
 *    when online), the saved copy when offline.
 *  - /assets/*: hashed, never change, so the saved copy is used straight away.
 *  - Everything else of ours (icons, manifest): saved copy at once, refreshed
 *    in the background.
 *  - The game socket, /api and /healthz are never touched.
 *
 * Bump VERSION only to throw away every saved file (normally never needed:
 * new builds have new asset names).
 */
const VERSION = "v1";
const PAGES = `ctc-pages-${VERSION}`;
const ASSETS = `ctc-assets-${VERSION}`;
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const res = await fetch("/", { cache: "no-cache" });
      if (!res.ok) return;
      await pages.put("/", res.clone());
      // Keep the files that page loads too, so the very first offline visit works.
      const html = await res.text();
      const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      const assets = await caches.open(ASSETS);
      await Promise.all(urls.map((u) => assets.add(u).catch(() => undefined)));
    })().catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![PAGES, ASSETS].includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/ws") || url.pathname.startsWith("/api/") || url.pathname === "/healthz") return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(PAGES)).put("/", res.clone());
          return res;
        } catch {
          // Every route is the same app; the saved page handles it.
          return (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(ASSETS);
          await cache.put(req, res.clone());
          void trim(cache);
        }
        return res;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) void cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      return hit ?? fresh;
    })(),
  );
});
