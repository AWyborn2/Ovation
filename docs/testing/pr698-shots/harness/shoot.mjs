/**
 * Screenshots of the New Studio set, slide and card editors (PR #698), with
 * every API call answered from fixtures (no server, no database).
 *
 *   PORT=5179 pnpm --filter @workspace/cricket-club run dev   # in another shell
 *   scripts/node_modules/.bin/tsx docs/testing/pr698-shots/harness/fixtures.ts /tmp/fx.json
 *   node docs/testing/pr698-shots/harness/shoot.mjs /tmp/fx.json <prefix> <out-dir>
 *
 * Uses the global Playwright and the machine's Chrome, at deviceScaleFactor 1.
 */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");

const [fxPath, prefix, outDir] = process.argv.slice(2);
const fx = JSON.parse(readFileSync(fxPath, "utf8"));
const origin = process.env.APP_ORIGIN ?? "http://localhost:5179";
mkdirSync(outDir, { recursive: true });

const ADMIN = { id: 1, username: "admin", displayName: "Club admin", createdAt: "2026-01-01" };
function answer(url, method) {
  const u = new URL(url);
  const p = u.pathname.replace(/^\/api/, "");
  if (p === "/auth/me") return [200, ADMIN];
  if (p === "/platform/auth/me") return [401, { error: "Not signed in" }];
  if (p === "/tenant-plan")
    return [200, { plan: "club", newStudio: true, entitlements: { socialStudio: true } }];
  if (p === "/social-drafts/956/set-design") return [200, fx.setDesign];
  if (p === "/social-drafts/956") return [200, fx.set];
  if (p === "/social-drafts/957") return [200, fx.card];
  if (p === "/social-settings")
    return [200, { settings: {}, captionTemplates: [], activeSponsors: [] }];
  if (method !== "GET") return [200, {}];
  return [200, []];
}

const SHOTS = [];
for (const [w, h] of [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
])
  for (const size of ["portrait", "story"])
    SHOTS.push({
      name: `set-${w}x${h}-${size}`,
      w,
      h,
      url: `/admin/social/set/956?format=${size}`,
    });
SHOTS.push({
  name: "slide-1440x900-portrait",
  w: 1440,
  h: 900,
  slide: true,
});
SHOTS.push({
  name: "card-1440x900-portrait",
  w: 1440,
  h: 900,
  url: "/admin/social/editor/957?format=portrait",
});
SHOTS.push({
  name: "set-1872x1000-topbar",
  w: 1872,
  h: 1000,
  url: "/admin/social/set/956?format=portrait",
});
SHOTS.push({
  name: "set-1366x768-topbar",
  w: 1366,
  h: 768,
  url: "/admin/social/set/956?format=portrait",
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
for (const s of SHOTS) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const [status, body] = answer(req.url(), req.method());
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  // Outside fonts and images aren't reachable here: fail them fast.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  if (s.slide) {
    // The slide editor's address, as the set editor's "Edit this slide" links to it.
    await page.goto(origin + "/admin/social/set/956?format=portrait", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('[data-testid="editor-artboard"]', { timeout: 30000 });
    await page.locator('nav[aria-label="Slides"] ol button[aria-label^="2. "]').click();
    const href = await page
      .locator('a[href*="/slide?key="]')
      .first()
      .getAttribute("href", { timeout: 10000 });
    s.url = `${href}&format=portrait`;
  }
  await page.goto(origin + s.url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector('[data-testid="editor-artboard"]', { timeout: 30000 });
  } catch {
    console.warn(`${s.name}: no artboard`);
  }
  if (s.name.includes("topbar")) {
    // The most the top bar holds: a team slide adds "Edit this slide".
    await page.locator('nav[aria-label="Slides"] ol button[aria-label^="2. "]').click();
  }
  await page.waitForTimeout(1500);
  const file = path.join(outDir, `${prefix}-${s.name}.png`);
  await page.screenshot({ path: file });
  // The top bar's fit, for the 1872px check.
  const fit = await page.evaluate(() => {
    const bar = document.querySelector("header");
    const save = [...document.querySelectorAll("header button")].find(
      (b) => b.textContent?.trim() === "Save",
    );
    return bar
      ? {
          barScroll: bar.scrollWidth,
          barClient: bar.clientWidth,
          saveRight: save ? Math.round(save.getBoundingClientRect().right) : null,
        }
      : null;
  });
  console.log(s.name, JSON.stringify(fit));
  await ctx.close();
}
await browser.close();
