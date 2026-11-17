/**
 * Small abuse limits, kept apart from the server so they can be tested on
 * their own. Everything is in memory: it resets on a restart, which is fine
 * for limits whose job is to make guessing slow, not to remember forever.
 */

/** At most `limit` events per key in each `windowMs` window. */
export class WindowLimit {
  private seen = new Map<string, { start: number; count: number }>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  private entry(key: string, now: number) {
    let e = this.seen.get(key);
    if (!e || now - e.start >= this.windowMs) {
      e = { start: now, count: 0 };
      this.seen.set(key, e);
    }
    return e;
  }

  /** Has this key used up its window? Does not count as an event. */
  blocked(key: string, now: number): boolean {
    return this.entry(key, now).count >= this.limit;
  }

  /** Count one event; true when it was still within the limit. */
  hit(key: string, now: number): boolean {
    const e = this.entry(key, now);
    e.count++;
    return e.count <= this.limit;
  }

  /** Forget windows that have run out, so the map cannot grow forever. */
  sweep(now: number) {
    for (const [k, e] of this.seen) if (now - e.start >= this.windowMs) this.seen.delete(k);
  }

  get size() {
    return this.seen.size;
  }
}

/** How many things (sockets) each key holds at once. */
export class OpenCount {
  private open = new Map<string, number>();
  constructor(readonly max: number) {}

  /** Take a slot; false when the key already holds `max`. */
  take(key: string): boolean {
    const n = this.open.get(key) ?? 0;
    if (n >= this.max) return false;
    this.open.set(key, n + 1);
    return true;
  }

  give(key: string) {
    const n = (this.open.get(key) ?? 1) - 1;
    if (n <= 0) this.open.delete(key);
    else this.open.set(key, n);
  }

  count(key: string) {
    return this.open.get(key) ?? 0;
  }
}

/**
 * The player's address. Behind a proxy (Render, Fly, a load balancer) the
 * socket's own address is the proxy's, so with `trustProxy` the first
 * X-Forwarded-For entry is used. That entry can be forged by a client that
 * talks to the proxy directly, so these limits are a speed bump on top of the
 * per-connection ones, not a wall.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, socketIp: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const raw = headers["x-forwarded-for"];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return socketIp ?? "unknown";
}
