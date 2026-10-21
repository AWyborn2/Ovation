/**
 * "Update available" and the edit rule (ADR-011 §3, T6.1, T6.2): an unedited
 * copy is offered its library template's newer versions (listed or not) and
 * can take them; using a template, taking an update or setting a default never
 * makes a copy the club's own; the first saved document change does, and an
 * edited copy is never offered updates. Real-DB integration test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  libraryTemplatesTable,
  templateLooksTable,
  tenantsTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { syncBundles } from "../lib/template-library/bundles";
import { fixtureBundle, fixtureTemplate } from "../lib/template-library/bundles.test-helpers";

const STAMP = Date.now();
const LOOK = `upd-${STAMP}`;
const tenants: number[] = [];
const admins: number[] = [];
const cookies: string[] = [];
let libId: number;

/** A milestone document that differs from the placeholder, version by version. */
const docV = (v: number) => {
  const doc = placeholderDocument("milestone");
  return { layers: doc.layers.map((l, i) => (i === 0 ? { ...l, name: `v${v}` } : l)) };
};
const sync = (v: number) =>
  syncBundles([
    fixtureBundle(LOOK, [fixtureTemplate("milestone", { version: v, document: docV(v) })]),
  ]);

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-template-updates";
  for (const [i, name] of ["Update Club", "Other Club"].entries()) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `upd-${i}-${STAMP}`,
        centralClubId: 5_000_000 + (STAMP % 100_000) * 2 + i,
        name,
        plan: "pro",
      })
      .returning();
    tenants.push(t!.id);
    const [a] = await db
      .insert(adminsTable)
      .values({
        tenantId: t!.id,
        username: `upd${i}_${STAMP}`,
        displayName: name,
        passwordHash: "x",
      })
      .returning();
    admins.push(a!.id);
    cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: a!.id, issuedAt: Date.now() })}`);
  }
  await sync(1);
  const [t] = await db
    .select()
    .from(libraryTemplatesTable)
    .where(eq(libraryTemplatesTable.slug, `${LOOK}/milestone`));
  libId = t!.id;
});

afterAll(async () => {
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  await db.delete(libraryTemplatesTable).where(like(libraryTemplatesTable.slug, `${LOOK}%`));
  await db.delete(templateLooksTable).where(eq(templateLooksTable.slug, LOOK));
  await db.delete(adminsTable).where(inArray(adminsTable.id, admins));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const as = (i: number) => ({
  get: (p: string) =>
    request(app).get(`/api${p}`).set("Cookie", cookies[i]!).set("x-tenant-id", String(tenants[i])),
  post: (p: string, body: object = {}) =>
    request(app)
      .post(`/api${p}`)
      .set("Cookie", cookies[i]!)
      .set("x-tenant-id", String(tenants[i]))
      .send(body),
  put: (p: string, body: object) =>
    request(app)
      .put(`/api${p}`)
      .set("Cookie", cookies[i]!)
      .set("x-tenant-id", String(tenants[i]))
      .send(body),
});

type Summary = {
  id: number;
  edited: boolean;
  updateAvailable: { version: number } | null;
  version: number;
};

const summary = async (id: number): Promise<Summary> => {
  const res = await as(0).get("/club-templates");
  return (res.body.templates as Summary[]).find((t) => t.id === id)!;
};

describe("update available", () => {
  let copyId: number;

  it("using a template and setting it as default never makes it the club's own", async () => {
    const used = await as(0).post("/club-templates", { libraryTemplateId: libId });
    expect(used.status).toBe(201);
    copyId = used.body.id;
    expect(used.body).toMatchObject({ edited: false, updateAvailable: null });
    const def = await as(0).post(`/club-templates/${copyId}/default`);
    expect(def.body).toMatchObject({ isDefault: true, edited: false });
  });

  it("offers a newer version to an unedited copy, listed or not, and takes it", async () => {
    await sync(2);
    // Unlisting the origin doesn't hide the update from copies.
    await db
      .update(libraryTemplatesTable)
      .set({ listed: false })
      .where(eq(libraryTemplatesTable.id, libId));
    expect((await summary(copyId)).updateAvailable).toEqual({ version: 2 });
    // The new version is viewable for the side-by-side preview.
    const lib = await as(0).get(`/template-library/${libId}`);
    expect(lib.status).toBe(200);
    expect(lib.body.version).toBe(2);

    const before = await summary(copyId);
    const stale = await as(0).post(`/club-templates/${copyId}/update`, {
      baseVersion: before.version - 1,
    });
    expect(stale.status).toBe(409);
    const taken = await as(0).post(`/club-templates/${copyId}/update`, {
      baseVersion: before.version,
    });
    expect(taken.status).toBe(200);
    expect(taken.body).toMatchObject({
      edited: false,
      updateAvailable: null,
      version: before.version + 1,
      basedOn: { templateId: libId, version: 2 },
    });
    expect(taken.body.document).toEqual(docV(2));
    expect(
      (await as(0).post(`/club-templates/${copyId}/update`, { baseVersion: taken.body.version }))
        .status,
    ).toBe(409);
  });

  it("another club can't take it", async () => {
    await sync(3);
    expect((await as(1).post(`/club-templates/${copyId}/update`, { baseVersion: 1 })).status).toBe(
      404,
    );
    expect((await summary(copyId)).updateAvailable).toEqual({ version: 3 });
  });

  it("a rename isn't an edit; the first document save is, and then no update is offered", async () => {
    let s = await summary(copyId);
    const renamed = await as(0).put(`/club-templates/${copyId}`, {
      baseVersion: s.version,
      name: "Ours",
    });
    expect(renamed.body).toMatchObject({ edited: false, updateAvailable: { version: 3 } });
    const saved = await as(0).put(`/club-templates/${copyId}`, {
      baseVersion: renamed.body.version,
      document: docV(99),
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ edited: true, updateAvailable: null });
    // Still credited to its origin.
    expect(saved.body.basedOn).toMatchObject({ templateId: libId });
    s = await summary(copyId);
    const refused = await as(0).post(`/club-templates/${copyId}/update`, {
      baseVersion: s.version,
    });
    expect(refused.status).toBe(409);
    const [row] = await db
      .select()
      .from(cardTemplatesTable)
      .where(eq(cardTemplatesTable.id, copyId));
    expect(row!.adjustments).toEqual(docV(99));
  });
});
