/**
 * Library template moderation and browse extras (template library release 2,
 * ADR-012, R2-C): a club reports a listed template (once per club, never its
 * own), the console lists reported templates and their reports, Ovation's
 * unlisting resolves them, dismissing keeps the template listed, a club's own
 * unlisting can't be undone from the console; favourites and the browse sorts.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
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

const STAMP = Date.now();
// A kind no other suite lists, so the library's order here is this suite's alone.
const KIND = `r2c-${STAMP}`;
const EMAIL = `r2c-${STAMP}@example.test`;
const PASSWORD = "r2c-moderation-password";

const tenants: Record<"author" | "b" | "c", number> = { author: 0, b: 0, c: 0 };
const cookies: Record<"author" | "b" | "c", string> = { author: "", b: "", c: "" };
const adminIds: number[] = [];
let platformAdminId: number;
let platformCookie: string;
const t: Record<"clubOld" | "ovation" | "clubNew" | "unlisted", number> = {
  clubOld: 0,
  ovation: 0,
  clubNew: 0,
  unlisted: 0,
};

async function libraryTemplate(opts: {
  name: string;
  author: number | null;
  listed: boolean;
  listedAt?: Date;
}): Promise<number> {
  const [row] = await db
    .insert(libraryTemplatesTable)
    .values({
      kind: KIND,
      name: opts.name,
      authorTenantId: opts.author,
      origin: opts.author === null ? "console" : "club",
      listed: opts.listed,
      listedAt: opts.listed ? (opts.listedAt ?? new Date()) : null,
    })
    .returning({ id: libraryTemplatesTable.id });
  await db.insert(libraryTemplateVersionsTable).values({
    templateId: row!.id,
    version: 1,
    document: { formatVersion: 2, pages: { card: { layers: [] } } },
    coverage: { pages: ["card"], sizes: ["square"] },
    fitStatus: "pass",
    fitReport: { kind: KIND, status: "pass", variants: 1, issues: [] },
  });
  return row!.id;
}

const as = (key: "author" | "b" | "c") => {
  const set = (r: request.Test) =>
    r.set("Cookie", cookies[key]).set("x-tenant-id", String(tenants[key]));
  return {
    get: (p: string) => set(request(app).get(`/api${p}`)),
    post: (p: string, body: object = {}) => set(request(app).post(`/api${p}`)).send(body),
    put: (p: string) => set(request(app).put(`/api${p}`)),
    del: (p: string) => set(request(app).delete(`/api${p}`)),
  };
};
const console_ = {
  get: (p: string) => request(app).get(`/api${p}`).set("Cookie", platformCookie),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api${p}`).set("Cookie", platformCookie).send(body),
};
const browse = async (key: "author" | "b" | "c", query: string) => {
  const res = await as(key).get(`/template-library?kind=${KIND}${query}`);
  expect(res.status).toBe(200);
  return res.body as { templates: Array<{ id: number; favourite: boolean }>; nextCursor: number };
};
const ids = (body: { templates: Array<{ id: number }> }) => body.templates.map((x) => x.id);

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-r2c";
  let n = 0;
  for (const key of ["author", "b", "c"] as const) {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        slug: `r2c-${key}-${STAMP}`,
        centralClubId: 4_600_000 + (STAMP % 100_000) * 3 + n++,
        name: `R2C ${key} ${STAMP}`,
        plan: "pro",
      })
      .returning();
    tenants[key] = tenant!.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant!.id,
        username: `r2c_${key}_${STAMP}`,
        displayName: `R2C ${key}`,
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin!.id);
    cookies[key] = `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`;
  }
  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Moderator", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  platformCookie = String(login.headers["set-cookie"][0]).split(";")[0]!;

  t.clubOld = await libraryTemplate({
    name: "Club old",
    author: tenants.author,
    listed: true,
    listedAt: new Date("2026-01-01T00:00:00Z"),
  });
  t.ovation = await libraryTemplate({
    name: "Ovation's",
    author: null,
    listed: true,
    listedAt: new Date("2026-03-01T00:00:00Z"),
  });
  t.clubNew = await libraryTemplate({
    name: "Club new",
    author: tenants.author,
    listed: true,
    listedAt: new Date("2026-06-01T00:00:00Z"),
  });
  t.unlisted = await libraryTemplate({ name: "Unlisted", author: tenants.author, listed: false });
  // Club new is the most used: copies at B and C (and the author's own, not counted).
  await db.insert(cardTemplatesTable).values(
    (["b", "c", "author"] as const).map((key) => ({
      tenantId: tenants[key],
      name: "Copy",
      source: "kind",
      originTemplateId: t.clubNew,
    })),
  );
});

afterAll(async () => {
  const tenantIds = Object.values(tenants);
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenantIds));
  await db.delete(libraryTemplatesTable).where(eq(libraryTemplatesTable.kind, KIND));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

describe("reporting a library template", () => {
  it("takes one report per club, the latest reason winning", async () => {
    expect((await as("b").post(`/template-library/${t.clubOld}/report`, { reason: "Rude" })).status).toBe(204);
    expect(
      (await as("b").post(`/template-library/${t.clubOld}/report`, { reason: "Very rude" })).status,
    ).toBe(204);
    const rows = await db
      .select()
      .from(libraryTemplateReportsTable)
      .where(eq(libraryTemplateReportsTable.templateId, t.clubOld));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: tenants.b, reason: "Very rude", resolvedAt: null });
  });

  it("refuses an empty reason, the club's own template and an unlisted one", async () => {
    expect((await as("b").post(`/template-library/${t.clubOld}/report`, { reason: "" })).status).toBe(400);
    const own = await as("author").post(`/template-library/${t.clubOld}/report`, { reason: "x" });
    expect(own.status).toBe(400);
    expect(own.body.error).toMatch(/unlist it instead/);
    expect((await as("b").post(`/template-library/${t.unlisted}/report`, { reason: "x" })).status).toBe(404);
    expect((await as("b").post(`/template-library/99999999/report`, { reason: "x" })).status).toBe(404);
  });

  it("is admin-only", async () => {
    const res = await request(app)
      .post(`/api/template-library/${t.clubOld}/report`)
      .set("x-tenant-id", String(tenants.b))
      .send({ reason: "x" });
    expect(res.status).toBe(401);
  });
});

describe("console moderation", () => {
  it("lists reported templates with their open count, and their reports", async () => {
    await as("c").post(`/template-library/${t.clubOld}/report`, { reason: "Copied our design" });
    const list = await console_.get(`/platform/admin/library/templates?kind=${KIND}&reported=true`);
    expect(list.status).toBe(200);
    expect(list.body.templates.map((x: { id: number }) => x.id)).toEqual([t.clubOld]);
    expect(list.body.templates[0]).toMatchObject({ openReports: 2, authorName: `R2C author ${STAMP}` });
    const all = await console_.get(`/platform/admin/library/templates?kind=${KIND}`);
    expect(all.body.templates).toHaveLength(4);
    expect(
      all.body.templates.find((x: { id: number }) => x.id === t.ovation).openReports,
    ).toBe(0);
    expect(
      (await console_.get(`/platform/admin/library/templates?reported=maybe`)).status,
    ).toBe(400);

    const reports = await console_.get(`/platform/admin/library/templates/${t.clubOld}/reports`);
    expect(reports.status).toBe(200);
    expect(reports.body.map((r: { clubName: string }) => r.clubName).sort()).toEqual(
      [`R2C b ${STAMP}`, `R2C c ${STAMP}`].sort(),
    );
    expect(reports.body[0]).toMatchObject({ resolvedAt: null });
  });

  it("is platform-admin only", async () => {
    expect((await request(app).get(`/api/platform/admin/library/templates/${t.clubOld}/reports`)).status).toBe(401);
    expect(
      (await request(app).post(`/api/platform/admin/library/templates/${t.clubOld}/reports/dismiss`)).status,
    ).toBe(401);
    // A club admin isn't a platform admin.
    expect((await as("b").get(`/platform/admin/library/templates/${t.clubOld}/reports`)).status).toBe(401);
  });

  it("dismisses reports and keeps the template listed", async () => {
    await as("b").post(`/template-library/${t.ovation}/report`, { reason: "Meh" });
    const res = await console_.post(`/platform/admin/library/templates/${t.ovation}/reports/dismiss`);
    expect(res.status).toBe(204);
    const [row] = await db
      .select()
      .from(libraryTemplatesTable)
      .where(eq(libraryTemplatesTable.id, t.ovation));
    expect(row!.listed).toBe(true);
    const reports = await console_.get(`/platform/admin/library/templates/${t.ovation}/reports`);
    expect(reports.body[0].resolvedAt).not.toBeNull();
    expect(
      (await console_.post(`/platform/admin/library/templates/99999999/reports/dismiss`)).status,
    ).toBe(404);
  });

  it("unlists as Ovation, resolving the reports; a re-report opens one again; relists", async () => {
    const unlist = await console_.post(`/platform/admin/library/templates/${t.clubOld}/unlist`, {
      reason: "Reported",
    });
    expect(unlist.status).toBe(200);
    expect(unlist.body).toMatchObject({ listed: false, unlistedBy: "ovation", openReports: 0 });
    const reports = await console_.get(`/platform/admin/library/templates/${t.clubOld}/reports`);
    expect(reports.body.every((r: { resolvedAt: string | null }) => r.resolvedAt !== null)).toBe(true);
    // Unlisted: clubs no longer see it, nor can report it.
    expect(ids(await browse("b", ""))).not.toContain(t.clubOld);
    expect((await as("b").post(`/template-library/${t.clubOld}/report`, { reason: "x" })).status).toBe(404);

    const relist = await console_.post(`/platform/admin/library/templates/${t.clubOld}/list`);
    expect(relist.status).toBe(200);
    expect(relist.body).toMatchObject({ listed: true, unlistedBy: null });
    expect(ids(await browse("b", ""))).toContain(t.clubOld);
  });

  it("won't relist a template its club unlisted", async () => {
    await db
      .update(libraryTemplatesTable)
      .set({ listed: false, unlistedBy: "author", unlistedAt: new Date() })
      .where(eq(libraryTemplatesTable.id, t.unlisted));
    const res = await console_.post(`/platform/admin/library/templates/${t.unlisted}/list`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/club that made this template unlisted it/);
  });
});

describe("favourites", () => {
  it("adds, lists and removes a club's own favourites", async () => {
    expect((await as("b").put(`/template-library/${t.ovation}/favourite`)).status).toBe(204);
    // Twice is fine.
    expect((await as("b").put(`/template-library/${t.ovation}/favourite`)).status).toBe(204);
    const mine = await browse("b", "&favourites=true");
    expect(ids(mine)).toEqual([t.ovation]);
    expect(mine.templates[0]!.favourite).toBe(true);
    const all = await browse("b", "");
    expect(all.templates.find((x) => x.id === t.clubNew)!.favourite).toBe(false);
    // `favourites=false` is every template, not only the favourites.
    expect(ids(await browse("b", "&favourites=false")).length).toBe(ids(all).length);

    // Another club's favourites are its own.
    expect(ids(await browse("c", "&favourites=true"))).toEqual([]);
    expect((await browse("c", "")).templates.every((x) => !x.favourite)).toBe(true);

    expect((await as("b").del(`/template-library/${t.ovation}/favourite`)).status).toBe(204);
    expect((await as("b").del(`/template-library/${t.ovation}/favourite`)).status).toBe(204);
    expect(ids(await browse("b", "&favourites=true"))).toEqual([]);
  });

  it("refuses a template clubs can't see", async () => {
    expect((await as("b").put(`/template-library/${t.unlisted}/favourite`)).status).toBe(404);
    expect((await as("b").put(`/template-library/99999999/favourite`)).status).toBe(404);
  });
});

describe("browse sorts", () => {
  it("orders by popular, new, Ovation first and club first", async () => {
    expect(ids(await browse("b", ""))).toEqual([t.clubOld, t.ovation, t.clubNew]);
    expect(ids(await browse("b", "&sort=popular"))[0]).toBe(t.clubNew);
    expect(ids(await browse("b", "&sort=new"))).toEqual([t.clubNew, t.ovation, t.clubOld]);
    expect(ids(await browse("b", "&sort=ovation"))).toEqual([t.ovation, t.clubOld, t.clubNew]);
    expect(ids(await browse("b", "&sort=club"))).toEqual([t.clubOld, t.clubNew, t.ovation]);
    expect((await as("b").get(`/template-library?sort=random`)).status).toBe(400);
  });

  it("pages a sorted list by position", async () => {
    const extra: number[] = [];
    for (let i = 0; i < 24; i++) {
      extra.push(await libraryTemplate({ name: `Filler ${i}`, author: null, listed: true }));
    }
    const first = await browse("b", "&sort=ovation");
    expect(first.templates).toHaveLength(24);
    expect(first.nextCursor).toBe(24);
    const second = await browse("b", `&sort=ovation&cursor=${first.nextCursor}`);
    const seen = [...ids(first), ...ids(second)];
    expect(new Set(seen).size).toBe(27);
    expect(second.nextCursor).toBeNull();
    // Club-made last when Ovation's come first.
    expect(ids(second).slice(-2)).toEqual([t.clubOld, t.clubNew]);
    await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, extra));
  });
});
