/**
 * End-to-end against a real server process: real sockets, real JSON.
 * Covers the multiplayer paths that only show up over a network — seat
 * reclaim after a drop, tab takeover, hostile input, a full match.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type RoomView, type ServerMessage } from "../shared/protocol";

const PORT = 18000 + Math.floor(Math.random() * 2000);
const URL = `ws://127.0.0.1:${PORT}/ws`;
let proc: ChildProcess;

before(async () => {
  proc = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", STATIC_DIR: "does-not-exist", ALLOWED_ORIGINS: "http://allowed.example" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 15000);
    proc.stdout!.on("data", (d) => {
      if (String(d).includes("listening")) {
        clearTimeout(t);
        resolve();
      }
    });
  });
});

after(() => {
  proc.kill();
});

class Client {
  ws: WebSocket;
  view: RoomView | null = null;
  token = "";
  errors: string[] = [];
  closed = false;
  private waiters: Array<() => void> = [];
  opened: Promise<void>;

  constructor() {
    this.ws = new WebSocket(URL, { headers: { Origin: `http://127.0.0.1:${PORT}` } });
    this.opened = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (d) => {
      const m = JSON.parse(String(d)) as ServerMessage;
      if (m.t === "error") this.errors.push(m.code);
      else if (m.t === "joined") {
        this.view = m.view;
        this.token = m.token;
      } else if (m.t === "state") this.view = m.view;
      this.waiters.splice(0).forEach((w) => w());
    });
    this.ws.on("close", () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  send(m: ClientMessage | string) {
    this.ws.send(typeof m === "string" ? m : JSON.stringify(m));
  }
  async until(pred: () => boolean, ms = 3000) {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error("timed out waiting for condition");
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
  static async join(room: string, name: string, extra: Partial<Extract<ClientMessage, { t: "join" }>> = {}) {
    const c = new Client();
    await c.opened;
    c.send({ t: "join", v: PROTOCOL_VERSION, room, name, ...extra });
    await c.until(() => c.view !== null || c.errors.length > 0);
    return c;
  }
}

const code = () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ".split("").sort(() => Math.random() - 0.5).slice(0, 5).join("");

function openWithOrigin(origin: string | null): Promise<"open" | "refused"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL, origin ? { headers: { Origin: origin } } : {});
    ws.on("open", () => { ws.close(); resolve("open"); });
    ws.on("error", () => resolve("refused"));
  });
}

test("sockets are same-origin by default, plus ALLOWED_ORIGINS", async () => {
  assert.equal(await openWithOrigin(`http://127.0.0.1:${PORT}`), "open", "the page this server serves");
  assert.equal(await openWithOrigin("http://allowed.example"), "open", "an origin from ALLOWED_ORIGINS");
  assert.equal(await openWithOrigin("https://evil.example"), "refused", "any other website");
  assert.equal(await openWithOrigin(null), "open", "a non-browser client (no Origin)");
});

test("oversized messages close the socket without hurting the server", async () => {
  const c = new Client();
  await c.opened;
  c.send(JSON.stringify({ t: "join", v: PROTOCOL_VERSION, room: "ABCDE", name: "x".repeat(6000) }));
  await c.until(() => c.closed);
  const alive = await Client.join(code(), "Next", { create: true });
  assert.equal(alive.view?.seat, "host");
});

test("actions before joining a table are refused", async () => {
  const c = new Client();
  await c.opened;
  c.send({ t: "guess", guess: ["1", "2", "3", "4"] });
  c.send({ t: "rematch" });
  await c.until(() => c.errors.length >= 2);
  assert.deepEqual(c.errors, ["not_now", "not_now"]);
});

test("health endpoint answers", async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("hostile and malformed input never takes the server down", async () => {
  const c = new Client();
  await c.opened;
  for (const raw of ["null", "0", "[]", "{", '{"t":"join","room":null,"name":{}}', '{"t":"setSecret","code":"1234"}', "x".repeat(3000)]) {
    c.send(raw);
  }
  await c.until(() => c.errors.length >= 7);
  assert.ok(c.errors.every((e) => e === "bad_message"));
  const alive = await Client.join(code(), "Still here", { create: true });
  assert.equal(alive.view?.seat, "host");
});

test("joining a table that does not exist is refused unless creating", async () => {
  const r = code();
  const j = await Client.join(r, "Guest");
  assert.deepEqual(j.errors, ["no_room"]);
  const h = await Client.join(r, "Host", { create: true });
  assert.equal(h.view?.seat, "host");
  const again = await Client.join(r, "Imposter", { create: true });
  assert.deepEqual(again.errors, ["room_exists"]);
});

test("stale protocol versions are told to refresh", async () => {
  const c = new Client();
  await c.opened;
  c.send({ t: "join", v: 1, room: code(), name: "Old", create: true });
  await c.until(() => c.errors.length > 0);
  assert.deepEqual(c.errors, ["version"]);
});

test("a full match plays out and both sides agree on every step", async () => {
  const r = code();
  const a = await Client.join(r, "Alice", { create: true });
  const b = await Client.join(r, "Bob");
  await a.until(() => a.view?.phase === "setup");
  assert.equal(a.view?.opponent?.name, "Bob");
  assert.equal(b.view?.opponent?.name, "Alice");

  a.send({ t: "setSecret", code: ["1", "2", "3", "4"] });
  b.send({ t: "setSecret", code: ["5", "6", "7", "8"] });
  await a.until(() => a.view?.phase === "play");
  await b.until(() => b.view?.phase === "play");

  // Out-of-turn guess is refused and the guesser is resynced.
  b.send({ t: "guess", guess: ["1", "2", "3", "5"] });
  await b.until(() => b.errors.includes("not_now"));
  assert.equal(b.view?.yourHunt.length, 0);

  // A double tap sends the same guess twice back to back: only one counts.
  a.send({ t: "guess", guess: ["9", "8", "7", "6"] });
  a.send({ t: "guess", guess: ["9", "8", "7", "6"] });
  await b.until(() => (b.view?.theirHunt.length ?? 0) === 1);
  await new Promise((res) => setTimeout(res, 150));
  assert.equal(a.view?.yourHunt.length, 1);
  assert.equal(b.view?.turn, "guest");

  b.send({ t: "guess", guess: ["1", "2", "3", "4"] });
  await a.until(() => a.view?.phase === "over");
  await b.until(() => b.view?.phase === "over");
  assert.equal(a.view?.outcome, "loss");
  assert.equal(b.view?.outcome, "win");
  assert.deepEqual(a.view?.revealedSecrets, b.view?.revealedSecrets);

  a.send({ t: "rematch" });
  await b.until(() => b.view?.opponent?.wantsRematch === true);
  assert.equal(b.view?.phase, "over");
  b.send({ t: "rematch" });
  await a.until(() => a.view?.phase === "setup");
  assert.equal(a.view?.firstMover, "guest");
});

test("a dropped player reclaims their seat and secret; a stranger cannot", async () => {
  const r = code();
  const a = await Client.join(r, "Alice", { create: true });
  const b = await Client.join(r, "Bob");
  a.send({ t: "setSecret", code: ["1", "2", "3", "4"] });
  await a.until(() => a.view?.you.ready === true);
  const token = a.token;
  a.ws.close();
  await b.until(() => b.view?.opponent?.connected === false);

  const m = await Client.join(r, "Mallory");
  assert.deepEqual(m.errors, ["room_full"]);
  assert.equal(m.view, null, "the stranger learns nothing about the table");

  const back = await Client.join(r, "Alice", { token, resume: "hard" });
  assert.equal(back.view?.seat, "host");
  assert.deepEqual(back.view?.yourSecret, ["1", "2", "3", "4"]);
  await b.until(() => b.view?.opponent?.connected === true);
});

test("the same seat opened in a new tab replaces the old socket", async () => {
  const r = code();
  const a = await Client.join(r, "Alice", { create: true });
  const a2 = await Client.join(r, "Alice", { token: a.token, resume: "hard" });
  assert.equal(a2.view?.seat, "host");
  await a.until(() => a.closed);
  assert.ok(a.errors.includes("replaced"));
});

test("leaving frees the seat at once and tells the other player", async () => {
  const r = code();
  const a = await Client.join(r, "Alice", { create: true });
  const b = await Client.join(r, "Bob");
  await a.until(() => a.view?.opponent !== null);
  b.send({ t: "leave" });
  await a.until(() => a.view?.opponent === null);
  assert.equal(a.view?.phase, "lobby");
  const c = await Client.join(r, "Carol");
  assert.equal(c.view?.seat, "guest");
});

test("one socket cannot sit on both sides of a table", async () => {
  const r = code();
  const a = await Client.join(r, "Alice", { create: true });
  a.send({ t: "join", v: PROTOCOL_VERSION, room: r, name: "Alice again" });
  await new Promise((res) => setTimeout(res, 200));
  assert.equal(a.view?.opponent, null, "re-joining moved the socket rather than adding a second player");
});
