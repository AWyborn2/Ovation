/**
 * Template library release 2, R2-C (ADR-012): clubs report templates, the
 * platform console sees open reports and unlists (resolving them), relists
 * or dismisses them; clubs keep favourites and sort the library.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  libraryTemplateReportsTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  platformAdminsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, hashPassword, SESSION_COOKIE } from "../lib/auth";
import { v2Document } from "../lib/template-library/bundles.test-helpers";

const STAMP = Date.now();
/** Every template here is named with the stamp, so a search for it hides other rows. */
const SEARCH = String(STAMP);
const EMAIL = `tmod-${STAMP}@ovation.test`;
const PASSWORD = "moderate-the-templates-1";
let consoleCookie: string;
let platformAdminId: number;
let authorTenant: number;
let otherTenant: number;
let thirdTenant: number;
let authorCookie: string;
let otherCookie: string;
const adminIds: number[] = [];
const templateIds: number[] = [];

async function makeTenant(slug: string, name: string, offset: number): Promise<number> {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug, centralClubId: 3_500_000 + (STAMP % 100_000) * 3 + offset, name, plan: "pro" })
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

/** A library template with a passed current version, listed unless said otherwise. */
async function makeTemplate(opts: {
  name: string;
  origin: "club" | "console";
  author?: number;
  listed?: boolean;
  listedAt?: Date;
}): Promise<number> {
  const [t] = await db
    .insert(libraryTemplatesTable)
    .values({
      kind: "milestone",
      name: opts.name,
      origin: opts.origin,
      authorTenantId: opts.author ?? null,
      currentVersion: 1,
      tags: ["retro"],
      listed: opts.listed ?? true,
      listedAt: opts.listed === false ? null : (opts.listedAt ?? new Date()),
    })
    .returning({ id: libraryTemplatesTable.id });
  await db.insert(libraryTemplateVersionsTable).values({
    templateId: t!.id,
    version: 1,
    document: v2Document("milestone"),
    coverage: { pages: ["card"], sizes: ["square"] },
    fitStatus: "pass",
    fitReport: { kind: "test", status: "pass", variants: 4, issues: [] },
  });
  templateIds.push(t!.id);
  return t!.id;
}

/** A club's copy of a library template (what "used by" counts). */
async function copyOf(tenant: number, templateId: number): Promise<void> {
  await db.insert(cardTemplatesTable).values({
    tenantId: tenant,
    name: `Copy ${templateId}`,
    source: "kind",
    baseKind: "milestone",
    cardKinds: ["milestone"],
    adjustments: v2Document("milestone"),
    version: 1,
    updatedAt: new Date(),
    isKindDefault: false,
    originTemplateId: templateId,
    originVersion: 1,
    fitStatus: "pass",
    fitReport: null,
  });
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
  put: (p: string) =>
    request(app).put(`/api${p}`).set("Cookie", cookie).set("x-tenant-id", String(tenant)),
  delete: (p: string) =>
    request(app).delete(`/api${p}`).set("Cookie", cookie).set("x-tenant-id", String(tenant)),
});
const author = () => club(authorCookie, authorTenant);
const other = () => club(otherCookie, otherTenant);
const consoleApi = {
  get: (p: string) =>
    request(app).get(`/api/platform/admin/library${p}`).set("Cookie", consoleCookie),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api/platform/admin/library${p}`).set("Cookie", consoleCookie).send(body),
};

/** The ids `GET /template-library` returns for this file's templates, every page. */
async function browse(
  as: ReturnType<typeof club>,
  params: Record<string, string> = {},
): Promise<number[]> {
  const ids: number[] = [];
  let cursor: number | null = null;
  do {
    const qs = new URLSearchParams({
      q: SEARCH,
      ...params,
      ...(cursor !== null ? { cursor: String(cursor) } : {}),
    });
    const res = await as.get(`/template-library?${qs}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    ids.push(...res.body.templates.map((t: { id: number }) => t.id));
    cursor = res.body.nextCursor;
  } while (cursor !== null);
  return ids;
}

let clubMade: number;
let ovationMade: number;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-template-moderation";
  authorTenant = await makeTenant(`tmod-author-${STAMP}`, `Author ${STAMP}`, 0);
  otherTenant = await makeTenant(`tmod-other-${STAMP}`, `Reporter ${STAMP}`, 1);
  thirdTenant = await makeTenant(`tmod-third-${STAMP}`, `Third ${STAMP}`, 2);
  authorCookie = await makeAdmin(authorTenant, "TModAuthor");
  otherCookie = await makeAdmin(otherTenant, "TModOther");
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Moderator", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  consoleCookie = String(login.headers["set-cookie"][0]).split(";")[0]!;

  ovationMade = await makeTemplate({
    name: `Ovation ${STAMP}`,
    origin: "console",
    listedAt: new Date(Date.now() - 60_000),
  });
  clubMade = await makeTemplate({
    name: `Club ${STAMP}`,
    origin: "club",
    author: authorTenant,
    listedAt: new Date(),
  });
});

afterAll(async () => {
  const tenants = [authorTenant, otherTenant, thirdTenant];
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  if (templateIds.length) {
    await db
      .delete(libraryTemplateVersionsTable)
      .where(inArray(libraryTemplateVersionsTable.templateId, templateIds));
    await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, templateIds));
  }
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

describe("reporting a template", () => {
  it("takes one report per club, replacing the reason when sent again", async () => {
    expect(
      (await other().post(`/template-library/${clubMade}/report`, { reason: "" })).status,
    ).toBe(400);
    const first = await other().post(`/template-library/${clubMade}/report`, {
      reason: "Uses our logo",
    });
    expect(first.status).toBe(204);
    const again = await other().post(`/template-library/${clubMade}/report`, {
      reason: "Uses our logo and our sponsor",
    });
    expect(again.status).toBe(204);
    const rows = await db
      .select()
      .from(libraryTemplateReportsTable)
      .where(eq(libraryTemplateReportsTable.templateId, clubMade));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: otherTenant,
      reason: "Uses our logo and our sponsor",
      resolvedAt: null,
    });
  });

  it("refuses the club's own template and one it can't see", async () => {
    const own = await author().post(`/template-library/${clubMade}/report`, { reason: "Oops" });
    expect(own.status).toBe(400);
    expect(own.body.error).toMatch(/unlist it instead/);
    const hidden = await makeTemplate({
      name: `Hidden ${STAMP}`,
      origin: "console",
      listed: false,
    });
    expect(
      (await other().post(`/template-library/${hidden}/report`, { reason: "Hmm" })).status,
    ).toBe(404);
  });
});

describe("console moderation", () => {
  it("is for platform admins only", async () => {
    expect(
      (await request(app).get(`/api/platform/admin/library/templates/${clubMade}/reports`)).status,
    ).toBe(401);
    const asClub = await request(app)
      .post(`/api/platform/admin/library/templates/${clubMade}/reports/dismiss`)
      .set("Cookie", authorCookie)
      .set("x-tenant-id", String(authorTenant));
    expect(asClub.status).toBe(401);
  });

  it("lists reported templates with their open reports and the clubs that sent them", async () => {
    const res = await consoleApi.get("/templates?reported=true");
    expect(res.status).toBe(200);
    const ids = res.body.templates.map((t: { id: number }) => t.id);
    expect(ids).toContain(clubMade);
    expect(ids).not.toContain(ovationMade);
    expect(res.body.templates.find((t: { id: number }) => t.id === clubMade)).toMatchObject({
      openReports: 1,
      authorName: `Author ${STAMP}`,
    });
    const reports = await consoleApi.get(`/templates/${clubMade}/reports`);
    expect(reports.status).toBe(200);
    expect(reports.body).toEqual([
      expect.objectContaining({
        clubName: `Reporter ${STAMP}`,
        reason: "Uses our logo and our sponsor",
        resolvedAt: null,
      }),
    ]);
  });

  it("dismisses reports and keeps the template listed", async () => {
    expect((await consoleApi.post(`/templates/${clubMade}/reports/dismiss`)).status).toBe(204);
    const t = await consoleApi.get(`/templates/${clubMade}`);
    expect(t.body).toMatchObject({ openReports: 0, listed: true });
    const reports = await consoleApi.get(`/templates/${clubMade}/reports`);
    expect(reports.body[0].resolvedAt).not.toBeNull();
    expect(await browse(other())).toContain(clubMade);
  });

  it("unlists as Ovation, resolving reports, and lists it again", async () => {
    await other().post(`/template-library/${clubMade}/report`, { reason: "Reported again" });
    expect((await consoleApi.get(`/templates/${clubMade}`)).body.openReports).toBe(1);
    const unlisted = await consoleApi.post(`/templates/${clubMade}/unlist`, { reason: "Logo" });
    expect(unlisted.status).toBe(200);
    expect(unlisted.body).toMatchObject({ listed: false, unlistedBy: "ovation", openReports: 0 });
    expect(await browse(other())).not.toContain(clubMade);
    // The author can't undo Ovation's unlisting.
    await author().post(`/template-library/${clubMade}/unlist`);
    expect((await consoleApi.get(`/templates/${clubMade}`)).body.unlistedBy).toBe("ovation");

    const relisted = await consoleApi.post(`/templates/${clubMade}/list`);
    expect(relisted.status).toBe(200);
    expect(relisted.body).toMatchObject({ listed: true, unlistedBy: null });
    expect(await browse(other())).toContain(clubMade);
  });

  it("leaves a template its club unlisted for the club to list again", async () => {
    const own = await makeTemplate({ name: `Own ${STAMP}`, origin: "club", author: authorTenant });
    expect((await author().post(`/template-library/${own}/unlist`)).status).toBe(200);
    const res = await consoleApi.post(`/templates/${own}/list`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/club unlisted/);
  });
});

describe("favourites", () => {
  it("are the club's own, and filter the library", async () => {
    expect((await other().put(`/template-library/${ovationMade}/favourite`)).status).toBe(204);
    expect((await other().put(`/template-library/${ovationMade}/favourite`)).status).toBe(204);
    expect(await browse(other(), { favourites: "true" })).toEqual([ovationMade]);
    const all = await other().get(`/template-library?q=${SEARCH}&favourites=false`);
    const flags = Object.fromEntries(
      all.body.templates.map((t: { id: number; favourite: boolean }) => [t.id, t.favourite]),
    );
    expect(flags[ovationMade]).toBe(true);
    expect(flags[clubMade]).toBe(false);
    // Another club's favourites are its own.
    expect(await browse(author(), { favourites: "true" })).toEqual([]);
    expect((await author().get(`/template-library/${ovationMade}`)).body.favourite).toBe(false);

    expect((await other().delete(`/template-library/${ovationMade}/favourite`)).status).toBe(204);
    expect(await browse(other(), { favourites: "true" })).toEqual([]);
  });

  it("can't hold a template the club can't see", async () => {
    const hidden = await makeTemplate({
      name: `Hidden fav ${STAMP}`,
      origin: "console",
      listed: false,
    });
    expect((await other().put(`/template-library/${hidden}/favourite`)).status).toBe(404);
  });
});

describe("sorting the library", () => {
  it("orders by popularity, newness and who made it", async () => {
    // The club template is used by two other clubs, the Ovation one by none.
    await copyOf(otherTenant, clubMade);
    await copyOf(thirdTenant, clubMade);
    // The author's own copy doesn't count.
    await copyOf(authorTenant, clubMade);
    const popular = await other().get(`/template-library?q=${SEARCH}&sort=popular`);
    expect(popular.body.templates[0]).toMatchObject({ id: clubMade, usedBy: 2 });

    // Relisting set listedAt, so the club template is the newest.
    expect((await browse(other(), { sort: "new" }))[0]).toBe(clubMade);
    expect((await browse(other(), { sort: "ovation" }))[0]).toBe(ovationMade);
    expect((await browse(other(), { sort: "club" }))[0]).toBe(clubMade);
  });

  it("pages a sorted library without repeats or gaps", async () => {
    for (let i = 0; i < 25; i++) {
      await makeTemplate({
        name: `Filler ${i} ${STAMP}`,
        origin: "console",
        listedAt: new Date(Date.now() - (i + 2) * 60_000),
      });
    }
    const listed = await db
      .select({ id: libraryTemplatesTable.id })
      .from(libraryTemplatesTable)
      .where(
        and(inArray(libraryTemplatesTable.id, templateIds), eq(libraryTemplatesTable.listed, true)),
      );
    const ids = await browse(other(), { sort: "new" });
    expect(ids.length).toBeGreaterThan(24);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(listed.map((r) => r.id).sort());
  });

  it("refuses a sort it doesn't know", async () => {
    expect((await other().get(`/template-library?sort=random`)).status).toBe(400);
  });
});
