import { test } from "node:test";
import assert from "node:assert/strict";
import type { Code } from "../shared/engine";
import * as R from "../shared/room";

const c = (s: string) => s.split("") as Code;
let n = 0;
const mint = () => `tok${++n}`;

function seatedRoom() {
  const room = R.createRoom("ABCDE", 0);
  const a = R.join(room, { name: "Alice" }, 0, mint);
  const b = R.join(room, { name: "Bob" }, 0, mint);
  assert.ok(a.ok && b.ok);
  return { room, a: a as Extract<typeof a, { ok: true }>, b: b as Extract<typeof b, { ok: true }> };
}

function playingRoom(hostSecret = "1234", guestSecret = "5678") {
  const r = seatedRoom();
  assert.ok(R.setSecret(r.room, "host", c(hostSecret)).ok);
  assert.ok(R.setSecret(r.room, "guest", c(guestSecret)).ok);
  return r;
}

test("two joins fill both seats and open setup; a third is refused", () => {
  const { room, a, b } = seatedRoom();
  assert.equal(a.seat, "host");
  assert.equal(b.seat, "guest");
  assert.notEqual(a.token, b.token);
  assert.equal(room.phase, "setup");
  const c3 = R.join(room, { name: "Carol" }, 0, mint);
  assert.equal(c3.ok, false);
  assert.equal(!c3.ok && c3.code, "room_full");
});

test("a dropped seat cannot be taken by a stranger, only by its token", () => {
  const { room, a } = seatedRoom();
  R.setSecret(room, "host", c("1234"));
  R.disconnect(room, "host", 10);
  const stranger = R.join(room, { name: "Mallory" }, 11, mint);
  assert.equal(stranger.ok, false, "stranger must not inherit the host seat");
  assert.deepEqual(room.players.host?.secret, c("1234"));

  const back = R.join(room, { name: "Alice", token: a.token, resume: "hard" }, 12, mint);
  assert.ok(back.ok && back.seat === "host" && back.resumed);
  assert.equal(room.players.host?.connected, true);
  assert.deepEqual(R.viewFor(room, "host").yourSecret, c("1234"));
});

test("soft resume does not displace a live seat; hard resume does", () => {
  const room = R.createRoom("ABCDE", 0);
  const a = R.join(room, { name: "Alice" }, 0, mint);
  assert.ok(a.ok);
  const soft = R.join(room, { name: "Alice", token: a.token, resume: "soft" }, 1, mint);
  assert.ok(soft.ok && soft.seat === "guest" && !soft.resumed, "second tab becomes a new player");
  const hard = R.join(room, { name: "Alice", token: a.token, resume: "hard" }, 2, mint);
  assert.ok(hard.ok && hard.seat === "host" && hard.displaced);
});

test("secrets are validated and set once, and only in setup", () => {
  const { room } = seatedRoom();
  const bad = R.setSecret(room, "host", c("0123"));
  assert.ok(!bad.ok && bad.code === "bad_code");
  assert.ok(R.setSecret(room, "host", c("1234")).ok);
  assert.equal(R.setSecret(room, "host", c("5678")).ok, false, "cannot change a locked secret");
  assert.deepEqual(room.players.host?.secret, c("1234"));
  assert.equal(room.phase, "setup");
  assert.ok(R.setSecret(room, "guest", c("5678")).ok);
  assert.equal(room.phase, "play");
});

test("only the seat whose turn it is may guess; double submits are refused", () => {
  const { room } = playingRoom();
  assert.equal(room.turn, "host");
  assert.equal(R.guess(room, "guest", c("1234")).ok, false);
  assert.ok(R.guess(room, "host", c("9876")).ok);
  const dup = R.guess(room, "host", c("9876"));
  assert.ok(!dup.ok && dup.code === "not_now");
  assert.equal(room.history.length, 1);
  assert.equal(room.turn, "guest");
});

test("the server scores guesses; views never leak the rival's secret mid-match", () => {
  const { room } = playingRoom("1234", "5678");
  R.guess(room, "host", c("5687"));
  const hv = R.viewFor(room, "host");
  assert.deepEqual(hv.yourHunt[0].verdict, { exact: 2, misplaced: 2 });
  assert.equal(hv.revealedSecrets, null);
  assert.ok(!JSON.stringify(hv).includes('"5","6","7","8"'), "guest secret must not be in host view");
  assert.ok(!JSON.stringify(R.viewFor(room, "guest")).includes('"1","2","3","4"'));
  assert.ok(!JSON.stringify(hv).includes("tok"), "tokens are never in a view");
});

test("rounds resolve in pairs: the second mover gets a reply before the match ends", () => {
  const { room } = playingRoom("1234", "5678");
  R.guess(room, "host", c("5678")); // host cracks it first
  assert.equal(room.phase, "play", "guest still gets their reply");
  R.guess(room, "guest", c("9876"));
  assert.equal(room.phase, "over");
  assert.equal(R.viewFor(room, "host").outcome, "win");
  assert.equal(R.viewFor(room, "guest").outcome, "loss");
  assert.deepEqual(R.viewFor(room, "guest").revealedSecrets, { host: c("1234"), guest: c("5678") });
});

test("both cracking in the same round is a draw", () => {
  const { room } = playingRoom("1234", "5678");
  R.guess(room, "host", c("5678"));
  R.guess(room, "guest", c("1234"));
  assert.equal(R.viewFor(room, "host").outcome, "draw");
  assert.equal(R.viewFor(room, "guest").outcome, "draw");
});

test("no cracks: rounds advance and the first mover opens each", () => {
  const { room } = playingRoom();
  R.guess(room, "host", c("9876"));
  R.guess(room, "guest", c("9876"));
  assert.equal(room.round, 2);
  assert.equal(room.turn, "host");
});

test("rematch needs both votes, is idempotent, and flips the first mover", () => {
  const { room } = playingRoom("1234", "5678");
  R.guess(room, "host", c("5678"));
  R.guess(room, "guest", c("9876"));
  assert.ok(R.requestRematch(room, "host").ok);
  assert.ok(R.requestRematch(room, "host").ok);
  assert.equal(room.phase, "over", "one vote is not enough");
  assert.equal(R.viewFor(room, "guest").opponent?.wantsRematch, true);
  assert.ok(R.requestRematch(room, "guest").ok);
  assert.equal(room.phase, "setup");
  assert.equal(room.firstMover, "guest");
  assert.equal(room.history.length, 0);
  assert.equal(room.players.host?.secret, null);
  assert.equal(R.requestRematch(room, "host").ok, false, "no rematch outside 'over'");
});

test("a player leaving resets the table to the lobby for whoever stays", () => {
  const { room } = playingRoom();
  R.guess(room, "host", c("9876"));
  R.leave(room, "host");
  assert.equal(room.phase, "lobby");
  assert.equal(room.history.length, 0);
  assert.equal(room.players.guest?.secret, null);
  const v = R.viewFor(room, "guest");
  assert.equal(v.opponent, null);
  const newcomer = R.join(room, { name: "Carol" }, 5, mint);
  assert.ok(newcomer.ok && newcomer.seat === "host");
  assert.equal(room.phase, "setup");
});

test("dropped seats expire after the grace period; connected ones never do", () => {
  const { room } = seatedRoom();
  R.disconnect(room, "guest", 1000);
  assert.deepEqual(R.expiredSeats(room, 1500, 1000), []);
  assert.deepEqual(R.expiredSeats(room, 2500, 1000), ["guest"]);
  assert.equal(R.isDeserted(room, 2500, 1000), false, "host still connected");
  R.disconnect(room, "host", 3000);
  assert.equal(R.isDeserted(room, 3500, 1000), false);
  assert.equal(R.isDeserted(room, 4500, 1000), true);
});

test("opponent presence is reported without exposing their token", () => {
  const { room } = seatedRoom();
  R.disconnect(room, "guest", 5);
  const v = R.viewFor(room, "host");
  assert.deepEqual(v.opponent, { name: "Bob", connected: false, ready: false, wantsRematch: false });
});
