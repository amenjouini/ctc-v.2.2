import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCode } from "../shared/engine";
import {
  DAILY_EPOCH, SHARE_ROWS, dailyCode, dailyNumber, dailyStats, dayKey, daysBetween, msUntilNextDay, shareGrid, shareRow,
} from "../shared/daily";
import { originOf, preview, renderPage } from "../server/page";

test("the daily code is legal and the same every time for a day", () => {
  for (let i = 0; i < 400; i++) {
    const d = new Date(2026, 10, 17 + i);
    const k = dayKey(d);
    const c = dailyCode(k);
    assert.ok(isValidCode(c), `${k}: ${c.join("")}`);
    assert.deepEqual(dailyCode(k), c);
  }
});

test("daily codes change from day to day", () => {
  const codes = new Set(Array.from({ length: 60 }, (_, i) => dailyCode(dayKey(new Date(2027, 0, 1 + i))).join("")));
  assert.ok(codes.size > 55, `only ${codes.size} different codes in 60 days`);
});

test("puzzle numbers count from the first day, across months and years", () => {
  assert.equal(dailyNumber(DAILY_EPOCH), 1);
  assert.equal(dailyNumber("2026-11-18"), 2);
  assert.equal(dailyNumber("2026-12-01"), 15);
  assert.equal(dailyNumber("2027-11-17"), 366);
  assert.equal(daysBetween("2027-02-28", "2027-03-01"), 1);
});

test("day keys follow the local calendar", () => {
  assert.equal(dayKey(new Date(2027, 0, 5, 23, 59)), "2027-01-05");
  assert.equal(dayKey(new Date(2027, 0, 6, 0, 0)), "2027-01-06");
  const left = msUntilNextDay(new Date(2027, 0, 5, 23, 0, 0));
  assert.equal(left, 3_600_000);
});

test("shared rows count squares, never positions", () => {
  assert.equal(shareRow({ exact: 1, misplaced: 2 }), "🟩🟨🟨⬛");
  assert.equal(shareRow({ exact: 0, misplaced: 0 }), "⬛⬛⬛⬛");
  assert.equal(shareRow({ exact: 4, misplaced: 0 }), "🟩🟩🟩🟩");
  const long = shareGrid(Array.from({ length: SHARE_ROWS + 3 }, () => ({ exact: 0, misplaced: 1 })));
  assert.equal(long.split("\n").length, SHARE_ROWS + 1);
  assert.ok(long.endsWith("…"));
});

test("statistics: played, streaks, average and spread", () => {
  const history = { "2027-01-01": 5, "2027-01-02": 4, "2027-01-03": 7, "2027-01-05": 3, "2027-01-06": 12 };
  const s = dailyStats(history, "2027-01-06");
  assert.equal(s.played, 5);
  assert.equal(s.maxStreak, 3);
  assert.equal(s.streak, 2);
  assert.equal(s.average, 6.2);
  assert.equal(s.spread.find((b) => b.label === "1-3")!.count, 1);
  assert.equal(s.spread.find((b) => b.label === "10+")!.count, 1);
});

test("a streak lasts through the next day, then breaks", () => {
  const history = { "2027-01-01": 5, "2027-01-02": 4 };
  assert.equal(dailyStats(history, "2027-01-03").streak, 2, "today not played yet");
  assert.equal(dailyStats(history, "2027-01-04").streak, 0, "a day was missed");
  assert.equal(dailyStats({}, "2027-01-04").average, null);
});

test("link previews are filled in and escaped", () => {
  const html = '<meta content="__OG_TITLE__"><meta content="__ORIGIN____OG_PATH__"><meta content="__ORIGIN__/og.png"><meta content="__OG_DESC__">';
  const out = renderPage(html, "https://play.example", "/room/abcde");
  assert.ok(out.includes('content="Join my table: ABCDE"'));
  assert.ok(out.includes('content="https://play.example/room/ABCDE"'));
  assert.ok(out.includes('content="https://play.example/og.png"'));
  assert.ok(!out.includes("__"));
  assert.equal(preview("/room/<script>").title, "Crack the Code", "not a table code: the default card");
  assert.equal(preview("/daily").path, "/daily");
});

test("only plain host names become an origin", () => {
  assert.equal(originOf("Play.Example:8443", true), "https://play.example:8443");
  assert.equal(originOf('evil.example"><script>', false), null);
  assert.equal(originOf(undefined, false), null);
});
