// The platform console's template library (ADR-011 L7-A, T7.1–T7.3).
//
// Real database. Fixture bundles are synced under look slugs unique to this run; the fit job is
// replaced with a stub runner so each test decides the verdict a new version gets.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray, like, or } from "drizzle-orm";
import app from "../app";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  platformAdminsTable,
  templateLooksTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import { hashPassword } from "../lib/auth";
import { syncBundles } from "../lib/template-library/bundles";
import { fixtureBundle, fixtureTemplate } from "../lib/template-library/bundles.test-helpers";
import { registerFitRunner, writeFitResult, type FitTarget } from "../lib/template-library/fit";
import { listLibraryTemplates } from "../lib/template-library/store";

const STAMP = Date.now();
const LOOK = `pl-${STAMP}-look`;
const EMAIL = `library+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
const NAME_PREFIX = `PL ${STAMP}`;

let cookie: string;
let platformAdminId: number;
const bundleIds: Record<string, number> = {};
const bundles = () => [
  fixtureBundle(LOOK, [
    fixtureTemplate("milestone"),
    fixtureTemplate("record", { listed: false }),
  ]),
];

// The fit job's stand-in: each new version gets `verdict` (null leaves it pending).
let verdict: "pass" | "fail" | null = "pass";
const writes: Promise<void>[] = [];
const settle = async () => {
  await Promise.all(writes.splice(0));
};

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-platform-library";
  registerFitRunner((target: FitTarget) => {
    if (!verdict) return;
    const status = verdict;
    writes.push(
      writeFitResult(target, {
        status,
        report: { kind: "test", status, variants: 12, issues: status === "fail" ? [{}] : [] },
      }),
    );
  });
  await syncBundles(bundles());
  await settle();
  const rows = await db
    .select({ id: libraryTemplatesTable.id, slug: libraryTemplatesTable.slug })
    .from(libraryTemplatesTable)
    .where(like(libraryTemplatesTable.slug, `${LOOK}/%`));
  for (const r of rows) bundleIds[r.slug!.split("/")[1]!] = r.id;

  const [pa] = await db
    .insert(platformAdminsTable)
    .values({ email: EMAIL, displayName: "Designer", passwordHash: await hashPassword(PASSWORD) })
    .returning();
  platformAdminId = pa!.id;
  const login = await request(app)
    .post("/api/platform/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  cookie = String(login.headers["set-cookie"][0]).split(";")[0]!;
});

beforeEach(() => {
  verdict = "pass";
});

afterAll(async () => {
  registerFitRunner(null);
  const mine = or(
    like(libraryTemplatesTable.slug, `${LOOK}/%`),
    like(libraryTemplatesTable.name, `${NAME_PREFIX}%`),
  );
  const ids = (await db.select({ id: libraryTemplatesTable.id }).from(libraryTemplatesTable).where(mine)).map(
    (r) => r.id,
  );
  if (ids.length) {
    await db
      .delete(libraryTemplateVersionsTable)
      .where(inArray(libraryTemplateVersionsTable.templateId, ids));
    await db.delete(libraryTemplatesTable).where(inArray(libraryTemplatesTable.id, ids));
  }
  await db.delete(templateLooksTable).where(like(templateLooksTable.slug, `pl-${STAMP}%`));
  await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformAdminId));
});

const api = {
  get: (p: string) => request(app).get(`/api/platform/admin/library${p}`).set("Cookie", cookie),
  post: (p: string, body: object = {}) =>
    request(app).post(`/api/platform/admin/library${p}`).set("Cookie", cookie).send(body),
  put: (p: string, body: object) =>
    request(app).put(`/api/platform/admin/library${p}`).set("Cookie", cookie).send(body),
};

const create = async (over: Record<string, unknown> = {}) => {
  const res = await api.post("/templates", {
    kind: "milestone",
    name: `${NAME_PREFIX} milestone`,
    document: placeholderDocument("milestone"),
    ...over,
  });
  await settle();
  return res;
};

describe("console library: access", () => {
  it("needs a platform admin", async () => {
    expect((await request(app).get("/api/platform/admin/library/templates")).status).toBe(401);
    expect((await request(app).post("/api/platform/admin/library/looks").send({})).status).toBe(
      401,
    );
  });
});

describe("console library: browsing", () => {
  it("lists every template, listed or not, with bundle templates read-only", async () => {
    const res = await api.get("/templates?kind=record");
    expect(res.status).toBe(200);
    const record = res.body.templates.find((t: { id: number }) => t.id === bundleIds.record);
    expect(record).toMatchObject({
      origin: "bundle",
      listed: false,
      readOnly: true,
      fitStatus: "pass",
      look: { slug: LOOK },
    });
    expect(res.body.templates.every((t: { kind: string }) => t.kind === "record")).toBe(true);
  });

  it("filters by origin and listing, and refuses a bad filter", async () => {
    const listed = await api.get("/templates?origin=bundle&listed=false");
    expect(listed.body.templates.map((t: { id: number }) => t.id)).toContain(bundleIds.record);
    expect(listed.body.templates.map((t: { id: number }) => t.id)).not.toContain(
      bundleIds.milestone,
    );
    expect((await api.get("/templates?origin=elsewhere")).status).toBe(400);
    expect((await api.get("/templates?listed=maybe")).status).toBe(400);
  });

  it("answers 404 for a template that doesn't exist", async () => {
    expect((await api.get("/templates/999999999")).status).toBe(404);
  });
});

describe("console library: making templates", () => {
  it("creates an unlisted console template at version 1 and checks its fit", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      origin: "console",
      listed: false,
      readOnly: false,
      version: 1,
      kind: "milestone",
    });
    const got = await api.get(`/templates/${res.body.id}`);
    expect(got.body.fitStatus).toBe("pass");
    const [v] = await db
      .select()
      .from(libraryTemplateVersionsTable)
      .where(eq(libraryTemplateVersionsTable.templateId, res.body.id));
    expect(v!.createdByAdminId).toBe(platformAdminId);
  });

  it("refuses an unknown kind, an invalid document and outside images", async () => {
    expect((await create({ kind: "nope" })).status).toBe(400);
    expect((await create({ document: { layers: "no" } })).status).toBe(400);
    const doc = placeholderDocument("milestone") as { layers: Array<Record<string, unknown>> };
    const outside = {
      layers: doc.layers.map((l, i) =>
        i === 0 ? { ...l, content: "See https://example.com/a.png" } : l,
      ),
    };
    const res = await create({ document: outside });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/library images/);
  });

  it("saves a new document as a new version, and refuses a stale one", async () => {
    const made = (await create()).body;
    const doc = placeholderDocument("milestone");
    const saved = await api.put(`/templates/${made.id}`, { baseVersion: 1, document: doc });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);
    const stale = await api.put(`/templates/${made.id}`, { baseVersion: 1, document: doc });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(2);
    const renamed = await api.put(`/templates/${made.id}`, {
      baseVersion: 2,
      name: `${NAME_PREFIX} renamed`,
    });
    expect(renamed.body).toMatchObject({ version: 2, name: `${NAME_PREFIX} renamed` });
    const versions = await db
      .select({ v: libraryTemplateVersionsTable.version })
      .from(libraryTemplateVersionsTable)
      .where(eq(libraryTemplateVersionsTable.templateId, made.id));
    expect(versions.map((r) => r.v).sort()).toEqual([1, 2]);
  });

  it("won't edit a bundle template, and duplicates it into a console copy", async () => {
    const id = bundleIds.milestone!;
    const edit = await api.put(`/templates/${id}`, {
      baseVersion: 1,
      document: placeholderDocument("milestone"),
    });
    expect(edit.status).toBe(403);
    const dup = await api.post(`/templates/${id}/duplicate`, { name: `${NAME_PREFIX} copy` });
    await settle();
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({
      origin: "console",
      listed: false,
      readOnly: false,
      version: 1,
      look: { slug: LOOK },
      name: `${NAME_PREFIX} copy`,
    });
    expect(dup.body.document).toEqual(placeholderDocument("milestone"));
  });
});

describe("console library: listing", () => {
  it("lists a template whose current version passed, so clubs can find it", async () => {
    const made = (await create()).body;
    const res = await api.post(`/templates/${made.id}/list`);
    expect(res.status).toBe(200);
    expect(res.body.listed).toBe(true);
    const browse = await listLibraryTemplates({ kind: "milestone" });
    // The browse is paged; walk it until the template shows.
    let page = browse;
    const seen = new Set(page.templates.map((t) => t.id));
    while (!seen.has(made.id) && page.nextCursor) {
      page = await listLibraryTemplates({ kind: "milestone", cursor: page.nextCursor });
      page.templates.forEach((t) => seen.add(t.id));
    }
    expect(seen.has(made.id)).toBe(true);
  });

  it("won't list a version whose check is pending, failed or skipped", async () => {
    verdict = null;
    const pending = (await create()).body;
    expect((await api.post(`/templates/${pending.id}/list`)).status).toBe(409);

    verdict = "fail";
    const failed = (await create()).body;
    const res = await api.post(`/templates/${failed.id}/list`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/failed the layout check/);

    verdict = "pass";
    const skipped = (await create()).body;
    await db
      .update(libraryTemplateVersionsTable)
      .set({ fitStatus: "pass", fitReport: { skipped: true } })
      .where(eq(libraryTemplateVersionsTable.templateId, skipped.id));
    const s = await api.post(`/templates/${skipped.id}/list`);
    expect(s.status).toBe(409);
    expect(s.body.error).toMatch(/hasn't had a layout check/);
  });

  it("unlists with a reason, and an Ovation unlisting survives bundle sync", async () => {
    const id = bundleIds.milestone!;
    const res = await api.post(`/templates/${id}/unlist`, { reason: "Clashes with sponsors" });
    expect(res.body).toMatchObject({
      listed: false,
      unlistedBy: "ovation",
      unlistReason: "Clashes with sponsors",
    });
    await syncBundles(bundles());
    expect((await api.get(`/templates/${id}`)).body.listed).toBe(false);
    // Listing it again undoes the unlisting; its bundle file lists it.
    const relisted = await api.post(`/templates/${id}/list`);
    expect(relisted.body).toMatchObject({ listed: true, unlistedBy: null, unlistReason: null });
  });

  it("won't list a bundle template its bundle file leaves unlisted", async () => {
    const res = await api.post(`/templates/${bundleIds.record}/list`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/bundle file/);
  });
});

describe("console library: looks", () => {
  it("creates a look, and refuses a taken, bundle or malformed slug", async () => {
    const slug = `pl-${STAMP}-new`;
    const made = await api.post("/looks", { slug, name: "New look", description: "Bold" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ slug, origin: "console", templates: 0 });
    expect((await api.post("/looks", { slug, name: "Again" })).status).toBe(409);
    expect((await api.post("/looks", { slug: "Not A Slug", name: "x" })).status).toBe(400);
    const bundleSlug = TEMPLATE_BUNDLES[0]?.slug;
    if (bundleSlug) expect((await api.post("/looks", { slug: bundleSlug, name: "x" })).status).toBe(409);
  });

  it("lists every look with its template count, and files a template under one", async () => {
    const res = await api.get("/looks");
    const look = res.body.looks.find((l: { slug: string }) => l.slug === LOOK);
    expect(look).toMatchObject({ origin: "bundle" });
    expect(look.templates).toBeGreaterThanOrEqual(2);
    const made = (await create({ lookId: look.id })).body;
    expect(made.look).toMatchObject({ id: look.id });
    expect((await create({ lookId: 999999999 })).status).toBe(400);
  });
});
