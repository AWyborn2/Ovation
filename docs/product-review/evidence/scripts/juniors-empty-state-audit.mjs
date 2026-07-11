// Job B: Empty-state audit of a brand-new club — halls-head tenant 1 (native local
// tables, all empty). Walks home, /players, /matches, /records, /honour-boards,
// /premierships, /compare, /grades at 1280x720 (video), plus mobile spot-checks.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = "/home/user/Ovation/docs/product-review/evidence/juniors-empty";
const VID = path.join(OUT, "_vid_empty");
fs.mkdirSync(VID, { recursive: true });
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://halls-head.ovation.test:24624";

const log = { pages: [] };
let shot = 30; // continue numbering after job A (01-24)
const snap = async (page, name) => {
  shot++;
  const f = `${String(shot).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, f), fullPage: true });
  return f;
};

async function dismissWelcome(page) {
  const later = page.getByRole("button", { name: /maybe later/i });
  if (await later.isVisible().catch(() => false)) {
    await later.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function auditPage(page, url, label, events, mode = "desktop") {
  events.length = 0;
  let navErr = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500); // give spinners a chance to resolve
  } catch (e) {
    navErr = String(e).slice(0, 300);
  }
  await dismissWelcome(page);
  const spinner = await page
    .$$eval('[class*="animate-spin"], [class*="spinner" i], [role="progressbar"]', (els) =>
      els.filter((e) => e.offsetParent !== null).length)
    .catch(() => -1);
  const brokenImgs = await page
    .$$eval("img", (imgs) =>
      imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:"))
        .map((i) => i.src))
    .catch(() => []);
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const file = await snap(page, `${mode}-hh-${label}`);
  log.pages.push({
    label, mode, url, navErr, screenshot: file, spinnersVisible: spinner, brokenImgs,
    events: [...events],
    textExcerpt: bodyText.replace(/\n{2,}/g, "\n").slice(0, 2500),
  });
  console.log(`done ${mode} ${label} spinners=${spinner} events=${events.length}`);
}

const PAGES = [
  ["/", "home"],
  ["/players", "players"],
  ["/matches", "matches"],
  ["/records", "records"],
  ["/honour-boards", "honour-boards"],
  ["/premierships", "premierships"],
  ["/compare", "compare"],
  ["/grades", "grades"],
];

const browser = await chromium.launch({ executablePath: CHROME });

// Desktop pass with video
{
  const ctx = await browser.newContext({
    recordVideo: { dir: VID, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();
  const events = [];
  page.on("console", (m) => { if (m.type() === "error") events.push({ t: "console.error", v: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => events.push({ t: "pageerror", v: String(e).slice(0, 300) }));
  page.on("requestfailed", (r) => events.push({ t: "requestfailed", v: `${r.url()} ${r.failure()?.errorText}` }));
  page.on("response", (r) => { if (r.status() >= 400) events.push({ t: `http${r.status()}`, v: r.url() }); });

  for (const [route, label] of PAGES) await auditPage(page, `${BASE}${route}`, label, events);

  // Compare page: try interacting with the player pickers on an empty club
  await page.goto(`${BASE}/compare`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1000);
  await dismissWelcome(page);
  const combo = page.locator('input, [role="combobox"], button[role="combobox"]').first();
  if (await combo.isVisible().catch(() => false)) {
    await combo.click().catch(() => {});
    await combo.fill?.("a").catch(() => {});
    await page.waitForTimeout(900);
    const f = await snap(page, "desktop-hh-compare-picker-open");
    log.pages.push({ label: "compare-picker-open", screenshot: f });
  }

  await page.close();
  await ctx.close();
  const vids = fs.readdirSync(VID).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VID, vids[0]), path.join(OUT, "juniors-hallshead-empty-desktop.webm"));
}

// Mobile spot-checks: home, players, records
{
  const ctx = await browser.newContext({
    recordVideo: { dir: VID, size: { width: 375, height: 812 } },
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  const events = [];
  page.on("console", (m) => { if (m.type() === "error") events.push({ t: "console.error", v: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => events.push({ t: "pageerror", v: String(e).slice(0, 300) }));
  page.on("requestfailed", (r) => events.push({ t: "requestfailed", v: `${r.url()} ${r.failure()?.errorText}` }));
  page.on("response", (r) => { if (r.status() >= 400) events.push({ t: `http${r.status()}`, v: r.url() }); });
  for (const [route, label] of [["/", "home"], ["/players", "players"], ["/records", "records"]]) {
    await auditPage(page, `${BASE}${route}`, label, events, "mobile");
  }
  await page.close();
  await ctx.close();
  const vids = fs.readdirSync(VID).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VID, vids[0]), path.join(OUT, "juniors-hallshead-empty-mobile.webm"));
}

await browser.close();
fs.writeFileSync(path.join(OUT, "empty-state-audit-log.json"), JSON.stringify(log, null, 2));
fs.rmSync(VID, { recursive: true, force: true });
console.log("EMPTY-STATE AUDIT COMPLETE");
