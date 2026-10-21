/**
 * Template library and club template API (ADR-011 T3.5–T3.11), with tenant
 * isolation and the junior rule for previews. Real-DB integration test
 * (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray, like } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  libraryTemplatesTable,
  socialDraftRevisionsTable,
  socialDraftsTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { ensureKindTemplate } from "../lib/kind-templates";
import { syncBundles } from "../lib/template-library/bundles";
import { fixtureBundle, fixtureTemplate } from "../lib/template-library/bundles.test-helpers";

const STAMP = Date.now();
const LOOK = `rt-${STAMP}`;
const OTHER_LOOK = `rt-${STAMP}-b`;
let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let otherCookie: string;
let lookId: number;
const libIds: Record<string, number> = {};

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

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-template-library";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `tpl-lib-${STAMP}`, centralClubId: 9981, name: "Library Club", plan: "pro" })
    .returning();
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `tpl-lib-other-${STAMP}`,
      centralClubId: 9982,
      name: "Other Club",
      plan: "pro",
    })
    .returning();
  tenantId = t!.id;
  otherTenantId = o!.id;
  cookie = await makeAdmin(tenantId, "LibEditor");
  otherCookie = await makeAdmin(otherTenantId, "LibOutsider");
  await syncBundles([
    fixtureBundle(LOOK, [fixtureTemplate("milestone"), fixtureTemplate("matchDay")], "Test Look"),
    fixtureBundle(OTHER_LOOK, [
      fixtureTemplate("milestone", { name: "Other milestone" }),
      fixtureTemplate("record", { listed: false }),
    ]),
  ]);
  const rows = await db
    .select({ id: libraryTemplatesTable.id, slug: libraryTemplatesTable.slug })
    .from(libraryTemplatesTable)
    .where(like(libraryTemplatesTable.slug, `rt-${STAMP}%`));
  for (const r of rows) libIds[r.slug!] = r.id;
  const [look] = await db
    .select()
    .from(templateLooksTable)
    .where(eq(templateLooksTable.slug, LOOK));
  lookId = look!.id;
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db
    .delete(socialDraftRevisionsTable)
    .where(inArray(socialDraftRevisionsTable.tenantId, tenants));
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  await db.delete(libraryTemplatesTable).where(like(libraryTemplatesTable.slug, `rt-${STAMP}%`));
  await db.delete(templateLooksTable).where(like(templateLooksTable.slug, `rt-${STAMP}%`));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const as = (c: string, tenant: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
  put: (p: string, body: object) =>
    request(app).put(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
  del: (p: string) =>
    request(app).delete(`/api${p}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
});
const me = () => as(cookie, tenantId);
const them = () => as(otherCookie, otherTenantId);

const kindCopies = (tenant: number, kind: string) =>
  db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenant),
        eq(cardTemplatesTable.source, "kind"),
        eq(cardTemplatesTable.baseKind, kind),
      ),
    );

describe("browsing the library", () => {
  it("needs an admin", async () => {
    expect((await request(app).get("/api/template-library")).status).toBe(401);
  });

  it("lists listed templates, filtered by kind, size and look, never club rows", async () => {
    // A club copy exists for the other tenant; it must not show up as a library template.
    await ensureKindTemplate(otherTenantId, "milestone", null);
    const res = await me().get(`/template-library?look=${LOOK}`);
    expect(res.status).toBe(200);
    expect(res.body.templates.map((t: { slug: string }) => t.slug).sort()).toEqual([
      `${LOOK}/matchDay`,
      `${LOOK}/milestone`,
    ]);
    const clubIds = (await db.select({ id: cardTemplatesTable.id }).from(cardTemplatesTable)).map(
      (r) => r.id,
    );
    for (const t of res.body.templates) {
      expect(Object.values(libIds)).toContain(t.id);
      expect(t.authorName).toBe("Ovation");
      expect(t.look).toMatchObject({ slug: LOOK, name: "Test Look" });
    }
    expect(clubIds.length).toBeGreaterThan(0);

    const byKind = await me().get(`/template-library?kind=milestone&look=${OTHER_LOOK}`);
    expect(byKind.body.templates.map((t: { name: string }) => t.name)).toEqual(["Other milestone"]);
    const size = res.body.templates[0].coverage.sizes[0];
    const bySize = await me().get(`/template-library?size=${size}&look=${LOOK}`);
    expect(bySize.body.templates.length).toBeGreaterThan(0);
    // An unlisted template is not browsable.
    expect((await me().get(`/template-library/${libIds[`${OTHER_LOOK}/record`]}`)).status).toBe(
      404,
    );
  });

  it("lists looks with the kinds each covers", async () => {
    const res = await me().get("/template-library/looks");
    const look = res.body.looks.find((l: { slug: string }) => l.slug === LOOK);
    expect(look.templates.map((t: { kind: string }) => t.kind).sort()).toEqual([
      "matchDay",
      "milestone",
    ]);
    const other = res.body.looks.find((l: { slug: string }) => l.slug === OTHER_LOOK);
    expect(other.templates.map((t: { kind: string }) => t.kind)).toEqual(["milestone"]);
  });
});

describe("club templates", () => {
  it("uses a library template as a new, unedited, non-default copy", async () => {
    const res = await me().post("/club-templates", {
      libraryTemplateId: libIds[`${LOOK}/milestone`],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: "milestone",
      isDefault: false,
      edited: false,
      version: 1,
      basedOn: { templateId: libIds[`${LOOK}/milestone`], version: 1, authorName: "Ovation" },
    });
    expect(res.body.document).toEqual(placeholderDocument("milestone"));
  });

  it("'Use as default' switches the kind's default in one step", async () => {
    await ensureKindTemplate(tenantId, "milestone", null);
    const res = await me().post("/club-templates", {
      libraryTemplateId: libIds[`${OTHER_LOOK}/milestone`],
      makeDefault: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(true);
    const defaults = (await kindCopies(tenantId, "milestone")).filter((r) => r.isKindDefault);
    expect(defaults.map((r) => r.id)).toEqual([res.body.id]);
  });

  it("lists the club's copies, defaults first", async () => {
    const res = await me().get("/club-templates?kind=milestone");
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBe(3);
    expect(res.body.templates[0].isDefault).toBe(true);
  });

  it("a document save makes it the club's own; a rename doesn't", async () => {
    const created = await me().post("/club-templates", {
      libraryTemplateId: libIds[`${LOOK}/matchDay`],
    });
    const id = created.body.id;
    const renamed = await me().put(`/club-templates/${id}`, {
      baseVersion: 1,
      name: "Our match day",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Our match day", edited: false, version: 2 });
    const doc = placeholderDocument("matchDay");
    const saved = await me().put(`/club-templates/${id}`, { baseVersion: 2, document: doc });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ edited: true, version: 3, fitStatus: "pass" });
    const stale = await me().put(`/club-templates/${id}`, { baseVersion: 2, name: "Late" });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(3);
    const bad = await me().put(`/club-templates/${id}`, {
      baseVersion: 3,
      document: { layers: "no" },
    });
    expect(bad.status).toBe(400);
  });

  it("duplicates, refuses to delete a default, and deletes the rest", async () => {
    const [def] = (await kindCopies(tenantId, "milestone")).filter((r) => r.isKindDefault);
    const dup = await me().post(`/club-templates/${def!.id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.isDefault).toBe(false);
    expect(dup.body.name).toMatch(/\(copy\)$/);
    expect((await me().del(`/club-templates/${def!.id}`)).status).toBe(400);
    expect((await me().del(`/club-templates/${dup.body.id}`)).status).toBe(204);
    expect((await me().get(`/club-templates/${dup.body.id}`)).status).toBe(404);
  });

  it("won't make a copy the default while its fit check is pending", async () => {
    const created = await me().post("/club-templates", {
      libraryTemplateId: libIds[`${LOOK}/milestone`],
    });
    await db
      .update(cardTemplatesTable)
      .set({ fitStatus: "pending" })
      .where(eq(cardTemplatesTable.id, created.body.id));
    expect((await me().post(`/club-templates/${created.body.id}/default`)).status).toBe(409);
    await db
      .update(cardTemplatesTable)
      .set({ fitStatus: "fail" })
      .where(eq(cardTemplatesTable.id, created.body.id));
    const res = await me().post(`/club-templates/${created.body.id}/default`);
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
  });

  it("applies a template to its kind's waiting drafts and records the template on each", async () => {
    const [def] = (await kindCopies(tenantId, "milestone")).filter((r) => r.isKindDefault);
    const [draft] = await db
      .insert(socialDraftsTable)
      .values({ tenantId, engine: "milestone", cardInput: { kind: "milestone", playerName: "A" } })
      .returning();
    const [theirs] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId: otherTenantId,
        engine: "milestone",
        cardInput: { kind: "milestone", playerName: "B" },
      })
      .returning();
    const res = await me().post(`/club-templates/${def!.id}/apply`, { version: def!.version });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(1);
    const [after] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, draft!.id));
    expect(after!.templateRef).toEqual({ copyId: def!.id, version: def!.version });
    expect(after!.packId).toBe("blank");
    const [untouched] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, theirs!.id));
    expect(untouched!.templateRef).toBeNull();
  });
});

describe("adopting a look", () => {
  it("makes the look's templates the defaults, reusing unedited copies, and only for its kinds", async () => {
    await ensureKindTemplate(tenantId, "record", null);
    const [recordBefore] = (await kindCopies(tenantId, "record")).filter((r) => r.isKindDefault);
    const res = await me().post(`/template-library/looks/${lookId}/adopt`);
    expect(res.status).toBe(200);
    const touched = [...res.body.changed, ...res.body.unchanged].map(
      (c: { kind: string }) => c.kind,
    );
    expect(touched.sort()).toEqual(["matchDay", "milestone"]);
    // The club's match day copy of this look was edited, so a fresh copy was made.
    expect(res.body.changed).toContainEqual(
      expect.objectContaining({ kind: "matchDay", created: true }),
    );
    for (const kind of ["matchDay", "milestone"]) {
      const [def] = (await kindCopies(tenantId, kind)).filter((r) => r.isKindDefault);
      expect(def!.originTemplateId).toBe(libIds[`${LOOK}/${kind}`]);
      expect(def!.editedAt).toBeNull();
    }
    const [recordAfter] = (await kindCopies(tenantId, "record")).filter((r) => r.isKindDefault);
    expect(recordAfter!.id).toBe(recordBefore!.id);

    const again = await me().post(`/template-library/looks/${lookId}/adopt`);
    expect(again.body.changed).toEqual([]);
    expect(again.body.unchanged).toHaveLength(2);
    // The other club is untouched.
    expect((await kindCopies(otherTenantId, "matchDay")).length).toBe(0);
  });
});

describe("tenant isolation (T3.11)", () => {
  it("another club can't read or change this club's copies", async () => {
    const [mine] = await kindCopies(tenantId, "milestone");
    const id = mine!.id;
    expect((await them().get(`/club-templates/${id}`)).status).toBe(404);
    expect(
      (await them().put(`/club-templates/${id}`, { baseVersion: mine!.version, name: "x" })).status,
    ).toBe(404);
    expect((await them().del(`/club-templates/${id}`)).status).toBe(404);
    expect((await them().post(`/club-templates/${id}/default`)).status).toBe(404);
    expect((await them().post(`/club-templates/${id}/duplicate`)).status).toBe(404);
    expect(
      (await them().post(`/club-templates/${id}/apply`, { version: mine!.version })).status,
    ).toBe(404);
    const list = await them().get("/club-templates");
    expect(list.body.templates.every((t: { id: number }) => t.id !== id)).toBe(true);
    const [unchanged] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, id));
    expect(unchanged!.name).toBe(mine!.name);
  });

  it("an unlisted library template opens only for a club holding a copy of it", async () => {
    const id = libIds[`${LOOK}/matchDay`]!;
    await db
      .update(libraryTemplatesTable)
      .set({ listed: false })
      .where(eq(libraryTemplatesTable.id, id));
    try {
      expect((await me().get(`/template-library/${id}`)).status).toBe(200);
      expect((await them().get(`/template-library/${id}`)).status).toBe(404);
      expect((await them().post("/club-templates", { libraryTemplateId: id })).status).toBe(404);
    } finally {
      await db
        .update(libraryTemplatesTable)
        .set({ listed: true })
        .where(eq(libraryTemplatesTable.id, id));
    }
  });
});

describe("preview input (T3.10)", () => {
  it("is the latest senior draft of the kind, never a junior one", async () => {
    const [senior] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "matchSummary",
        cardInput: { kind: "matchSummary", headline: "Senior result" },
      })
      .returning();
    await db.insert(socialDraftsTable).values([
      {
        tenantId,
        engine: "matchSummary",
        sourceMatchIsJunior: true,
        cardInput: { kind: "matchSummary", headline: "Junior match" },
      },
      {
        tenantId,
        engine: "matchday",
        cardInput: { kind: "matchSummary", slides: [{ junior: true, headline: "Junior slide" }] },
      },
    ]);
    const res = await me().get("/template-library/preview-input?kind=matchSummary");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "draft", draftId: senior!.id });
    expect(res.body.input.headline).toBe("Senior result");
    // Another club sees its own (none): the sample.
    const other = await them().get("/template-library/preview-input?kind=matchSummary");
    expect(other.body).toEqual({ kind: "matchSummary", source: "sample", input: null });
    expect((await me().get("/template-library/preview-input?kind=nope")).status).toBe(404);
  });

  it("falls back to the sample when only junior drafts exist", async () => {
    await db.insert(socialDraftsTable).values({
      tenantId: otherTenantId,
      engine: "teamlist",
      sourceMatchIsJunior: true,
      cardInput: { kind: "teamList", title: "Juniors" },
    });
    const res = await them().get("/template-library/preview-input?kind=teamList");
    expect(res.body.source).toBe("sample");
  });
});
