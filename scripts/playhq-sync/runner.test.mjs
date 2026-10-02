// node --test scripts/playhq-sync/  (run by `pnpm --filter @workspace/scripts test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { COLLECTOR, ingestBody, run, runStatus } from "./runner.mjs";

const ENV = {
  OVATION_API_URL: "https://ovation.test/api/",
  PLAYHQ_SYNC_SECRET: "s3cret",
  HARNESS_PATH: "/harness.js",
};
const DUE = {
  orgId: "4559f1b9-86d8-eb11-a7ad-2818780da0cc",
  planName: "weekly",
  slot: "2026-10-04T22:00:00.000Z",
  plan: { orgId: "4559f1b9-86d8-eb11-a7ad-2818780da0cc", seasons: "current", kinds: ["matches"] },
};

/** A fake server: answers /plans with `plans`, records every ingest body. */
function fakeServer(
  plans,
  ingestReply = { status: "ok", fixtureChanges: 0, tenants: [], warnings: [] },
) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const body = url.endsWith("/plans")
      ? { now: "x", plans }
      : url.endsWith("/watchdog")
        ? WATCHDOG_OK
        : ingestReply;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { calls, fetchImpl };
}

/** A fake browser whose harness reports `statuses` in turn, then dumps `records`. */
function fakeBrowser(statuses, records = [{ kind: "plan", id: "p" }]) {
  const seen = { pages: 0, evaluated: [], closed: false };
  let i = 0;
  const page = {
    goto: async (url) => seen.evaluated.push(`goto ${url}`),
    evaluate: async (fn, arg) => {
      if (typeof fn === "string") return seen.evaluated.push("harness");
      const src = fn.toString();
      if (src.includes("__ov.start")) return seen.evaluated.push(`start ${JSON.stringify(arg)}`);
      if (src.includes("__ov.status")) return statuses[Math.min(i++, statuses.length - 1)];
      if (src.includes("__ov.dump")) return { version: "2.0.0", exportedAt: "t", records };
    },
    close: async () => {},
  };
  return {
    seen,
    launch: async () => ({
      newPage: async () => (seen.pages++, page),
      close: async () => (seen.closed = true),
    }),
  };
}

const sleep = async () => {};
const WATCHDOG_OK = { checked: 1, opened: [], resolved: [], open: 0 };
const done = { phase: "done", finishedAt: "t", errorCount: 0, errors: [], stats: { failed: 0 } };

test("runStatus: ok, partial on errors or timeout, failed on a harness error", () => {
  assert.equal(runStatus(done, false), "ok");
  assert.equal(runStatus({ ...done, errorCount: 2 }, false), "partial");
  assert.equal(runStatus({ ...done, stats: { failed: 1 } }, false), "partial");
  assert.equal(runStatus(done, true), "partial");
  assert.equal(runStatus({ phase: "error" }, false), "failed");
  assert.equal(runStatus(undefined, false), "failed");
});

test("ingestBody carries the plan name, collector and capped errors", () => {
  const errors = Array.from({ length: 250 }, (_, k) => ({ path: `/p${k}`, error: "HTTP 500" }));
  const b = ingestBody(DUE, { ...done, errorCount: 250, errors }, false, 1234.6, { records: [] });
  assert.equal(b.collector, COLLECTOR);
  assert.equal(b.planName, "weekly");
  assert.equal(b.status, "partial");
  assert.equal(b.errors.length, 200);
  assert.equal(b.durationMs, 1235);
});

test("no plans due: never launches a browser", async () => {
  const { calls, fetchImpl } = fakeServer([]);
  let launched = false;
  const r = await run({
    env: ENV,
    fetchImpl,
    launch: async () => ((launched = true), {}),
    readHarness: async () => "",
    log: () => {},
  });
  assert.equal(r.due, 0);
  assert.equal(launched, false);
  // plans, then the health check — the watchdog runs even when nothing is due.
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://ovation.test/api/internal/playhq/plans");
  assert.equal(calls[1].url, "https://ovation.test/api/internal/playhq/watchdog");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[0].init.headers["x-sync-secret"], "s3cret");
});

test("one plan: runs the harness with the server's plan and posts a gzip dump", async () => {
  const { calls, fetchImpl } = fakeServer([DUE]);
  const b = fakeBrowser([{ phase: "matches" }, done]);
  const r = await run({
    env: ENV,
    fetchImpl,
    launch: b.launch,
    readHarness: async () => "H",
    sleep,
    log: () => {},
  });
  assert.deepEqual(r.failures, []);
  assert.equal(r.uploaded.length, 1);
  assert.ok(b.seen.evaluated.includes(`start ${JSON.stringify(DUE.plan)}`));
  assert.equal(b.seen.closed, true);

  const post = calls[1];
  assert.equal(post.url, "https://ovation.test/api/internal/playhq/ingest");
  assert.equal(post.init.method, "POST");
  assert.equal(post.init.headers["content-encoding"], "gzip");
  const body = JSON.parse(gunzipSync(post.init.body).toString());
  assert.equal(body.planName, "weekly");
  assert.equal(body.status, "ok");
  assert.equal(body.dump.records.length, 1);
});

test("a timeout still uploads what was collected, marked partial", async () => {
  const { calls, fetchImpl } = fakeServer([DUE]);
  const b = fakeBrowser([{ phase: "matches" }]);
  const r = await run({
    env: { ...ENV, PLAN_TIMEOUT_MS: "-1" },
    fetchImpl,
    launch: b.launch,
    readHarness: async () => "H",
    sleep,
    log: () => {},
  });
  assert.deepEqual(r.failures, []);
  const body = JSON.parse(gunzipSync(calls[1].init.body).toString());
  assert.equal(body.status, "partial");
});

test("a failed upload is reported and the remaining plans still run", async () => {
  let n = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith("/plans"))
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ plans: [DUE, { ...DUE, planName: "matchday" }] }),
      };
    if (url.endsWith("/watchdog"))
      return { ok: true, status: 200, text: async () => JSON.stringify(WATCHDOG_OK) };
    n++;
    return n === 1
      ? { ok: false, status: 503, text: async () => '{"error":"not configured"}' }
      : {
          ok: true,
          status: 200,
          text: async () => '{"status":"ok","fixtureChanges":0,"tenants":[]}',
        };
  };
  const b = fakeBrowser([done]);
  const r = await run({
    env: ENV,
    fetchImpl,
    launch: b.launch,
    readHarness: async () => "H",
    sleep,
    log: () => {},
  });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /weekly .*HTTP 503/);
  assert.equal(r.uploaded.length, 1);
  assert.equal(b.seen.pages, 2);
});

test("ONLY_PLAN / ONLY_ORG narrow a manual run", async () => {
  const { fetchImpl } = fakeServer([DUE, { ...DUE, planName: "matchday" }]);
  const b = fakeBrowser([done]);
  const r = await run({
    env: { ...ENV, ONLY_PLAN: "matchday" },
    fetchImpl,
    launch: b.launch,
    readHarness: async () => "H",
    sleep,
    log: () => {},
  });
  assert.equal(r.due, 1);
  assert.equal(r.uploaded[0].planName, "matchday");
});

test("refuses to run without the API URL or secret", async () => {
  await assert.rejects(run({ env: {}, launch: async () => ({}) }), /OVATION_API_URL/);
});

test("a failing health check fails the run (so GitHub's own failure email fires too)", async () => {
  const fetchImpl = async (url) =>
    url.endsWith("/plans")
      ? { ok: true, status: 200, text: async () => JSON.stringify({ plans: [] }) }
      : { ok: false, status: 503, text: async () => '{"error":"not configured"}' };
  const r = await run({ env: ENV, fetchImpl, launch: async () => ({}), log: () => {} });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /^watchdog: .*HTTP 503/);
});
