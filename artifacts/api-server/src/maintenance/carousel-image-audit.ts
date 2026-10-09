/**
 * Opt-in real-Chromium image audit (no production data or storage writes).
 * pnpm --filter @workspace/api-server exec tsx src/maintenance/carousel-image-audit.ts
 * Optional: --type=teamList (matchDay/results/matchSummary), --size=square,
 * --pack=gold-foil-v1, --output=/tmp/custom-audit.
 * --type=matchSummary additionally exercises dense four-innings scorecards.
 *
 * Exercises the real builder with browser-only fixture responses, then the
 * real SlidePreview and post-pack HTTP handler. Only byte storage is replaced
 * with an in-memory store; PNG rendering is NOT mocked.
 * Fixture PNGs are served by a short-lived loopback server, never stored in DB.
 * Failure images and downloaded ZIPs are kept under /tmp/carousel-image-audit.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import sharp from "sharp";
import JSZip from "jszip";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, tenantsTable, adminsTable, socialDraftsTable } from "@workspace/db";
import { CAROUSEL_PACK_IDS, type QueuedCarouselSlide } from "@workspace/scorecard/queued-carousel";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore } from "../lib/photo-store";
import { closeBrowser } from "../lib/card-video-renderer";
import { auditCarouselBuilder } from "./carousel-builder-audit";

const origin = "http://localhost:80";
const allTypes = ["matchDay", "teamList", "results", "matchSummary"] as const;
const allSizes = ["square", "portrait", "story", "landscape"] as const;
const filter = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.split("=")[1];
const output = filter("output") ?? "/tmp/carousel-image-audit";
const types = allTypes.filter(t => !filter("type") || filter("type") === t);
const sizes = allSizes.filter(s => !filter("size") || filter("size") === s);
const packs = CAROUSEL_PACK_IDS.filter(p => !filter("pack") || filter("pack") === p);
assert(types.length && sizes.length && packs.length, "Invalid type, size or pack filter");
await mkdir(output, { recursive: true });

// Actual decoded PNG fixtures: edge detail, transparency, internal whitespace,
// wide/tall/square artwork and a colourful photo whose crop is unambiguous.
const assets = new Map<string, Buffer>();
for (const [name, w, h, inset] of [
  ["wide", 600, 120, 2], ["tall", 120, 600, 2],
  ["square", 250, 250, 2], ["padded", 600, 300, 60],
] as const) {
  assets.set(`/${name}.png`, await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="#238858"/>
      <rect x="${inset}" y="${inset}" width="12" height="12" fill="#ff00ff"/>
      <rect x="${w - inset - 12}" y="${h - inset - 12}" width="12" height="12" fill="#00ffff"/>
      <text x="${w / 2}" y="${h / 2}" dominant-baseline="middle" text-anchor="middle"
        font-size="${Math.min(w, h) * .23}" fill="white">${name.toUpperCase()}</text>
    </svg>`,
  )).png().toBuffer());
}
assets.set("/photo.png", await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
    <rect width="900" height="600" fill="#166dcc"/><rect x="300" width="300" height="600" fill="#cc4020"/>
    <rect x="600" width="300" height="600" fill="#26a44d"/>
    <circle cx="610" cy="210" r="80" fill="#ffd700"/>
    <text x="90" y="550" font-size="90" fill="white">CROP CHECK</text>
  </svg>`,
)).png().toBuffer());
const assetServer = createServer((req, res) => {
  const bytes = assets.get(req.url ?? "");
  res.writeHead(bytes ? 200 : 404, { "content-type": "image/png", "access-control-allow-origin": "*" });
  res.end(bytes);
});
await new Promise<void>(resolve => assetServer.listen(0, "127.0.0.1", resolve));
const address = assetServer.address();
assert(address && typeof address !== "string");
const assetOrigin = `http://127.0.0.1:${address.port}`;
const url = (name: string) => `${assetOrigin}/${name}.png`;
const objects = new Map<string, Buffer>();
setPhotoStore({
  async read(path) { assert(objects.has(path)); return objects.get(path)!; },
  async write(bytes) { const path = `/objects/library/audit-${randomUUID()}`; objects.set(path, bytes); return path; },
  async remove(path) { objects.delete(path); },
});

let tenantId: number | undefined;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
let page: Page | undefined;
let passed = 0;
try {
  const [tenant] = await db.insert(tenantsTable).values({
    slug: `image-audit-${randomUUID()}`, name: "Image Audit Club",
    centralClubId: 1_000_000_000 + parseInt(randomUUID().slice(0, 7), 16), plan: "pro",
  }).returning();
  tenantId = tenant.id;
  const [admin] = await db.insert(adminsTable).values({
    tenantId, username: `audit-${randomUUID()}`, displayName: "Image Audit", passwordHash: "unused",
  }).returning();
  const cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  browser = await puppeteer.launch({
    executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  page = await browser.newPage();
  await page.goto(`${origin}/__card-render`, { waitUntil: "networkidle2" });

  const fixture = {
    brand: { name: "Image Audit Club", logoUrl: url("square"), primaryColour: "#FBAC27", backgroundColour: "#14213D" },
    photo: url("photo"),
    sponsors: [
      { id: 1, name: "Presenting wide", logoUrl: url("wide"), grades: [], isPresenting: true },
      { id: 2, name: "Team tall", logoUrl: url("tall"), grades: ["A Grade"], isPresenting: false },
      { id: 3, name: "Wrong team", logoUrl: url("padded"), grades: ["B Grade"], isPresenting: false },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: i + 4, name: `Unassigned ${i}`, logoUrl: url(i % 2 ? "padded" : "square"),
        grades: [], isPresenting: false,
      })),
    ],
  };
  await auditCarouselBuilder(page, fixture, output);
  for (const type of types) {
    // Use the real builder: source assignment, selected photos and saved crops
    // must travel through the same code as the editor, not test-only markup.
    const slides = await page.evaluate(async (args) => {
      const load = new Function("path", "return import(path)") as (p: string) => Promise<any>;
      const { buildWeekendSlides } = await load("/src/components/weekend-carousel/model.ts");
      const summary = {
        kind: "matchSummary", grade: "A Grade", matchTitle: "A Grade • Round 1",
        result: "Club won by 40 runs", resultWinner: "club", carouselDetail: args.type === "matchSummary",
        club: { name: "Image Audit Club" }, opposition: { name: "Visitors" },
        innings: (args.type === "matchSummary" ? ["club", "opposition", "club", "opposition"] : ["club", "opposition"]).map((teamKey, i) => ({
          teamKey, inningsNum: i < 2 ? 1 : 2, totalRuns: String(200 - i * 40), wickets: "6", overs: "40",
          topBatters: [
            { name: "Test Batter Full Name", runs: 80, balls: 70, notOut: true },
            { name: "Another Full Name", runs: 62, balls: 53 },
            { name: "Third Test Batter", runs: 41, balls: 30 },
          ],
          topBowlers: [
            { name: "Test Bowler Full Name", wickets: 3, runs: 20, overs: "8" },
            { name: "Another Test Bowler", wickets: 2, runs: 28, overs: "7" },
          ],
        })),
      };
      const input = args.type === "teamList" ? {
        kind: "teamList", grade: "A Grade", gradeRound: "A GRADE • ROUND 1", venueDateTime: "Saturday • Test Ground",
        players: Array.from({ length: 12 }, (_, i) => ({ order: i + 1, surname: `PLAYER ${i + 1}`, ...(i === 0 ? { role: "C/WK" } : {}) })),
      } : args.type === "matchDay" ? undefined : summary;
      const photos = [{ id: 1, url: args.fixture.photo, grade: "A Grade", photoTypes: ["batting"], season: 2026 },
        { id: 2, url: args.fixture.photo, grade: null, photoTypes: ["club"], season: 2026 }];
      return buildWeekendSlides([{
        fixture: { id: 1, grade: "A Grade", opponentName: "Visitors", isHome: true,
          startAt: "2026-10-10T04:00:00Z", roundLabel: "Round 1", venue: "Test Ground" },
        input, photoId: 1, transform: { focalX: .73, focalY: .31, zoom: 1.45 },
      }], photos, {
        settings: { sponsorsEnabled: true, clubHashtag: "#ImageAudit" },
        activeSponsors: args.fixture.sponsors, brand: args.fixture.brand,
      }, "Weekend image audit", "2026-10-09", "2026-10-11", "Australia/Perth",
      { selection: { photoId: 2, transform: { focalX: .22, focalY: .68, zoom: 1.3 } }, photos });
    }, { type, fixture }) as QueuedCarouselSlide[];
    assert.equal(slides.length, 3);
    assert.equal((slides[0].data.sponsors as any[])[0].logoUrl, url("wide"));
    assert.deepEqual((slides[1].data.sponsors as any[]).map(s => s.logoUrl), [url("tall")]);
    assert.equal((slides[1].data.photoTransform as any).zoom, 1.45);
    assert(!JSON.stringify(slides[2].input).includes("Wrong team"));

    for (const packId of packs) {
    for (const size of sizes) {
      const draftInput = { kind: "matchDay", weekendCarousel: {
        version: 1, packId, submissionId: randomUUID(), setType: type, size, slides,
      } };
      const caption = `Image audit: ${type} / ${size}`;
      const [draft] = await db.insert(socialDraftsTable).values({
        tenantId, cardInput: draftInput, caption, status: "awaiting_review",
        engine: "ondemand",
      }).returning();
      const response = await request(app).post(`/api/social-drafts/${draft.id}/post-pack`)
        .set("x-forwarded-host", "localhost:80").set("x-forwarded-proto", "http")
        .set("x-tenant-id", String(tenantId)).set("Cookie", cookie).expect(200);
      const zipPath = String(response.body.zipUrl).replace("/api/storage", "");
      const zipBytes = objects.get(zipPath);
      assert(zipBytes, `No ZIP at ${zipPath}`);
      await writeFile(`${output}/${packId}-${type}-${size}.zip`, zipBytes);
      const zip = await JSZip.loadAsync(zipBytes);
      assert.equal(await zip.file("caption.txt")!.async("string"), caption);
      const pngs = Object.keys(zip.files).filter(n => n.endsWith(".png"));
      assert.equal(pngs.length, slides.length);
      const [after] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, draft.id));
      assert.equal(after.status, "awaiting_review");
      assert.deepEqual(after.cardInput, draftInput, "Export mutated the frozen composition");

      for (const [index, slide] of slides.entries()) {
        const png = await zip.file(pngs[index])!.async("nodebuffer");
        assert(pngs[index].endsWith(`-${index + 1}of3.png`), "ZIP slide order changed");
        const meta = await sharp(png).metadata();
        const name = `${packId}-${type}-${size}-${index}`;
        await writeFile(`${output}/${name}-export.png`, png);
        await page.setViewport({ width: meta.width!, height: meta.height!, deviceScaleFactor: 1 });
        await page.evaluate(async ({ slide, size, width, packId }) => {
          const load = new Function("path", "return import(path)") as (p: string) => Promise<any>;
          const [{ default: React }, { default: ReactDOM }, { SlidePreview }] = await Promise.all([
            load("/node_modules/.vite/deps/react.js"), load("/node_modules/.vite/deps/react-dom_client.js"),
            load("/src/components/weekend-carousel/slide-preview.tsx"),
          ]);
          const g = globalThis as any;
          const document = g.document;
          const requestAnimationFrame = g.requestAnimationFrame.bind(g);
          g.auditRoot?.unmount();
          document.querySelector("#audit-preview")?.remove();
          const host = document.createElement("div");
          host.id = "audit-preview";
          Object.assign(host.style, { position: "fixed", left: "0", top: "0", width: `${width}px`, zIndex: "2147483647" });
          document.body.append(host);
          g.auditRoot = ReactDOM.createRoot(host);
          g.auditRoot.render(React.createElement(SlidePreview, { slide, size, packId }));
          await new Promise(r => setTimeout(r, 100));
          const frame = host.querySelector("[data-testid^=slide-] > div");
          if (!frame) throw new Error("Preview frame missing");
          frame.style.maxWidth = "none";
          frame.style.border = "0";
          frame.style.borderRadius = "0";
          await document.fonts.ready;
          await Promise.all([...host.querySelectorAll("img")].map((img: any) => img.decode()));
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }, { slide, size, packId, width: meta.width! });
        const card: ElementHandle | null = await page.$("#audit-preview [data-testid^=slide-] > div > div");
        assert(card);
        const preview: Buffer = Buffer.from(await card.screenshot());
        await writeFile(`${output}/${name}-preview.png`, preview);
        const a = await sharp(png).ensureAlpha().raw().toBuffer();
        const b: Buffer = await sharp(preview).ensureAlpha().raw().toBuffer();
        assert.equal(a.length, b.length, `${name}: dimensions differ`);
        let totalDifference = 0;
        for (let i = 0; i < a.length; i++) totalDifference += Math.abs(a[i] - b[i]);
        // A scaled React preview and native screenshot can use slightly
        // different glyph-edge antialiasing, especially with four innings.
        // Bound raw error tightly AND compare mildly blurred pixels to catch
        // actual layout/crop changes without treating hinting as lost content.
        const blurredA = await sharp(png).blur(1).ensureAlpha().raw().toBuffer();
        const blurredB = await sharp(preview).blur(1).ensureAlpha().raw().toBuffer();
        let blurredDifference = 0;
        for (let i = 0; i < blurredA.length; i++) blurredDifference += Math.abs(blurredA[i] - blurredB[i]);
        assert(totalDifference / a.length < 1 && blurredDifference / blurredA.length < .5,
          `${name}: preview/export pixels differ (raw ${totalDifference / a.length}, blurred ${blurredDifference / blurredA.length})`);
        await checkLogoGeometry(page, slide, meta.width!, meta.height!);
      }
      await db.delete(socialDraftsTable).where(eq(socialDraftsTable.id, draft.id));
      objects.clear();
      passed++;
      console.log(`PASS ${packId}/${type}/${size}: real ZIP, crops, sponsor roles, geometry and preview pixels`);
    }
    }
  }
  // Sparse and crowded grids, including incomplete final rows. These are
  // geometry checks on the real native renderer; ZIP parity is covered above.
  for (const packId of packs) {
  for (const size of sizes) {
    for (const count of [0, 1, 2, 5, 10, 18, 25]) {
      const sponsors = Array.from({ length: count }, (_, i) => ({
        name: `Grid ${i}`, logoUrl: url(["wide", "tall", "square", "padded"][i % 4]),
      }));
      const input = {
        kind: "matchDay", grade: "", oppositionName: "", date: "", startTime: "", venue: "", homeAway: "HOME",
        carouselPage: { page: "sponsors", title: "Image audit", sponsors },
      };
      const native = await page.evaluate(async (payload) => {
        const g = globalThis as any;
        g.auditRoot?.unmount();
        g.document.querySelector("#audit-preview")?.remove();
        return g.__cardRenderHarness.renderStill(payload);
      }, { input, options: { size, packId, junior: false, sponsorsOn: false, strictImages: true,
        data: { brand: fixture.brand, sponsors: [], hashtag: "#ImageAudit" } } });
      await page.setViewport({ width: native.width, height: native.height });
      await checkLogoGeometry(page, { label: `Closing grid ${count}` } as QueuedCarouselSlide,
        native.width, native.height, "#pack-still-root");
    }
  }
  }
  // Broken selected artwork must fail the actual export, not return a partial
  // success. No stored blob may be written before all slides render.
  const brokenInput = {
    kind: "matchDay", weekendCarousel: {
      version: 1, submissionId: randomUUID(), setType: "matchDay", size: "square",
      slides: ["title", "content", "sponsors"].map((id, index) => ({
        id, label: id, junior: false, sponsorsOn: true, warnings: [],
        input: { kind: "matchDay", grade: "A Grade", oppositionName: "Visitors",
          ...(index !== 1 ? { carouselPage: { page: index === 0 ? "title" : "sponsors", title: "Failure check", sponsors: [] } } : {}) },
        data: { brand: fixture.brand, sponsors: [{ name: "Broken artwork", logoUrl: `${assetOrigin}/missing.png` }] },
      })),
    },
  };
  const [brokenDraft] = await db.insert(socialDraftsTable).values({
    tenantId, engine: "ondemand", cardInput: brokenInput, caption: "Failure check", status: "awaiting_review",
  }).returning();
  const failed = await request(app).post(`/api/social-drafts/${brokenDraft.id}/post-pack`)
    .set("x-forwarded-host", "localhost:80").set("x-forwarded-proto", "http")
    .set("x-tenant-id", String(tenantId)).set("Cookie", cookie).expect(500);
  assert.match(failed.body.error, /image/i);
  assert.equal(objects.size, 0, "Failed export wrote partial output");
  console.log(`PASS ${passed} carousel image audit cases. Images and ZIPs: ${output}`);
} catch (error) {
  if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await closeBrowser();
  setPhotoStore(null);
  await new Promise<void>(resolve => assetServer.close(() => resolve()));
  if (tenantId) {
    await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  }
}

async function checkLogoGeometry(page: Page, slide: QueuedCarouselSlide, width: number, height: number, selector = "#audit-preview") {
  const failures = await page.evaluate(({ width, height, selector }) => {
    const problems: string[] = [];
    const g = globalThis as any;
    const host = g.document.querySelector(selector);
    const getComputedStyle = g.getComputedStyle.bind(g);
    const boxes = [...host.querySelectorAll("[data-weekend-sponsor]")].map(e => e.getBoundingClientRect());
    for (const panel of host.querySelectorAll("[data-innings]")) {
      for (const element of [panel, ...panel.querySelectorAll("*")]) {
        const rect = element.getBoundingClientRect();
        if (rect.top < -1 || rect.bottom > height + 1 || rect.left < -1 || rect.right > width + 1) {
          problems.push("Innings information is outside the card");
        }
      }
    }
    for (const b of boxes) {
      if (Math.abs(b.width / b.height - 2) > .03) problems.push("Sponsor tile is not 2:1");
      if (Math.abs(b.width - boxes[0].width) > 1 || Math.abs(b.height - boxes[0].height) > 1) problems.push("Sponsor tiles have unequal sizes");
    }
    for (const image of host.querySelectorAll("img")) {
      // Fixture photo is intentionally cropped; logos must remain contained.
      if (image.src.endsWith("/photo.png")) continue;
      // The Club Kit's low-opacity oversized crest is a decorative watermark,
      // deliberately clipped at the card edges; not a sponsor/header logo.
      let watermark = false;
      for (let p = image.parentElement; p && p !== host; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (Number(s.opacity) < .1 && s.pointerEvents === "none") watermark = true;
      }
      if (watermark) continue;
      const style = getComputedStyle(image);
      const element = image.getBoundingClientRect();
      if (!image.naturalWidth || !image.naturalHeight) problems.push("Logo did not decode");
      if (style.objectFit !== "contain") problems.push(`Logo is cropped or stretched: ${image.src.split("/").at(-1)} (${style.objectFit})`);
      if (style.transform !== "none") problems.push("Photo zoom leaked onto a logo");
      // object-fit contains the artwork, not necessarily the replaced element's
      // box. Check the painted bounds so intentional slot clipping is not
      // mistaken for clipped logo detail.
      const scale = Math.min(element.width / image.naturalWidth, element.height / image.naturalHeight);
      const paintedWidth = image.naturalWidth * scale;
      const paintedHeight = image.naturalHeight * scale;
      const b = {
        left: element.left + (element.width - paintedWidth) / 2,
        right: element.left + (element.width + paintedWidth) / 2,
        top: element.top + (element.height - paintedHeight) / 2,
        bottom: element.top + (element.height + paintedHeight) / 2,
      };
      const label = `${image.src.split("/").at(-1)} ${JSON.stringify(b)}`;
      if (b.left < -1 || b.top < -1 || b.right > width + 1 || b.bottom > height + 1) problems.push(`Logo is outside the card: ${label}`);
      for (let p = image.parentElement; p && p !== host; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflow === "hidden" || s.overflow === "clip") {
          const parent = p.getBoundingClientRect();
          if (b.left < parent.left - 1 || b.right > parent.right + 1 ||
            b.top < parent.top - 1 || b.bottom > parent.bottom + 1) problems.push(`Logo is clipped by its container: ${label}`);
        }
      }
    }
    return problems;
  }, { width, height, selector });
  assert.deepEqual(failures, [], `${slide.label}: ${failures.join(", ")}`);
}
