// S1 spike (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md): can headless
// Chromium on a CI runner drive the PlayHQ harness from a play.cricket.com.au page?
//
// Throwaway. Read-only against PlayHQ, writes nothing anywhere: it prints a JSON report and,
// when GITHUB_STEP_SUMMARY is set, a markdown summary. Run by .github/workflows/playhq-spike.yml.
//
//   CHROME_PATH=/usr/bin/google-chrome node playhq-headless.mjs
//
// Env: CHROME_PATH (required), ORG_ID (default Halls Head), UA_MODE ("default" | "desktop").
// `puppeteer-core` is resolved from the working directory (the workflow npm-installs it into a
// temp dir) so this spike adds nothing to the pnpm workspace.

import { createRequire } from "node:module";
import { readFile, appendFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "noop.js"));
const puppeteer = require("puppeteer-core");

const HARNESS = process.env.HARNESS_PATH;
const CHROME = process.env.CHROME_PATH;
const ORG_ID = process.env.ORG_ID || "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
const UA_MODE = process.env.UA_MODE || "default";
const CLUB_URL = `https://play.cricket.com.au/club/halls-head-cricket-club/${ORG_ID}`;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

const report = { startedAt: new Date().toISOString(), orgId: ORG_ID, uaMode: UA_MODE };

async function main() {
  if (!CHROME || !HARNESS) throw new Error("CHROME_PATH and HARNESS_PATH are required");
  const harness = await readFile(HARNESS, "utf8");
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    report.defaultUserAgent = await browser.userAgent();
    if (UA_MODE === "desktop") {
      await page.setUserAgent(report.defaultUserAgent.replace("HeadlessChrome", "Chrome"));
    }
    report.userAgent = await page.evaluate(() => navigator.userAgent);

    // 1. Load the club page like a person would.
    const nav = await page.goto(CLUB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    report.pageStatus = nav ? nav.status() : null;
    report.pageTitle = await page.title();
    report.pageUrl = page.url();

    // 2. One raw call before the harness, so a block shows up as a plain HTTP status.
    report.rawProbe = await page.evaluate(async (orgId) => {
      try {
        const r = await fetch(
          `https://grassrootsapiproxy.cricket.com.au/fixturesladders/organisations/${orgId}/seasons?jsconfig=eccn:true`,
          { headers: { accept: "application/json" } },
        );
        const text = await r.text();
        return { status: r.status, bytes: text.length, head: text.slice(0, 160) };
      } catch (e) {
        return { error: String(e && e.message) };
      }
    }, ORG_ID);

    // 3. The real thing: install the harness verbatim and run the planned `weekly` plan.
    report.install = await page.evaluate(harness);
    const t0 = Date.now();
    await page.evaluate(async (orgId) => {
      await window.__ov.clear();
      return window.__ov.start({
        orgId,
        seasons: "current",
        kinds: ["matches", "ladder", "gradeTeams", "rounds"],
        balls: "none",
        scorecards: "none",
      });
    }, ORG_ID);
    let status;
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      status = await page.evaluate(() => window.__ov.status());
      if (status.finishedAt || status.phase === "error" || status.phase === "done") break;
      if (Date.now() - t0 > RUN_TIMEOUT_MS) {
        status.timedOut = true;
        break;
      }
    }
    report.run = { ms: Date.now() - t0, ...status };
    report.exportInfo = await page.evaluate(() => window.__ov.exportInfo());

    // 4. Opportunistic S2 probe on up to 3 upcoming matches.
    // Only the first path is documented; the rest are guesses, and a 404 is an answer too.
    report.lineupProbe = await page.evaluate(async (orgId) => {
      const paths = (id) => [
        `/scores/matches/${id}`,
        `/scores/matches/${id}/lineups`,
        `/scores/matches/${id}/players`,
        `/scores/matches/${id}/teams`,
      ];
      const recs = await window.__ov.all();
      const now = Date.now();
      const upcoming = [];
      const seen = new Set();
      const walk = (v) => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (!v || typeof v !== "object") return;
        const start = v.startDateTime || v.matchStartDateTime || v.startDate || v.date;
        if (v.id && start && !seen.has(v.id) && Date.parse(start) > now) {
          seen.add(v.id);
          upcoming.push({ id: v.id, start, status: v.status });
        }
        Object.values(v).forEach(walk);
      };
      recs.filter((r) => r.kind === "matches").forEach((r) => walk(r.data));
      upcoming.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

      // Describe a payload's shape: top-level keys plus any path whose name smells of players.
      const shape = (data) => {
        const hits = [];
        const scan = (v, p, depth) => {
          if (depth > 6 || !v || typeof v !== "object") return;
          for (const [k, x] of Object.entries(v)) {
            const kp = Array.isArray(v) ? `${p}[]` : `${p}.${k}`;
            if (/player|lineup|squad|roster|participant|selected/i.test(k)) {
              hits.push({
                path: kp,
                type: Array.isArray(x) ? `array(${x.length})` : typeof x,
                sample: JSON.stringify(Array.isArray(x) ? x[0] : x)?.slice(0, 200),
              });
            }
            if (Array.isArray(v)) {
              scan(x, p + "[]", depth + 1);
              break;
            }
            scan(x, kp, depth + 1);
          }
        };
        scan(data, "$", 0);
        return {
          topKeys: data && typeof data === "object" ? Object.keys(data) : typeof data,
          playerish: hits.slice(0, 25),
        };
      };

      const out = { upcomingFound: upcoming.length, matches: [] };
      for (const m of upcoming.slice(0, 3)) {
        const probes = [];
        for (const p of paths(m.id)) {
          const isCard = p === `/scores/matches/${m.id}`;
          const data = await window.__ov.api(
            p,
            isCard ? { responseModifier: "IncludeScorecard", organisationId: orgId } : {},
          );
          probes.push({
            path: p.replace(m.id, ":id"),
            error: data && data.__error,
            ...(data && !data.__error ? shape(data) : {}),
          });
        }
        out.matches.push({ ...m, probes });
      }
      return out;
    }, ORG_ID);
  } finally {
    await browser.close();
  }
}

function verdict() {
  const r = report.run;
  if (!r) return "FAIL (harness never ran)";
  if (r.timedOut) return "FAIL (timed out)";
  if (r.stats?.failed || r.errorCount) return `FAIL (${r.stats?.failed} failed calls)`;
  if (!report.exportInfo?.records) return "FAIL (0 records)";
  return `PASS (${report.exportInfo.records} records, ${r.stats.calls} calls)`;
}

main()
  .catch((e) => {
    report.fatal = String(e && e.stack ? e.stack : e);
  })
  .finally(async () => {
    report.finishedAt = new Date().toISOString();
    report.verdict = verdict();
    console.log(JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const md = [
        `## PlayHQ headless spike (${UA_MODE} UA): ${report.verdict}`,
        "",
        `- page: ${report.pageStatus} \`${report.pageTitle}\``,
        `- raw API probe: ${JSON.stringify(report.rawProbe)}`,
        `- harness: ${JSON.stringify(report.run?.stats)} in ${report.run?.ms} ms`,
        `- export: ${JSON.stringify(report.exportInfo)}`,
        `- upcoming matches probed for lineups: ${report.lineupProbe?.upcomingFound ?? "n/a"}`,
        report.fatal ? `- fatal: \`${report.fatal.split("\n")[0]}\`` : "",
        "",
        "<details><summary>full report</summary>",
        "",
        "```json",
        JSON.stringify(report, null, 2),
        "```",
        "</details>",
        "",
      ].join("\n");
      await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
    }
    process.exitCode = report.verdict.startsWith("PASS") ? 0 : 1;
  });
