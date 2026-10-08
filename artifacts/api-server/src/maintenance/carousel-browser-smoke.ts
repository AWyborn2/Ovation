/**
 * Opt-in browser check against the managed local preview. Creates/removes its
 * own tenant/admin/drafts; only the scorecard source response is synthetic.
 * Run: pnpm --filter @workspace/api-server exec tsx src/maintenance/carousel-browser-smoke.ts
 */
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import JSZip from "jszip";
import request from "supertest";
import app from "../app";
import { setPhotoStore } from "../lib/photo-store";
import { eq } from "drizzle-orm";
import { db, tenantsTable, adminsTable, socialDraftsTable, captionTemplatesTable, cardTemplatesTable, cardThemesTable, socialSettingsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { logger } from "../lib/logger";
import { TEAM_INPUT, assertTeamNames } from "./team-name-browser-check";
import { renderDraftSlides } from "../lib/draft-render";
import { closeBrowser } from "../lib/card-video-renderer";
import { readQueuedCarousel, queuedSlideAdjustments } from "@workspace/scorecard/queued-carousel";

const stamp = Date.now();
const origin = "http://localhost:80";
const fixtures = [1, 2].map(id => ({
  id, grade: id === 1 ? "A Grade" : "B Grade", opponentName: "Visitors",
  startAt: "2026-10-10T04:00:00Z", isHome: true, source: "manual", createdAt: new Date(0).toISOString(),
}));
const summary = {
  kind: "matchSummary", grade: "A Grade", matchTitle: "A Grade • Round 1", result: "Club won by 40 runs", resultWinner: "club",
  club: { name: "Test Cricket Club" }, opposition: { name: "Visitors" },
  innings: ["club", "opposition", "club", "opposition"].map((teamKey, i) => ({
    teamKey, inningsNum: i + 1, totalRuns: String(200 - i * 40), wickets: "6", overs: "40",
    topBatters: [{ name: "Sam Batter", runs: 80, balls: 70, notOut: true }],
    topBowlers: [{ name: "Pat Bowler", wickets: 3, runs: 20, overs: "8" }],
  })),
};
const [tenant] = await db.insert(tenantsTable).values({
  name: "Carousel Browser Check", slug: `carousel-browser-${stamp}`, centralClubId: 9989, readsFromCentral: true, plan: "pro",
  logoUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="60" fill="#334155"/></svg>').toString("base64")}`,
}).returning();
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
const objects = new Map<string, Buffer>();
try {
  const [admin] = await db.insert(adminsTable).values({
    tenantId: tenant.id, username: `carousel-check-${stamp}`, displayName: "Browser Check", passwordHash: "unused",
  }).returning();
  browser = await puppeteer.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setCookie({ name: SESSION_COOKIE, value: encodeSession({ adminId: admin.id, issuedAt: Date.now() }), url: origin });
  await page.setViewport({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on("request", req => {
    if (!req.url().includes("/api/weekend-carousel/sources")) {
      // Tenant routing is local only. Sending this header to Google Fonts
      // triggers a cross-origin preflight and prevents the intended font load.
      void req.continue({ headers: { ...req.headers(), ...(new URL(req.url()).origin === new URL(origin).origin ? { "x-tenant-id": String(tenant.id) } : {}) } });
      return;
    }
    const type = new URL(req.url()).searchParams.get("setType") ?? "matchDay";
    const input = type === "teamList" ? TEAM_INPUT : { ...summary, carouselDetail: type === "matchSummary" };
    void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
      timeZone: "Australia/Perth", fixtures, photos: [], coverPhotos: [], warnings: [],
      content: type === "matchDay" ? {} : Object.fromEntries(fixtures.map(f => [f.id, input])),
    }) });
  });
  await page.goto(`${origin}/admin/social/studio`, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="button-open-carousel-teamList"]', { timeout: 60000 });
  await mkdir("/tmp/carousel-browser", { recursive: true });
  for (const type of ["teamList", "results", "matchSummary"]) {
    logger.info({ type }, "Checking carousel editor");
    await page.locator(`[data-testid="button-open-carousel-${type}"]`).click();
    await page.waitForSelector('[data-testid="button-generate-weekend"]');
    await page.locator('[data-testid="button-generate-weekend"]').click();
    await page.waitForSelector('[data-testid="button-queue-weekend"]');
    for (const size of ["square", "portrait", "story", "landscape"]) {
      await page.locator(`[data-testid="button-size-${size}"]`).click();
      await new Promise(resolve => setTimeout(resolve, 300));
      const slide = await page.$('[data-testid="slide-fixture-1"]');
      if (type === "teamList") await assertTeamNames(page, '[data-testid="slide-fixture-1"]');
      await slide!.screenshot({ path: `/tmp/carousel-browser/${type}-${size}.png` });
      if (type === "matchSummary") {
        const panels = await slide!.$$("[data-innings]");
        if (panels.length !== 4) throw new Error(`Expected four innings in ${size}, got ${panels.length}`);
      }
    }
    await page.locator('[data-testid="button-queue-weekend"]').click();
    try {
      await page.waitForSelector('[data-testid="status-weekend-queued"]', { timeout: 10000 });
    } catch (error) {
      await page.screenshot({ path: "/tmp/carousel-browser/failure.png" });
      logger.error({ text: await page.$eval('[data-testid="weekend-fullscreen-editor"]', e => e.textContent?.slice(-2200)) }, "Browser queue state");
      throw error;
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="weekend-fullscreen-editor"]', { hidden: true });
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.locator('[data-testid="button-open-carousel-matchSummary"]').click();
  await page.waitForSelector('[data-testid="button-generate-weekend"]');
  await page.locator('[data-testid="button-generate-weekend"]').click();
  await page.screenshot({ path: "/tmp/carousel-browser/mobile-editor.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  const rows = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenant.id));
  if (rows.length !== 3 || rows.some(r => r.status !== "awaiting_review")) throw new Error("Unexpected review records");
  const teamDraft = rows.find(r => readQueuedCarousel(r.cardInput)?.setType === "teamList")!;
  const saved = readQueuedCarousel(teamDraft.cardInput)!;
  const formats = ["square", "portrait", "story", "landscape"] as const;
  await writeFile("/tmp/carousel-browser/saved-team.json", JSON.stringify(saved));
  await page.goto(`${origin}/__card-render`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => Boolean((globalThis as any).__cardRenderHarness));
  for (const slide of saved.slides) {
    await page.evaluate(async payload => (globalThis as any).__cardRenderHarness.renderStill(payload), {
      input: slide.input, options: { size: "square", packId: "club-kit-v1", data: slide.data, sponsorsOn: slide.sponsorsOn, junior: slide.junior },
    });
    const broken = await page.$$eval("#pack-still-root img", imgs => imgs.filter(img => !(img as any).naturalWidth).map(img => img.getAttribute("src")?.slice(0, 150)));
    if (broken.length) throw new Error(`Broken test fixture images: ${JSON.stringify(broken)}`);
  }
  // Actual queued still renderer (not the unit-test seam), across every size.
  const exports = await renderDraftSlides(teamDraft, [...formats], origin, logger);
  const pixelHash = async (png: Buffer) => createHash("sha256").update(await sharp(png).ensureAlpha().raw().toBuffer()).digest("hex");
  for (const size of formats) {
    const slide = saved.slides[1];
    const options = { size, packId: "club-kit-v1", sponsorsOn: slide.sponsorsOn, junior: slide.junior,
      data: slide.data, adjustments: queuedSlideAdjustments(slide, size), strictImages: true };
    const meta = await page.evaluate(async payload => (globalThis as any).__cardRenderHarness.renderStill(payload),
      { input: slide.input, options });
    await assertTeamNames(page, meta.selector);
    const preview = Buffer.from(await (await page.$(meta.selector))!.screenshot({ type: "png" }));
    const queued = exports.find(s => s.size === size && s.page === 2)!.png;
    if (await pixelHash(preview) !== await pixelHash(queued)) throw new Error(`${size}: queued PNG differs from checked preview`);
    // The individual-card HTTP export must also match the checked pixels.
    const bytes = await page.evaluate(async payload => {
      const response = await fetch("/api/card-renders/still", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await response.text());
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    }, { input: slide.input, options });
    if (await pixelHash(Buffer.from(bytes)) !== await pixelHash(queued)) throw new Error(`${size}: individual PNG differs from queued PNG`);
    await writeFile(`/tmp/carousel-browser/team-export-${size}.png`, queued);
  }
  // Call the real post-pack ZIP route; only storage is in-memory so this check
  // doesn't leave test files in the club's permanent object bucket.
  setPhotoStore({
    async write(bytes) { const path = `/objects/library/name-check-${objects.size}`; objects.set(path, bytes); return path; },
    async read(path) { return objects.get(path)!; },
    async remove(path) { objects.delete(path); },
  });
  const pack = await request(app).post(`/api/social-drafts/${teamDraft.id}/post-pack`)
    .set("x-forwarded-host", "localhost").set("x-forwarded-proto", "http")
    .set("x-tenant-id", String(tenant.id))
    .set("Cookie", `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
  if (pack.status !== 200) throw new Error(`ZIP export failed: ${JSON.stringify(pack.body)}`);
  const zipBytes = objects.get(pack.body.zipUrl.replace("/api/storage", ""))!;
  await writeFile("/tmp/carousel-browser/team-exports.zip", zipBytes);
  const unpacked = await JSZip.loadAsync(zipBytes);
  if (Object.keys(unpacked.files).length !== saved.slides.length + 1) throw new Error("ZIP missing slides or caption");
  for (const slide of exports.filter(s => s.size === saved.size)) {
    const png = await unpacked.file(`matchDay-${slide.size}-${slide.page}of${slide.of}.png`)!.async("nodebuffer");
    if (await pixelHash(png) !== await pixelHash(slide.png)) throw new Error("ZIP changed rendered pixels");
  }
  logger.info({ types: ["teamList", "results", "matchSummary"], savedSets: rows.length }, "Carousel browser check passed");
} catch (error) {
  const page = (await browser?.pages())?.at(-1);
  if (page) {
    await page.screenshot({ path: "/tmp/carousel-browser/failure.png" });
    logger.error({ text: await page.$eval("body", e => e.textContent?.slice(-3500)) }, "Browser failure state");
  }
  logger.error({ err: error }, "Carousel browser check failed");
  throw error;
} finally {
  setPhotoStore(null);
  await browser?.close();
  await closeBrowser();
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenant.id));
  for (const table of [captionTemplatesTable, cardTemplatesTable, cardThemesTable, socialSettingsTable]) {
    await db.delete(table).where(eq(table.tenantId, tenant.id));
  }
  await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenant.id));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant.id));
}
