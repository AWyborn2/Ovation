/**
 * Junior card photos — the routes (plan 2026-10-16-001, ADR-007; AE4, AE5): an admin
 * adds, lists, defaults and removes a junior player's photos; the image is served
 * publicly only while the player is allowed a photo; the raw storage path is never
 * served publicly; withholding consent strips the photo from open cards in the same
 * request and marks a posted one stale. Real-DB integration test (needs DATABASE_URL);
 * object storage is an in-memory store.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  juniorParticipantsTable,
  juniorPhotosTable,
  socialDraftsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

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
    const path = `/objects/${prefix}/test-${STAMP}-${counter++}`;
    objects.set(path, data);
    return path;
  },
  async remove(path) {
    objects.delete(path);
  },
};

let tenantId: number;
let adminId: number;
let cookie: string;
const RILEY = randomUUID().toLowerCase();
const MIA = randomUUID().toLowerCase();

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
const asPublic = (r: request.Test) => r.set("x-tenant-id", String(tenantId));

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-junior-photos";
  setPhotoStore(memoryStore);
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `jr-photos-${STAMP}`,
      centralClubId: 97_800 + (STAMP % 150),
      name: "Junior Photos",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `jrp_${STAMP}`, displayName: "Ash", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(juniorParticipantsTable).values([
    { tenantId, participantId: RILEY, displayName: "Riley Thompson" },
    { tenantId, participantId: MIA, displayName: "Mia Brown", isPrivate: true },
  ]);
});

afterAll(async () => {
  setPhotoStore(null);
  await purgeTestTenants([tenantId]);
});

describe("admin photo management", () => {
  let photoId: number;
  let secondId: number;

  it("adds a photo from an upload: converted, stored under the private junior prefix, default", async () => {
    const res = await asAdmin(request(app).post(`/api/juniors/participants/${RILEY}/photos`)).send({
      objectPath: await upload("riley-1"),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ participantId: RILEY, isDefault: true });
    expect(res.body.url).toMatch(/^\/api\/juniors\/photos\/\d+$/);
    photoId = res.body.id;
    const [row] = await db
      .select()
      .from(juniorPhotosTable)
      .where(eq(juniorPhotosTable.id, photoId));
    expect(row.objectPath).toMatch(/^\/objects\/library\/juniors\//);
    expect(row.thumbPath).toMatch(/^\/objects\/library\/juniors\//);
    // The original upload (possibly with GPS EXIF) is not kept.
    expect(objects.has(`/objects/uploads/${STAMP}-riley-1`)).toBe(false);
  });

  it("a second photo is not the default unless asked; set default swaps; list puts the default first", async () => {
    const res = await asAdmin(request(app).post(`/api/juniors/participants/${RILEY}/photos`)).send({
      objectPath: await upload("riley-2"),
    });
    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(false);
    secondId = res.body.id;
    const def = await asAdmin(
      request(app).post(`/api/juniors/participants/${RILEY}/photos/${secondId}/default`),
    );
    expect(def.status).toBe(200);
    expect(def.body.isDefault).toBe(true);
    const list = await asAdmin(request(app).get(`/api/juniors/participants/${RILEY}/photos`));
    expect(list.body.map((p: { id: number; isDefault: boolean }) => [p.id, p.isDefault])).toEqual([
      [secondId, true],
      [photoId, false],
    ]);
  });

  it("removing the default promotes the remaining photo", async () => {
    const res = await asAdmin(
      request(app).delete(`/api/juniors/participants/${RILEY}/photos/${secondId}`),
    );
    expect(res.status).toBe(204);
    const list = await asAdmin(request(app).get(`/api/juniors/participants/${RILEY}/photos`));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: photoId, isDefault: true });
  });

  it("refuses without an admin session and for another club's participant", async () => {
    expect(
      (await asPublic(request(app).get(`/api/juniors/participants/${RILEY}/photos`))).status,
    ).toBe(401);
    expect(
      (await asAdmin(request(app).get(`/api/juniors/participants/${randomUUID()}/photos`))).status,
    ).toBe(404);
  });
});

describe("gated serving (AE5)", () => {
  let rileyPhoto: number;
  let miaPhoto: number;
  beforeAll(async () => {
    rileyPhoto = (await asAdmin(request(app).get(`/api/juniors/participants/${RILEY}/photos`)))
      .body[0].id;
    const res = await asAdmin(request(app).post(`/api/juniors/participants/${MIA}/photos`)).send({
      objectPath: await upload("mia-1"),
    });
    miaPhoto = res.body.id;
  });

  it("serves an allowed player's photo publicly, as a non-cacheable JPEG", async () => {
    const res = await asPublic(request(app).get(`/api/juniors/photos/${rileyPhoto}`));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(
      (await asPublic(request(app).get(`/api/juniors/photos/${rileyPhoto}/thumb`))).status,
    ).toBe(200);
  });

  it("refuses a private player's photo publicly but serves it to an admin", async () => {
    expect((await asPublic(request(app).get(`/api/juniors/photos/${miaPhoto}`))).status).toBe(404);
    expect((await asAdmin(request(app).get(`/api/juniors/photos/${miaPhoto}`))).status).toBe(200);
  });

  it("never serves a junior photo from the raw storage route without an admin", async () => {
    const [row] = await db
      .select({ objectPath: juniorPhotosTable.objectPath })
      .from(juniorPhotosTable)
      .where(eq(juniorPhotosTable.id, rileyPhoto));
    const res = await asPublic(request(app).get(`/api/storage${row.objectPath}`));
    expect(res.status).toBe(404);
  });

  it("shows the photo in the public directory and profile for an allowed player only", async () => {
    const dir = await asPublic(request(app).get(`/api/juniors/players`));
    const byId = new Map(
      (dir.body as { participantId: string; photoUrl: string | null }[]).map((p) => [
        p.participantId,
        p.photoUrl,
      ]),
    );
    expect(byId.get(RILEY)).toBe(`/api/juniors/photos/${rileyPhoto}`);
    expect(byId.has(MIA)).toBe(false); // private: not in the public directory at all
    const profile = await asPublic(request(app).get(`/api/juniors/players/${RILEY}`));
    expect(profile.body.photoUrl).toBe(`/api/juniors/photos/${rileyPhoto}`);
  });
});

describe("withholding consent (R6)", () => {
  let rileyPhoto: number;
  let openDraftId: number;
  let postedDraftId: number;

  beforeAll(async () => {
    rileyPhoto = (await asAdmin(request(app).get(`/api/juniors/participants/${RILEY}/photos`)))
      .body[0].id;
    const url = `/api/juniors/photos/${rileyPhoto}`;
    const base = {
      tenantId,
      engine: "milestone",
      family: "achievements",
      appPath: "/juniors/matches/1",
      sourceMatchIsJunior: true,
      photoUrl: url,
      photoSource: "auto:junior-photo",
    };
    const [open] = await db
      .insert(socialDraftsTable)
      .values({
        ...base,
        sourceKey: `feat:century:jr-photos-open:${STAMP}`,
        cardInput: {
          kind: "century",
          junior: true,
          playerName: "Riley T",
          photoUrl: url,
          featuredParticipantId: RILEY,
          juniorPhotoAllowed: true,
        },
        status: "awaiting_review",
      })
      .returning({ id: socialDraftsTable.id });
    openDraftId = open.id;
    const [posted] = await db
      .insert(socialDraftsTable)
      .values({
        ...base,
        sourceKey: `feat:century:jr-photos-posted:${STAMP}`,
        cardInput: {
          kind: "century",
          junior: true,
          playerName: "Riley T",
          photoUrl: url,
          featuredParticipantId: RILEY.toUpperCase(),
          juniorPhotoAllowed: true,
        },
        status: "posted",
      })
      .returning({ id: socialDraftsTable.id });
    postedDraftId = posted.id;
  });

  it("records who withheld and when; the photo comes off the open card now and the posted one goes stale", async () => {
    const res = await asAdmin(request(app).patch(`/api/juniors/participants/${RILEY}`)).send({
      photoWithheld: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ photoWithheld: true });
    expect(typeof res.body.photoWithheldBy).toBe("string");
    expect(res.body.photoWithheldAt).toBeTruthy();

    const [open] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, openDraftId));
    expect(open.photoUrl).toBeNull();
    expect(open.photoSource).toBe("none");
    expect(open.cardInput).not.toHaveProperty("featuredParticipantId");
    expect(open.cardInput).not.toHaveProperty("juniorPhotoAllowed");
    expect((open.cardInput as { photoUrl: unknown }).photoUrl).toBeNull();

    const [posted] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, postedDraftId));
    expect(posted.status).toBe("posted");
    expect(posted.staleSince).not.toBeNull();
  });

  it("the photo is no longer served publicly, and the admin sees the state in the directory", async () => {
    expect((await asPublic(request(app).get(`/api/juniors/photos/${rileyPhoto}`))).status).toBe(
      404,
    );
    expect((await asAdmin(request(app).get(`/api/juniors/photos/${rileyPhoto}`))).status).toBe(200);
    const profile = await asPublic(request(app).get(`/api/juniors/players/${RILEY}`));
    expect(profile.body.photoUrl).toBeNull();
    const dir = await asAdmin(request(app).get(`/api/juniors/players?includePrivate=true`));
    const riley = (
      dir.body as { participantId: string; photoWithheld?: boolean; photoUrl: string | null }[]
    ).find((p) => p.participantId === RILEY);
    expect(riley).toMatchObject({
      photoWithheld: true,
      photoUrl: `/api/juniors/photos/${rileyPhoto}`,
    });
  });

  it("allowing photos again clears the record and serves the photo once more", async () => {
    const res = await asAdmin(request(app).patch(`/api/juniors/participants/${RILEY}`)).send({
      photoWithheld: false,
    });
    expect(res.body).toMatchObject({
      photoWithheld: false,
      photoWithheldBy: null,
      photoWithheldAt: null,
    });
    expect((await asPublic(request(app).get(`/api/juniors/photos/${rileyPhoto}`))).status).toBe(
      200,
    );
    const [p] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, tenantId),
          eq(juniorParticipantsTable.participantId, RILEY),
        ),
      );
    expect(p.photoWithheld).toBe(false);
  });
});
