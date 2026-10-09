/**
 * Social Studio U10 — the post pack endpoint: a PNG per enabled format, the
 * caption, and a zip of both; junior drafts render in the juniors palette
 * with no photo; other tenants get 404. Real-DB integration test (needs
 * DATABASE_URL); the still renderer and object storage are stubbed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialDraftsTable,
  socialSettingsTable,
  captionTemplatesTable,
  cardTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";
import { setStillRenderer } from "./post-pack";

const STAMP = Date.now();
const objects = new Map<string, Buffer>();
let n = 0;
const store: PhotoStore = {
  async read(p) {
    return objects.get(p)!;
  },
  async write(data) {
    const p = `/objects/library/pack-${STAMP}-${n++}`;
    objects.set(p, data);
    return p;
  },
  async remove(p) {
    objects.delete(p);
  },
};
const renders: Array<{ input: Record<string, unknown>; options: Record<string, unknown> }> = [];

let tenantId: number;
let otherTenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-post-pack";
  setPhotoStore(store);
  setStillRenderer(async (input, options) => {
    renders.push({
      input: input as Record<string, unknown>,
      options: options as Record<string, unknown>,
    });
    return {
      buffer: Buffer.from(`png:${(options as { size: string }).size}`),
      contentType: "image/png",
    };
  });
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `pack-${STAMP}`, centralClubId: 9991, name: "Pack Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `pack-o-${STAMP}`, centralClubId: 9992, name: "Other", plan: "pro" })
    .returning();
  otherTenantId = o.id;
  await db.insert(socialSettingsTable).values({
    tenantId,
    sizeSquare: true,
    sizePortrait: false,
    sizeStory: true,
    clubHashtag: "#PackClub",
  });
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `pack_${STAMP}`, displayName: "Pack", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  setPhotoStore(null);
  setStillRenderer(null);
  await db
    .delete(socialDraftsTable)
    .where(inArray(socialDraftsTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

async function draft(values: Partial<typeof socialDraftsTable.$inferInsert>, tenant = tenantId) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId: tenant,
      engine: "milestone",
      status: "ready",
      cardInput: { kind: "century", playerName: "Sam Keeper", runs: 104 },
      appPath: "/players/1",
      ...values,
    })
    .returning();
  return row;
}

const post = (id: number) =>
  request(app)
    .post(`/api/social-drafts/${id}/post-pack`)
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId));

describe("POST /social-drafts/:id/post-pack", () => {
  it.each(["teamList", "results", "matchSummary"])("saves and exports a frozen %s carousel without changing review status", async setType => {
    const input = setType === "teamList"
      ? { kind: "teamList", players: [{ order: 1, surname: "KEEPER", role: "C/WK" }] }
      : { kind: "matchSummary", club: { name: "Club" }, opposition: { name: "Visitors" }, result: "Won",
        carouselDetail: setType === "matchSummary",
        innings: [{ teamKey: "club", totalRuns: "200", wickets: "6", topBatters: [], topBowlers: [] }] };
    const slides = ["title", "team-b", "team-a", "sponsors"].map((id, i) => ({
      id, label: id, junior: false, sponsorsOn: false, warnings: [],
      input: i === 0 || i === 3 ? { kind: "matchDay", carouselPage: { page: id, sponsors: [] } } : input,
      data: { photoUrl: "/frozen-photo.jpg", photoTransform: { focalX: .2, focalY: .8, zoom: 2 } },
    }));
    const caption = `Edited ${setType} caption`;
    const saved = await request(app).post("/api/social-drafts")
      .set("Cookie", cookie).set("x-tenant-id", String(tenantId))
      .send({ packId: "club-kit-v1", caption, cardInput: { kind: "matchDay", weekendCarousel: {
        version: 1, setType, submissionId: crypto.randomUUID(), size: "portrait", slides,
      } } });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect(saved.body.status).toBe("awaiting_review");
    renders.length = 0;
    const res = await post(saved.body.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(renders.map(r => r.input)).toEqual(slides.map(s => s.input));
    expect(renders.every(r => r.options.size === "portrait")).toBe(true);
    expect(renders[1].options.data).toEqual(slides[1].data);
    const zip = await JSZip.loadAsync(objects.get(String(res.body.zipUrl).replace("/api/storage", ""))!);
    expect(Object.keys(zip.files).filter(f => f.endsWith(".png"))).toHaveLength(4);
    expect(await zip.file("caption.txt")!.async("string")).toBe(caption);
    const [after] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, saved.body.id));
    expect(after.status).toBe("awaiting_review");
    expect(after.cardInput).toEqual(saved.body.cardInput);
    const forbidden = await request(app).post(`/api/social-drafts/${saved.body.id}/post-pack`)
      .set("x-tenant-id", String(otherTenantId));
    expect(forbidden.status).toBe(401);
  });
  it("renders a draft with no pack of its own in the club's pack for the kind, as the preview does", async () => {
    await db.insert(cardTemplatesTable).values({
      tenantId,
      name: "Club Kit",
      source: "pack",
      packId: "club-kit-v1",
      cardKinds: [],
      isActive: true,
      isDefault: true,
    });
    await db
      .update(socialSettingsTable)
      .set({ packColourModes: { "sunset-v1": "pack", "club-kit-v1": "club" } })
      .where(eq(socialSettingsTable.tenantId, tenantId));
    try {
      const d = await draft({ packId: null });
      renders.length = 0;
      expect((await post(d.id)).status).toBe(200);
      expect(renders.length).toBeGreaterThan(0);
      for (const r of renders) {
        expect(r.options.packId).toBe("club-kit-v1");
        // Only "pack's own look" choices ride along (as the Studio passes them).
        expect((r.options.data as Record<string, unknown>).packColourModes).toEqual({
          "sunset-v1": "pack",
        });
      }
      // A draft's own pack still wins.
      const own = await draft({ packId: "sunset-v1" });
      renders.length = 0;
      expect((await post(own.id)).status).toBe(200);
      expect(renders.every((r) => r.options.packId === "sunset-v1")).toBe(true);
    } finally {
      await db.delete(cardTemplatesTable).where(eq(cardTemplatesTable.tenantId, tenantId));
      await db
        .update(socialSettingsTable)
        .set({ packColourModes: {} })
        .where(eq(socialSettingsTable.tenantId, tenantId));
    }
  });

  it("returns an image per enabled format, the caption, and a zip of both plus caption.txt", async () => {
    const d = await draft({
      caption: "Sam 104* #PackClub",
      photoUrl: "/api/storage/objects/p.jpg",
      packId: "sunset-v1",
    });
    renders.length = 0;
    const res = await post(d.id);
    expect(res.status).toBe(200);
    expect(res.body.images.map((i: { size: string }) => i.size)).toEqual(["square", "story"]);
    expect(res.body.caption).toBe("Sam 104* #PackClub");

    const opts = renders[0].options as {
      packId: string;
      junior: boolean;
      data: { hashtag: string; photoUrl: string; brand: { name: string } };
    };
    expect(opts.packId).toBe("sunset-v1");
    expect(opts.junior).toBe(false);
    expect(opts.data.hashtag).toBe("#PackClub");
    expect(opts.data.photoUrl).toBe("/api/storage/objects/p.jpg");
    expect(opts.data.brand.name).toBeTruthy();

    const zipPath = String(res.body.zipUrl).replace("/api/storage", "");
    const zip = await JSZip.loadAsync(objects.get(zipPath)!);
    expect(Object.keys(zip.files).sort()).toEqual([
      "caption.txt",
      "century-square.png",
      "century-story.png",
    ]);
    expect(await zip.file("caption.txt")!.async("string")).toBe("Sam 104* #PackClub");
  });

  it("a junior draft renders in the juniors palette with no photo and its masked names", async () => {
    const d = await draft({
      engine: "matchSummary",
      sourceMatchIsJunior: true,
      photoUrl: "/api/storage/objects/should-not-appear.jpg",
      cardInput: {
        kind: "matchSummary",
        junior: true,
        topBatters: [{ name: "Private Player", runs: 30 }],
      },
    });
    renders.length = 0;
    expect((await post(d.id)).status).toBe(200);
    const { options, input } = renders[0];
    expect(options.junior).toBe(true);
    expect((options.data as { photoUrl: string | null }).photoUrl).toBeNull();
    expect(JSON.stringify(input)).toContain("Private Player");
  });

  it("a long round posts as a balanced set: cover + even slides, juniors apart, per-slide edits", async () => {
    const grades = ["A", "B", "C", "D", "FA", "FB", "T20", "V", "U17", "U15", "U13"];
    const d = await draft({
      engine: "roundFixtures",
      photoUrl: "/api/storage/objects/team.jpg",
      packId: "club-kit-v1",
      cardInput: {
        kind: "roundFixtures",
        roundLabel: "ROUND 15",
        date: "SAT 14 FEB",
        fixtures: grades.map((grade) => ({
          grade,
          opponent: "Opp",
          venue: "Oval",
          startTime: "1:00 PM",
        })),
      },
      adjustments: {
        fields: { headline: "Root" },
        slides: { "detail:junior:U17": { fields: { headline: "Juniors" } } },
      },
    });
    renders.length = 0;
    const res = await post(d.id);
    expect(res.status).toBe(200);
    // square + story, each: cover + 4 + 4 seniors + 3 juniors.
    const square = res.body.images.filter((i: { size: string }) => i.size === "square");
    expect(square.map((i: { page: number; of: number }) => `${i.page}/${i.of}`)).toEqual([
      "1/4",
      "2/4",
      "3/4",
      "4/4",
    ]);
    const squareRenders = renders.filter((r) => r.options.size === "square");
    const rows = squareRenders.map((r) => (r.input.fixtures as unknown[]).length);
    expect(rows).toEqual([11, 4, 4, 3]);
    expect(squareRenders[0].input.setRole).toBe("cover");
    // The junior slide: juniors palette, no photo, its own edits.
    const junior = squareRenders[3];
    expect(junior.options.junior).toBe(true);
    expect((junior.options.data as { photoUrl: string | null }).photoUrl).toBeNull();
    expect(junior.options.adjustments).toEqual({ fields: { headline: "Juniors" } });
    // Unedited slides carry no edits; seniors keep the photo.
    expect(squareRenders[1].options.adjustments).toBeNull();
    expect((squareRenders[1].options.data as { photoUrl: string }).photoUrl).toBe(
      "/api/storage/objects/team.jpg",
    );

    const zip = await JSZip.loadAsync(
      objects.get(String(res.body.zipUrl).replace("/api/storage", ""))!,
    );
    expect(Object.keys(zip.files)).toContain("roundFixtures-square-4of4.png");
  });

  it("another tenant's draft is 404", async () => {
    const foreign = await draft({}, otherTenantId);
    expect((await post(foreign.id)).status).toBe(404);
  });
});
