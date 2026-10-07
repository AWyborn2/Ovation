import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, tenantsTable, adminsTable, fixturesTable, clubPhotosTable } from "@workspace/db";
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
  expected = [rows[0].id, rows[8].id, rows[1].id];
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
  centralRows.mockResolvedValue([{ id: cancelledId, status: "CANCELLED" }]);
});
afterAll(async () => {
  for (const id of [tenant, other].filter(Boolean)) {
    await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, id));
    await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, id));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
});
const fetchSources = (tenantId = tenant) => request(app).get("/api/weekend-carousel/sources")
  .set("x-tenant-id", String(tenantId)).set("Cookie", cookie);

describe("weekend carousel protected sources", () => {
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
    expect(res.body.photos.map((p: { id: number }) => p.id)).toEqual([photoId]);
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
  });
  it("fails explicitly if live cancellation status is unavailable", async () => {
    centralRows.mockRejectedValueOnce(new Error("Test central outage"));
    const res = await fetchSources().query({ from: "2026-10-09", to: "2026-10-11" });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Retry before exporting");
  });
});
