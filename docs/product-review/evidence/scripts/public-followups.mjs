// Follow-up probes: compare picker, anonymous admin-action leaks (Add Player /
// Edit), players empty-search state, leaderboard column-sort behaviour.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  BASE, EVIDENCE, CHROME, ensureDirs, attachCollectors, startPage,
  pageDiagnostics, shot, fullShot, writeLog,
} from "./public-lib.mjs";

ensureDirs();
const videoDir = path.join(EVIDENCE, "_video_followups");
fs.mkdirSync(videoDir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const log = attachCollectors(page);

async function dismissWelcome() {
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-testid="welcome-dismiss"]')?.click()).catch(() => {});
  await page.waitForTimeout(400);
}

// ---- COMPARE ----
let rec = startPage(log, "compare-retry");
await page.goto(`${BASE}/compare`, { waitUntil: "networkidle" }).catch(() => {});
await dismissWelcome();
// inspect what the triggers actually are
const triggerInfo = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button, [role=combobox]"))
    .filter((e) => /select player/i.test(e.textContent ?? ""))
    .map((e) => ({ tag: e.tagName, role: e.getAttribute("role"), text: e.textContent?.trim().slice(0, 30) }))
);
rec.notes.push(`compare triggers: ${JSON.stringify(triggerInfo)}`);
try {
  const pickPlayer = async (which, searchText) => {
    const trig = page.locator(`text=Select Player ${which}...`).first();
    await trig.click();
    await page.waitForTimeout(500);
    const input = page.getByPlaceholder(/search players/i).last();
    await input.fill(searchText);
    await page.waitForTimeout(700);
    const opt = page.locator("[cmdk-item], [role=option]").first();
    await opt.click();
    await page.waitForTimeout(900);
  };
  await pickPlayer("A", "Lewis");
  await shot(page, "26-compare-one-picked.png");
  await pickPlayer("B", "White");
  await page.waitForTimeout(1200);
  await shot(page, "27-compare-two-players.png");
  await fullShot(page, "28-compare-two-players-full.png");
} catch (e) {
  rec.notes.push(`compare retry failed: ${String(e).slice(0, 200)}`);
  await shot(page, "27-compare-retry-failed.png");
}
await pageDiagnostics(page, rec);

// ---- ADMIN LEAK: Add Player as anonymous ----
rec = startPage(log, "anon-add-player");
await page.goto(`${BASE}/players`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(800);
const addBtn = page.getByRole("button", { name: /add player/i }).first();
if (await addBtn.isVisible().catch(() => false)) {
  rec.notes.push("Add Player button IS visible to anonymous visitor");
  await addBtn.click();
  await page.waitForTimeout(1000);
  await shot(page, "33-anon-add-player-clicked.png");
  await page.keyboard.press("Escape");
} else rec.notes.push("Add Player button not visible");

// ---- ADMIN LEAK: Edit link on player detail as anonymous ----
rec = startPage(log, "anon-edit-link");
await page.goto(`${BASE}/players/26`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(800);
const editLink = page.locator("text=Edit").first();
if (await editLink.isVisible().catch(() => false)) {
  rec.notes.push("Edit control IS visible to anonymous visitor on player detail");
  await editLink.click();
  await page.waitForTimeout(1000);
  await shot(page, "34-anon-edit-clicked.png");
  await page.keyboard.press("Escape");
} else rec.notes.push("Edit control not visible");

// ---- EMPTY SEARCH STATE ----
rec = startPage(log, "players-empty-search");
await page.goto(`${BASE}/players`, { waitUntil: "networkidle" }).catch(() => {});
const search = page.locator('input[placeholder*="earch"]').first();
await search.fill("zzzz-no-such-player");
await page.waitForTimeout(900);
await shot(page, "35-players-empty-search.png");

// ---- LEADERBOARD SORT ATTEMPT ----
rec = startPage(log, "leaderboard-sort");
await page.goto(`${BASE}/grades/A%20Grade`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(800);
const runsHeader = page.locator("table thead th", { hasText: /^Runs$/ }).first();
if (await runsHeader.isVisible().catch(() => false)) {
  const before = await page.locator("table tbody tr").first().innerText();
  await runsHeader.click();
  await page.waitForTimeout(700);
  const after = await page.locator("table tbody tr").first().innerText();
  rec.notes.push(`sort click changed first row: ${before.split("\n")[0]} -> ${after.split("\n")[0]} (${before === after ? "NO CHANGE — headers not sortable" : "changed"})`);
  await shot(page, "36-leaderboard-after-sort-click.png");
} else rec.notes.push("Runs header not found");

writeLog(log, "console-log-followups.md");
await ctx.close();
await browser.close();
const files = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
files.forEach((f, i) => fs.renameSync(path.join(videoDir, f), path.join(EVIDENCE, `followups${files.length > 1 ? "-" + (i + 1) : ""}.webm`)));
fs.rmSync(videoDir, { recursive: true, force: true });
console.log("FOLLOWUPS DONE");
