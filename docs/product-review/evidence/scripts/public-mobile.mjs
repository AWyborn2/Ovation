// Public visitor UX review — MOBILE (375x812) on mandurah.ovation.test.
// home, players, player detail, matches, match detail, hamburger nav.
// Checks: horizontal scroll, header height, tap-target sizes, broken images.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  BASE, EVIDENCE, CHROME, ensureDirs, attachCollectors, startPage,
  pageDiagnostics, skeletonCheck, shot, fullShot, writeLog,
} from "./public-lib.mjs";

ensureDirs();
const videoDir = path.join(EVIDENCE, "_video_mobile");
fs.mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
// NOTE: isMobile:false on purpose — Chrome's mobile emulation silently expands the
// layout viewport (375 → 568 on this site) when content overflows, which hides the
// horizontal-scroll bug from both measurements and screenshots. Strict 375 shows truth.
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  recordVideo: { dir: videoDir, size: { width: 375, height: 812 } },
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
const log = attachCollectors(page);

async function mobileChecks(rec) {
  const d = await page.evaluate(() => {
    const doc = document.documentElement;
    const header = document.querySelector("header");
    const hRect = header ? header.getBoundingClientRect() : null;
    // tap targets: interactive elements smaller than 40x40 that are visible
    const small = [];
    for (const el of document.querySelectorAll("a, button")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.top > window.innerHeight * 3) continue;
      if (r.height < 32 || r.width < 32) {
        const t = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30);
        if (t) small.push(`${t} (${Math.round(r.width)}x${Math.round(r.height)})`);
      }
    }
    return {
      scrollW: doc.scrollWidth,
      innerW: window.innerWidth,
      headerH: hRect ? Math.round(hRect.height) : null,
      smallTargets: small.slice(0, 12),
      smallCount: small.length,
    };
  });
  if (d.scrollW > d.innerW + 1) rec.notes.push(`HORIZONTAL SCROLL: ${d.scrollW} > ${d.innerW}`);
  rec.notes.push(`header height: ${d.headerH}px`);
  if (d.smallCount) rec.notes.push(`small tap targets (<32px): ${d.smallCount} — e.g. ${d.smallTargets.join("; ")}`);
  return d;
}

async function visit(url, label, shotName, { settle = 1200 } = {}) {
  const rec = startPage(log, label);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await skeletonCheck(page, rec);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => rec.notes.push("networkidle timeout"));
  await page.waitForTimeout(settle);
  await pageDiagnostics(page, rec);
  await mobileChecks(rec);
  if (shotName) await shot(page, shotName);
  return rec;
}

// HOME
let rec = await visit(`${BASE}/`, "m-home", null);
const welcome = page.locator('[role="dialog"]').first();
if (await welcome.isVisible().catch(() => false)) {
  await shot(page, "40a-mobile-welcome.png");
  // JS-click: the dialog footer buttons overlap on narrow viewports and
  // intercept pointer events, so a trusted click can never land (see findings).
  const dismissed = await page
    .evaluate(() => {
      const b = document.querySelector('[data-testid="welcome-dismiss"]');
      if (b) { b.click(); return true; }
      return false;
    })
    .catch(() => false);
  if (!dismissed) await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  if (await welcome.isVisible().catch(() => false)) rec.notes.push("Welcome dialog did not dismiss");
}
await shot(page, "40-mobile-home.png");
await fullShot(page, "41-mobile-home-full.png");

// HAMBURGER NAV
rec = startPage(log, "m-hamburger");
const burger = page.getByRole("button", { name: /open navigation menu/i }).first();
if (await burger.isVisible().catch(() => false)) {
  await burger.click();
  await page.waitForTimeout(600);
  await pageDiagnostics(page, rec);
  await mobileChecks(rec);
  await shot(page, "42-mobile-nav-open.png");
  await fullShot(page, "43-mobile-nav-open-full.png");
  await burger.click().catch(() => {});
} else {
  rec.notes.push("hamburger button not found");
  await shot(page, "42-mobile-no-hamburger.png");
}

// PLAYERS
await visit(`${BASE}/players`, "m-players", "44-mobile-players.png");

// PLAYER DETAIL
rec = startPage(log, "m-player-detail");
const pl = page.locator('a[href^="/players/"]').first();
if (await pl.count()) await pl.click();
else await page.locator("table tbody tr").first().click().catch(() => rec.notes.push("no player row"));
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
rec.notes.push(`url: ${page.url()}`);
await pageDiagnostics(page, rec);
await mobileChecks(rec);
await shot(page, "45-mobile-player-detail.png");
await fullShot(page, "46-mobile-player-detail-full.png");

// MATCHES
await visit(`${BASE}/matches`, "m-matches", "47-mobile-matches.png");

// MATCH DETAIL
rec = startPage(log, "m-match-detail");
const ml = page.locator('a[href^="/matches/"]').first();
if (await ml.count()) await ml.click();
else rec.notes.push("no match link");
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
rec.notes.push(`url: ${page.url()}`);
await pageDiagnostics(page, rec);
await mobileChecks(rec);
await shot(page, "48-mobile-match-detail.png");
await fullShot(page, "49-mobile-match-detail-full.png");

writeLog(log, "console-log-mobile.md");
await ctx.close();
await browser.close();

const files = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
files.forEach((f, i) => {
  fs.renameSync(path.join(videoDir, f), path.join(EVIDENCE, `mobile-walkthrough${files.length > 1 ? "-" + (i + 1) : ""}.webm`));
});
fs.rmSync(videoDir, { recursive: true, force: true });
console.log("MOBILE DONE");
