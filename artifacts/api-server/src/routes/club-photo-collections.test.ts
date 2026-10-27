/**
 * Photo collections and photo layer sources. Covers the collection routes
 * (create, rename, delete, add and take out photos, names unique per club,
 * tenant isolation, each photo listing its collections), how a sourced photo
 * layer's photo is picked (a team list player by role, position or seed, with
 * their tagged photo and area, then headshot; a collection photo picked per
 * draft; two layers preferring different photos; nothing for juniors, a
 * missing role or a deleted collection), drafts picking and re-picking them
 * (a design edit, a collection change), and the editor's preview. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  playerImagesTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  clubPhotoCollectionsTable,
  fixturesTable,
  teamListsTable,
  socialDraftsTable,
  type TeamListPlayer,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { objectUrl } from "../lib/photo-store";
import { resolveLayerPhotos } from "../lib/layer-photos";

const STAMP = Date.now();
const GRADE = `Sources Grade ${STAMP}`;

let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;
const players: Record<string, number> = {};
const photos: Record<string, number> = {};
let fixtureId: number;
let otherPhotoId: number;

const urlOf = (name: string) => objectUrl(`/objects/library/sources-${STAMP}-${name}`);

async function libraryPhoto(
  name: string,
  opts: { tenant?: number; playerId?: number; area?: boolean; takenAt?: string } = {},
): Promise<number> {
  const tid = opts.tenant ?? tenantId;
  const [photo] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId: tid,
      objectPath: `/objects/library/sources-${STAMP}-${name}`,
      thumbPath: `/objects/library/sources-${STAMP}-${name}-thumb`,
      width: 1000,
      height: 800,
      grade: GRADE,
      takenAt: opts.takenAt ? new Date(opts.takenAt) : null,
    })
    .returning();
  if (opts.playerId != null) {
    await db.insert(clubPhotoPlayersTable).values({
      tenantId: tid,
      photoId: photo.id,
      playerId: opts.playerId,
      area: opts.area ? { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } : null,
    });
  }
  return photo.id;
}

const api = (
  method: "get" | "post" | "patch" | "delete",
  path: string,
  as: "own" | "other" = "own",
) =>
  request(app)
    [method](`/api${path}`)
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));

/** A v2 document with these photo layers on the Team List card page. */
const docWith = (...layers: Array<Record<string, unknown>>) => ({
  formatVersion: 2,
  pages: {
    team: {
      layers: layers.map((l, i) => ({
        id: `photo${i}`,
        kind: "photo",
        geometry: { square: { x: 0, y: 0, w: 50, h: 50 } },
        ...l,
      })),
    },
  },
});

const teamListCard = { kind: "teamList", grade: GRADE };

const resolve = (
  adjustments: unknown,
  over: Partial<Parameters<typeof resolveLayerPhotos>[0]> = {},
) =>
  resolveLayerPhotos({
    tenantId,
    adjustments,
    cardInput: teamListCard,
    junior: false,
    seed: `teamlist:${fixtureId}`,
    ...over,
  });

async function createCollection(name: string, as: "own" | "other" = "own"): Promise<number> {
  const res = await api("post", "/club-photo-collections", as).send({ name });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-photo-sources";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `sources-${STAMP}`, centralClubId: 9981, name: "Sources Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `sources-o-${STAMP}`, centralClubId: 9982, name: "Other", plan: "pro" })
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
        username: `sources_${key}_${STAMP}`,
        displayName: "Sources Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    const c = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    if (tid === tenantId) cookie = c;
    else otherCookie = c;
  }

  const rows = await db
    .insert(playersTable)
    .values([
      { surname: `Skip${STAMP}`, givenName: "Cap" },
      { surname: `Gloves${STAMP}`, givenName: "Kip" },
      { surname: `Third${STAMP}`, givenName: "Tom" },
      { surname: `Head${STAMP}`, givenName: "Hal" },
    ])
    .returning();
  [players.captain, players.keeper, players.third, players.headshot] = rows.map((r) => r.id);

  photos.captain = await libraryPhoto("captain", { playerId: players.captain, area: true });
  photos.keeper = await libraryPhoto("keeper", { playerId: players.keeper });
  photos.third = await libraryPhoto("third", { playerId: players.third });
  await db.insert(playerImagesTable).values({
    tenantId,
    playerId: players.headshot,
    imageUrl: `https://example.test/headshot-${STAMP}.jpg`,
    isDefault: true,
  });
  for (let i = 0; i < 5; i++)
    photos[`crowd${i}`] = await libraryPhoto(`crowd${i}`, { takenAt: `2025-03-0${i + 1}` });
  otherPhotoId = await libraryPhoto("elsewhere", { tenant: otherTenantId });

  const [f] = await db
    .insert(fixturesTable)
    .values({ tenantId, grade: GRADE, opponentName: "Rivals", startAt: new Date("2026-11-07") })
    .returning();
  fixtureId = f.id;
  const list: TeamListPlayer[] = [
    { order: 1, playerId: players.third, displayName: "Tom Third" },
    { order: 2, playerId: players.captain, displayName: "Cap Skip", role: "C" },
    { order: 3, displayName: "New Signing" },
    { order: 4, playerId: players.keeper, displayName: "Kip Gloves", role: "WK" },
    { order: 5, playerId: players.headshot, displayName: "Hal Head" },
  ];
  await db.insert(teamListsTable).values({ tenantId, fixtureId, players: list, isPublished: true });
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db
    .delete(clubPhotoCollectionsTable)
    .where(inArray(clubPhotoCollectionsTable.tenantId, tenants));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenants));
  await db.delete(teamListsTable).where(inArray(teamListsTable.tenantId, tenants));
  await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, tenants));
  await db.delete(playerImagesTable).where(inArray(playerImagesTable.tenantId, tenants));
  if (Object.keys(players).length)
    await db.delete(playersTable).where(inArray(playersTable.id, Object.values(players)));
  if (adminIds.length) await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

describe("photo collection routes", () => {
  it("creates, lists, renames and deletes collections, names unique per club", async () => {
    const id = await createCollection("Matchday crowd");
    const dup = await api("post", "/club-photo-collections").send({ name: " matchday CROWD " });
    expect(dup.status).toBe(409);
    expect((await api("post", "/club-photo-collections").send({ name: "  " })).status).toBe(400);
    // Another club can use the same name.
    await createCollection("Matchday crowd", "other");

    const add = await api("post", `/club-photo-collections/${id}/photos`).send({
      photoIds: [photos.crowd0, photos.crowd1, photos.crowd0],
    });
    expect(add.status).toBe(200);
    expect(add.body).toMatchObject({ id, name: "Matchday crowd", photoCount: 2 });
    expect(add.body.coverUrl).toBe(objectUrl(`/objects/library/sources-${STAMP}-crowd1-thumb`));

    const list = await api("get", "/club-photo-collections");
    expect(list.body.map((c: { id: number }) => c.id)).toEqual([id]);

    const renamed = await api("patch", `/club-photo-collections/${id}`).send({ name: "Crowd" });
    expect(renamed.body).toMatchObject({ id, name: "Crowd", photoCount: 2 });

    // Each photo lists the collections it is in.
    const lib = await api("get", "/club-photos");
    const crowd0 = lib.body.find((p: { id: number }) => p.id === photos.crowd0);
    expect(crowd0.collectionIds).toEqual([id]);

    const out = await api("post", `/club-photo-collections/${id}/photos/remove`).send({
      photoIds: [photos.crowd0],
    });
    expect(out.body.photoCount).toBe(1);

    expect((await api("delete", `/club-photo-collections/${id}`)).status).toBe(204);
    expect((await api("get", "/club-photo-collections")).body).toEqual([]);
    // The photos stay in the library.
    const [kept] = await db
      .select()
      .from(clubPhotosTable)
      .where(eq(clubPhotosTable.id, photos.crowd1));
    expect(kept).toBeTruthy();
  });

  it("keeps each club to its own collections and photos", async () => {
    const id = await createCollection("Ours");
    // Another club's photo can't go in.
    const foreign = await api("post", `/club-photo-collections/${id}/photos`).send({
      photoIds: [otherPhotoId],
    });
    expect(foreign.status).toBe(404);
    // Another club can't see, rename, fill, empty or delete it.
    expect(
      (await api("get", "/club-photo-collections", "other")).body.map(
        (c: { name: string }) => c.name,
      ),
    ).not.toContain("Ours");
    expect(
      (await api("patch", `/club-photo-collections/${id}`, "other").send({ name: "Mine" })).status,
    ).toBe(404);
    expect(
      (
        await api("post", `/club-photo-collections/${id}/photos`, "other").send({
          photoIds: [otherPhotoId],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("post", `/club-photo-collections/${id}/photos/remove`, "other").send({
          photoIds: [photos.crowd0],
        })
      ).status,
    ).toBe(404);
    expect((await api("delete", `/club-photo-collections/${id}`, "other")).status).toBe(404);
    // Another club's layer source naming it finds nothing.
    const picked = await resolveLayerPhotos({
      tenantId: otherTenantId,
      adjustments: docWith({ source: { kind: "collection", collectionId: id } }),
      cardInput: teamListCard,
      junior: false,
      seed: "x",
    });
    expect(picked).toBeNull();
  });
});

describe("photo layer sources", () => {
  it("features the team list's captain, keeper or the player at a position", async () => {
    const lp = await resolve(
      docWith(
        { source: { kind: "player", pick: "captain" } },
        { source: { kind: "player", pick: "keeper" } },
        { source: { kind: "player", pick: "position", position: 1 } },
      ),
    );
    expect(lp?.photo0?.url).toBe(urlOf("captain"));
    // The captain's photo crops to their area on it.
    expect(lp?.photo0?.focus).toEqual({
      box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      width: 1000,
      height: 800,
    });
    expect(lp?.photo1?.url).toBe(urlOf("keeper"));
    expect(lp?.photo2?.url).toBe(urlOf("third"));
  });

  it("falls back to a headshot, and finds nothing for an unlinked name or a missing role", async () => {
    const lp = await resolve(
      docWith(
        { source: { kind: "player", pick: "position", position: 5 } },
        { source: { kind: "player", pick: "position", position: 3 } },
        { source: { kind: "player", pick: "viceCaptain" } },
      ),
    );
    expect(lp?.photo0).toEqual({ url: `https://example.test/headshot-${STAMP}.jpg`, focus: null });
    expect(lp).not.toHaveProperty("photo1");
    expect(lp).not.toHaveProperty("photo2");
    // No team list (another card kind): nothing, so the layer shows the card's photo.
    expect(
      await resolve(docWith({ source: { kind: "player", pick: "captain" } }), {
        seed: "roundup:1",
      }),
    ).toBeNull();
  });

  it("picks random players and collection photos per draft, different for each layer", async () => {
    const id = await createCollection("Random pool");
    await api("post", `/club-photo-collections/${id}/photos`).send({
      photoIds: [0, 1, 2, 3, 4].map((i) => photos[`crowd${i}`]),
    });
    const doc = docWith(
      { source: { kind: "collection", collectionId: id } },
      { source: { kind: "collection", collectionId: id } },
      { source: { kind: "player", pick: "random" } },
      { source: { kind: "player", pick: "random" } },
    );
    const a = await resolve(doc);
    expect(await resolve(doc)).toEqual(a);
    const crowd = [0, 1, 2, 3, 4].map((i) => urlOf(`crowd${i}`));
    expect(crowd).toContain(a?.photo0?.url);
    expect(crowd).toContain(a?.photo1?.url);
    expect(a?.photo1?.url).not.toBe(a?.photo0?.url);
    // Random players have tagged photos (the headshot-only player ranks last) and differ.
    const tagged = [urlOf("captain"), urlOf("keeper"), urlOf("third")];
    expect(tagged).toContain(a?.photo2?.url);
    expect(tagged).toContain(a?.photo3?.url);
    expect(a?.photo3?.url).not.toBe(a?.photo2?.url);
    // Other drafts spread across the collection.
    const picks = new Set<string>();
    for (let i = 0; i < 12; i++)
      picks.add(
        (await resolve(docWith({ source: { kind: "collection", collectionId: id } }), {
          seed: `d${i}`,
        }))!.photo0!.url,
      );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("never gives a junior card a photo, and ignores a deleted collection", async () => {
    const id = await createCollection("Gone soon");
    await api("post", `/club-photo-collections/${id}/photos`).send({ photoIds: [photos.crowd0] });
    const doc = docWith(
      { source: { kind: "collection", collectionId: id } },
      { source: { kind: "player", pick: "captain" } },
    );
    expect(await resolve(doc, { junior: true })).toBeNull();
    expect(await resolve(doc, { cardInput: { ...teamListCard, junior: true } })).toBeNull();
    await api("delete", `/club-photo-collections/${id}`);
    const after = await resolve(doc);
    expect(after).not.toHaveProperty("photo0");
    expect(after?.photo1?.url).toBe(urlOf("captain"));
  });

  it("a draft picks them when its design changes, and re-picks when its collection does", async () => {
    const id = await createCollection("Draft pool");
    const [d] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "teamlist",
        status: "awaiting_review",
        cardInput: teamListCard,
        appPath: "/fixtures",
        sourceKey: `teamlist:${fixtureId}`,
        templateVersion: 1,
      })
      .returning();
    const design = docWith(
      { source: { kind: "collection", collectionId: id } },
      { link: "cap", source: { kind: "player", pick: "captain" } },
    );
    const patched = await api("patch", `/social-drafts/${d.id}`).send({ adjustments: design });
    expect(patched.status).toBe(200);
    // The empty collection finds nothing yet; a linked layer is keyed by its link.
    expect(patched.body.layerPhotos).toEqual({
      "link:cap": {
        url: urlOf("captain"),
        focus: { box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, width: 1000, height: 800 },
      },
    });
    await api("post", `/club-photo-collections/${id}/photos`).send({ photoIds: [photos.crowd2] });
    const [after] = await db.select().from(socialDraftsTable).where(eq(socialDraftsTable.id, d.id));
    expect(after.layerPhotos?.photo0?.url).toBe(urlOf("crowd2"));
    // An admin's own photo: the draft keeps its layer photos as they were.
    await api("patch", `/social-drafts/${d.id}`).send({ photoUrl: urlOf("crowd3") });
    await api("post", `/club-photo-collections/${id}/photos/remove`).send({
      photoIds: [photos.crowd2],
    });
    const [manual] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, d.id));
    expect(manual.layerPhotos?.photo0?.url).toBe(urlOf("crowd2"));
  });

  it("previews a template's sources against the latest published team list", async () => {
    const id = await createCollection("Preview pool");
    await api("post", `/club-photo-collections/${id}/photos`).send({ photoIds: [photos.crowd4] });
    const res = await api("post", "/club-templates/layer-photo-preview").send({
      kind: "teamList",
      document: docWith(
        { source: { kind: "collection", collectionId: id } },
        { source: { kind: "player", pick: "keeper" } },
      ),
    });
    expect(res.status).toBe(200);
    expect(res.body.teamList).toEqual({ grade: GRADE, opponent: "Rivals" });
    expect(res.body.layerPhotos.photo0.url).toBe(urlOf("crowd4"));
    expect(res.body.layerPhotos.photo1.url).toBe(urlOf("keeper"));
    // Junior kinds get none.
    const junior = await api("post", "/club-templates/layer-photo-preview").send({
      kind: "juniorHighlights",
      document: docWith({ source: { kind: "collection", collectionId: id } }),
    });
    expect(junior.body.layerPhotos).toEqual({});
  });
});
