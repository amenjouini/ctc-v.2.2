import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenCount, WindowLimit, clientIp } from "../server/limits";

test("a window allows its limit, then blocks until it runs out", () => {
  const w = new WindowLimit(3, 1000);
  assert.equal(w.hit("a", 0), true);
  assert.equal(w.hit("a", 10), true);
  assert.equal(w.hit("a", 20), true);
  assert.equal(w.blocked("a", 30), true);
  assert.equal(w.hit("a", 40), false);
  assert.equal(w.blocked("b", 40), false, "other addresses are not affected");
  assert.equal(w.blocked("a", 1000), false, "a new window starts fresh");
});

test("sweeping forgets finished windows only", () => {
  const w = new WindowLimit(1, 1000);
  w.hit("old", 0);
  w.hit("new", 900);
  w.sweep(1000);
  assert.equal(w.size, 1);
});

test("open counts cap each key and free slots on release", () => {
  const o = new OpenCount(2);
  assert.equal(o.take("a"), true);
  assert.equal(o.take("a"), true);
  assert.equal(o.take("a"), false);
  o.give("a");
  assert.equal(o.take("a"), true);
  o.give("a");
  o.give("a");
  assert.equal(o.count("a"), 0);
  o.give("a");
  assert.equal(o.count("a"), 0, "never negative");
});

test("the address comes from the proxy header only when trusted", () => {
  const h = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
  assert.equal(clientIp(h, "10.0.0.1", true), "203.0.113.7");
  assert.equal(clientIp(h, "10.0.0.1", false), "10.0.0.1");
  assert.equal(clientIp({}, "10.0.0.2", true), "10.0.0.2");
  assert.equal(clientIp({}, undefined, false), "unknown");
});
