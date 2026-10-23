/**
 * Element moderation in the platform console (editable-elements plan, D5,
 * decision E1): every element with its author and open reports, Ovation's
 * unlisting, listing again and dismissing reports, and what clubs see after.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  libraryElementReportsTable,
  libraryElementsTable,
  platformAdminsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, hashPassword, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const EMAIL = `mod-${STAMP}@ovation.test`;
const PASSWORD = "moderate-the-library-1";
let consoleCookie: string;
let platformAdminId: number;
let authorTenant: number;
let reporterTenant: number;
let authorCookie: string;
let reporterCookie: string;
const adminIds: number[] = [];
let elementId: number;

const fragment = {
  formatVersion: 2,
  layers: [
    {
      id: "e1",
      kind: "shape",
      geometry: { square: { x: 0, y: 80, w: 100, h: 10 } },
      style: { fill: "var(--gold)" },
    },
  ],
};

async function makeTenant(slug: string, name: string, offset: number): Promise<number> {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug, centralClubId: 3_400_000 + (STAMP % 100_000) * 2 + offset, name, plan: "pro" })
    .returning();
  return t!.id;
}

async function makeAdmin(tenant: number, name: string): Promise<string> {
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant,
      username: `${name}_${STAMP}`,
      displayName: name,
      passwordHash: "x",
    })
    .returning();
  adminIds.push(admin!.id);
  return `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
}

const club = (cookie: string, tenant: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", cookie).set("x-tenant-id", String(tenant)),
  post: (p: string, body: object = {}) =>
    request(app)
      .post(`/api${p}`)
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenant))
      .send(body),
});
const consoleApi = {
  get: (p: string) =>
    request(app).get(`/api/platform/admin/library${p}`).set("Cookie", consoleCookie),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api/platform/admin/library${p}`).set("Cookie", consoleCookie).send(body),
};

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-element-moderation";
  authorTenant = await makeTenant(`mod-author-${STAMP}`, "Author Club", 0);
  reporterTenant = await makeTenant(`mod-reporter-${STAMP}`, "Reporter Club", 1);
  authorCookie = await makeAdmin(authorTenant, "ModAuthor");
  reporterCookie = await makeAdmin(reporterTenant, "ModReporter");
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Moderator", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  consoleCookie = String(login.headers["set-cookie"][0]).split(";")[0]!;

  const saved = await club(authorCookie, authorTenant).post("/template-library/elements", {
    name: `Moderated band ${STAMP}`,
    category: "bands",
    document: fragment,
  });
  elementId = saved.body.id;
  await club(reporterCookie, reporterTenant).post(
    `/template-library/elements/${elementId}/report`,
    {
      reason: "Looks like our sponsor's logo",
    },
  );
});

afterAll(async () => {
  const tenants = [authorTenant, reporterTenant];
  await db
    .delete(libraryElementsTable)
    .where(inArray(libraryElementsTable.authorTenantId, tenants));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

describe("element moderation", () => {
  it("is for platform admins only", async () => {
    expect((await request(app).get("/api/platform/admin/library/elements")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/platform/admin/library/elements")
          .set("Cookie", authorCookie)
          .set("x-tenant-id", String(authorTenant))
      ).status,
    ).toBe(401);
  });

  it("lists elements with their author and open reports, reported first", async () => {
    const res = await consoleApi.get("/elements?reported=true");
    expect(res.status).toBe(200);
    expect(res.body.elements[0]).toMatchObject({
      id: elementId,
      origin: "club",
      authorName: "Author Club",
      authorTenantId: authorTenant,
      listed: true,
      openReports: 1,
    });
    expect(res.body.elements.every((e: { openReports: number }) => e.openReports > 0)).toBe(true);
    const found = await consoleApi.get(`/elements?q=${STAMP}&origin=club`);
    expect(found.body.elements.map((e: { id: number }) => e.id)).toEqual([elementId]);
    expect(found.body).toMatchObject({ total: 1, page: 1, pageSize: 100 });
    expect((await consoleApi.get("/elements?reported=maybe")).status).toBe(400);
    expect((await consoleApi.get("/elements?origin=elsewhere")).status).toBe(400);
    expect((await consoleApi.get("/elements?page=0")).status).toBe(400);
  });

  it("shows each report with the club that made it", async () => {
    const res = await consoleApi.get(`/elements/${elementId}/reports`);
    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([
      expect.objectContaining({
        clubName: "Reporter Club",
        reason: "Looks like our sponsor's logo",
        resolvedAt: null,
      }),
    ]);
    expect((await consoleApi.get("/elements/999999999/reports")).status).toBe(404);
  });

  it("unlists as Ovation, resolving the reports, and no club sees it", async () => {
    const res = await consoleApi.post(`/elements/${elementId}/unlist`, { reason: "Sponsor art" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      listed: false,
      unlistedBy: "ovation",
      unlistReason: "Sponsor art",
      openReports: 0,
    });
    const reports = await db
      .select()
      .from(libraryElementReportsTable)
      .where(eq(libraryElementReportsTable.elementId, elementId));
    expect(reports.every((r) => r.resolvedAt !== null)).toBe(true);
    expect(
      (await club(reporterCookie, reporterTenant).get(`/template-library/elements/${elementId}`))
        .status,
    ).toBe(404);
    // The author still finds it under its own elements, unlisted.
    const mine = await club(authorCookie, authorTenant).get("/template-library/elements?mine=true");
    expect(mine.body.elements).toEqual([expect.objectContaining({ id: elementId, listed: false })]);
  });

  it("lists it again, and dismisses new reports without unlisting", async () => {
    const res = await consoleApi.post(`/elements/${elementId}/list`);
    expect(res.body).toMatchObject({ listed: true, unlistedBy: null, unlistReason: null });
    expect(
      (await club(reporterCookie, reporterTenant).get(`/template-library/elements/${elementId}`))
        .status,
    ).toBe(200);
    await club(reporterCookie, reporterTenant).post(
      `/template-library/elements/${elementId}/report`,
      { reason: "Still not sure" },
    );
    expect((await consoleApi.get(`/elements?q=${STAMP}`)).body.elements[0].openReports).toBe(1);
    const dismissed = await consoleApi.post(`/elements/${elementId}/reports/dismiss`);
    expect(dismissed.body).toMatchObject({ listed: true, openReports: 0 });
    expect((await consoleApi.post("/elements/999999999/list")).status).toBe(404);
    expect((await consoleApi.post("/elements/999999999/unlist")).status).toBe(404);
  });
});
