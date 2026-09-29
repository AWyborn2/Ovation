import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray, count } from "drizzle-orm";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  playerImagesTable,
  importsTable,
} from "@workspace/db";

/**
 * Native stats write fence (hybrid-stats plan, U2 / KTD10).
 *
 * The native stats tables (imports, players, player merges, the photo gallery)
 * carry no tenant_id and hold only Halls Head's (tenant #1's) history. A
 * signed-in admin of any other tenant must be refused on every write route —
 * with no native row changing — while a Halls Head admin keeps full access.
 *
 * Real-DB suite: needs DATABASE_URL and the seeded tenant 1 (runs in CI).
 */

const STAMP = Date.now();
const MISSING_ID = 2_000_000_000;

type Guarded = {
  name: string;
  method: "post" | "patch" | "delete";
  path: () => string;
  body?: Record<string, unknown>;
};

describe("native stats write fence", () => {
  let centralTenantId: number;
  let nativeConfiguredTenantId: number;
  let hhAdminId: number;
  let t2AdminId: number;
  let t3AdminId: number;
  let hhCookie: string;
  let t2Cookie: string;
  let t3Cookie: string;
  // Halls Head (native) fixtures a foreign admin will aim at.
  let hhPlayerId: number;
  let hhOtherPlayerId: number;
  let hhImageId: number;
  let csvImportId: number;
  let batchImportId: number;
  const createdPlayerIds: number[] = [];

  const cookie = (adminId: number) =>
    `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

  const guarded = (): Guarded[] => [
    { name: "scorecard import", method: "post", path: () => "/api/imports/match-xlsx" },
    { name: "CSV import", method: "post", path: () => "/api/imports/playcricket-csv" },
    {
      name: "CSV/match import commit",
      method: "post",
      path: () => `/api/imports/${csvImportId}/commit`,
    },
    { name: "import delete", method: "delete", path: () => `/api/imports/${csvImportId}` },
    { name: "batch upload", method: "post", path: () => "/api/imports/match-batch" },
    {
      name: "batch revalidate",
      method: "post",
      path: () => `/api/imports/match-batch/${batchImportId}/revalidate`,
    },
    {
      name: "batch commit",
      method: "post",
      path: () => `/api/imports/match-batch/${batchImportId}/commit`,
    },
    {
      name: "undo season",
      method: "post",
      path: () => "/api/imports/undo-season",
      body: { grade: "A Grade", season: 2024 },
    },
    {
      name: "player create",
      method: "post",
      path: () => "/api/players",
      body: { surname: `FenceCreate${STAMP}`, givenName: "Foreign" },
    },
    {
      name: "player patch",
      method: "patch",
      path: () => `/api/players/${hhPlayerId}`,
      body: { surname: `Hijacked${STAMP}` },
    },
    { name: "player delete", method: "delete", path: () => `/api/players/${hhPlayerId}` },
    {
      name: "player merge",
      method: "post",
      path: () => `/api/players/${hhOtherPlayerId}/merge`,
      body: { keeperId: hhPlayerId },
    },
    {
      name: "image upload",
      method: "post",
      path: () => `/api/players/${hhPlayerId}/images`,
      body: { imageUrl: "/api/storage/objects/foreign" },
    },
    {
      name: "image delete",
      method: "delete",
      path: () => `/api/players/${hhPlayerId}/images/${hhImageId}`,
    },
    {
      name: "image set default",
      method: "post",
      path: () => `/api/players/${hhPlayerId}/images/${hhImageId}/default`,
    },
  ];

  const send = (g: Guarded, tenantId: number, sessionCookie?: string) => {
    let r = request(app)[g.method](g.path()).set("x-tenant-id", String(tenantId));
    if (sessionCookie) r = r.set("Cookie", sessionCookie);
    return g.body ? r.send(g.body) : r;
  };

  /** Everything a foreign write could touch, for a before/after comparison. */
  const snapshot = async () => {
    const players = await db
      .select()
      .from(playersTable)
      .where(inArray(playersTable.id, [hhPlayerId, hhOtherPlayerId]))
      .orderBy(playersTable.id);
    const images = await db
      .select()
      .from(playerImagesTable)
      .where(eq(playerImagesTable.playerId, hhPlayerId))
      .orderBy(playerImagesTable.id);
    const imports = await db
      .select({ id: importsTable.id, status: importsTable.status })
      .from(importsTable)
      .where(inArray(importsTable.id, [csvImportId, batchImportId]))
      .orderBy(importsTable.id);
    const [{ n: playerCount }] = await db.select({ n: count() }).from(playersTable);
    const [{ n: importCount }] = await db.select({ n: count() }).from(importsTable);
    return { players, images, imports, playerCount, importCount };
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-native-fence";

    // A normal central-reading club, and a misconfigured one still flagged
    // native — neither may write Halls Head's native tables.
    const [central] = await db
      .insert(tenantsTable)
      .values({
        slug: `fence-central-${STAMP}`,
        centralClubId: 997,
        name: "Fence Central Tenant",
        plan: "pilot",
        readsFromCentral: true,
      })
      .returning();
    centralTenantId = central.id;
    const [nativeCfg] = await db
      .insert(tenantsTable)
      .values({
        slug: `fence-native-${STAMP}`,
        centralClubId: 996,
        name: "Fence Native-Configured Tenant",
        plan: "pilot",
        readsFromCentral: false,
      })
      .returning();
    nativeConfiguredTenantId = nativeCfg.id;

    const [hh] = await db
      .insert(adminsTable)
      .values({ username: `fence_hh_${STAMP}`, displayName: "HH", passwordHash: "x" })
      .returning();
    const [t2] = await db
      .insert(adminsTable)
      .values({
        tenantId: centralTenantId,
        username: `fence_t2_${STAMP}`,
        displayName: "T2",
        passwordHash: "x",
      })
      .returning();
    const [t3] = await db
      .insert(adminsTable)
      .values({
        tenantId: nativeConfiguredTenantId,
        username: `fence_t3_${STAMP}`,
        displayName: "T3",
        passwordHash: "x",
      })
      .returning();
    hhAdminId = hh.id;
    t2AdminId = t2.id;
    t3AdminId = t3.id;
    hhCookie = cookie(hhAdminId);
    t2Cookie = cookie(t2AdminId);
    t3Cookie = cookie(t3AdminId);

    const [p1] = await db
      .insert(playersTable)
      .values({
        surname: `FenceKeeper${STAMP}`,
        givenName: "Native",
        imageUrl: "/api/storage/objects/hh",
      })
      .returning();
    const [p2] = await db
      .insert(playersTable)
      .values({ surname: `FenceDup${STAMP}`, givenName: "Native" })
      .returning();
    hhPlayerId = p1.id;
    hhOtherPlayerId = p2.id;
    createdPlayerIds.push(p1.id, p2.id);

    const [img] = await db
      .insert(playerImagesTable)
      .values({
        tenantId: 1,
        playerId: hhPlayerId,
        imageUrl: "/api/storage/objects/hh",
        isDefault: true,
      })
      .returning();
    hhImageId = img.id;

    const [csv] = await db
      .insert(importsTable)
      .values({ filename: `fence-${STAMP}.csv`, kind: "csv", status: "pending" })
      .returning();
    const [batch] = await db
      .insert(importsTable)
      .values({ filename: `fence-${STAMP}.zip`, kind: "match-batch", status: "pending" })
      .returning();
    csvImportId = csv.id;
    batchImportId = batch.id;
  });

  afterAll(async () => {
    await db.delete(importsTable).where(inArray(importsTable.id, [csvImportId, batchImportId]));
    if (createdPlayerIds.length > 0) {
      await db
        .delete(playerImagesTable)
        .where(inArray(playerImagesTable.playerId, createdPlayerIds));
      await db.delete(playersTable).where(inArray(playersTable.id, createdPlayerIds));
    }
    await db.delete(adminsTable).where(inArray(adminsTable.id, [hhAdminId, t2AdminId, t3AdminId]));
    await db
      .delete(tenantsTable)
      .where(inArray(tenantsTable.id, [centralTenantId, nativeConfiguredTenantId]));
  });

  it("refuses an unauthenticated request with 401 before the fence", async () => {
    for (const g of guarded()) {
      const res = await send(g, centralTenantId);
      expect(res.status, g.name).toBe(401);
    }
  });

  it("refuses a central tenant's admin on every native write, changing nothing", async () => {
    const before = await snapshot();
    for (const g of guarded()) {
      const res = await send(g, centralTenantId, t2Cookie);
      expect(res.status, g.name).toBe(409);
      expect(res.body.error, g.name).toMatch(/native stats/i);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a native-configured non-Halls-Head tenant too, changing nothing", async () => {
    const before = await snapshot();
    for (const g of guarded()) {
      const res = await send(g, nativeConfiguredTenantId, t3Cookie);
      expect(res.status, g.name).toBe(409);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("does not list Halls Head's player images to another tenant, nor self-heal them", async () => {
    // Legacy HH player with an image_url but no gallery row: the self-heal must
    // not copy Halls Head's photo into another tenant's gallery.
    const [legacy] = await db
      .insert(playersTable)
      .values({
        surname: `FenceLegacy${STAMP}`,
        givenName: "Native",
        imageUrl: "/api/storage/objects/hh-legacy",
      })
      .returning();
    createdPlayerIds.push(legacy.id);

    const listed = await request(app)
      .get(`/api/players/${hhPlayerId}/images`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(200);
    expect(listed.body).toEqual([]);

    const healed = await request(app)
      .get(`/api/players/${legacy.id}/images`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(200);
    expect(healed.body).toEqual([]);
    const rows = await db
      .select()
      .from(playerImagesTable)
      .where(eq(playerImagesTable.playerId, legacy.id));
    expect(rows).toEqual([]);

    // Halls Head still sees (and self-heals) its own gallery, tagged tenant 1.
    const hhList = await request(app)
      .get(`/api/players/${hhPlayerId}/images`)
      .set("x-tenant-id", "1")
      .expect(200);
    expect(hhList.body.map((i: { id: number }) => i.id)).toEqual([hhImageId]);
    const hhHealed = await request(app)
      .get(`/api/players/${legacy.id}/images`)
      .set("x-tenant-id", "1")
      .expect(200);
    expect(hhHealed.body).toHaveLength(1);
    const [healedRow] = await db
      .select()
      .from(playerImagesTable)
      .where(eq(playerImagesTable.playerId, legacy.id));
    expect(healedRow.tenantId).toBe(1);
  });

  it("lets a Halls Head admin past the fence on every import route", async () => {
    // No file / unknown id: each route answers with its own validation, not 409.
    const noFile = [
      "/api/imports/match-xlsx",
      "/api/imports/playcricket-csv",
      "/api/imports/match-batch",
    ];
    for (const path of noFile) {
      const res = await request(app).post(path).set("x-tenant-id", "1").set("Cookie", hhCookie);
      expect(res.status, path).toBe(400);
    }
    for (const path of [
      `/api/imports/${MISSING_ID}/commit`,
      `/api/imports/match-batch/${MISSING_ID}/revalidate`,
      `/api/imports/match-batch/${MISSING_ID}/commit`,
    ]) {
      const res = await request(app).post(path).set("x-tenant-id", "1").set("Cookie", hhCookie);
      expect(res.status, path).not.toBe(409);
      expect(res.status, path).toBeLessThan(500);
    }
    const del = await request(app)
      .delete(`/api/imports/${MISSING_ID}`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie);
    expect(del.status).not.toBe(409);
    expect(del.status).toBeLessThan(500);
    const undo = await request(app)
      .post("/api/imports/undo-season")
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .send({});
    expect(undo.status).toBe(400);
  });

  it("lets a Halls Head admin create, patch, photograph, merge and delete players", async () => {
    const created = await request(app)
      .post("/api/players")
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .send({ surname: `FenceHH${STAMP}`, givenName: "Made" })
      .expect(201);
    const newId = created.body.id as number;
    createdPlayerIds.push(newId);

    await request(app)
      .patch(`/api/players/${newId}`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .send({ givenName: "Renamed" })
      .expect(200);

    const img = await request(app)
      .post(`/api/players/${newId}/images`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .send({ imageUrl: "/api/storage/objects/hh-new" })
      .expect(201);
    expect(img.body.tenantId).toBe(1);
    const img2 = await request(app)
      .post(`/api/players/${newId}/images`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .send({ imageUrl: "/api/storage/objects/hh-new-2" })
      .expect(201);
    await request(app)
      .post(`/api/players/${newId}/images/${img2.body.id}/default`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .expect(200);
    await request(app)
      .delete(`/api/players/${newId}/images/${img.body.id}`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .expect(204);

    // Merge the new player into the fixture keeper, then delete the keeper's twin.
    await request(app)
      .post(`/api/players/${newId}/merge`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .send({ keeperId: hhOtherPlayerId })
      .expect(200);
    const [gone] = await db.select().from(playersTable).where(eq(playersTable.id, newId));
    expect(gone).toBeUndefined();

    await request(app)
      .delete(`/api/players/${hhOtherPlayerId}`)
      .set("x-tenant-id", "1")
      .set("Cookie", hhCookie)
      .expect(204);
  });
});
