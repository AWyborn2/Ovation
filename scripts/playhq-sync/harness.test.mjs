// The scorecard selection in the scraper harness (.claude/skills/playcricket-stats-scraper),
// loaded the way the browser runs it: the whole file evaluated against a `window`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(
  new URL("../../.claude/skills/playcricket-stats-scraper/harness.js", import.meta.url),
  "utf8",
);
const window = {};
vm.runInNewContext(src, {
  window,
  console,
  setTimeout,
  clearTimeout,
  fetch: () => {},
  location: { origin: "https://play.cricket.com.au" },
});
const ov = window.__ov;

const NOW = "2026-10-05T01:00:00Z";
const match = (id, status, ...starts) => ({
  id,
  status,
  matchSchedule: starts.map((startDateTime) => ({ startDateTime })),
});
const LIST = [
  match("done", "COMPLETED", "2026-10-03T02:30:00Z"),
  match("two-day", "IN_PROGRESS", "2026-10-03T02:30:00Z", "2026-10-10T02:30:00Z"),
  match("pending", "PENDING", "2026-10-04T02:30:00Z"),
  match("fixture", "UPCOMING", "2026-10-10T02:30:00Z"),
  match("later", "PENDING", "2026-10-17T02:30:00Z"),
  match("old", "COMPLETED", "2026-09-26T02:30:00Z"),
];
// Arrays made inside the sandbox have its own prototype; copy them out for deepEqual.
const ids = (mode, since) => Array.from(ov._selectMatches(LIST, mode, since, NOW), (m) => m.id);

test("'since' takes finished AND in-progress matches whose last day is on or after the date", () => {
  assert.deepEqual(ids("since", "2026-10-03"), ["done", "two-day", "pending"]);
});

test("a fixture, or a match whose first day hasn't begun, is never in progress", () => {
  assert.equal(ov._inProgress(LIST[3], NOW), false);
  assert.equal(ov._inProgress(LIST[4], NOW), false);
  assert.equal(ov._inProgress(LIST[1], NOW), true);
});

test("'completed' (history scrapes) is unchanged: finished matches only", () => {
  assert.deepEqual(ids("completed"), ["done", "old"]);
  assert.deepEqual(ids("none"), []);
});

test("lineups: the org's matches that haven't started and start within the window", () => {
  const nowMs = Date.parse(NOW);
  const list = [
    { ...match("ours", "UPCOMING", "2026-10-10T02:30:00Z"), teams: [{ id: "t1" }, { id: "x" }] },
    { ...match("theirs", "UPCOMING", "2026-10-10T02:30:00Z"), teams: [{ id: "y" }, { id: "x" }] },
    { ...match("far", "UPCOMING", "2026-10-20T02:30:00Z"), teams: [{ id: "t1" }] },
    { ...match("begun", "IN_PROGRESS", "2026-10-04T02:30:00Z"), teams: [{ id: "t1" }] },
    { ...match("over", "COMPLETED", "2026-10-03T02:30:00Z"), teams: [{ id: "t1" }] },
  ];
  const got = Array.from(ov._upcomingFor(list, ["t1"], 8, nowMs), (m) => m.id);
  assert.deepEqual(got, ["ours"]);
});
