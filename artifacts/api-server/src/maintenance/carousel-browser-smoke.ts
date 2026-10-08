/**
 * Opt-in browser check against the managed local preview. Creates/removes its
 * own tenant/admin/drafts; only the scorecard source response is synthetic.
 * Run: pnpm --filter @workspace/api-server exec tsx src/maintenance/carousel-browser-smoke.ts
 */
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, tenantsTable, adminsTable, socialDraftsTable, captionTemplatesTable, cardTemplatesTable, cardThemesTable, socialSettingsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { logger } from "../lib/logger";

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
}).returning();
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  const [admin] = await db.insert(adminsTable).values({
    tenantId: tenant.id, username: `carousel-check-${stamp}`, displayName: "Browser Check", passwordHash: "unused",
  }).returning();
  browser = await puppeteer.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "x-tenant-id": String(tenant.id) });
  await page.setCookie({ name: SESSION_COOKIE, value: encodeSession({ adminId: admin.id, issuedAt: Date.now() }), url: origin });
  await page.setViewport({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on("request", req => {
    if (!req.url().includes("/api/weekend-carousel/sources")) { void req.continue(); return; }
    const type = new URL(req.url()).searchParams.get("setType") ?? "matchDay";
    const input = type === "teamList" ? {
      kind: "teamList", grade: "A Grade", gradeRound: "A GRADE • ROUND 1", venueDateTime: "Saturday • Test Ground",
      players: Array.from({ length: 12 }, (_, i) => ({ order: i + 1, surname: `PLAYER ${i + 1}`, ...(i === 0 ? { role: "C/WK" } : {}) })),
    } : { ...summary, carouselDetail: type === "matchSummary" };
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
    await page.click('[data-testid="button-generate-weekend"]');
    await page.waitForSelector('[data-testid="button-queue-weekend"]');
    for (const size of ["square", "portrait", "story", "landscape"]) {
      await page.click(`[data-testid="button-size-${size}"]`);
      await new Promise(resolve => setTimeout(resolve, 300));
      const slide = await page.$('[data-testid="slide-fixture-1"]');
      await slide!.screenshot({ path: `/tmp/carousel-browser/${type}-${size}.png` });
      if (type === "matchSummary") {
        const panels = await slide!.$$("[data-innings]");
        if (panels.length !== 4) throw new Error(`Expected four innings in ${size}, got ${panels.length}`);
      }
    }
    await page.click('[data-testid="button-queue-weekend"]');
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
  await page.click('[data-testid="button-generate-weekend"]');
  await page.screenshot({ path: "/tmp/carousel-browser/mobile-editor.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  const rows = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenant.id));
  if (rows.length !== 3 || rows.some(r => r.status !== "awaiting_review")) throw new Error("Unexpected review records");
  logger.info({ types: ["teamList", "results", "matchSummary"], savedSets: rows.length }, "Carousel browser check passed");
} catch (error) {
  logger.error({ err: error }, "Carousel browser check failed");
  throw error;
} finally {
  await browser?.close();
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenant.id));
  for (const table of [captionTemplatesTable, cardTemplatesTable, cardThemesTable, socialSettingsTable]) {
    await db.delete(table).where(eq(table.tenantId, tenant.id));
  }
  await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenant.id));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant.id));
}
