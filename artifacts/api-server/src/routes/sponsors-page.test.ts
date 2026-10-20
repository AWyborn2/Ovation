/**
 * Sponsors page options (ADR-010 P6, migration 0053): a sponsor's tier, the
 * club's sponsors page background photo, and what the Weekend Carousel's
 * sources give the page (background, next senior home game, socials). Every
 * read and write is tenant-scoped: one club can neither pick another club's
 * photo nor see its fixtures, sponsors or background.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  captionTemplatesTable,
  clubPhotoPlayersTable,
  clubPhotosTable,
  fixturesTable,
  socialConnectionsTable,
  socialSettingsTable,
  sponsorsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];
const photo: Record<"clubWide" | "graded" | "otherClub" | "fillIn", number> = {
  clubWide: 0,
  graded: 0,
  otherClub: 0,
  fillIn: 0,
};
let homeId = 0;

const as = (i: number) => ({
  get: (url: string) =>
    request(app).get(url).set("Cookie", cookies[i]).set("x-tenant-id", String(tenantIds[i])),
  post: (url: string, body: object) =>
    request(app)
      .post(url)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i]))
      .send(body),
  patch: (url: string, body: object) =>
    request(app)
      .patch(url)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i]))
      .send(body),
});

const libraryPhoto = (tenantId: number, grade: string | null) => ({
  tenantId,
  objectPath: `/objects/p6-${STAMP}-${Math.random()}.jpg`,
  thumbPath: `/objects/p6-${STAMP}-${Math.random()}-t.jpg`,
  width: 1200,
  height: 800,
  season: 2026,
  grade,
});

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "sponsors-page-test";
  for (const i of [0, 1]) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sponsors-page-${i}-${STAMP}`,
        centralClubId: 9960 + i,
        name: `Sponsors Club ${i}`,
        plan: "pro",
      })
      .returning();
    tenantIds.push(t.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `sponsors_page_${i}_${STAMP}`,
        displayName: "Sponsors",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
  }
  const [a, b] = tenantIds;
  const rows = await db
    .insert(clubPhotosTable)
    .values([
      libraryPhoto(a, null),
      libraryPhoto(a, "A Grade"),
      libraryPhoto(b, null),
      libraryPhoto(a, null),
    ])
    .returning({ id: clubPhotosTable.id });
  [photo.clubWide, photo.graded, photo.otherClub, photo.fillIn] = rows.map((r) => r.id);
  // A fill-in player tagged in a photo keeps it off cards (fill-in exclusion).
  await db
    .insert(clubPhotoPlayersTable)
    .values({ tenantId: a, photoId: photo.fillIn, playerId: 90001 });
  const home = {
    tenantId: a,
    grade: "A Grade",
    opponentName: "Visitors Cricket Club Inc",
    isHome: true,
    source: "manual",
    venue: "Club Oval",
  };
  const fixtures = await db
    .insert(fixturesTable)
    .values([
      // Before the set's first day: not "next".
      { ...home, startAt: new Date("2026-10-08T04:00:00Z") },
      // Within the set, but not a game the page should name.
      { ...home, opponentName: "Bye", startAt: new Date("2026-10-10T01:00:00Z") },
      { ...home, notes: "Cancelled", startAt: new Date("2026-10-10T01:30:00Z") },
      { ...home, grade: "U15 Boys", startAt: new Date("2026-10-10T01:45:00Z") },
      { ...home, isHome: false, startAt: new Date("2026-10-10T01:50:00Z") },
      // The next senior home game.
      { ...home, startAt: new Date("2026-10-10T02:00:00Z") },
      { ...home, startAt: new Date("2026-10-17T02:00:00Z") },
      // Another club's home game, earlier still.
      { ...home, tenantId: b, startAt: new Date("2026-10-09T23:00:00Z") },
    ])
    .returning({ id: fixturesTable.id });
  homeId = fixtures[5].id;
  await db.insert(socialConnectionsTable).values({
    tenantId: a,
    provider: "meta",
    status: "connected",
    igUsername: "ourclub",
    pageName: "Our Club",
  });
});

afterAll(async () => {
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db
    .delete(socialConnectionsTable)
    .where(inArray(socialConnectionsTable.tenantId, tenantIds));
  await db.delete(clubPhotosTable).where(inArray(clubPhotosTable.tenantId, tenantIds));
  await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, tenantIds));
  await db.delete(sponsorsTable).where(inArray(sponsorsTable.tenantId, tenantIds));
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  for (const id of tenantIds) await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
});

describe("sponsor tier", () => {
  let sponsorId = 0;

  it("defaults to standard and saves major", async () => {
    const plain = await as(0)
      .post("/api/sponsors", { name: "Plain", logoUrl: "/api/storage/objects/plain.png" })
      .expect(201);
    expect(plain.body.tier).toBe("standard");
    const major = await as(0)
      .post("/api/sponsors", {
        name: "Major",
        logoUrl: "/api/storage/objects/major.png",
        tier: "major",
      })
      .expect(201);
    expect(major.body.tier).toBe("major");
    sponsorId = plain.body.id;
  });

  it("changes tier, and refuses an unknown one", async () => {
    const res = await as(0).patch(`/api/sponsors/${sponsorId}`, { tier: "major" }).expect(200);
    expect(res.body.tier).toBe("major");
    await as(0).patch(`/api/sponsors/${sponsorId}`, { tier: "gold" }).expect(400);
  });

  it("the active sponsors carry their tier", async () => {
    const res = await as(0).get("/api/social-settings").expect(200);
    expect(
      (res.body.activeSponsors as Array<{ name: string; tier: string }>).map((s) => s.tier),
    ).toEqual(["major", "major"]);
  });

  it("another club can neither change nor see the sponsor", async () => {
    await as(1).patch(`/api/sponsors/${sponsorId}`, { tier: "standard" }).expect(404);
    const [row] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsorId));
    expect(row.tier).toBe("major");
    expect((await as(1).get("/api/social-settings").expect(200)).body.activeSponsors).toEqual([]);
  });
});

describe("sponsors page background", () => {
  it("is null until chosen", async () => {
    const res = await as(0).get("/api/social-settings").expect(200);
    expect(res.body.settings.sponsorsBackgroundPhotoId).toBeNull();
  });

  it("saves one of the club's own club-wide photos", async () => {
    const res = await as(0)
      .patch("/api/social-settings", { sponsorsBackgroundPhotoId: photo.clubWide })
      .expect(200);
    expect(res.body.sponsorsBackgroundPhotoId).toBe(photo.clubWide);
  });

  it("refuses a grade photo", async () => {
    await as(0)
      .patch("/api/social-settings", { sponsorsBackgroundPhotoId: photo.graded })
      .expect(400);
  });

  it("refuses another club's photo (tenant isolation)", async () => {
    await as(1)
      .patch("/api/social-settings", { sponsorsBackgroundPhotoId: photo.clubWide })
      .expect(400);
    await as(0)
      .patch("/api/social-settings", { sponsorsBackgroundPhotoId: photo.otherClub })
      .expect(400);
    const res = await as(1).get("/api/social-settings").expect(200);
    expect(res.body.settings.sponsorsBackgroundPhotoId).toBeNull();
  });

  it("null clears it, and deleting the photo clears it too", async () => {
    const cleared = await as(0)
      .patch("/api/social-settings", { sponsorsBackgroundPhotoId: null })
      .expect(200);
    expect(cleared.body.sponsorsBackgroundPhotoId).toBeNull();
    const [spare] = await db
      .insert(clubPhotosTable)
      .values(libraryPhoto(tenantIds[0], null))
      .returning({ id: clubPhotosTable.id });
    await as(0).patch("/api/social-settings", { sponsorsBackgroundPhotoId: spare.id }).expect(200);
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.id, spare.id));
    const res = await as(0).get("/api/social-settings").expect(200);
    expect(res.body.settings.sponsorsBackgroundPhotoId).toBeNull();
  });
});

describe("weekend carousel sources: sponsors page", () => {
  const sources = (i: number, audience = "all") =>
    as(i).get(
      `/api/weekend-carousel/sources?from=2026-10-10&to=2026-10-11&setType=matchDay&audience=${audience}`,
    );

  beforeAll(async () => {
    await as(0)
      .patch("/api/social-settings", {
        sponsorsBackgroundPhotoId: photo.clubWide,
        clubUrl: "https://www.ourclub.com.au/",
      })
      .expect(200);
  });

  it("gives the background, the next senior home game and the socials", async () => {
    const res = await sources(0).expect(200);
    const page = res.body.sponsorsPage;
    expect(page.backgroundPhoto.id).toBe(photo.clubWide);
    expect(page.nextHomeGame).toMatchObject({
      kind: "matchDay",
      page: "fixture",
      fixtureId: homeId,
      junior: false,
      grade: "A Grade",
      homeAway: "HOME",
      venue: "Club Oval",
      date: "SAT 10 OCT",
    });
    // The short name, as every card prints it.
    expect(page.nextHomeGame.opposition.name).toBe("Visitors");
    expect(page.socials).toEqual(["@ourclub", "Our Club", "ourclub.com.au"]);
  });

  it("a junior-only set reads no senior fixture", async () => {
    const res = await sources(0, "junior").expect(200);
    expect(res.body.sponsorsPage.nextHomeGame).toBeNull();
  });

  it("a photo with a fill-in player tagged is never the background", async () => {
    await db
      .update(socialSettingsTable)
      .set({ sponsorsBackgroundPhotoId: photo.fillIn })
      .where(eq(socialSettingsTable.tenantId, tenantIds[0]));
    const res = await sources(0).expect(200);
    expect(res.body.sponsorsPage.backgroundPhoto).toBeNull();
  });

  it("another club gets only its own (tenant isolation)", async () => {
    // Even a stored id pointing at this club's photo resolves to nothing there.
    await as(1).get("/api/social-settings").expect(200);
    await db
      .update(socialSettingsTable)
      .set({ sponsorsBackgroundPhotoId: photo.clubWide })
      .where(eq(socialSettingsTable.tenantId, tenantIds[1]));
    const res = await sources(1).expect(200);
    const page = res.body.sponsorsPage;
    expect(page.backgroundPhoto).toBeNull();
    expect(page.socials).toEqual([]);
    // Its own home game, never this club's.
    expect(page.nextHomeGame?.fixtureId).not.toBe(homeId);
    expect(page.nextHomeGame?.date).toBe("SAT 10 OCT");
  });
});
