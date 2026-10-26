/**
 * Social Studio automation U6 — the club photo library routes: batch ingest
 * with per-file errors, batch tagging, senior-only tags, upload limits and
 * tenant isolation. Real-DB integration test (needs DATABASE_URL); object
 * storage is replaced by an in-memory store.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray, lt, max } from "drizzle-orm";
import sharp from "sharp";
import app from "../app";
import {
  db,
  getDb,
  tenantsTable,
  adminsTable,
  playersTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { taggedPlayerPhotoUrl } from "../lib/club-photo-library";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";
import { draftPhotoFocus } from "../lib/photo-focus-snapshot";
import { pickCandidatePhoto } from "../lib/draft-enrich";

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
  // The populated native sequence includes reserved cap/fill-in ids >= 90000.
  // Photo tags need regular senior ids, not whatever that sequence yields.
  const [regular] = await db
    .select({ maxId: max(playersTable.id) })
    .from(playersTable)
    .where(lt(playersTable.id, 90000));
  const firstPlayerId = (regular.maxId ?? 0) + 1;
  if (firstPlayerId + 1 >= 90000) throw new Error("No regular senior fixture ids available");
  const players = await db
    .insert(playersTable)
    .values([
      { id: firstPlayerId, surname: `Lens${STAMP}`, givenName: "Pat" },
      { id: firstPlayerId + 1, surname: `Shutter${STAMP}`, givenName: "Kim" },
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

const api = (method: "get" | "post" | "put", path: string, as: "own" | "other" = "own") => {
  const agent = request(app);
  const req =
    method === "get"
      ? agent.get(`/api${path}`)
      : method === "put"
        ? agent.put(`/api${path}`)
        : agent.post(`/api${path}`);
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

  it("saves a Premiership photo with the updated category rules", async () => {
    const original = await upload("premiership.jpg", await jpeg());
    const res = await api("post", "/club-photos/ingest").send({
      objectPaths: [original],
      grade: "D Grade",
      photoType: "premiership",
    });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({
      ok: true,
      photo: { grade: "D Grade", photoTypes: ["premiership"] },
    });
    expect(objects.has(original)).toBe(false);
  });

  it("explains an outdated photo-category constraint without blaming conversion or exposing SQL", async () => {
    const original = await upload("outdated-category.jpg", await jpeg());
    const postgresError = Object.assign(new Error("private database details"), {
      code: "23514",
      constraint: "club_photos_photo_types_check",
    });
    const insert = vi.spyOn(getDb(), "insert").mockImplementationOnce(() => {
      throw new Error("private SQL and parameters", { cause: postgresError });
    });
    try {
      const res = await api("post", "/club-photos/ingest").send({
        objectPaths: [original],
        grade: "D Grade",
        photoType: "premiership",
      });
      expect(res.status).toBe(200);
      const result = res.body.results[0];
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/converted successfully/i);
      expect(result.error).toMatch(/database.*photo category/i);
      expect(result.error).toMatch(/Unsorted/);
      expect(result.error).not.toMatch(/private|SQL|23514|club_photos/);
      expect(objects.has(original)).toBe(true);
    } finally {
      insert.mockRestore();
    }
  });

  it("distinguishes a library-save failure from a missing upload", async () => {
    const original = await upload("save-failure.jpg", await jpeg());
    const write = vi
      .spyOn(memoryStore, "write")
      .mockRejectedValueOnce(new Error("storage unavailable"));
    try {
      const saved = await api("post", "/club-photos/ingest").send({ objectPaths: [original] });
      expect(saved.body.results[0]).toMatchObject({
        ok: false,
        error:
          "The photo converted successfully, but could not be saved to the library. Please retry.",
      });
      expect(objects.has(original)).toBe(true);
    } finally {
      write.mockRestore();
    }
    const missing = await api("post", "/club-photos/ingest").send({
      objectPaths: [`/objects/uploads/${STAMP}-missing`],
    });
    expect(missing.body.results[0]).toMatchObject({
      ok: false,
      error: "This upload could not be read. Please retry the upload.",
    });
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

describe("profile photo from the library", () => {
  it("a player with no headshot gets a library photo they're tagged in, solo shots first", async () => {
    const [group, solo] = await Promise.all([
      upload("profile-group.jpg", await jpeg()),
      upload("profile-solo.jpg", await jpeg()),
    ]);
    const g = await api("post", "/club-photos/ingest").send({
      objectPaths: [group],
      playerIds,
    });
    const s = await api("post", "/club-photos/ingest").send({
      objectPaths: [solo],
      playerIds: [playerIds[0]],
    });
    const soloUrl = s.body.results[0].photo.url;
    expect(g.body.results[0].ok).toBe(true);

    // The helper behind GET /players/:id. This test club is a non-#1 native
    // tenant, so the stats route itself fails closed (409) by design.
    expect(await taggedPlayerPhotoUrl(tenantId, playerIds[0])).toBe(soloUrl);
    // Another club's library never leaks onto this club's profile.
    expect(await taggedPlayerPhotoUrl(otherTenantId, playerIds[0])).toBeNull();
    // A player with no tagged photos gets none.
    expect(await taggedPlayerPhotoUrl(tenantId, 987654)).toBeNull();
  });
});

describe("focus areas", () => {
  it("sets a focus box, switched-off shapes and player areas, tagging new players", async () => {
    const path = await upload("focus.jpg", await jpeg(300, 200));
    const ingest = await api("post", "/club-photos/ingest").send({
      objectPaths: [path],
      playerIds: [playerIds[0]],
    });
    const photoId = ingest.body.results[0].photo.id as number;
    expect(ingest.body.results[0].photo.focusBox).toBeNull();
    expect(ingest.body.results[0].photo.offShapes).toEqual([]);

    const res = await api("put", `/club-photos/${photoId}/focus`).send({
      focusBox: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
      offShapes: ["wide", "tall", "wide"],
      playerAreas: [
        { playerId: playerIds[0], box: { x: 0.1, y: 0.2, w: 0.2, h: 0.5 } },
        { playerId: playerIds[1], box: { x: 0.4, y: 0.2, w: 0.2, h: 0.5 } },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.focusBox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(res.body.offShapes).toEqual(["tall", "wide"]);
    expect(res.body.playerIds).toEqual([...playerIds].sort((a, b) => a - b));
    expect(res.body.playerAreas).toHaveLength(2);

    // Fields left out are kept; a null area clears it but keeps the tag.
    const cleared = await api("put", `/club-photos/${photoId}/focus`).send({
      playerAreas: [{ playerId: playerIds[1], box: null }],
    });
    expect(cleared.body.focusBox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(cleared.body.playerAreas.map((a: { playerId: number }) => a.playerId)).toEqual([
      playerIds[0],
    ]);
    expect(cleared.body.playerIds).toHaveLength(2);

    // What a draft snapshots: the pictured player's area, else the photo's box.
    const url = res.body.url as string;
    expect(await draftPhotoFocus(tenantId, url, playerIds[0])).toEqual({
      box: { x: 0.1, y: 0.2, w: 0.2, h: 0.5 },
      width: 300,
      height: 200,
    });
    expect((await draftPhotoFocus(tenantId, url, playerIds[1]))?.box).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.6,
    });
    expect(await draftPhotoFocus(otherTenantId, url)).toBeNull();
    expect(await draftPhotoFocus(tenantId, "https://example.org/headshot.jpg")).toBeNull();

    const none = await api("put", `/club-photos/${photoId}/focus`).send({ focusBox: null });
    expect(none.body.focusBox).toBeNull();
  });

  it("rejects bad boxes, non-senior players and another club's photo", async () => {
    const path = await upload("focus-bad.jpg", await jpeg());
    const ingest = await api("post", "/club-photos/ingest").send({ objectPaths: [path] });
    const photoId = ingest.body.results[0].photo.id as number;
    const tiny = await api("put", `/club-photos/${photoId}/focus`).send({
      focusBox: { x: 0.5, y: 0.5, w: 0.001, h: 0.2 },
    });
    expect(tiny.status).toBe(400);
    const fillIn = await api("put", `/club-photos/${photoId}/focus`).send({
      playerAreas: [{ playerId: 90001, box: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
    });
    expect(fillIn.status).toBe(422);
    const other = await api("put", `/club-photos/${photoId}/focus`, "other").send({
      focusBox: { x: 0, y: 0, w: 0.5, h: 0.5 },
    });
    expect(other.status).toBe(404);
  });
});

describe("shape-aware picking", () => {
  it("passes over a photo switched off for the card's frame shape", async () => {
    const path = await upload("no-tall.jpg", await jpeg(300, 200));
    const ingest = await api("post", "/club-photos/ingest").send({
      objectPaths: [path],
      playerIds: [playerIds[1]],
    });
    const photo = ingest.body.results[0].photo as { id: number; url: string };
    await api("put", `/club-photos/${photo.id}/focus`).send({ offShapes: ["tall"] });
    const pick = (frameAspect: number | null) =>
      pickCandidatePhoto(tenantId, [playerIds[1]], {
        order: "ranked",
        seed: null,
        types: [],
        format: null,
        frameAspect,
      });
    // Newest first when the frame doesn't matter, or is wide.
    expect((await pick(null))?.url).toBe(photo.url);
    expect((await pick(16 / 9))?.url).toBe(photo.url);
    // A tall frame takes the player's other photo.
    const tall = await pick(4 / 5);
    expect(tall?.url).toBeTruthy();
    expect(tall?.url).not.toBe(photo.url);
  });
});
