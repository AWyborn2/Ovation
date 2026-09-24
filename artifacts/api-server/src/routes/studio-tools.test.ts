/**
 * Social Studio U19 — the Studio tools routes: background removal of senior
 * library photos (stored as a derived PNG linked to its source) and match-day
 * forecasts per fixture venue. Real-DB integration test (needs DATABASE_URL);
 * object storage is an in-memory store and every external call is a mocked
 * `fetch` — nothing leaves the test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
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
  fixturesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { setPhotoStore, type PhotoStore } from "../lib/photo-store";
import { clearForecastCache } from "../lib/integrations/forecast";

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
    const path = `/objects/library/tools-${STAMP}-${counter++}`;
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
let playerId: number;

const api = (method: "get" | "post", path: string, as: "own" | "other" = "own") => {
  const agent = request(app);
  const req = method === "get" ? agent.get(`/api${path}`) : agent.post(`/api${path}`);
  return req
    .set("Cookie", as === "own" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "own" ? tenantId : otherTenantId));
};

async function libraryPhoto(tid: number, tags: number[] = []): Promise<number> {
  const data = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#00305c" },
  })
    .jpeg()
    .toBuffer();
  const objectPath = await memoryStore.write(data, "image/jpeg");
  const [row] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId: tid,
      objectPath,
      thumbPath: objectPath,
      width: 64,
      height: 48,
      season: 2025,
      grade: "A Grade",
    })
    .returning();
  if (tags.length)
    await db
      .insert(clubPhotoPlayersTable)
      .values(tags.map((p) => ({ tenantId: tid, photoId: row.id, playerId: p })));
  return row.id;
}

let fetchMock: ReturnType<typeof vi.fn>;
const photoroomCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("photoroom"));
const meteoCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("open-meteo"));

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-studio-tools";
  setPhotoStore(memoryStore);
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `tools-${STAMP}`, centralClubId: 9953, name: "Tools Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `tools-o-${STAMP}`, centralClubId: 9954, name: "Other", plan: "pro" })
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
        username: `tools_${key}_${STAMP}`,
        displayName: "Tools Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    const c = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    if (tid === tenantId) cookie = c;
    else otherCookie = c;
  }
  const [p] = await db
    .insert(playersTable)
    .values({ surname: `Cutout${STAMP}`, givenName: "Sam" })
    .returning();
  playerId = p.id;
});

afterAll(async () => {
  setPhotoStore(null);
  await db
    .delete(clubPhotosTable)
    .where(inArray(clubPhotosTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(playersTable).where(eq(playersTable.id, playerId));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

beforeEach(async () => {
  clearForecastCache();
  process.env.PHOTOROOM_API_KEY = "pr-test-key";
  const cutOut = await sharp({
    create: { width: 64, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("photoroom")) return new Response(new Uint8Array(cutOut), { status: 200 });
    if (url.includes("open-meteo")) {
      const hour = new URL(url).searchParams.get("start_hour");
      return new Response(
        JSON.stringify({ hourly: { time: [hour], temperature_2m: [26.2], weather_code: [0] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PHOTOROOM_API_KEY;
});

describe("background removal", () => {
  it("stores a transparent PNG cut-out in the library, linked to its source", async () => {
    const sourceId = await libraryPhoto(tenantId, [playerId]);
    const [before] = await db
      .select()
      .from(clubPhotosTable)
      .where(eq(clubPhotosTable.id, sourceId));

    const res = await api("post", "/studio-tools/background-removal").send({ photoId: sourceId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sourcePhotoId: sourceId,
      season: 2025,
      grade: "A Grade",
      playerIds: [playerId],
    });
    expect(res.body.id).not.toBe(sourceId);
    expect(photoroomCalls()).toHaveLength(1);

    const [row] = await db
      .select()
      .from(clubPhotosTable)
      .where(eq(clubPhotosTable.id, res.body.id));
    const stored = objects.get(row.objectPath)!;
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect((await sharp(objects.get(row.thumbPath)!).metadata()).format).toBe("png");

    // The source photo is untouched.
    const [after] = await db.select().from(clubPhotosTable).where(eq(clubPhotosTable.id, sourceId));
    expect(after).toEqual(before);

    const listed = await api("get", "/club-photos");
    const cut = listed.body.find((p: { id: number }) => p.id === res.body.id);
    expect(cut.sourcePhotoId).toBe(sourceId);
  });

  it("returns a clear failure on a provider error and stores nothing", async () => {
    const sourceId = await libraryPhoto(tenantId);
    fetchMock.mockResolvedValueOnce(new Response("quota exceeded", { status: 402 }));
    const countBefore = (
      await db.select().from(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId))
    ).length;

    const res = await api("post", "/studio-tools/background-removal").send({ photoId: sourceId });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/could not process this photo/);
    const countAfter = (
      await db.select().from(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId))
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it("rejects a photo outside the club library before any external call", async () => {
    const foreignId = await libraryPhoto(otherTenantId);
    const res = await api("post", "/studio-tools/background-removal").send({ photoId: foreignId });
    expect(res.status).toBe(404);
    const missing = await api("post", "/studio-tools/background-removal").send({
      photoId: 2_000_000_000,
    });
    expect(missing.status).toBe(404);
    expect(photoroomCalls()).toHaveLength(0);
  });

  it("rejects a photo tagged with a junior or a fill-in before any external call", async () => {
    // Tags written straight to the table: the tagging routes refuse these ids,
    // so this is the defence-in-depth path.
    const juniorTagged = await libraryPhoto(tenantId, [playerId, 1_999_999_999]);
    const fillInTagged = await libraryPhoto(tenantId, [90_001]);
    for (const photoId of [juniorTagged, fillInTagged]) {
      const res = await api("post", "/studio-tools/background-removal").send({ photoId });
      expect(res.status).toBe(422);
    }
    expect(photoroomCalls()).toHaveLength(0);
  });

  it("returns 404 on every endpoint when no API key is configured", async () => {
    const sourceId = await libraryPhoto(tenantId);
    expect((await api("get", "/studio-tools/background-removal")).status).toBe(200);
    delete process.env.PHOTOROOM_API_KEY;
    expect((await api("get", "/studio-tools/background-removal")).status).toBe(404);
    const res = await api("post", "/studio-tools/background-removal").send({ photoId: sourceId });
    expect(res.status).toBe(404);
    expect(photoroomCalls()).toHaveLength(0);
  });

  it("is admin-only", async () => {
    const res = await request(app)
      .get("/api/studio-tools/background-removal")
      .set("x-tenant-id", String(tenantId));
    expect(res.status).toBe(401);
  });
});

describe("forecast", () => {
  const inTwoDays = () => new Date(Date.now() + 2 * 24 * 3600_000);

  async function fixture(tid: number, coords: boolean): Promise<number> {
    const [row] = await db
      .insert(fixturesTable)
      .values({
        tenantId: tid,
        grade: "A Grade",
        opponentName: "Visitors CC",
        venue: "Home Oval",
        startAt: inTwoDays(),
        venueLatitude: coords ? -32.54 : null,
        venueLongitude: coords ? 115.74 : null,
      })
      .returning();
    return row.id;
  }

  it("returns temperature and conditions; a second request within the hour hits the cache", async () => {
    const id = await fixture(tenantId, true);
    const res = await api("get", `/studio-tools/forecast?fixtureId=${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fixtureId: id,
      venue: "Home Oval",
      temperatureC: 26,
      weatherCode: 0,
      conditions: "Sunny",
    });
    const again = await api("get", `/studio-tools/forecast?fixtureId=${id}`);
    expect(again.status).toBe(200);
    expect(meteoCalls()).toHaveLength(1);
    const url = new URL(String(meteoCalls()[0][0]));
    expect(url.searchParams.get("models")).toBe("bom_access_global");
  });

  it("returns 404 without venue coordinates, and for another club's fixture", async () => {
    const noCoords = await fixture(tenantId, false);
    expect((await api("get", `/studio-tools/forecast?fixtureId=${noCoords}`)).status).toBe(404);
    const foreign = await fixture(otherTenantId, true);
    expect((await api("get", `/studio-tools/forecast?fixtureId=${foreign}`)).status).toBe(404);
    expect(meteoCalls()).toHaveLength(0);
  });

  it("returns 502 when the forecast provider fails", async () => {
    const id = await fixture(tenantId, true);
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));
    expect((await api("get", `/studio-tools/forecast?fixtureId=${id}`)).status).toBe(502);
  });
});
