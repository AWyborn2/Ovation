// One-off, read-only probe: where does play.cricket.com.au expose a team selected for an
// upcoming match? Run by the `probe_lineups` input of .github/workflows/playhq-sync.yml.
//
// For a club's upcoming senior matches in the next 10 days it fetches the match from the
// grassroots API in its known shapes (and a few candidate lineup paths), then opens the match
// centre page and records which grassroots requests the site itself makes. It prints only the
// structure of each response — key paths, types, array lengths, numbers and booleans — never
// a player's name or any other free text, and it writes nothing anywhere.
//
// Env: CHROME_PATH, HARNESS_PATH, PROBE_ORG (PlayHQ organisation GUID; default Halls Head).

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const SITE = "https://play.cricket.com.au/";
const ORG = process.env.PROBE_ORG || "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
// String values safe to print (enumerations, not people).
const KEEP = /^(status|matchType|type|role|roleName|position|positionName|resultType|kind)$/i;

/** Structure of a JSON value: path -> { types, count, sample } with names redacted. */
export function shape(value, path = "$", out = new Map(), key = "") {
  const t = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const e = out.get(path) ?? { types: new Set(), count: 0, samples: new Set() };
  e.types.add(t);
  e.count++;
  if (t === "number" || t === "boolean") e.samples.add(String(value));
  else if (t === "string" && KEEP.test(key)) e.samples.add(value.slice(0, 40));
  else if (t === "string") e.samples.add(`<str ${value.length}>`);
  else if (t === "array") e.samples.add(`len ${value.length}`);
  out.set(path, e);
  if (t === "array") value.forEach((v) => shape(v, `${path}[]`, out, key));
  else if (t === "object")
    for (const [k, v] of Object.entries(value)) shape(v, `${path}.${k}`, out, k);
  return out;
}

export function printShape(label, value) {
  console.log(`\n=== ${label}`);
  if (value && value.__error) return console.log(`  error: ${value.__error}`);
  for (const [p, e] of shape(value)) {
    const samples = [...e.samples].slice(0, 6).join(", ");
    console.log(`  ${p}  ${[...e.types].join("|")} x${e.count}  ${samples}`);
  }
}

async function main() {
  const require = createRequire(`${process.cwd()}/`);
  const puppeteer = require("puppeteer-core");
  const harness = await readFile(process.env.HARNESS_PATH, "utf8");
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    protocolTimeout: 600_000,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(harness);
    // Fail fast on candidate paths that do not exist.
    await page.evaluate(() => {
      window.__ov.opts.retries = 0;
    });
    const ev = (fn, ...args) => page.evaluate(fn, ...args);
    const grades = await ev((org) => window.__ov.discover(org, { seasons: "current" }), ORG);
    console.log(`discovered ${grades.length} senior grade(s)`);
    const now = Date.now();
    const horizon = now + 10 * 24 * 3600 * 1000;
    const upcoming = [];
    for (const g of grades) {
      const res = await ev((id) => window.__ov.matches(id), g.gradeId);
      for (const m of (res && res.matches) || []) {
        const start = (m.matchSchedule || [])
          .map((x) => x.startDateTime)
          .filter(Boolean)
          .sort()[0];
        const t = start ? Date.parse(start) : NaN;
        const ours = (m.teams || []).some((tm) => g.teamIds.includes(tm.id));
        if (ours && t >= now - 12 * 3600 * 1000 && t <= horizon)
          upcoming.push({ id: m.id, start, grade: g.gradeName, status: m.status, list: m });
      }
    }
    upcoming.sort((a, b) => a.start.localeCompare(b.start));
    const probes = [];
    for (const u of upcoming.slice(0, 6)) {
      const r = { id: u.id, start: u.start, grade: u.grade, status: u.status, listEntry: u.list };
      const call = (path, params) => ev((a, b) => window.__ov.api(a, b), path, params ?? undefined);
      r.plain = await call(`/scores/matches/${u.id}`);
      r.scorecard = await call(`/scores/matches/${u.id}`, {
        responseModifier: "IncludeScorecard",
        organisationId: ORG,
      });
      for (const p of ["lineups", "teams", "players", "squads"])
        r[`path:${p}`] = await call(`/scores/matches/${u.id}/${p}`);
      for (const m of ["IncludeLineups", "IncludeTeamLineups", "IncludePlayers"])
        r[`modifier:${m}`] = await call(`/scores/matches/${u.id}`, { responseModifier: m });
      probes.push(r);
      console.log(`probed ${u.id}`);
    }
    const found = { gradeCount: grades.length, upcoming: upcoming.length, probes };

    console.log(
      `org ${ORG}: ${found.gradeCount} senior grade(s), ${found.upcoming} match(es) in window`,
    );
    for (const r of found.probes) {
      console.log(`\n##### match ${r.id} — ${r.grade} — ${r.start} — ${r.status}`);
      for (const [k, v] of Object.entries(r))
        if (v && typeof v === "object") printShape(`${r.id} ${k}`, v);
    }

    // What the site's own match centre requests (the UI may use a path the API notes miss).
    for (const r of found.probes.slice(0, 2)) {
      for (const url of [`${SITE}match/${r.id}`, `${SITE}matches/${r.id}`]) {
        const p = await browser.newPage();
        const seen = [];
        p.on("response", async (res) => {
          const u = res.url();
          if (!u.includes("grassroots")) return;
          let body = null;
          try {
            body = await res.json();
          } catch {}
          seen.push({ url: u.replace(/[?].*$/, ""), status: res.status(), body });
        });
        let status = null;
        try {
          status = (await p.goto(url, { waitUntil: "networkidle2", timeout: 45_000 }))?.status();
          // Click anything that looks like a teams / lineup tab, then let it load.
          await p.evaluate(() => {
            for (const el of document.querySelectorAll("a,button,[role=tab]"))
              if (/team|line ?up|squad|player/i.test(el.textContent || "")) el.click();
          });
          await new Promise((res) => setTimeout(res, 6000));
        } catch (e) {
          status = `error ${e.message}`;
        }
        const tabs = await p
          .evaluate(() =>
            [...document.querySelectorAll("a,button,[role=tab]")]
              .map((el) => (el.textContent || "").trim())
              .filter((t) => t && t.length < 25 && !/\d/.test(t)),
          )
          .catch(() => []);
        console.log(`\n##### page ${url} → ${status}`);
        console.log(`  controls: ${[...new Set(tabs)].slice(0, 40).join(" | ")}`);
        for (const s of seen) {
          console.log(`  request ${s.status} ${s.url}`);
          if (s.body && JSON.stringify(s.body).includes("participantId"))
            printShape(`ui ${s.url}`, s.body);
        }
        await p.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
