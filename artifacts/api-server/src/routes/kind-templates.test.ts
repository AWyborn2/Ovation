/**
 * Card kind template API (plan 2026-10-07-002, U5; ADR-002, ADR-003).
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  socialDraftRevisionsTable,
  socialDraftsTable,
  tenantsTable,
} from "@workspace/db";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { ensureKindTemplate } from "../lib/kind-templates";

const STAMP = Date.now();
let tenantId: number;
let otherTenantId: number;
const adminIds: number[] = [];
let cookie: string;
let secondCookie: string;
let otherCookie: string;
const SWITCH = process.env.KIND_TEMPLATES;

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
  adminIds.push(admin.id);
  return `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-kind-templates";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `kind-tpl-${STAMP}`, centralClubId: 9961, name: "Template Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `kind-tpl-other-${STAMP}`,
      centralClubId: 9962,
      name: "Other Club",
      plan: "pro",
    })
    .returning();
  otherTenantId = o.id;
  cookie = await makeAdmin(tenantId, "Editor");
  secondCookie = await makeAdmin(tenantId, "Second");
  otherCookie = await makeAdmin(otherTenantId, "Outsider");
});

afterEach(() => {
  if (SWITCH === undefined) delete process.env.KIND_TEMPLATES;
  else process.env.KIND_TEMPLATES = SWITCH;
});

afterAll(async () => {
  const tenants = [tenantId, otherTenantId];
  await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenants));
  await db.delete(cardTemplatesTable).where(inArray(cardTemplatesTable.tenantId, tenants));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
});

const as = (c: string, tenant = tenantId) => ({
  get: (path: string) =>
    request(app).get(`/api${path}`).set("Cookie", c).set("x-tenant-id", String(tenant)),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set("Cookie", c).set("x-tenant-id", String(tenant)).send(body),
});

const on = () => {
  process.env.KIND_TEMPLATES = `${tenantId},${otherTenantId}`;
};

describe("switched off (KTD18)", () => {
  it("reports disabled and answers 404 for every kind route", async () => {
    delete process.env.KIND_TEMPLATES;
    const list = await as(cookie).get("/kind-templates");
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ enabled: false, templates: [] });
    expect((await as(cookie).get("/kind-templates/milestone")).status).toBe(404);
    expect(
      (await as(cookie).post("/kind-templates/milestone/start", { starter: "club-kit" })).status,
    ).toBe(404);
    const rows = await db
      .select()
      .from(cardTemplatesTable)
      .where(and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, "kind")));
    expect(rows).toHaveLength(0);
  });
});

describe("starting, saving and conflicts", () => {
  it("has no template until one is started, then starts at version 1", async () => {
    on();
    expect((await as(cookie).get("/kind-templates/milestone")).status).toBe(404);
    const res = await as(cookie).post("/kind-templates/milestone/start", { starter: "club-kit" });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("milestone");
    expect(res.body.version).toBe(1);
    expect(res.body.document.layers.length).toBeGreaterThan(0);
  });

  it("saves a new version and rejects a stale save naming who saved (KTD7)", async () => {
    on();
    const doc = placeholderDocument("milestone");
    const saved = await as(cookie).put("/kind-templates/milestone", {
      baseVersion: 1,
      document: doc,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);
    expect(saved.body.updatedByName).toBe("Editor");

    const stale = await as(secondCookie).put("/kind-templates/milestone", {
      baseVersion: 1,
      document: doc,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(2);
    expect(stale.body.updatedByName).toBe("Editor");
    const [row] = await db
      .select()
      .from(cardTemplatesTable)
      .where(
        and(
          eq(cardTemplatesTable.tenantId, tenantId),
          eq(cardTemplatesTable.baseKind, "milestone"),
        ),
      );
    expect(row.version).toBe(2);
  });

  it("refuses a template with an empty size (KTD15)", async () => {
    on();
    const doc = placeholderDocument("milestone");
    for (const layer of doc.layers) layer.sizes = ["square", "portrait", "landscape"];
    const res = await as(cookie).put("/kind-templates/milestone", {
      baseVersion: 2,
      document: doc,
    });
    expect(res.status).toBe(400);
    expect(res.body.emptySizes).toEqual(["story"]);
  });

  it("restarting an existing template needs the current version", async () => {
    on();
    const missing = await as(cookie).post("/kind-templates/milestone/start", {
      starter: "broadcast",
    });
    expect(missing.status).toBe(409);
    const ok = await as(cookie).post("/kind-templates/milestone/start", {
      starter: "broadcast",
      baseVersion: 2,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(3);
  });

  it("answers 404 for an unknown kind", async () => {
    on();
    expect((await as(cookie).get("/kind-templates/notAKind")).status).toBe(404);
  });
});

describe("lazy creation (KTD11)", () => {
  it("creates exactly one template under concurrent calls", async () => {
    on();
    const [a, b] = await Promise.all([
      ensureKindTemplate(tenantId, "century", "club-kit-v1"),
      ensureKindTemplate(tenantId, "century", "club-kit-v1"),
    ]);
    expect(a.id).toBe(b.id);
    const rows = await db
      .select()
      .from(cardTemplatesTable)
      .where(
        and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.baseKind, "century")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].defaultForKinds).toEqual([]);
  });

  it("records a retired pack and shows the notice until dismissed (AE7)", async () => {
    on();
    await ensureKindTemplate(tenantId, "teamList", "gold-foil-v1");
    let list = await as(cookie).get("/kind-templates");
    let teamList = list.body.templates.find((t: { kind: string }) => t.kind === "teamList");
    expect(teamList.replacedPackId).toBe("gold-foil-v1");
    expect(teamList.noticeDismissed).toBe(false);
    expect((await as(cookie).post("/kind-templates/teamList/dismiss-notice")).status).toBe(204);
    list = await as(cookie).get("/kind-templates");
    teamList = list.body.templates.find((t: { kind: string }) => t.kind === "teamList");
    expect(teamList.noticeDismissed).toBe(true);
  });

  it("leaves the club's pack choice alone and stays out of the card-template list", async () => {
    on();
    await db.insert(cardTemplatesTable).values({
      tenantId,
      name: "Pack",
      source: "pack",
      packId: "broadcast-dark-v1",
      packVariant: `kt-${STAMP}`,
      defaultForKinds: ["ladder"],
    });
    await ensureKindTemplate(tenantId, "ladder", "broadcast-dark-v1");
    const [pack] = await db
      .select()
      .from(cardTemplatesTable)
      .where(and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, "pack")));
    expect(pack.defaultForKinds).toEqual(["ladder"]);
    const listed = await as(cookie).get("/card-templates");
    expect(listed.body.some((r: { source: string }) => r.source === "kind")).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("never shows or changes another club's template", async () => {
    on();
    const other = as(otherCookie, otherTenantId);
    expect((await other.get("/kind-templates/milestone")).status).toBe(404);
    expect(
      (
        await other.put("/kind-templates/milestone", {
          baseVersion: 3,
          document: placeholderDocument("milestone"),
        })
      ).status,
    ).toBe(404);
    const [mine] = await db
      .select()
      .from(cardTemplatesTable)
      .where(
        and(
          eq(cardTemplatesTable.tenantId, tenantId),
          eq(cardTemplatesTable.baseKind, "milestone"),
        ),
      );
    expect(mine.version).toBe(3);
  });
});

describe("applying to waiting drafts (R16, R18, AE4)", () => {
  const draft = async (
    status: string,
    extra: Partial<typeof socialDraftsTable.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "milestone",
        status,
        cardInput: { kind: "milestone", playerName: "Kim", tierLabel: "Centurion" },
        packId: "broadcast-dark-v1",
        adjustments: { layers: [] },
        ...extra,
      })
      .returning();
    return row;
  };

  it("replaces every unposted draft's design, keeps captions, skips posted", async () => {
    on();
    const plain = await draft("awaiting_review");
    const ready = await draft("ready");
    const tweaked = await draft("awaiting_review", {
      caption: "Hand written",
      editedAt: new Date(),
      designEditedAt: new Date(),
      adjustments: { layers: [], photo: { square: { focalX: 10, focalY: 10, zoom: 2 } } },
    });
    const posted = await draft("posted");

    const res = await as(cookie).post("/kind-templates/milestone/apply", {
      version: 3,
      expectedDrafts: 4,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ changed: 3, skipped: 1 });

    const rows = await db
      .select()
      .from(socialDraftsTable)
      .where(inArray(socialDraftsTable.id, [plain.id, ready.id, tweaked.id, posted.id]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of [plain.id, ready.id, tweaked.id]) {
      const r = byId.get(id)!;
      expect(r.packId).toBe("blank");
      expect(r.templateVersion).toBe(3);
      expect(r.layoutCheckPending).toBe(true);
      expect(r.designEditedAt).toBeNull();
      expect((r.adjustments as { layers: unknown[] }).layers.length).toBeGreaterThan(0);
    }
    expect(byId.get(tweaked.id)!.caption).toBe("Hand written");
    expect(byId.get(tweaked.id)!.editedAt).not.toBeNull();
    expect(byId.get(posted.id)!.packId).toBe("broadcast-dark-v1");
    expect(byId.get(posted.id)!.templateVersion).toBeNull();

    const revisions = await db
      .select()
      .from(socialDraftRevisionsTable)
      .where(eq(socialDraftRevisionsTable.draftId, tweaked.id));
    expect(revisions.map((r) => r.reason)).toContain("template");
    expect(revisions[0].adjustments).toEqual({
      layers: [],
      photo: { square: { focalX: 10, focalY: 10, zoom: 2 } },
    });
  });

  it("refuses an apply for a version that is no longer current", async () => {
    on();
    const res = await as(cookie).post("/kind-templates/milestone/apply", { version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.currentVersion).toBe(3);
  });

  it("counts waiting drafts per kind in the list", async () => {
    on();
    const list = await as(cookie).get("/kind-templates");
    const milestone = list.body.templates.find((t: { kind: string }) => t.kind === "milestone");
    expect(milestone.waitingDrafts).toBe(3);
  });
});

describe("hand-made and hand-edited drafts (U7)", () => {
  const patch = (c: string, path: string, body: object) =>
    request(app)
      .patch(`/api${path}`)
      .set("Cookie", c)
      .set("x-tenant-id", String(tenantId))
      .send(body);

  it("a card started from the club's design copies the kind template when on", async () => {
    on();
    const res = await as(cookie).post("/social-drafts", {
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      packId: "club-kit",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      packId: "blank",
      templateVersion: expect.any(Number),
      layoutCheckPending: true,
    });
  });

  it("a blank canvas stays blank, and the switch off keeps the pack", async () => {
    on();
    const blank = await as(cookie).post("/social-drafts", {
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      packId: "blank",
    });
    expect(blank.body.templateVersion).toBeNull();
    delete process.env.KIND_TEMPLATES;
    const off = await as(cookie).post("/social-drafts", {
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      packId: "club-kit",
    });
    expect(off.body).toMatchObject({ packId: "club-kit", templateVersion: null });
  });

  it("a design edit on a templated draft marks the design, not the caption", async () => {
    on();
    const created = await as(cookie).post("/social-drafts", {
      cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
      packId: "club-kit",
    });
    await db
      .update(socialDraftsTable)
      .set({ layoutCheckPending: false })
      .where(eq(socialDraftsTable.id, created.body.id));
    const res = await patch(cookie, `/social-drafts/${created.body.id}`, {
      adjustments: placeholderDocument("milestone"),
    });
    expect(res.status).toBe(200);
    expect(res.body.editedAt).toBeNull();
    expect(res.body.designEditedAt).not.toBeNull();
    expect(res.body.layoutCheckPending).toBe(true);
  });
});
