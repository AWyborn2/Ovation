/**
 * Social Studio U18 — ad-hoc cards and editor templates. An ad-hoc card waits
 * for review and never auto-promotes; saving a draft as a template and
 * creating a card from it reproduces the pack and adjustments; editor
 * templates stay out of the card-template gallery and never leak across
 * tenants. Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialDraftsTable,
  socialSettingsTable,
  cardTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];

async function makeTenant(n: number) {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `adhoc-${n}-${STAMP}`,
      centralClubId: 9960 + n,
      name: "Adhoc Club",
      plan: "pro",
    })
    .returning();
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId: t.id, username: `adhoc${n}_${STAMP}`, displayName: "A", passwordHash: "x" })
    .returning();
  tenantIds.push(t.id);
  adminIds.push(admin.id);
  cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-adhoc";
  await makeTenant(1);
  await makeTenant(2);
  // Auto-post on: an ad-hoc card must still wait for review.
  await db.insert(socialSettingsTable).values({ tenantId: tenantIds[0], autoPostEnabled: true });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenantIds));
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenantIds));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
});

const as = (i: number) => ({
  post: (path: string, body?: object) =>
    request(app)
      .post(`/api${path}`)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i]))
      .send(body ?? {}),
  get: (path: string) =>
    request(app)
      .get(`/api${path}`)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i])),
  del: (path: string) =>
    request(app)
      .delete(`/api${path}`)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i])),
});

const signing = { kind: "newSigning", playerName: "Sam Lee", headline: "WELCOME" };
const adjustments = {
  fields: { headline: "NEW RECRUIT" },
  layers: [
    {
      id: "l1",
      kind: "text",
      content: "Sat 2pm",
      geometry: { square: { x: 5, y: 5, w: 40, h: 8 } },
    },
  ],
};

describe("POST /social-drafts (ad-hoc)", () => {
  it("creates a draft awaiting review that never auto-promotes", async () => {
    const res = await as(0).post("/social-drafts", { cardInput: signing, packId: null });
    expect(res.status).toBe(201);
    expect(res.body.engine).toBe("adhoc");
    expect(res.body.status).toBe("awaiting_review");
    expect(res.body.autoReadyAt).toBeNull();
    expect(res.body.family).toBe("matchday");

    const [row] = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.id, res.body.id));
    expect(row.sourceImportedAt).toBeNull();
    const list = await as(0).get("/social-drafts?status=awaiting_review");
    expect(list.body.map((d: { id: number }) => d.id)).toContain(res.body.id);
  });

  it("a blank canvas keeps the blank pack and its layers", async () => {
    const res = await as(0).post("/social-drafts", {
      cardInput: signing,
      packId: "blank",
      adjustments,
    });
    expect(res.status).toBe(201);
    expect(res.body.packId).toBe("blank");
    expect(res.body.adjustments).toEqual(adjustments);
  });

  it("rejects a card input with no kind", async () => {
    expect((await as(0).post("/social-drafts", { cardInput: {} })).status).toBe(400);
  });
});

describe("editor templates", () => {
  it("save as template, then create from it, reproduces the pack and adjustments", async () => {
    const draft = await as(0).post("/social-drafts", {
      cardInput: signing,
      packId: "broadcast-dark-v1",
      adjustments,
    });
    const saved = await as(0).post(`/social-drafts/${draft.body.id}/save-template`, {
      name: "Signing, with time",
    });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({
      name: "Signing, with time",
      baseKind: "newSigning",
      packId: "broadcast-dark-v1",
      adjustments,
    });

    const listed = await as(0).get("/editor-templates");
    expect(listed.body.map((t: { id: number }) => t.id)).toContain(saved.body.id);
    // Editor templates are not gallery designs.
    const gallery = await as(0).get("/card-templates");
    expect(gallery.body.map((t: { id: number }) => t.id)).not.toContain(saved.body.id);

    const other = { ...signing, playerName: "Jo Park" };
    const fresh = await as(0).post("/social-drafts", {
      cardInput: other,
      templateId: saved.body.id,
    });
    expect(fresh.status).toBe(201);
    expect(fresh.body.cardInput).toEqual(other);
    expect(fresh.body.packId).toBe("broadcast-dark-v1");
    expect(fresh.body.adjustments).toEqual(adjustments);
  });

  it("another club cannot see, use or delete a template", async () => {
    const draft = await as(0).post("/social-drafts", { cardInput: signing, adjustments });
    const saved = await as(0).post(`/social-drafts/${draft.body.id}/save-template`, {
      name: "Private",
    });
    expect((await as(1).get("/editor-templates")).body).toEqual([]);
    const use = await as(1).post("/social-drafts", {
      cardInput: signing,
      templateId: saved.body.id,
    });
    expect(use.status).toBe(404);
    expect((await as(1).del(`/editor-templates/${saved.body.id}`)).status).toBe(404);
    expect((await as(0).del(`/editor-templates/${saved.body.id}`)).status).toBe(204);
  });

  it("an empty name is rejected", async () => {
    const draft = await as(0).post("/social-drafts", { cardInput: signing });
    const res = await as(0).post(`/social-drafts/${draft.body.id}/save-template`, { name: "" });
    expect(res.status).toBe(400);
  });
});
