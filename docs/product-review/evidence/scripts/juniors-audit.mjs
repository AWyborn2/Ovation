// Job A: Juniors section audit on mandurah + halls-head tenants.
// Desktop 1280x720 with video; captures console errors, failed requests,
// broken images, spinner state, and body-text excerpts per page.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = "/home/user/Ovation/docs/product-review/evidence/juniors-empty";
const VID = path.join(OUT, "_vid_juniors");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VID, { recursive: true });

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// Known Mandurah SENIOR player names (from central DB) — must never appear on junior pages.
const SENIOR_NAMES = ["Hunter Stewart", "Lucas White", "Jake Mitchell", "Josh Bailey", "Flynn Brooks", "Mitch James"];

const log = { pages: [] };
let shot = 0;
const snap = async (page, name) => {
  shot++;
  const f = `${String(shot).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, f), fullPage: true });
  return f;
};

// First-visit "Welcome to the club portal" modal blocks all pointer events.
// Dismiss it if present (screenshot it once per host first).
const welcomeSeen = new Set();
async function dismissWelcome(page, host) {
  const later = page.getByRole("button", { name: /maybe later/i });
  if (await later.isVisible().catch(() => false)) {
    if (!welcomeSeen.has(host)) {
      welcomeSeen.add(host);
      const f = await snap(page, `${host}-welcome-modal`);
      log.pages.push({ host, label: "welcome-modal", screenshot: f, note: "first-visit modal, blocks pointer events until dismissed" });
    }
    await later.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function auditPage(page, host, url, label, events) {
  events.length = 0;
  const t0 = Date.now();
  let navErr = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);
  } catch (e) {
    navErr = String(e).slice(0, 300);
  }
  await dismissWelcome(page, host);
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
  const seniorBleed = SENIOR_NAMES.filter((n) => bodyText.includes(n));
  const file = await snap(page, `${host}-${label}`);
  log.pages.push({
    host, label, url, navErr, ms: Date.now() - t0, screenshot: file,
    spinnersVisible: spinner, brokenImgs, seniorBleed,
    events: [...events],
    textExcerpt: bodyText.replace(/\n{2,}/g, "\n").slice(0, 1800),
  });
  console.log(`done ${host} ${label} spinners=${spinner} events=${events.length} bleed=${seniorBleed.length}`);
}

const browser = await chromium.launch({ executablePath: CHROME });

for (const host of ["mandurah", "halls-head"]) {
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

  const base = `http://${host}.ovation.test:24624`;

  // 1. Home page + header Seniors/Juniors toggle
  await auditPage(page, host, `${base}/`, "home-seniors-mode", events);
  // find the toggle
  const toggle = page.locator("header").getByText(/juniors/i).first();
  const toggleVisible = await toggle.isVisible().catch(() => false);
  log.pages.push({ host, label: "toggle-present", toggleVisible });
  if (toggleVisible) {
    events.length = 0;
    await toggle.click();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const urlAfter = page.url();
    const f = await snap(page, `${host}-after-toggle-click`);
    log.pages.push({ host, label: "toggle-click", urlAfter, screenshot: f, events: [...events] });
  }

  // 2. Junior routes
  for (const [route, label] of [
    ["/juniors", "juniors-dashboard"],
    ["/juniors/matches", "juniors-matches"],
    ["/juniors/premierships", "juniors-premierships"],
    ["/juniors/players", "juniors-players"],
    ["/juniors/office-bearers", "juniors-office-bearers"],
    ["/juniors/matches/1", "juniors-match-detail-nonexistent"],
    ["/juniors/players/1", "juniors-player-detail-nonexistent"],
  ]) {
    await auditPage(page, host, `${base}${route}`, label, events);
  }

  // 3. While in juniors mode, check header nav links (do they point to junior or senior routes?)
  await page.goto(`${base}/juniors`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(800);
  const navLinks = await page.$$eval("header a", (as) =>
    as.map((a) => ({ text: a.innerText.trim(), href: a.getAttribute("href") })).filter((x) => x.text)).catch(() => []);
  log.pages.push({ host, label: "juniors-mode-nav-links", navLinks });

  // 4. Toggle back to seniors from juniors mode
  const backToggle = page.locator("header").getByText(/seniors/i).first();
  if (await backToggle.isVisible().catch(() => false)) {
    await backToggle.click();
    await page.waitForTimeout(800);
    log.pages.push({ host, label: "toggle-back-to-seniors", urlAfter: page.url() });
  }

  await page.close();
  await ctx.close();
  // rename video
  const vids = fs.readdirSync(VID).filter((f) => f.endsWith(".webm"));
  if (vids.length) {
    fs.renameSync(path.join(VID, vids[0]), path.join(OUT, `juniors-${host}-desktop.webm`));
  }
}

// Mobile check: mandurah juniors dashboard + matches at 375x812
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
  await auditPage(page, "mandurah-mobile", "http://mandurah.ovation.test:24624/juniors", "juniors-dashboard-mobile", events);
  await auditPage(page, "mandurah-mobile", "http://mandurah.ovation.test:24624/juniors/players", "juniors-players-mobile", events);
  // mobile menu open (if hamburger exists)
  const burger = page.locator('header button').last();
  if (await burger.isVisible().catch(() => false)) {
    await burger.click().catch(() => {});
    await page.waitForTimeout(600);
    const f = await snap(page, "mandurah-mobile-juniors-menu-open");
    log.pages.push({ host: "mandurah-mobile", label: "menu-open", screenshot: f });
  }
  await page.close();
  await ctx.close();
  const vids = fs.readdirSync(VID).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VID, vids[0]), path.join(OUT, "juniors-mandurah-mobile.webm"));
}

await browser.close();
fs.writeFileSync(path.join(OUT, "juniors-audit-log.json"), JSON.stringify(log, null, 2));
fs.rmSync(VID, { recursive: true, force: true });
console.log("JUNIORS AUDIT COMPLETE");
