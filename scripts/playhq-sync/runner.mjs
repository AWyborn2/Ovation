// PlayHQ scheduled-sync runner (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md,
// U6). Run hourly by .github/workflows/playhq-sync.yml.
//
//   1. GET  {OVATION_API_URL}/internal/playhq/plans          → the plans due now (may be none)
//   2. for each: open play.cricket.com.au in headless Chromium, inject the harness verbatim,
//      __ov.start(plan), poll until done (or the per-plan timeout), take __ov.dump()
//   3. POST {OVATION_API_URL}/internal/playhq/ingest (gzip)  → loads, projects, sweeps
//   4. POST {OVATION_API_URL}/internal/playhq/sweep          → scheduled drafting sweep, every club
//   5. POST {OVATION_API_URL}/internal/playhq/watchdog       → sync health, alerts
//
// The runner is deliberately dumb: the server decides what is due, and a plan is marked done
// only by its ingest landing, so a crashed or skipped hour heals on the next one. It holds no
// database credential — just the sync secret.
//
// Plain ESM with no workspace imports, so the workflow can run it with only `puppeteer-core`
// installed. Env: OVATION_API_URL (e.g. https://<app>/api), PLAYHQ_SYNC_SECRET, CHROME_PATH,
// HARNESS_PATH; optional PLAN_TIMEOUT_MS, ONLY_ORG, ONLY_PLAN.
//
// Manual catch-up: with MANUAL_ORG (a PlayHQ organisation GUID) and MANUAL_SINCE (YYYY-MM-DD),
// the runner skips the due list and runs one catch-up for that organisation — its matches,
// ladder, every scorecard since that date and the sides named for its upcoming matches — e.g.
// to re-fetch a weekend a failed sync missed.

import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

export const SITE = "https://play.cricket.com.au/";
export const COLLECTOR = "gha-headless";

/** Collector status for a finished (or abandoned) harness run. */
export function runStatus(status, timedOut) {
  if (!status || status.phase === "error") return "failed";
  if (timedOut || status.errorCount > 0 || status.stats?.failed > 0) return "partial";
  return "ok";
}

/** The ingest request body for one plan's dump. */
export function ingestBody(due, status, timedOut, durationMs, dump) {
  return {
    collector: COLLECTOR,
    planName: due.planName,
    status: runStatus(status, timedOut),
    errors: (status?.errors ?? []).slice(0, 200).map((e) => ({ ...e })),
    durationMs: Math.max(0, Math.round(durationMs)),
    sourceName: `${COLLECTOR} ${due.planName} ${due.orgId} ${due.slot}`,
    dump,
  };
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one plan a manual catch-up runs (the same shape the server's catchup plan has). */
export function manualPlan(orgId, since, now = new Date()) {
  const org = String(orgId ?? "")
    .trim()
    .toLowerCase();
  const day = String(since ?? "").trim();
  if (!GUID_RE.test(org))
    throw new Error(`MANUAL_ORG must be a PlayHQ organisation GUID, got "${orgId}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))
    throw new Error(`MANUAL_SINCE must be a date like 2026-10-03, got "${since}"`);
  return {
    orgId: org,
    planName: "catchup",
    slot: now.toISOString(),
    plan: {
      orgId: org,
      seasons: "current",
      kinds: ["matches", "ladder"],
      balls: "none",
      scorecards: "since",
      lineups: "upcoming",
      since: day,
      resume: true,
    },
  };
}

async function api(fetchImpl, base, secret, path, init = {}) {
  const res = await fetchImpl(`${base.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { "x-sync-secret": secret, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok)
    throw new Error(`${init.method ?? "GET"} ${path} → HTTP ${res.status} ${text.slice(0, 300)}`);
  return body;
}

/** Run one plan in a fresh page; returns { status, timedOut, durationMs, dump }. */
export async function collect(browser, harness, plan, { timeoutMs, pollMs = 2000, sleep }) {
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(harness);
    const t0 = Date.now();
    await page.evaluate(async (p) => {
      await window.__ov.clear();
      return window.__ov.start(p);
    }, plan);
    let status;
    let timedOut = false;
    for (;;) {
      await sleep(pollMs);
      status = await page.evaluate(() => window.__ov.status());
      if (status.phase === "done" || status.phase === "error" || status.finishedAt) break;
      if (Date.now() - t0 > timeoutMs) {
        timedOut = true;
        break;
      }
    }
    const dump = await page.evaluate(() => window.__ov.dump());
    return { status, timedOut, durationMs: Date.now() - t0, dump };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * The whole run. Dependencies are injected so it can be tested without a browser or server.
 * Returns { due, uploaded, failures }; the caller exits non-zero on any failure.
 */
export async function run({
  env,
  fetchImpl = fetch,
  launch,
  readHarness = (p) => readFile(p, "utf8"),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = (...a) => console.log(...a),
}) {
  const base = env.OVATION_API_URL;
  const secret = env.PLAYHQ_SYNC_SECRET;
  if (!base || !secret) throw new Error("OVATION_API_URL and PLAYHQ_SYNC_SECRET are required");

  const { plans } = env.MANUAL_ORG
    ? { plans: [manualPlan(env.MANUAL_ORG, env.MANUAL_SINCE)] }
    : await api(fetchImpl, base, secret, "/internal/playhq/plans");
  const due = plans.filter(
    (p) =>
      (!env.ONLY_ORG || p.orgId === env.ONLY_ORG) &&
      (!env.ONLY_PLAN || p.planName === env.ONLY_PLAN),
  );
  log(
    `${due.length} plan(s) due${plans.length !== due.length ? ` (${plans.length} before filters)` : ""}`,
  );
  const result = { due: due.length, uploaded: [], failures: [], sweep: null, watchdog: null };
  if (due.length > 0)
    await collectAll(due, result, {
      env,
      base,
      secret,
      fetchImpl,
      launch,
      readHarness,
      sleep,
      log,
    });

  // The scheduled drafting sweep for every club, after the ingests so this hour's results
  // are already in central: result, achievement and round-up cards, debut caps, match-day
  // timing and auto-post promotion. A failure fails the job, like the watchdog's.
  try {
    const { results } = await api(fetchImpl, base, secret, "/internal/playhq/sweep", {
      method: "POST",
    });
    const sum = (k) => results.reduce((n, r) => n + (r[k] ?? 0), 0);
    const failed = results.filter((r) => !r.ok).map((r) => r.tenantId);
    result.sweep = { clubs: results.length, failed };
    log(
      `sweep: ${results.length} club(s), ${sum("matchSummaries")} result card(s), ${sum("achievements")} achievement card(s), ${sum("promoted")} promoted${failed.length ? `, FAILED for tenant(s) ${failed.join(", ")}` : ""}`,
    );
    if (failed.length) result.failures.push(`sweep failed for tenant(s) ${failed.join(", ")}`);
  } catch (err) {
    log(`sweep: FAILED ${err?.message ?? err}`);
    result.failures.push(`sweep: ${err?.message ?? err}`);
  }

  // Health check after every run, including runs with nothing due: the server opens or
  // resolves incidents (alert emails, club notices). A watchdog error fails the job too, so
  // GitHub's own failure email is a second line of alerting.
  try {
    result.watchdog = await api(fetchImpl, base, secret, "/internal/playhq/watchdog", {
      method: "POST",
    });
    const w = result.watchdog;
    log(
      `watchdog: ${w.checked} org(s) checked, ${w.opened.length} opened, ${w.resolved.length} resolved, ${w.open} open`,
    );
  } catch (err) {
    log(`watchdog: FAILED ${err?.message ?? err}`);
    result.failures.push(`watchdog: ${err?.message ?? err}`);
  }
  return result;
}

async function collectAll(
  due,
  result,
  { env, base, secret, fetchImpl, launch, readHarness, sleep, log },
) {
  const harness = await readHarness(env.HARNESS_PATH);
  const browser = await launch();
  try {
    for (const d of due) {
      const label = `${d.planName} ${d.orgId}`;
      try {
        const c = await collect(browser, harness, d.plan, {
          timeoutMs: Number(env.PLAN_TIMEOUT_MS) || 20 * 60_000,
          sleep,
        });
        const body = ingestBody(d, c.status, c.timedOut, c.durationMs, c.dump);
        log(
          `${label}: ${body.status}, ${c.dump?.records?.length ?? 0} records, ${c.durationMs} ms`,
        );
        const res = await api(fetchImpl, base, secret, "/internal/playhq/ingest", {
          method: "POST",
          headers: { "content-type": "application/json", "content-encoding": "gzip" },
          body: gzipSync(Buffer.from(JSON.stringify(body))),
        });
        log(
          `${label}: ingested → ${res.status}, ${res.fixtureChanges} fixture change(s), ${res.tenants?.length ?? 0} tenant(s)`,
        );
        for (const w of res.warnings ?? []) log(`${label}: warning: ${w}`);
        const p = res.centralProjection;
        if (p) {
          log(
            `${label}: stats copy (${p.mode}) → ${p.created} created, ${p.updated} updated, ` +
              `${p.skipped} skipped, ${p.playersInserted} new players`,
          );
          for (const [reason, n] of Object.entries(p.skipReasons ?? {}))
            log(`${label}: stats copy skipped ${n} × ${reason}`);
        }
        result.uploaded.push({ ...d, status: body.status, ingest: res.status });
        if (body.status === "failed") result.failures.push(`${label}: harness failed`);
      } catch (err) {
        log(`${label}: FAILED ${err?.message ?? err}`);
        result.failures.push(`${label}: ${err?.message ?? err}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

// CLI entry (the workflow). puppeteer-core is resolved from the working directory, where the
// workflow installed it, so the repo needs no extra dependency.
const { pathToFileURL } = await import("node:url");
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const require = createRequire(path.join(process.cwd(), "noop.js"));
  const puppeteer = require("puppeteer-core");
  const launch = () =>
    puppeteer.launch({
      executablePath: process.env.CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  run({ env: process.env, launch })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      if (r.failures.length) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err?.stack ?? err);
      process.exitCode = 1;
    });
}
