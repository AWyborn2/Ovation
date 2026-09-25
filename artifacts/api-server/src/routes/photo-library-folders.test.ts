/**
 * Photo library folders: folders are a view over each photo's grade and photo
 * type (no table). `POST /club-photos/move` files photos into a grade × type
 * folder (Club-wide = no grade, Unsorted = no type), uploads can target a
 * folder, and the list filters by "no grade" / "no type". Covers senior-only
 * grades, unknown types, tenant isolation and re-picking open auto drafts.
 * Real-DB integration test (needs DATABASE_URL); object storage is replaced by
 * an in-memory store.
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
  socialDraftsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { objectUrl, setPhotoStore, type PhotoStore } from "../lib/photo-store";

const STAMP = Date.now();
const GRADE = `Folder Grade ${STAMP}`;
const OTHER_GRADE = `Folder B Grade ${STAMP}`;

const objects = new Map<string, Buffer>();
let counter = 0;
const memoryStore: PhotoStore = {
  async read(path) {
    const data = objects.get(path);
    if (!data) throw new Error("missing object");
    return data;
  },
  async write(data) {
    const path = `/objects/library/folders-${STAMP}-${counter++}`;
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
const photos: Record<string, number> = {};

async function libraryPhoto(
  name: string,
  opts: {
    tenant?: number;
    grade?: string | null;
    types?: string[];
    takenAt?: string;
    playerId?: number;
  } = {},
): Promise<number> {
  const tid = opts.tenant ?? tenantId;
  const [photo] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId: tid,
      objectPath: `/objects/library/folders-${STAMP}-${name}`,
      thumbPath: `/objects/library/folders-${STAMP}-${name}-thumb`,
      width: 100,
      height: 100,
      grade: opts.grade === undefined ? GRADE : opts.grade,
      takenAt: new Date(opts.takenAt ?? "2025-01-01"),
      photoTypes: opts.types ?? [],
    })
    .returning();
  if (opts.playerId != null) {
    await db
      .insert(clubPhotoPlayersTable)
      .values({ tenantId: tid, photoId: photo.id, playerId: opts.playerId });
  }
  photos[name] = photo.id;
  return photo.id;
}

const urlOf = (name: string) => objectUrl(`/objects/library/folders-${STAMP}-${name}`);

const api = (method: "get" | "post", path: string, as: "own" | "other" = "own") => {
  const agent = request(app);
  const req = method === "get" ? agent.get(`/api${path}`) : agent.post(`/api${path}`);
  return req
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));
};

const move = (body: unknown, as: "own" | "other" = "own") =>
  api("post", "/club-photos/move", as).send(body as object);

const row = async (id: number) =>
  (await db.select().from(clubPhotosTable).where(eq(clubPhotosTable.id, id)))[0];

const reloadDraft = async (id: number) =>
  (await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, id)))[0];

const ids = (body: Array<{ id: number }>) => body.map((p) => p.id).sort((a, b) => a - b);

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-photo-folders";
  setPhotoStore(memoryStore);
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `folders-${STAMP}`, centralClubId: 9973, name: "Folder Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `folders-o-${STAMP}`, centralClubId: 9974, name: "Other", plan: "pro" })
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
        username: `folders_${key}_${STAMP}`,
        displayName: "Folder Admin",
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
    .values([{ surname: `Folder${STAMP}`, givenName: "Flo" }])
    .returning();
  playerIds.push(...players.map((p) => p.id));

  await libraryPhoto("batting", { types: ["batting"] });
  await libraryPhoto("multi", { types: ["team", "celebrating"] });
  await libraryPhoto("unsorted", {});
  await libraryPhoto("clubwide", { grade: null });
  await libraryPhoto("clubwide-team", { grade: null, types: ["team"] });
  await libraryPhoto("elsewhere", { tenant: otherTenantId, grade: null });
});

afterAll(async () => {
  setPhotoStore(null);
  const tenants = [tenantId, otherTenantId];
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenants));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

describe("folder filters", () => {
  it("lists Club-wide (no grade) and Unsorted (no type) photos", async () => {
    const clubWide = await api("get", "/club-photos?ungraded=true");
    expect(clubWide.status).toBe(200);
    expect(ids(clubWide.body)).toEqual(
      ids([{ id: photos.clubwide }, { id: photos["clubwide-team"] }]),
    );

    const unsorted = await api(
      "get",
      `/club-photos?grade=${encodeURIComponent(GRADE)}&untyped=true`,
    );
    expect(unsorted.status).toBe(200);
    expect(ids(unsorted.body)).toEqual([photos.unsorted]);

    const clubWideUnsorted = await api("get", "/club-photos?ungraded=true&untyped=true");
    expect(ids(clubWideUnsorted.body)).toEqual([photos.clubwide]);

    // "false" is not a flag.
    const all = await api("get", "/club-photos?ungraded=false");
    expect(all.body.length).toBeGreaterThanOrEqual(5);
  });

  it("rejects asking for a grade and no grade at once", async () => {
    const res = await api("get", `/club-photos?grade=${encodeURIComponent(GRADE)}&ungraded=true`);
    expect(res.status).toBe(400);
  });

  it("keeps another club's Club-wide photos out", async () => {
    const ours = await api("get", "/club-photos?ungraded=true");
    expect(ids(ours.body)).not.toContain(photos.elsewhere);
    const theirs = await api("get", "/club-photos?ungraded=true", "other");
    expect(ids(theirs.body)).toEqual([photos.elsewhere]);
  });
});

describe("move", () => {
  it("sets the grade and type, replacing an existing type", async () => {
    const res = await move({
      photoIds: [photos.batting, photos.multi],
      grade: OTHER_GRADE,
      photoType: "bowling",
    });
    expect(res.status).toBe(200);
    for (const p of res.body)
      expect(p).toMatchObject({ grade: OTHER_GRADE, photoTypes: ["bowling"] });
    expect(await row(photos.multi)).toMatchObject({ grade: OTHER_GRADE, photoTypes: ["bowling"] });
  });

  it("Club-wide sets the grade to null", async () => {
    const res = await move({ photoIds: [photos.batting], grade: null, photoType: "batting" });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ grade: null, photoTypes: ["batting"] });
    expect((await row(photos.batting)).grade).toBeNull();
  });

  it("Unsorted clears the type", async () => {
    const res = await move({ photoIds: [photos.multi], grade: GRADE, photoType: null });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ grade: GRADE, photoTypes: [] });
  });

  it("a junior grade is 422", async () => {
    const res = await move({ photoIds: [photos.unsorted], grade: "Under 15", photoType: null });
    expect(res.status).toBe(422);
    expect((await row(photos.unsorted)).grade).toBe(GRADE);
  });

  it("an unknown type is 400", async () => {
    const res = await move({ photoIds: [photos.unsorted], grade: GRADE, photoType: "selfie" });
    expect(res.status).toBe(400);
  });

  it("another club can't move these photos, nor we theirs", async () => {
    const foreign = await move(
      { photoIds: [photos.unsorted], grade: null, photoType: "team" },
      "other",
    );
    expect(foreign.status).toBe(404);
    expect((await row(photos.unsorted)).grade).toBe(GRADE);
    const theirs = await move({ photoIds: [photos.elsewhere], grade: GRADE, photoType: "team" });
    expect(theirs.status).toBe(404);
    expect((await row(photos.elsewhere)).grade).toBeNull();
  });

  it("re-picks open auto drafts, never a manual photo", async () => {
    const player = playerIds[0];
    await libraryPhoto("player-old", { grade: GRADE, takenAt: "2024-01-01", playerId: player });
    await libraryPhoto("player-new", { grade: GRADE, takenAt: "2025-06-01", playerId: player });
    const draft = (photoUrl: string, photoSource: string) =>
      db
        .insert(socialDraftsTable)
        .values({
          tenantId,
          engine: "milestone",
          status: "awaiting_review",
          cardInput: { kind: "fiveFor", grade: GRADE, playerName: "Flo" },
          appPath: `/players/${player}`,
          photoUrl,
          photoSource,
        })
        .returning();
    const [auto] = await draft(urlOf("player-new"), "auto:library-player");
    const [manual] = await draft("/api/storage/objects/mine", "manual");

    // A five-for prefers bowling photos: filing the older one there wins it.
    const res = await move({
      photoIds: [photos["player-old"]],
      grade: GRADE,
      photoType: "bowling",
    });
    expect(res.status).toBe(200);
    expect(await reloadDraft(auto.id)).toMatchObject({
      photoUrl: urlOf("player-old"),
      photoSource: "auto:library-player",
    });
    expect(await reloadDraft(manual.id)).toMatchObject({
      photoUrl: "/api/storage/objects/mine",
      photoSource: "manual",
    });

    // Back to Unsorted: the auto draft returns to the newest photo.
    await move({ photoIds: [photos["player-old"]], grade: GRADE, photoType: null });
    expect((await reloadDraft(auto.id)).photoUrl).toBe(urlOf("player-new"));
  });
});

describe("upload into a folder", () => {
  it("files the uploaded photos under the folder's grade and type", async () => {
    const jpeg = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 0, g: 48, b: 92 } },
    })
      .jpeg()
      .toBuffer();
    const upload = `/objects/uploads/folders-${STAMP}-a.jpg`;
    objects.set(upload, jpeg);
    const res = await api("post", "/club-photos/ingest").send({
      objectPaths: [upload],
      grade: OTHER_GRADE,
      photoType: "fielding",
    });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({
      ok: true,
      photo: { grade: OTHER_GRADE, photoTypes: ["fielding"] },
    });

    const listed = await api(
      "get",
      `/club-photos?grade=${encodeURIComponent(OTHER_GRADE)}&type=fielding`,
    );
    expect(ids(listed.body)).toEqual([res.body.results[0].photo.id]);
  });

  it("rejects an upload into a junior grade with 422", async () => {
    const upload = `/objects/uploads/folders-${STAMP}-junior.jpg`;
    objects.set(upload, Buffer.from("x"));
    const res = await api("post", "/club-photos/ingest").send({
      objectPaths: [upload],
      grade: "Under 15",
    });
    expect(res.status).toBe(422);
    // Nothing was ingested: the upload is still in storage.
    expect(objects.has(upload)).toBe(true);
    const listed = await api("get", `/club-photos?grade=${encodeURIComponent("Under 15")}`);
    expect(listed.body).toEqual([]);
  });

  it("rejects an unknown upload type with 400", async () => {
    const res = await api("post", "/club-photos/ingest").send({
      objectPaths: [`/objects/uploads/folders-${STAMP}-none.jpg`],
      photoType: "selfie",
    });
    expect(res.status).toBe(400);
  });
});
