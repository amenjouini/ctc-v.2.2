import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_MAX, cleanName, parseClientMessage } from "../shared/protocol";

test("garbage never becomes a message", () => {
  for (const raw of ["", "null", "0", "[]", '"join"', "{", "{}", '{"t":"nope"}', '{"t":"join"}', '{"t":"join","v":2}']) {
    assert.equal(parseClientMessage(raw), null, raw);
  }
});

test("join is normalised and bounded", () => {
  const m = parseClientMessage(JSON.stringify({ t: "join", v: 2, room: "abcde", name: "  Al\u0000ice  ", create: "yes" }));
  assert.deepEqual(m, { t: "join", v: 2, room: "abcde", name: "Alice", token: undefined, resume: undefined, create: false });
  assert.equal(parseClientMessage(JSON.stringify({ t: "join", v: 2, room: "ABCDE", name: "x", token: 5 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: "join", v: 2, room: "ABCDE", name: "x", resume: "maybe" })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: "join", v: 2, room: "ABCDE", name: "x", token: "a".repeat(65) })), null);
});

test("codes must be four one-character strings", () => {
  assert.deepEqual(parseClientMessage('{"t":"guess","guess":["1","2","3","4"]}'), { t: "guess", guess: ["1", "2", "3", "4"] });
  assert.equal(parseClientMessage('{"t":"guess","guess":"1234"}'), null);
  assert.equal(parseClientMessage('{"t":"guess","guess":[1,2,3,4]}'), null);
  assert.equal(parseClientMessage('{"t":"setSecret","code":["12","3","4","5"]}'), null);
  assert.equal(parseClientMessage('{"t":"setSecret"}'), null);
  // Well-formed but illegal (repeated digit) passes the parser: the room refuses it with a reason.
  assert.deepEqual(parseClientMessage('{"t":"setSecret","code":["1","1","2","3"]}'), { t: "setSecret", code: ["1", "1", "2", "3"] });
});

test("extra fields are dropped, not passed through", () => {
  assert.deepEqual(parseClientMessage('{"t":"rematch","seat":"host","score":500}'), { t: "rematch" });
});

test("cleanName strips control and bidi characters and caps length", () => {
  assert.equal(cleanName(`a${String.fromCharCode(0x202e)}b${String.fromCharCode(0x200b)}c`), "abc");
  assert.equal(cleanName("  lots   of   space "), "lots of space");
  assert.equal(cleanName("x".repeat(40)).length, NAME_MAX);
  assert.equal(cleanName(42), "");
});
