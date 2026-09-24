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

  it("another tenant's draft is 404", async () => {
    const foreign = await draft({}, otherTenantId);
    expect((await post(foreign.id)).status).toBe(404);
  });
});
