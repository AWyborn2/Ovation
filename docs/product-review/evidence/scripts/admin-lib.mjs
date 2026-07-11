// Shared helpers for club-admin review scripts (tenant 1, halls-head).
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

export const BASE = "http://halls-head.ovation.test:24624";
export const EVID = "/home/user/Ovation/docs/product-review/evidence/club-admin";
const VIDDIR = "/tmp/claude-0/-home-user-Ovation/6f9bc7d9-7149-59c4-8676-d65ea2c1577c/scratchpad/pw/videos";

fs.mkdirSync(EVID, { recursive: true });
fs.mkdirSync(VIDDIR, { recursive: true });

export async function makeSession() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VIDDIR, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => {
    if (m.type() === "error")
      logs.push(`CONSOLE-ERROR on ${page.url()} :: ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.push(`PAGEERROR on ${page.url()} :: ${e.message}`));
  page.on("requestfailed", (r) =>
    logs.push(`REQUEST-FAILED ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`)
  );
  page.on("response", (r) => {
    if (r.status() >= 400)
      logs.push(`HTTP-${r.status()} ${r.request().method()} ${r.url()} (page: ${page.url()})`);
  });
  return { browser, context, page, logs };
}

export async function shot(page, name) {
  await page.screenshot({ path: path.join(EVID, name), fullPage: false });
  console.log("shot:", name);
}

export async function shotFull(page, name) {
  await page.screenshot({ path: path.join(EVID, name), fullPage: true });
  console.log("shot(full):", name);
}

// The public-site welcome/tour modal can pop over any page (including /admin).
export async function dismissTour(page) {
  const later = page.locator('button:has-text("Maybe later")');
  if (await later.count().catch(() => 0)) {
    await later.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

export async function login(page) {
  await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await dismissTour(page);
  if (await page.locator("#username").count()) {
    await page.fill("#username", "owner");
    await page.fill("#password", "ReviewAdmin!2026");
    await page.click('button:has-text("Sign in")');
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
  }
}

export async function finish({ browser, context, page, logs }, videoName, logName) {
  const video = page.video();
  await context.close();
  if (video) {
    const p = await video.path();
    fs.copyFileSync(p, path.join(EVID, videoName));
    console.log("video:", videoName);
  }
  await browser.close();
  fs.writeFileSync(path.join(EVID, logName), logs.join("\n") + "\n");
  console.log(`log: ${logName} (${logs.length} entries)`);
}
