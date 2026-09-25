/**
 * Social Studio automation U6 — the club photo library routes: batch ingest
 * with per-file errors, batch tagging, senior-only tags, upload limits and
 * tenant isolation. Real-DB integration test (needs DATABASE_URL); object
 * storage is replaced by an in-memory store.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";

const STAMP = Date.now();
const objects = new Map<string, Buffer>();
let counter = 0;
const memoryStore: PhotoStore = {
  async read(path) {
    const data = objects.get(path);
    if (!data) throw new Error("missing object");
    return data;
  },
  async write(data) {
    const path = `/objects/library/test-${STAMP}-${counter++}`;
    objects.set(path, data);
    return path;
  },
  async remove(path) {
    objects.delete(path);
  },
};

let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;
const playerIds: number[] = [];

async function upload(name: string, data: Buffer): Promise<string> {
  const path = `/objects/uploads/${STAMP}-${name}`;
  objects.set(path, data);
  return path;
}

const jpeg = (w = 64, h = 48) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#00305c" } })
    .jpeg()
    .toBuffer();

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-club-photos";
  setPhotoStore(memoryStore);
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `photos-${STAMP}`, centralClubId: 9951, name: "Photo Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `photos-o-${STAMP}`, centralClubId: 9952, name: "Other", plan: "pro" })
    .returning();
  otherTenantId = o.id;
  for (const [tid, key] of [
    [tenantId, "a"],
    [otherTenantId, "b"],
  ] as const) {
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tid,
        username: `photos_${key}_${STAMP}`,
        displayName: "Photo Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    const c = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    if (tid === tenantId) cookie = c;
    else otherCookie = c;
  }
  const players = await db
    .insert(playersTable)
    .values([
      { surname: `Lens${STAMP}`, givenName: "Pat" },
      { surname: `Shutter${STAMP}`, givenName: "Kim" },
    ])
    .returning();
  playerIds.push(...players.map((p) => p.id));
});

afterAll(async () => {
  setPhotoStore(null);
  await db
    .delete(clubPhotosTable)
    .where(inArray(clubPhotosTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

const api = (method: "get" | "post", path: string, as: "own" | "other" = "own") => {
  const agent = request(app);
  const req = method === "get" ? agent.get(`/api${path}`) : agent.post(`/api${path}`);
  return req
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));
};

describe("ingest", () => {
  it("converts a batch, returns per-file errors, and deletes the originals", async () => {
    const good = await upload("good.jpg", await jpeg());
    const png = await upload(
      "wide.png",
      await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#fff" } })
        .png()
        .toBuffer(),
    );
    const heicHeader = Buffer.alloc(12);
    heicHeader.writeUInt32BE(24, 0);
    heicHeader.write("ftypheic", 4, "ascii");
    const badHeic = await upload("bad.heic", Buffer.concat([heicHeader, Buffer.alloc(512, 3)]));

    const res = await api("post", "/club-photos/ingest").send({
      objectPaths: [good, badHeic, png],
      season: 2025,
      grade: "A Grade",
      playerIds: [playerIds[0]],
    });
    expect(res.status).toBe(200);
    const [r1, r2, r3] = res.body.results;
    expect(r1).toMatchObject({ ok: true, photo: { grade: "A Grade", season: 2025 } });
    expect(r1.photo.playerIds).toEqual([playerIds[0]]);
    expect(r1.photo.url).toMatch(/^\/api\/storage\/objects\/library\//);
    expect(r2).toMatchObject({ ok: false, error: expect.stringMatching(/HEIC/) });
    expect(r3.ok).toBe(true);
    expect(r3.photo.width).toBe(2048);

    // Converted uploads are removed; the failed one is left for the admin.
    expect(objects.has(good)).toBe(false);
    expect(objects.has(png)).toBe(false);
    expect(objects.has(badHeic)).toBe(true);
  });

  it("rejects a batch over 50 files with a clear error", async () => {
    const paths = Array.from({ length: 60 }, (_, i) => `/objects/uploads/x-${i}`);
    const res = await api("post", "/club-photos/ingest").send({ objectPaths: paths });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/50/);
  });

  it("refuses to sign a HEIC upload over 25 MB", async () => {
    const res = await api("post", "/storage/uploads/request-url").send({
      name: "big.heic",
      size: 30 * 1024 * 1024,
      contentType: "image/heic",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/25MB/);
  });
});

describe("tags", () => {
  it("batch-tags ten photos with a grade and two players in one call", async () => {
    const paths = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => upload(`batch-${i}.jpg`, await jpeg())),
    );
    const ingest = await api("post", "/club-photos/ingest").send({ objectPaths: paths });
    const ids = ingest.body.results.map((r: { photo: { id: number } }) => r.photo.id);

    const res = await api("post", "/club-photos/tags").send({
      photoIds: ids,
      grade: "B Grade",
      addPlayerIds: playerIds,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    for (const p of res.body) {
      expect(p.grade).toBe("B Grade");
      expect(p.playerIds).toEqual([...playerIds].sort((a, b) => a - b));
    }
    const tags = await db
      .select()
      .from(clubPhotoPlayersTable)
      .where(inArray(clubPhotoPlayersTable.photoId, ids));
    expect(tags).toHaveLength(20);

    const byPlayer = await api("get", `/club-photos?playerId=${playerIds[1]}`);
    expect(byPlayer.body.map((p: { id: number }) => p.id).sort()).toEqual([...ids].sort());
  });

  it("tagging a non-senior player (junior participant or fill-in) is 422", async () => {
    const [photo] = await db
      .select()
      .from(clubPhotosTable)
      .where(eq(clubPhotosTable.tenantId, tenantId))
      .limit(1);
    for (const bad of [987654321, 90001]) {
      const res = await api("post", "/club-photos/tags").send({
        photoIds: [photo.id],
        addPlayerIds: [bad],
      });
      expect(res.status).toBe(422);
      expect(res.body.playerIds).toEqual([bad]);
    }
  });
});

describe("tenant isolation", () => {
  it("another club cannot list, tag or delete these photos", async () => {
    const own = await api("get", "/club-photos");
    expect(own.body.length).toBeGreaterThan(0);
    const id = own.body[0].id;

    const list = await api("get", "/club-photos", "other");
    expect(list.status).toBe(200);
    expect(list.body.some((p: { id: number }) => p.id === id)).toBe(false);
    expect(
      (await api("post", "/club-photos/tags", "other").send({ photoIds: [id], grade: "X" })).status,
    ).toBe(404);
    expect(
      (await api("post", "/club-photos/delete", "other").send({ photoIds: [id] })).status,
    ).toBe(404);

    const del = await api("post", "/club-photos/delete").send({ photoIds: [id] });
    expect(del.body).toEqual({ deleted: 1 });
  });
});

describe("Google Drive import", () => {
  it("is hidden (404) until all three Google keys are set", async () => {
    const saved = {
      id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      key: process.env.GOOGLE_DRIVE_API_KEY,
      app: process.env.GOOGLE_DRIVE_APP_ID,
    };
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    delete process.env.GOOGLE_DRIVE_API_KEY;
    delete process.env.GOOGLE_DRIVE_APP_ID;
    try {
      expect((await api("get", "/club-photos/google-drive")).status).toBe(404);
      const fetchRes = await api("post", "/club-photos/google-drive/fetch").send({
        accessToken: "t",
        fileIds: ["1AbCdEfGhIjKlMnOp"],
      });
      expect(fetchRes.status).toBe(404);

      process.env.GOOGLE_DRIVE_CLIENT_ID = "cid.apps.googleusercontent.com";
      process.env.GOOGLE_DRIVE_API_KEY = "AIzaKey";
      process.env.GOOGLE_DRIVE_APP_ID = "123456";
      const cfg = await api("get", "/club-photos/google-drive");
      expect(cfg.status).toBe(200);
      expect(cfg.body).toEqual({
        clientId: "cid.apps.googleusercontent.com",
        apiKey: "AIzaKey",
        appId: "123456",
      });
      // A bad body is refused before any Google call.
      const bad = await api("post", "/club-photos/google-drive/fetch").send({ fileIds: [] });
      expect(bad.status).toBe(400);
    } finally {
      for (const [k, v] of [
        ["GOOGLE_DRIVE_CLIENT_ID", saved.id],
        ["GOOGLE_DRIVE_API_KEY", saved.key],
        ["GOOGLE_DRIVE_APP_ID", saved.app],
      ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("needs an admin", async () => {
    const res = await request(app)
      .get("/api/club-photos/google-drive")
      .set("x-tenant-id", String(tenantId));
    expect(res.status).toBe(401);
  });
});
