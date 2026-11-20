/**
 * Change photo (Nov 2026): a set draft slide's own photo
 * (`arrangement.ownPhotos` in the set design). Saved and read back per slide,
 * refused when it isn't the club's library photo or (on a junior slide)
 * approved junior stock, drawn by the post render exactly as the editor's
 * preview draws it (`applySlidePhoto`), and dropped on render when it no
 * longer passes. Also the photo pool for Random and a single card's Back to
 * automatic photo. Real-DB integration test (needs DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  captionTemplatesTable,
  clubPhotoPlayersTable,
  clubPhotosTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  socialDraftRevisionsTable,
  socialDraftsTable,
  socialSettingsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import {
  applySlidePhoto,
  assembleSetDocument,
  mapCarouselSlides,
  type SetDocument,
  type SlidePhoto,
} from "@workspace/scorecard/kind-templates";
import { carouselSlideData, readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { documentCoverage } from "../lib/template-library/coverage";
import { renderDraftSlides, setStillRenderer } from "../lib/draft-render";
import { logger } from "../lib/logger";

const STAMP = Date.now();
const LOOK = `cp-${STAMP}`;
let tenantId: number;
let otherTenantId: number;
let adminId: number;
let cookie: string;
let templateId: number;
const photos: Record<string, { id: number; url: string }> = {};

const box = { x: 5, y: 5, w: 90, h: 20 };
const shape = (id: string) => ({
  id,
  kind: "shape" as const,
  geometry: { square: box, portrait: box, story: box, landscape: box },
});
const kindDoc = (pages: string[]) => ({
  formatVersion: 2,
  pages: Object.fromEntries(pages.map((p) => [p, { layers: [shape(`cp-${p}`)] }])),
});
const DOCS: Record<string, unknown> = {
  matchDay: kindDoc(["fixture", "title", "sponsors"]),
  teamList: kindDoc(["team"]),
  teamListRound: kindDoc(["card"]),
};

async function libraryPhoto(
  name: string,
  over: Partial<typeof clubPhotosTable.$inferInsert> = {},
  tenant = tenantId,
) {
  const objectPath = `/objects/library/${LOOK}-${name}`;
  const [row] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId: tenant,
      objectPath,
      thumbPath: `${objectPath}-thumb`,
      width: 1600,
      height: 1200,
      grade: "A Grade",
      ...over,
    })
    .returning();
  photos[name] = { id: row!.id, url: `/api/storage${objectPath}` };
  return photos[name]!;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-slide-photos";
  const tenants = await db
    .insert(tenantsTable)
    .values(
      [0, 1].map((n) => ({
        slug: `cp-${STAMP}-${n}`,
        centralClubId: 4_300_000 + (STAMP % 100_000) + n,
        name: `Photo Club ${n}`,
        plan: "pro",
      })),
    )
    .returning();
  tenantId = tenants[0]!.id;
  otherTenantId = tenants[1]!.id;
  const [a] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `cp_${STAMP}`, displayName: "CP", passwordHash: "x" })
    .returning();
  adminId = a!.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  const [l] = await db
    .insert(templateLooksTable)
    .values({ slug: LOOK, name: LOOK, origin: "bundle" })
    .returning();
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      slug: `${LOOK}/matchDay`,
      lookId: l!.id,
      kind: "matchDay",
      name: "matchDay (test)",
      origin: "bundle",
      listed: true,
    })
    .returning();
  templateId = t!.id;
  await db.insert(libraryTemplateVersionsTable).values({
    templateId,
    version: 1,
    document: DOCS.matchDay,
    coverage: documentCoverage(DOCS.matchDay, "matchDay"),
    fitStatus: "pass",
  });
  await libraryPhoto("auto-1");
  await libraryPhoto("auto-2");
  await libraryPhoto("own", { focusBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
  await libraryPhoto("stock", { grade: null, juniorStock: true });
  await libraryPhoto("tagged", { grade: "B Grade" });
  await db
    .insert(clubPhotoPlayersTable)
    .values({ tenantId, photoId: photos.tagged!.id, playerId: 7001 });
  await libraryPhoto("elsewhere", {}, otherTenantId);
});

afterEach(() => setStillRenderer(null));

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, tenants));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenants));
  await db
    .delete(socialDraftRevisionsTable)
    .where(inArray(socialDraftRevisionsTable.tenantId, tenants));
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(clubPhotoPlayersTable).where(inArray(clubPhotoPlayersTable.tenantId, tenants));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenants));
  await db.delete(libraryTemplatesTable).where(eq(libraryTemplatesTable.id, templateId));
  await db.delete(templateLooksTable).where(eq(templateLooksTable.slug, LOOK));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const api = (method: "get" | "put" | "post" | "patch", path: string) =>
  request(app)[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));

const slide = (id: string, input: Record<string, unknown>, data = {}, junior = false) => ({
  id,
  label: id,
  junior,
  sponsorsOn: false,
  warnings: [],
  input: junior && !input.carouselPage ? { ...input, junior: true } : input,
  data,
});
const title = () =>
  slide("title", {
    kind: "matchDay",
    carouselPage: { page: "title", title: "This weekend", sponsors: [] },
  });

async function carousel(slides: ReturnType<typeof slide>[]) {
  const res = await api("post", "/social-drafts").send({
    caption: "This weekend",
    cardInput: {
      kind: "matchDay",
      weekendCarousel: {
        version: 3,
        templateRef: { libraryTemplateId: templateId, version: 1 },
        setType: "matchDay",
        submissionId: randomUUID(),
        size: "square",
        slides,
      },
    },
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

const seniorCarousel = () =>
  carousel([
    title(),
    slide("fx-1", { kind: "matchDay", grade: "A Grade" }, { photoUrl: photos["auto-1"]!.url }),
    slide("fx-2", { kind: "matchDay", grade: "B Grade" }, { photoUrl: photos["auto-2"]!.url }),
  ]);

const choiceOf = (name: string): SlidePhoto => ({
  photoId: photos[name]!.id,
  url: photos[name]!.url,
});

async function designOf(id: number): Promise<SetDocument> {
  const res = await api("get", `/social-drafts/${id}/set-design`);
  expect(res.status).toBe(200);
  return res.body.document as SetDocument;
}

const withChoice = (doc: SetDocument, ownPhotos: Record<string, SlidePhoto>): SetDocument => ({
  ...doc,
  arrangement: { order: [], removed: [], ...doc.arrangement, ownPhotos },
});

const save = (id: number, document: SetDocument) =>
  api("put", `/social-drafts/${id}/set-design`).send({ document });

type Captured = { input: Record<string, unknown>; data: Record<string, unknown> };
async function captureRender(id: number): Promise<Captured[]> {
  const seen: Captured[] = [];
  setStillRenderer(async (input, options) => {
    seen.push({ input: input as Captured["input"], data: (options as Captured).data });
    const buffer = await sharp({
      create: { width: 4, height: 4, channels: 4, background: "#123456" },
    })
      .png()
      .toBuffer();
    return { buffer, contentType: "image/png", warnings: [] };
  });
  const [row] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id));
  await renderDraftSlides(row!, ["square"], null, logger);
  return seen;
}

describe("a queued carousel slide's own photo", () => {
  it("saves on that slide only, for every size, and reads back after a reload", async () => {
    const id = await seniorCarousel();
    const doc = await designOf(id);
    const res = await save(
      id,
      withChoice(doc, { "fx-1": { ...choiceOf("own"), focus: undefined } }),
    );
    expect(res.status).toBe(200);
    const again = await designOf(id);
    // The server takes the framing from the library (the photo's focus box).
    expect(again.arrangement?.ownPhotos).toEqual({
      "fx-1": {
        ...choiceOf("own"),
        focus: { box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, width: 1600, height: 1200 },
      },
    });
    // The slides' own data is untouched: the automatic photos stay where they were.
    const wc = readQueuedCarousel(res.body.cardInput)!;
    expect(wc.slides.find((s) => s.id === "fx-1")!.data.photoUrl).toBe(photos["auto-1"]!.url);
  });

  it("goes with its slide when the slide is deleted", async () => {
    const id = await seniorCarousel();
    const doc = await designOf(id);
    const res = await save(id, {
      ...withChoice(doc, { "fx-1": choiceOf("own") }),
      arrangement: { order: [], removed: ["fx-1"], ownPhotos: { "fx-1": choiceOf("own") } },
    });
    expect(res.status).toBe(200);
    expect((await designOf(id)).arrangement?.ownPhotos).toBeUndefined();
  });

  it("refuses a photo that isn't this club's library photo at that address", async () => {
    const id = await seniorCarousel();
    const doc = await designOf(id);
    const other = await save(id, withChoice(doc, { "fx-1": choiceOf("elsewhere") }));
    expect(other.status).toBe(400);
    const moved = await save(
      id,
      withChoice(doc, { "fx-1": { ...choiceOf("own"), url: photos["auto-2"]!.url } }),
    );
    expect(moved.status).toBe(400);
    expect((await designOf(id)).arrangement?.ownPhotos).toBeUndefined();
  });

  it("draws in the post render exactly as the editor's preview does (render parity)", async () => {
    const id = await seniorCarousel();
    const doc = await designOf(id);
    expect((await save(id, withChoice(doc, { "fx-2": choiceOf("own") }))).status).toBe(200);
    const [row] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id));
    const set = row!.adjustments as SetDocument;
    const stored = readQueuedCarousel(row!.cardInput)!;
    const byId = new Map(stored.slides.map((s) => [s.id, s]));
    // The editor's preview data (cricket-club `setDraftSlides`) for every slide.
    const preview = mapCarouselSlides(set, stored.slides).slides.map((s) =>
      applySlidePhoto(
        { input: s.input, data: carouselSlideData(stored, byId.get(s.key)!), junior: false },
        set.arrangement?.ownPhotos?.[s.key],
      ),
    );
    const seen = await captureRender(id);
    expect(seen.map((s) => s.data.photoUrl)).toEqual([
      undefined,
      photos["auto-1"]!.url,
      photos.own!.url,
    ]);
    expect(seen.map((s) => ({ input: s.input, data: s.data }))).toEqual(
      preview.map((p) => ({ input: p.input, data: p.data })),
    );
  });

  it("is dropped on render once the photo has left the library (fails closed)", async () => {
    const gone = await libraryPhoto(`gone-${randomUUID()}`);
    const id = await seniorCarousel();
    const doc = await designOf(id);
    const choice = { photoId: gone.id, url: gone.url };
    expect((await save(id, withChoice(doc, { "fx-1": choice }))).status).toBe(200);
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.id, gone.id));
    const seen = await captureRender(id);
    expect(seen[1]!.data.photoUrl).toBe(photos["auto-1"]!.url);
  });
});

describe("a junior slide's own photo", () => {
  const juniorCarousel = () =>
    carousel([
      title(),
      slide("jr-1", { kind: "matchDay", grade: "Under 13" }, {}, true),
      slide("fx-1", { kind: "matchDay", grade: "A Grade" }, { photoUrl: photos["auto-1"]!.url }),
    ]);

  it("refuses a club library photo that isn't approved junior stock", async () => {
    const id = await juniorCarousel();
    const doc = await designOf(id);
    const res = await save(id, withChoice(doc, { "jr-1": choiceOf("own") }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved junior stock/);
    expect((await designOf(id)).arrangement?.ownPhotos).toBeUndefined();
  });

  it("takes approved junior stock, and the render draws it behind the junior marker", async () => {
    const id = await juniorCarousel();
    const doc = await designOf(id);
    // The senior slide beside it may take any library photo.
    const res = await save(
      id,
      withChoice(doc, { "jr-1": choiceOf("stock"), "fx-1": choiceOf("own") }),
    );
    expect(res.status).toBe(200);
    const seen = await captureRender(id);
    const junior = seen.find((s) => s.input.junior === true)!;
    expect(junior.data.photoUrl).toBe(photos.stock!.url);
    expect(junior.input).toMatchObject({
      juniorPhotoAllowed: true,
      juniorStockPhotoId: photos.stock!.id,
    });
    expect(seen.find((s) => s.input.grade === "A Grade")!.data.photoUrl).toBe(photos.own!.url);
  });

  it("is dropped on render if its photo is no longer junior stock (fails closed)", async () => {
    const was = await libraryPhoto(`was-stock-${randomUUID()}`, { grade: null, juniorStock: true });
    const id = await juniorCarousel();
    const doc = await designOf(id);
    const choice = { photoId: was.id, url: was.url };
    expect((await save(id, withChoice(doc, { "jr-1": choice }))).status).toBe(200);
    await db
      .update(clubPhotosTable)
      .set({ juniorStock: false })
      .where(eq(clubPhotosTable.id, was.id));
    const seen = await captureRender(id);
    const junior = seen.find((s) => s.input.junior === true)!;
    expect(junior.data.photoUrl).toBeUndefined();
    expect(junior.input.juniorPhotoAllowed).toBeUndefined();
  });

  it("the pool for a junior slide is approved junior stock only", async () => {
    const id = await juniorCarousel();
    const res = await api("get", `/social-drafts/${id}/photo-pool?slide=jr-1`);
    expect(res.status).toBe(200);
    expect(res.body.junior).toBe(true);
    expect(res.body.photoIds).toContain(photos.stock!.id);
    expect(res.body.photoIds).not.toContain(photos.own!.id);
    expect(res.body.photoIds).not.toContain(photos["auto-1"]!.id);
  });
});

describe("a Round Team Lists slide's own photo", () => {
  async function roundDraft(junior = false) {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "teamlists-round",
        status: "awaiting_review",
        cardInput: {
          kind: "teamListRound",
          roundLabel: "Round 5",
          date: "Sat 14 Feb",
          ...(junior ? { junior: true } : {}),
          teams: ["A Grade", "B Grade"].map((grade) => ({
            grade,
            players: [{ surname: "Smith", order: 1 }],
          })),
        },
        appPath: "/fixtures",
        sourceKey: `teamlists-round:${randomUUID()}`,
        sourceMatchIsJunior: junior,
        packId: "blank",
        templateVersion: 1,
        photoUrl: photos["auto-1"]!.url,
        adjustments: assembleSetDocument("teamLists", (k) => DOCS[k])!.document,
      })
      .returning();
    return row!.id;
  }

  it("draws on that team's slide only", async () => {
    const id = await roundDraft();
    const doc = await designOf(id);
    const res = await save(id, withChoice(doc, { "detail:senior:B Grade": choiceOf("own") }));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.adjustments.arrangement.ownPhotos)).toEqual([
      "detail:senior:B Grade",
    ]);
    const seen = await captureRender(id);
    const urls = seen.map((s) => [s.input.grade ?? s.input.kind, s.data.photoUrl]);
    expect(urls).toContainEqual(["B Grade", photos.own!.url]);
    expect(urls).toContainEqual(["A Grade", photos["auto-1"]!.url]);
  });

  it("refuses a library photo on a junior round", async () => {
    const id = await roundDraft(true);
    const doc = await designOf(id);
    const res = await save(id, withChoice(doc, { "detail:senior:A Grade": choiceOf("own") }));
    expect(res.status).toBe(400);
  });

  it("the pool for a team slide is its grade's photos when no player is known", async () => {
    const id = await roundDraft();
    const res = await api(
      "get",
      `/social-drafts/${id}/photo-pool?slide=${encodeURIComponent("detail:senior:B Grade")}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ junior: false, photoIds: [photos.tagged!.id], playerIds: [] });
  });
});

describe("a single card's photo", () => {
  async function card(over: Partial<typeof socialDraftsTable.$inferInsert> = {}) {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "manual",
        status: "awaiting_review",
        cardInput: { kind: "player", name: "Pat Smith", grade: "B Grade" },
        appPath: "/",
        sourceKey: `card:${randomUUID()}`,
        subjectPlayerId: 7001,
        photoUrl: photos.own!.url,
        photoSource: "manual",
        ...over,
      })
      .returning();
    return row!.id;
  }

  it("the pool is the card's player's tagged photos", async () => {
    const id = await card();
    const res = await api("get", `/social-drafts/${id}/photo-pool`);
    expect(res.body).toEqual({ junior: false, photoIds: [photos.tagged!.id], playerIds: [7001] });
  });

  it("goes back to the automatic photo, and stays automatic", async () => {
    const id = await card();
    const res = await api("patch", `/social-drafts/${id}`).send({ photoAuto: true });
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toBe(photos.tagged!.url);
    const [row] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id));
    expect(row!.photoSource).not.toBe("manual");
  });

  it("refuses Back to automatic with a photo, and on a junior card", async () => {
    const id = await card();
    const both = await api("patch", `/social-drafts/${id}`).send({
      photoAuto: true,
      photoUrl: photos.own!.url,
    });
    expect(both.status).toBe(400);
    const junior = await card({
      sourceMatchIsJunior: true,
      cardInput: { kind: "player", name: "Riley T.", junior: true },
      photoUrl: null,
      photoSource: null,
    });
    const res = await api("patch", `/social-drafts/${junior}`).send({ photoAuto: true });
    expect(res.status).toBe(400);
  });
});
