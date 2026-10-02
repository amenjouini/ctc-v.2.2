import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describe,
  generateCode,
  isRoomCode,
  isValidCode,
  makeRoomCode,
  normaliseRoom,
  scoreGuess,
  type Code,
} from "../shared/engine";

const c = (s: string) => s.split("") as Code;

test("generateCode always yields a legal code", () => {
  for (let i = 0; i < 5000; i++) assert.ok(isValidCode(generateCode()));
});

test("generateCode never leads with zero and uses every non-zero lead", () => {
  const leads = new Set<string>();
  for (let i = 0; i < 5000; i++) leads.add(generateCode()[0]);
  assert.ok(!leads.has("0"));
  assert.equal(leads.size, 9);
});

test("scoreGuess counts exact and misplaced digits", () => {
  assert.deepEqual(scoreGuess(c("1234"), c("1234")), { exact: 4, misplaced: 0 });
  assert.deepEqual(scoreGuess(c("4321"), c("1234")), { exact: 0, misplaced: 4 });
  assert.deepEqual(scoreGuess(c("1243"), c("1234")), { exact: 2, misplaced: 2 });
  assert.deepEqual(scoreGuess(c("5678"), c("1234")), { exact: 0, misplaced: 0 });
  assert.deepEqual(scoreGuess(c("1567"), c("1234")), { exact: 1, misplaced: 0 });
  assert.deepEqual(scoreGuess(c("5617"), c("1234")), { exact: 0, misplaced: 1 });
});

test("isValidCode enforces length, distinct digits, no leading zero", () => {
  assert.ok(isValidCode(c("1023")));
  assert.ok(!isValidCode(c("0123")));
  assert.ok(!isValidCode(c("1123")));
  assert.ok(!isValidCode(c("123")));
  assert.ok(!isValidCode(c("12345")));
  assert.ok(!isValidCode(["1", "2", "3", "a"]));
  assert.ok(!isValidCode("1234" as unknown as string[]));
});

test("describe spells numbers out and never uses figures", () => {
  assert.equal(describe({ exact: 4, misplaced: 0 }), "Cracked it.");
  assert.equal(describe({ exact: 1, misplaced: 2 }), "One in the right slot, two in the code but elsewhere.");
  assert.match(describe({ exact: 0, misplaced: 0 }), /^Nothing here/);
  for (let e = 0; e <= 4; e++)
    for (let m = 0; m + e <= 4; m++) assert.doesNotMatch(describe({ exact: e, misplaced: m }), /\d/);
});

test("room codes are unambiguous and round-trip through normalisation", () => {
  for (let i = 0; i < 500; i++) {
    const code = makeRoomCode();
    assert.ok(isRoomCode(code), code);
    assert.equal(normaliseRoom(code.toLowerCase()), code);
  }
  assert.equal(normaliseRoom(" ab-c d9x "), "ABCD9");
  assert.ok(!isRoomCode("ABCD0"), "zero is not in the alphabet");
  assert.ok(!isRoomCode("ABCD"));
  assert.equal(normaliseRoom(undefined as unknown as string), "");
});
