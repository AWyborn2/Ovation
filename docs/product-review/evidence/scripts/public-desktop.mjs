// Public visitor UX review — DESKTOP (1280x720) on mandurah.ovation.test (tenant 2, central reads).
// Walks: home, players, player detail, matches (+filters), match detail, grades,
// grade leaderboard, records, honour boards, premierships, compare, 404,
// guided fan tour, dark-mode toggle. Records video + numbered screenshots.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  BASE, EVIDENCE, CHROME, ensureDirs, attachCollectors, startPage,
  pageDiagnostics, skeletonCheck, shot, fullShot, writeLog,
} from "./public-lib.mjs";

ensureDirs();
const videoDir = path.join(EVIDENCE, "_video_desktop");
fs.mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const log = attachCollectors(page);

async function visit(url, label, shotName, { fullPage = false, settle = 1200 } = {}) {
  const rec = startPage(log, label);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await skeletonCheck(page, rec);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => rec.notes.push("networkidle timeout 15s"));
  await page.waitForTimeout(settle);
  await pageDiagnostics(page, rec);
  if (shotName) (fullPage ? await fullShot(page, shotName) : await shot(page, shotName));
  return rec;
}

// ---------- 1. HOME ----------
let rec = await visit(`${BASE}/`, "home", null);
// If a first-visit welcome guide appears, capture then dismiss it.
const welcome = page.locator('[role="dialog"], [data-tour="welcome"]').first();
if (await welcome.isVisible().catch(() => false)) {
  await shot(page, "01a-home-welcome-guide.png");
  rec.notes.push("Welcome guide/dialog shown on first visit");
  const close = page.getByRole("button", { name: /close|dismiss|got it|skip|×/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
await shot(page, "01-home-top.png");
await fullShot(page, "02-home-full.png");
// grab headline totals text for spot-check
const totalsText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
fs.writeFileSync(path.join(EVIDENCE, "home-innertext.txt"), totalsText);

// ---------- 2. PLAYERS DIRECTORY ----------
rec = await visit(`${BASE}/players`, "players-directory", "03-players-directory.png");
// try searching
const search = page.locator('input[type="search"], input[placeholder*="earch"]').first();
if (await search.isVisible().catch(() => false)) {
  await search.fill("Lewis");
  await page.waitForTimeout(900);
  await shot(page, "04-players-search-lewis.png");
  await search.fill("");
  await page.waitForTimeout(600);
} else rec.notes.push("No search input found on /players");

// ---------- 3. PLAYER DETAIL ----------
rec = startPage(log, "player-detail");
const playerLink = page.locator('a[href^="/players/"]').first();
if (await playerLink.count()) {
  await playerLink.click();
} else {
  // rows may be clickable trs
  await page.locator("table tbody tr").first().click().catch(() => rec.notes.push("no clickable player row"));
}
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
await pageDiagnostics(page, rec);
rec.notes.push(`player-detail url: ${page.url()}`);
await shot(page, "05-player-detail-top.png");
await fullShot(page, "06-player-detail-full.png");

// ---------- 4. MATCHES LIST + FILTERS ----------
rec = await visit(`${BASE}/matches`, "matches-list", "07-matches-list.png");
// try any filter controls (selects/comboboxes)
const combos = page.locator('select, [role="combobox"]');
const nCombos = await combos.count();
rec.notes.push(`filter controls found on /matches: ${nCombos}`);
if (nCombos) {
  const c = combos.first();
  const tag = await c.evaluate((el) => el.tagName);
  try {
    if (tag === "SELECT") {
      const opts = await c.locator("option").allTextContents();
      rec.notes.push(`first select options: ${opts.slice(0, 8).join("|")}`);
      if (opts.length > 1) await c.selectOption({ index: 1 });
    } else {
      await c.click();
      await page.waitForTimeout(500);
      await shot(page, "08-matches-filter-open.png");
      const opt = page.locator('[role="option"]').nth(1);
      if (await opt.isVisible().catch(() => false)) await opt.click();
      else await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(1000);
    await shot(page, "09-matches-filtered.png");
  } catch (e) {
    rec.notes.push(`filter interaction failed: ${e.message}`);
  }
}

// ---------- 5. MATCH DETAIL (SCORECARD) ----------
rec = startPage(log, "match-detail");
await page.goto(`${BASE}/matches`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(800);
const matchLink = page.locator('a[href^="/matches/"]').first();
if (await matchLink.count()) await matchLink.click();
else await page.locator("table tbody tr, [class*=card]").first().click().catch(() => rec.notes.push("no match link found"));
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
rec.notes.push(`match-detail url: ${page.url()}`);
await pageDiagnostics(page, rec);
await shot(page, "10-match-detail-top.png");
await fullShot(page, "11-match-detail-scorecard-full.png");

// ---------- 6. GRADES + LEADERBOARD ----------
rec = await visit(`${BASE}/grades`, "grades", "12-grades.png");
rec = startPage(log, "grade-leaderboard");
const gradeLink = page.locator('a[href^="/grades/"]').first();
if (await gradeLink.count()) await gradeLink.click();
else await page.goto(`${BASE}/grades/A%20Grade`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
rec.notes.push(`leaderboard url: ${page.url()}`);
await pageDiagnostics(page, rec);
await shot(page, "13-grade-leaderboard.png");
await fullShot(page, "14-grade-leaderboard-full.png");
// capture the first data row text for the UI-vs-DB spot check
const firstRow = await page.locator("table tbody tr").first().innerText().catch(() => "(no table row)");
fs.appendFileSync(path.join(EVIDENCE, "spotcheck-ui.txt"), `A-grade leaderboard first row: ${firstRow.replaceAll("\n", " | ")}\nURL: ${page.url()}\n\n`);
const headRow = await page.locator("table thead tr").first().innerText().catch(() => "(no header)");
fs.appendFileSync(path.join(EVIDENCE, "spotcheck-ui.txt"), `A-grade header: ${headRow.replaceAll("\n", " | ")}\n\n`);

// ---------- 7. RECORDS ----------
await visit(`${BASE}/records`, "records", "15-records.png", { fullPage: false });
await fullShot(page, "16-records-full.png");

// ---------- 8. HONOUR BOARDS ----------
await visit(`${BASE}/honour-boards`, "honour-boards", "17-honour-boards.png");
await fullShot(page, "18-honour-boards-full.png");

// ---------- 9. PREMIERSHIPS ----------
await visit(`${BASE}/premierships`, "premierships", "19-premierships.png");
await fullShot(page, "20-premierships-full.png");

// ---------- 10. COMPARE ----------
rec = await visit(`${BASE}/compare`, "compare", "21-compare-empty.png");
try {
  const pick = async (btnIdx, name, shotName) => {
    const btn = page.getByRole("button", { name: /select/i }).nth(btnIdx);
    await btn.click();
    const input = page.getByPlaceholder(/search players/i);
    await input.fill(name);
    await page.waitForTimeout(800);
    const opt = page.locator('[role="option"], [cmdk-item]').first();
    await opt.click();
    await page.waitForTimeout(800);
    if (shotName) await shot(page, shotName);
  };
  await pick(0, "Lewis", null);
  await pick(0, "White", "22-compare-two-players.png"); // after first pick, remaining "Select" button is index 0
  await fullShot(page, "23-compare-full.png");
} catch (e) {
  rec.notes.push(`compare interaction failed: ${e.message}`);
  await shot(page, "22-compare-failed-state.png");
}
await pageDiagnostics(page, rec);

// ---------- 11. 404 ----------
rec = await visit(`${BASE}/this/page/does-not-exist`, "404-page", "24-404-page.png");

// ---------- 12. GUIDED FAN TOUR ----------
rec = await visit(`${BASE}/`, "fan-tour", null, { settle: 800 });
const help = page.locator('[data-tour="help-button"]').first();
if (await help.isVisible().catch(() => false)) {
  await help.click();
  await page.waitForTimeout(1500);
  await shot(page, "25-fan-tour-step1.png");
  // advance a few steps via Next-like buttons (driver.js / shepherd style)
  for (let i = 2; i <= 5; i++) {
    const next = page.getByRole("button", { name: /next|→/i }).first();
    const nextAlt = page.locator(".driver-popover-next-btn, .shepherd-button, [class*=next]").first();
    const target = (await next.isVisible().catch(() => false)) ? next
      : (await nextAlt.isVisible().catch(() => false)) ? nextAlt : null;
    if (!target) { rec.notes.push(`tour: no next button at step ${i}`); break; }
    await target.click();
    await page.waitForTimeout(1400);
    await shot(page, `2${4 + i - 1}-fan-tour-step${i}.png`); // 25..29 range
  }
  // close tour
  const close = page.locator(".driver-popover-close-btn, [aria-label*=lose]").first();
  if (await close.isVisible().catch(() => false)) await close.click();
  else await page.keyboard.press("Escape");
} else {
  rec.notes.push("Help button NOT visible in header");
  await shot(page, "25-no-help-button.png");
}

// ---------- 13. DARK MODE ----------
rec = await visit(`${BASE}/`, "dark-mode", "30-home-light.png", { settle: 800 });
const darkBtn = page.getByRole("button", { name: /switch to dark mode/i }).first();
if (await darkBtn.isVisible().catch(() => false)) {
  await darkBtn.click();
  await page.waitForTimeout(900);
  await shot(page, "31-home-dark.png");
  await page.goto(`${BASE}/grades/A%20Grade`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(900);
  await shot(page, "32-leaderboard-dark.png");
  // back to light
  const lightBtn = page.getByRole("button", { name: /switch to light mode/i }).first();
  if (await lightBtn.isVisible().catch(() => false)) await lightBtn.click();
} else rec.notes.push("Dark mode toggle NOT found");

writeLog(log, "console-log-desktop.md");
await ctx.close();
await browser.close();

// rename video
const files = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
files.forEach((f, i) => {
  fs.renameSync(path.join(videoDir, f), path.join(EVIDENCE, `desktop-walkthrough${files.length > 1 ? "-" + (i + 1) : ""}.webm`));
});
fs.rmSync(videoDir, { recursive: true, force: true });
console.log("DESKTOP DONE");
