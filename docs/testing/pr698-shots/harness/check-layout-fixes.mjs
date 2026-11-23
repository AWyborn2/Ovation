// Layout-fix checks at 1366x768 on the PR #698 harness fixtures (editor/layout-fixes).
// Writes after-fix-set-1366x768-*.png to the folder given; quantise to 96 colours before committing.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const [fxPath, outDir] = process.argv.slice(2);
const fx = JSON.parse(readFileSync(fxPath, "utf8"));
const origin = process.env.APP_ORIGIN ?? "http://localhost:5179";
mkdirSync(outDir, { recursive: true });
const ADMIN = { id: 1, username: "admin", displayName: "Club admin", createdAt: "2026-01-01" };
function answer(url, method) {
  const p = new URL(url).pathname.replace(/^\/api/, "");
  if (p === "/auth/me") return [200, ADMIN];
  if (p === "/platform/auth/me") return [401, { error: "Not signed in" }];
  if (p === "/tenant-plan")
    return [200, { plan: "club", newStudio: true, entitlements: { socialStudio: true } }];
  if (p === "/social-drafts/956/set-design") return [200, fx.setDesign];
  if (p === "/social-drafts/956") return [200, fx.set];
  if (p.startsWith("/social-drafts/956/photo-pool"))
    return [200, { photoIds: [], playerIds: [], junior: false }];
  if (p === "/social-settings")
    return [200, { settings: {}, captionTemplates: [], activeSponsors: [] }];
  if (method !== "GET") return [200, {}];
  return [200, []];
}
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.route("**/api/**", (route) => {
  const req = route.request();
  const [status, body] = answer(req.url(), req.method());
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
});
await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
await page.goto(origin + "/admin/social/set/956?format=portrait", {
  waitUntil: "domcontentloaded",
});
await page.waitForSelector('[data-testid="editor-artboard"]', { timeout: 60000 });
await page.locator('nav[aria-label="Slides"] ol button[aria-label^="2. "]').click();
await page.waitForTimeout(1500);

const panel = () =>
  page.evaluate(
    () =>
      document.querySelector('[data-testid="editor-panel"]')?.getAttribute("data-panel") ?? null,
  );
const firstTool = () =>
  page.evaluate(() => {
    const t = document.querySelector('[role="toolbar"][aria-label="Layer tools"]');
    return t
      ? [...t.querySelectorAll("button")].slice(0, 3).map((b) => b.textContent?.trim())
      : null;
  });
const log = (k, v) => console.log(k.padEnd(34), JSON.stringify(v));

const info = await page.evaluate(() => {
  const board = document.querySelector('[data-testid="editor-artboard"]').getBoundingClientRect();
  const ov = [...document.querySelectorAll('[data-testid^="layer-"]')].map((e) => ({
    id: e.dataset.testid.slice(6),
    base: e.hasAttribute("data-page-base"),
    r: e.getBoundingClientRect().toJSON(),
  }));
  return { board: board.toJSON(), ov };
});
log(
  "page bases",
  info.ov.filter((o) => o.base).map((o) => o.id),
);
const photo = info.ov.find((o) => o.id === "team-l2");
log("photo overlay", photo?.r);

// 1. A click on the page's background (top-left corner of the card).
await page.mouse.click(info.board.x + 4, info.board.y + 4);
await page.waitForTimeout(300);
log("bg click -> panel", await panel());

// 2. A click on the photo (its middle), and again.
if (photo) {
  const cx = photo.r.x + photo.r.width / 2;
  const cy = photo.r.y + photo.r.height / 2;
  const topAt = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.dataset?.testid,
    [cx, cy],
  );
  log("element on top at photo middle", topAt);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(300);
  log("photo click 1 -> toolbar", await firstTool());
  await page.screenshot({ path: path.join(outDir, "after-fix-set-1366x768-photo-selected.png") });
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(300);
  log("photo click 2 -> toolbar", await firstTool());
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(300);
  log("photo click 3 -> toolbar", await firstTool());
}

// 3. Toolbar: button sizes and no swatches.
const tb = await page.evaluate(() => {
  const t = document.querySelector('[role="toolbar"][aria-label="Layer tools"]');
  if (!t) return null;
  return {
    swatches: !!t.querySelector('[aria-label="Colour"]'),
    buttons: [...t.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return [
        b.textContent?.trim() || b.getAttribute("aria-label"),
        Math.round(r.width),
        Math.round(r.height),
      ];
    }),
  };
});
log("toolbar", tb);

// Esc.
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
log("Esc -> panel", await panel());

// Select something, then click the grey right of the card.
if (photo) await page.mouse.click(photo.r.x + photo.r.width / 2, photo.r.y + photo.r.height / 2);
await page.waitForTimeout(200);
const area = await page.evaluate(() =>
  document.querySelector('[data-testid="canvas-area"]').getBoundingClientRect().toJSON(),
);
await page.mouse.click(area.x + area.width - 20, area.y + area.height / 2);
await page.waitForTimeout(300);
log("grey click -> panel", await panel());
await page.screenshot({ path: path.join(outDir, "after-fix-set-1366x768-edit-page.png") });

// 4. Change photo from the top bar (shown only when the slide has a photo).
const cp = page.getByRole("button", { name: "Change photo" });
log("Change photo in top bar", await cp.count());
if (await cp.count()) {
  await cp.first().click();
  await page.waitForTimeout(400);
  log(
    "Change photo -> sliders",
    await page.getByRole("slider", { name: "Photo left–right" }).count(),
  );
}

// 5. Scroll view duplicate.
await page.getByRole("group", { name: "Pages" }).getByRole("button", { name: "Scroll" }).click();
await page.waitForTimeout(800);
const dups = await page.evaluate(() =>
  [
    ...document.querySelectorAll('section[aria-label="Slides"] button[aria-label^="Duplicate "]'),
  ].map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-disabled"), b.title]),
);
log("scroll duplicates", dups);
await page.screenshot({ path: path.join(outDir, "after-fix-set-1366x768-scroll.png") });
await browser.close();
