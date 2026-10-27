/**
 * The junior photo library (kiosk-photo-rotation A): upload into folders, tag several
 * children, and the one consent rule `juniorLibraryPhotoAllowed` — a photo is shown
 * outside admin only with at least one tag and every tagged child allowed. Covers tenant
 * isolation, any-one-withheld, untagged, the 0060 backfill shape (a per-player photo with
 * one tag keeps feeding cards), and juniors isolation (nothing reaches the senior
 * library). Real-DB integration test (needs DATABASE_URL); storage is in memory.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  juniorParticipantsTable,
  juniorPhotoParticipantsTable,
  juniorPhotosTable,
  socialDraftsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";
import { draftPhotoFocus } from "../lib/photo-focus-snapshot";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import {
  juniorLibraryPhotoAllowed,
  loadJuniorPhotoConsent,
  loadJuniorPhotos,
} from "../lib/junior-photos";

const STAMP = Date.now();
const objects = new Map<string, Buffer>();
let counter = 0;
const memoryStore: PhotoStore = {
  async read(path) {
    const data = objects.get(path);
    if (!data) throw new Error("missing object");
    return data;
  },
  async write(data, _contentType, prefix = "library") {
    const path = `/objects/${prefix}/lib-${STAMP}-${counter++}`;
    objects.set(path, data);
    return path;
  },
  async remove(path) {
    objects.delete(path);
  },
};

let tenantId: number;
let otherTenantId: number;
let cookie: string;
let otherCookie: string;
const AVA = randomUUID().toLowerCase();
const BEN = randomUUID().toLowerCase();
const CAL = randomUUID().toLowerCase();

const jpeg = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: "#00305c" } })
    .jpeg()
    .toBuffer();

async function upload(name: string): Promise<string> {
  const path = `/objects/uploads/${STAMP}-${name}`;
  objects.set(path, await jpeg());
  return path;
}

const asAdmin = (r: request.Test) => r.set("Cookie", cookie).set("x-tenant-id", String(tenantId));
const asOther = (r: request.Test) =>
  r.set("Cookie", otherCookie).set("x-tenant-id", String(otherTenantId));
const asPublic = (r: request.Test) => r.set("x-tenant-id", String(tenantId));

async function ingest(name: string, body: Record<string, unknown> = {}): Promise<number> {
  const res = await asAdmin(request(app).post("/api/juniors/photo-library/ingest")).send({
    objectPaths: [await upload(name)],
    ...body,
  });
  expect(res.status).toBe(200);
  expect(res.body.results[0].ok).toBe(true);
  return res.body.results[0].photo.id;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-junior-library";
  setPhotoStore(memoryStore);
  const tenants = await db
    .insert(tenantsTable)
    .values([
      {
        slug: `jr-lib-${STAMP}`,
        centralClubId: 97_600 + (STAMP % 150),
        name: "Junior Library",
        plan: "pro",
      },
      {
        slug: `jr-lib-other-${STAMP}`,
        centralClubId: 97_400 + (STAMP % 150),
        name: "Other Club",
        plan: "pro",
      },
    ])
    .returning();
  tenantId = tenants[0].id;
  otherTenantId = tenants[1].id;
  const admins = await db
    .insert(adminsTable)
    .values([
      { tenantId, username: `jrl_${STAMP}`, displayName: "Ash", passwordHash: "x" },
      {
        tenantId: otherTenantId,
        username: `jrl_o_${STAMP}`,
        displayName: "Other",
        passwordHash: "x",
      },
    ])
    .returning();
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[0].id, issuedAt: Date.now() })}`;
  otherCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[1].id, issuedAt: Date.now() })}`;
  await db.insert(juniorParticipantsTable).values([
    { tenantId, participantId: AVA, displayName: "Ava Smith" },
    { tenantId, participantId: BEN, displayName: "Ben Jones" },
    { tenantId, participantId: CAL, displayName: "Cal Private", isPrivate: true },
    // The same child at another club is a different row; it must never count here.
    { tenantId: otherTenantId, participantId: AVA, displayName: "Ava Elsewhere" },
  ]);
});

afterAll(async () => {
  setPhotoStore(null);
  await purgeTestTenants([tenantId, otherTenantId]);
});

describe("library uploads and folders", () => {
  it("ingests into a folder with tags, privately stored, EXIF-free original removed", async () => {
    const id = await ingest("team-1", {
      grade: "Under 13",
      photoType: "team",
      season: 2026,
      matchFormat: "t20",
      participantIds: [AVA, BEN.toUpperCase()],
    });
    const list = await asAdmin(request(app).get("/api/juniors/photo-library"));
    const photo = list.body.find((p: { id: number }) => p.id === id);
    expect(photo).toMatchObject({
      grade: "Under 13",
      photoTypes: ["team"],
      season: 2026,
      matchFormat: "t20",
      displayable: true,
    });
    expect(
      photo.participants.map((p: { participantId: string }) => p.participantId).sort(),
    ).toEqual([AVA, BEN].sort());
    const [row] = await db.select().from(juniorPhotosTable).where(eq(juniorPhotosTable.id, id));
    expect(row.objectPath).toMatch(/^\/objects\/library\/juniors\//);
    expect(row.participantId).toBeNull();
    expect(objects.has(`/objects/uploads/${STAMP}-team-1`)).toBe(false);
  });

  it("refuses to tag a child who is not this club's junior", async () => {
    const res = await asAdmin(request(app).post("/api/juniors/photo-library/ingest")).send({
      objectPaths: [await upload("bad-tag")],
      participantIds: [randomUUID()],
    });
    expect(res.status).toBe(422);
  });

  it("moves photos between folders", async () => {
    const id = await ingest("move-1", { participantIds: [AVA] });
    const res = await asAdmin(request(app).post("/api/juniors/photo-library/move")).send({
      photoIds: [id],
      grade: "Under 15",
      photoType: "batting",
    });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ grade: "Under 15", photoTypes: ["batting"] });
  });
});

describe("consent rule (fail closed)", () => {
  it("an untagged photo is not displayable and is never served publicly", async () => {
    const id = await ingest("untagged");
    expect(await juniorLibraryPhotoAllowed(tenantId, id)).toBe(false);
    expect((await asPublic(request(app).get(`/api/juniors/photos/${id}`))).status).toBe(404);
    expect((await asAdmin(request(app).get(`/api/juniors/photos/${id}`))).status).toBe(200);
  });

  it("any one withheld or private child hides the whole photo", async () => {
    const group = await ingest("group", { participantIds: [AVA, BEN] });
    expect((await asPublic(request(app).get(`/api/juniors/photos/${group}`))).status).toBe(200);

    const withPrivate = await ingest("with-private", { participantIds: [AVA, CAL] });
    expect(await juniorLibraryPhotoAllowed(tenantId, withPrivate)).toBe(false);
    expect((await asPublic(request(app).get(`/api/juniors/photos/${withPrivate}`))).status).toBe(
      404,
    );

    await db
      .update(juniorParticipantsTable)
      .set({ photoWithheld: true })
      .where(eq(juniorParticipantsTable.participantId, BEN));
    try {
      expect(await juniorLibraryPhotoAllowed(tenantId, group)).toBe(false);
      expect((await asPublic(request(app).get(`/api/juniors/photos/${group}`))).status).toBe(404);
      // ... and Ava's cards never pick the group photo while Ben is withheld.
      const picks = await loadJuniorPhotos(tenantId, [AVA]);
      expect(picks.get(AVA)?.photoId).not.toBe(group);
    } finally {
      await db
        .update(juniorParticipantsTable)
        .set({ photoWithheld: false })
        .where(eq(juniorParticipantsTable.participantId, BEN));
    }
  });

  it("tagging a private child strips the photo from an open card in the same request", async () => {
    const id = await ingest("card", { participantIds: [AVA] });
    const url = `/api/juniors/photos/${id}`;
    const [draft] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "milestone",
        family: "achievements",
        appPath: "/juniors/matches/1",
        sourceMatchIsJunior: true,
        sourceKey: `feat:century:jr-lib:${STAMP}`,
        photoUrl: url,
        photoSource: "auto:junior-photo",
        cardInput: { kind: "century", junior: true, photoUrl: url, juniorPhotoAllowed: true },
        status: "awaiting_review",
      })
      .returning({ id: socialDraftsTable.id });
    const res = await asAdmin(request(app).post("/api/juniors/photo-library/tags")).send({
      photoIds: [id],
      addParticipantIds: [CAL],
    });
    expect(res.status).toBe(200);
    expect(res.body[0].displayable).toBe(false);
    const [after] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, draft.id));
    expect(after.photoUrl).toBeNull();
    expect(after.cardInput).not.toHaveProperty("juniorPhotoAllowed");
  });
});

describe("backfill shape: per-player photos keep working", () => {
  it("a legacy per-player photo with its single backfilled tag is still the player's card photo", async () => {
    const res = await asAdmin(request(app).post(`/api/juniors/participants/${BEN}/photos`)).send({
      objectPath: await upload("ben-own"),
      makeDefault: true,
    });
    expect(res.status).toBe(201);
    const tags = await db
      .select()
      .from(juniorPhotoParticipantsTable)
      .where(eq(juniorPhotoParticipantsTable.photoId, res.body.id));
    expect(tags.map((t) => t.participantId)).toEqual([BEN]);
    expect((await loadJuniorPhotos(tenantId, [BEN])).get(BEN)?.photoId).toBe(res.body.id);
    expect((await asPublic(request(app).get(res.body.url))).status).toBe(200);
  });

  it("the migration's backfill statement tags a photo that only has participant_id", async () => {
    const [legacy] = await db
      .insert(juniorPhotosTable)
      .values({ tenantId, participantId: AVA, objectPath: "/objects/library/juniors/legacy" })
      .returning();
    expect(await juniorLibraryPhotoAllowed(tenantId, legacy.id)).toBe(false);
    await db.execute(
      // The exact backfill from lib/db/migrations/0060_junior_photo_library.sql.
      sql.raw(`INSERT INTO "junior_photo_participants" ("tenant_id", "photo_id", "participant_id")
       SELECT "tenant_id", "id", "participant_id" FROM "junior_photos" WHERE "participant_id" IS NOT NULL
       ON CONFLICT ("photo_id", "participant_id") DO NOTHING`),
    );
    expect(await juniorLibraryPhotoAllowed(tenantId, legacy.id)).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("another club neither lists, edits, serves nor consents to this club's photos", async () => {
    const id = await ingest("isolated", { participantIds: [AVA] });
    const list = await asOther(request(app).get("/api/juniors/photo-library"));
    expect(list.status).toBe(200);
    expect(list.body.map((p: { id: number }) => p.id)).not.toContain(id);
    for (const path of ["tags", "move", "delete"]) {
      const res = await asOther(request(app).post(`/api/juniors/photo-library/${path}`)).send({
        photoIds: [id],
        grade: null,
        photoType: null,
      });
      expect(res.status).toBe(404);
    }
    expect(
      (
        await request(app)
          .get(`/api/juniors/photos/${id}`)
          .set("x-tenant-id", String(otherTenantId))
      ).status,
    ).toBe(404);
    expect((await loadJuniorPhotoConsent(otherTenantId, [id])).get(id)).toBe(false);
  });

  it("the library routes are admin-only", async () => {
    expect((await asPublic(request(app).get("/api/juniors/photo-library"))).status).toBe(401);
  });
});

describe("juniors isolation", () => {
  it("junior library photos never appear in the senior photo library", async () => {
    const id = await ingest("never-senior", { participantIds: [AVA], grade: "Under 13" });
    const senior = await asAdmin(request(app).get("/api/club-photos"));
    expect(senior.status).toBe(200);
    const urls = (senior.body as { url: string }[]).map((p) => p.url);
    expect(urls.some((u) => u.includes("/juniors/"))).toBe(false);
    expect(urls).not.toContain(`/api/juniors/photos/${id}`);
  });

  it("delete removes the rows, tags and stored files", async () => {
    const id = await ingest("delete-me", { participantIds: [AVA] });
    const [row] = await db.select().from(juniorPhotosTable).where(eq(juniorPhotosTable.id, id));
    const res = await asAdmin(request(app).post("/api/juniors/photo-library/delete")).send({
      photoIds: [id],
    });
    expect(res.body).toEqual({ deleted: 1 });
    expect(objects.has(row.objectPath)).toBe(false);
    const tags = await db
      .select()
      .from(juniorPhotoParticipantsTable)
      .where(eq(juniorPhotoParticipantsTable.photoId, id));
    expect(tags).toEqual([]);
  });
});

describe("photo focus areas", () => {
  it("sets a box, shapes and a tagged child's area; the draft snapshot uses that area", async () => {
    const id = await ingest("focus", { participantIds: [AVA, BEN] });
    const put = (body: Record<string, unknown>) =>
      asAdmin(request(app).put(`/api/juniors/photo-library/${id}/focus`)).send(body);
    const res = await put({
      focusBox: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
      offShapes: ["wide"],
      participantAreas: [
        { participantId: AVA.toUpperCase(), box: { x: 0.5, y: 0.2, w: 0.2, h: 0.5 } },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.focusBox).toEqual({ x: 0.1, y: 0.1, w: 0.6, h: 0.6 });
    expect(res.body.offShapes).toEqual(["wide"]);
    expect(res.body.participantAreas).toEqual([
      { participantId: AVA, box: { x: 0.5, y: 0.2, w: 0.2, h: 0.5 } },
    ]);

    // The snapshot a junior card stores: the featured child's area, else the box.
    const url = `/api/juniors/photos/${id}`;
    expect((await draftPhotoFocus(tenantId, url, null, AVA))?.box).toEqual({
      x: 0.5,
      y: 0.2,
      w: 0.2,
      h: 0.5,
    });
    expect((await draftPhotoFocus(tenantId, url, null, BEN))?.box).toEqual({
      x: 0.1,
      y: 0.1,
      w: 0.6,
      h: 0.6,
    });
    expect(await draftPhotoFocus(otherTenantId, url, null, AVA)).toBeNull();

    // An area needs the child tagged first; another club can't edit it.
    const untagged = await put({
      participantAreas: [{ participantId: randomUUID(), box: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
    });
    expect(untagged.status).toBe(400);
    const other = await asOther(request(app).put(`/api/juniors/photo-library/${id}/focus`)).send({
      focusBox: null,
    });
    expect(other.status).toBe(404);
  });
});
