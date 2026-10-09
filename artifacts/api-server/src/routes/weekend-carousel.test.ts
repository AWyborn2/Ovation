import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, tenantsTable, adminsTable, fixturesTable, clubPhotosTable, clubPhotoPlayersTable, teamListsTable, matchDisplaySettingsTable, shirtNumbersTable, shirtNumberSettingsTable } from "@workspace/db";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const centralRows = vi.hoisted(() => vi.fn());
vi.mock("@workspace/db/central", async importOriginal => ({
  ...await importOriginal<typeof import("@workspace/db/central")>(),
  centralDb: { select: () => ({ from: () => ({ where: centralRows }) }) },
}));
const stamp = Date.now();
let tenant: number, other: number, cookie: string;
let expected: number[], photoId: number;
let coverIds: number[];
const cancelledId = randomUUID();
const orgId = randomUUID();

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "weekend-carousel-test";
  const [a, b] = await db.insert(tenantsTable).values([
    { slug: `weekend-a-${stamp}`, name: "Weekend Test A", centralClubId: 9891, readsFromCentral: true, playhqOrgId: orgId },
    { slug: `weekend-b-${stamp}`, name: "Weekend Test B", centralClubId: 9892, readsFromCentral: true },
  ]).returning();
  tenant = a.id; other = b.id;
  const [admin] = await db.insert(adminsTable).values({ tenantId: tenant, username: `weekend-${stamp}`, displayName: "Weekend Test", passwordHash: "x" }).returning();
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  const common = { tenantId: tenant, grade: "A Grade", opponentName: "Visitors", isHome: true, source: "manual" };
  const rows = await db.insert(fixturesTable).values([
    { ...common, startAt: new Date("2026-10-08T16:00:00Z") },
    { ...common, startAt: new Date("2026-10-11T15:59:59Z") },
    { ...common, startAt: new Date("2026-10-08T15:59:59Z") },
    { ...common, startAt: new Date("2026-10-11T16:00:00Z") },
    { ...common, opponentName: "Bye", startAt: new Date("2026-10-10T04:00:00Z") },
    { ...common, notes: "Cancelled", startAt: new Date("2026-10-10T04:00:00Z") },
    { ...common, source: "playhq", playhqMatchId: cancelledId, startAt: new Date("2026-10-10T04:00:00Z") },
    { ...common, tenantId: other, startAt: new Date("2026-10-10T04:00:00Z") },
    { ...common, grade: "U15", startAt: new Date("2026-10-10T04:00:00Z") },
  ]).returning();
  expected = [rows[0].id, rows[1].id, rows[8].id];
  await db.insert(teamListsTable).values([
    { tenantId: tenant, fixtureId: rows[0].id, isPublished: true, source: "admin",
       players: [{ playerId: -18001, displayName: "Sam Captain", order: 1, role: "C/WK" }, { displayName: "Twelve Extra", order: 12 }] },
    { tenantId: tenant, fixtureId: rows[1].id, isPublished: false, source: "selection",
      players: [{ displayName: "Unpublished Person", order: 1 }] },
    { tenantId: tenant, fixtureId: rows[8].id, isPublished: true,
      players: [{ displayName: "Private Junior", order: 1 }] },
    { tenantId: other, fixtureId: rows[7].id, isPublished: true,
      players: [{ displayName: "Other Tenant", order: 1 }] },
  ]);
  const p = { tenantId: tenant, objectPath: `/objects/test-${stamp}`, thumbPath: `/objects/test-thumb-${stamp}`, width: 100, height: 100, grade: "A Grade", photoTypes: ["batting"] };
  const photos = await db.insert(clubPhotosTable).values([
    { ...p, photoTypes: ["fielding", "celebrating"] },
    { ...p, tenantId: other },
    { ...p, grade: "B Grade" },
    { ...p, grade: "U15" },
    { ...p, grade: null },
    { ...p, photoTypes: ["team"] },
  ]).returning();
  photoId = photos[0].id;
  const cover = { ...p, grade: null, season: 2026 };
  const covers = await db.insert(clubPhotosTable).values([
    { ...cover, photoTypes: ["team"] },
    { ...cover, photoTypes: ["celebrating"] },
    { ...cover, photoTypes: [] },
    { ...cover, season: 2025 },
    { ...cover, season: null },
    { ...cover, grade: "A Grade" },
    { ...cover, grade: "U15" },
    { ...cover, tenantId: other },
    { ...cover }, // Invalid legacy player tag: not in this tenant's senior crosswalk.
  ]).returning();
  coverIds = covers.slice(0, 3).map(p => p.id);
  await db.insert(clubPhotoPlayersTable).values({ tenantId: tenant, photoId: covers[8].id, playerId: -12345 });
  centralRows.mockResolvedValue([{ id: cancelledId, status: "CANCELLED" }]);
});
afterAll(async () => {
  for (const id of [tenant, other].filter(Boolean)) {
    await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.tenantId, id));
    await db.delete(shirtNumberSettingsTable).where(eq(shirtNumberSettingsTable.tenantId, id));
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, id));
    await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, id));
    await db.delete(matchDisplaySettingsTable).where(eq(matchDisplaySettingsTable.tenantId, id));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
});
const fetchSources = (tenantId = tenant) => request(app).get("/api/weekend-carousel/sources")
  .set("x-tenant-id", String(tenantId)).set("Cookie", cookie);

describe("weekend carousel protected sources", () => {
  it("reads manual playing-number changes afresh, scoped to fixture season and club", async () => {
    await db.insert(shirtNumberSettingsTable).values({ tenantId: tenant, enabled: true })
      .onConflictDoUpdate({ target: shirtNumberSettingsTable.tenantId, set: { enabled: true } });
    const entries = await db.insert(shirtNumbersTable).values([
      { tenantId: tenant, season: 2026, playerId: -18001, name: `Audit Captain ${stamp}`, number: "36", source: "admin" },
      { tenantId: tenant, season: 2025, playerId: -18001, name: `Past Captain ${stamp}`, number: "99", source: "admin" },
      { tenantId: other, season: 2026, playerId: -18001, name: `Other Captain ${stamp}`, number: "77", source: "admin" },
    ]).returning();
    const load = async () => {
      const res = await fetchSources().query({ from: "2026-10-09", to: "2026-10-11", setType: "teamList" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return res.body.content;
    };
    try {
      const original = await load();
      expect(original[expected[0]]).toMatchObject({ numbering: "shirt",
        players: [{ shirtNumber: "36", firstInitial: "S", surname: "CAPTAIN" },
          { firstInitial: "T", surname: "EXTRA" }] });
      expect(original[expected[0]].players[1]).not.toHaveProperty("shirtNumber");
      expect(original[expected[2]]).not.toHaveProperty("numbering");
      expect(original[expected[2]].players[0]).not.toHaveProperty("shirtNumber");
      // Same number-only edit used by the register; no real club records touched.
      const edit = await request(app).patch(`/api/shirt-numbers/${entries[0].id}`)
        .set("x-tenant-id", String(tenant)).set("Cookie", cookie).send({ number: "88" });
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      const refreshed = await load();
      expect(refreshed[expected[0]].players[0].shirtNumber).toBe("88");
      expect(original[expected[0]].players[0].shirtNumber).toBe("36");
      await db.update(shirtNumberSettingsTable).set({ enabled: false }).where(eq(shirtNumberSettingsTable.tenantId, tenant));
      const disabled = await load();
      expect(disabled[expected[0]]).not.toHaveProperty("numbering");
      expect(disabled[expected[0]].players[0]).not.toHaveProperty("shirtNumber");
    } finally {
      for (const entry of entries) await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.id, entry.id));
      await db.update(shirtNumberSettingsTable).set({ enabled: false }).where(eq(shirtNumberSettingsTable.tenantId, tenant));
    }
  });
  it("uses published lists only, preserves roles/order, masks juniors and excludes other clubs", async () => {
    const res = await fetchSources().query({ from: "2026-10-09", to: "2026-10-11", setType: "teamList" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.fixtures.map((f: { id: number }) => f.id)).toEqual([expected[0], expected[2]]);
    expect(res.body.content[expected[0]].players).toMatchObject([
      { surname: "CAPTAIN", order: 1, role: "C/WK" }, { surname: "EXTRA", order: 12 },
    ]);
    expect(res.body.content[expected[2]]).toMatchObject({ junior: true, players: [{ surname: "PLAYER" }] });
    expect(JSON.stringify(res.body)).not.toMatch(/Private Junior|Unpublished Person|Other Tenant/);
    expect(res.body.warnings.join(" ")).toContain("no published team list");
  });
  it("honours saved Grade menu order with chronological fixtures within each grade", async () => {
    await db.insert(matchDisplaySettingsTable).values({ tenantId: tenant, gradeOrder: ["U15", "A Grade"] });
    try {
      const res = await fetchSources().query({ from: "2026-10-09", to: "2026-10-11" });
      expect(res.body.fixtures.map((f: { id: number }) => f.id)).toEqual([expected[2], expected[0], expected[1]]);
    } finally {
      await db.delete(matchDisplaySettingsTable).where(eq(matchDisplaySettingsTable.tenantId, tenant));
    }
  });
  it("requires an admin and rejects cross-tenant sessions", async () => {
    expect((await request(app).get("/api/weekend-carousel/sources").set("x-tenant-id", String(tenant))).status).toBe(401);
    expect((await fetchSources(other).query({ from: "2026-10-09", to: "2026-10-11" })).status).toBe(401);
  });
  it("includes both local date boundaries, started games and distinct same-grade fixtures; removes cancellations/byes", async () => {
    const res = await fetchSources().query({ from: "2026-10-09", to: "2026-10-11" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.timeZone).toBe("Australia/Perth");
    expect(res.body.fixtures.map((f: { id: number }) => f.id)).toEqual(expected);
    expect(res.body.warnings[0]).toContain("Excluded 3");
    expect(res.body.photos.map((p: { id: number }) => p.id)).toContain(photoId);
    expect(res.body.photos.every((p: { grade: string }) => p.grade === "A Grade")).toBe(true);
    expect(res.body.coverPhotos.map((p: { id: number }) => p.id)).toEqual(coverIds);
  });
  it("rejects invalid/reversed dates rather than normalising them", async () => {
    for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-10-12", "2026-10-09"], ["oops", "2026-10-11"]]) {
      expect((await fetchSources().query({ from, to })).status).toBe(400);
    }
  });
  it("returns an explicit empty source list for empty ranges", async () => {
    const res = await fetchSources().query({ from: "2027-01-01", to: "2027-01-03" });
    expect(res.status).toBe(200);
    expect(res.body.fixtures).toEqual([]);
    expect(res.body.photos).toEqual([]);
    expect(res.body.coverPhotos.map((p: { id: number }) => p.id)).toEqual(coverIds);
  });
  it("rechecks cover tags and deletion on each source request", async () => {
    const [cover] = await db.insert(clubPhotosTable).values({
      tenantId: tenant, objectPath: `/objects/temporary-cover-${stamp}`, thumbPath: `/objects/temporary-cover-thumb-${stamp}`,
      width: 100, height: 100, grade: null, season: 2026, photoTypes: ["team"],
    }).returning();
    const ids = async () => (await fetchSources().query({ from: "2026-10-09", to: "2026-10-11" })).body.coverPhotos.map((p: { id: number }) => p.id);
    expect(await ids()).toContain(cover.id);
    await db.update(clubPhotosTable).set({ season: 2025 }).where(eq(clubPhotosTable.id, cover.id));
    expect(await ids()).not.toContain(cover.id);
    await db.update(clubPhotosTable).set({ season: 2026, grade: "A Grade" }).where(eq(clubPhotosTable.id, cover.id));
    expect(await ids()).not.toContain(cover.id);
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.id, cover.id));
    expect(await ids()).not.toContain(cover.id);
  });
  it("fails explicitly if live cancellation status is unavailable", async () => {
    centralRows.mockRejectedValueOnce(new Error("Test central outage"));
    const res = await fetchSources().query({ from: "2026-10-09", to: "2026-10-11" });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Retry before exporting");
  });
});
