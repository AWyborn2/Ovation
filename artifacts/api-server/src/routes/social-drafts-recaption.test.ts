/**
 * POST /social-drafts/recaption rebuilds queued drafts' captions from the
 * current templates and variations, keeping edited captions and never touching
 * posted, dismissed or ad-hoc drafts, or another club's queue. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, socialDraftsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
let tenantId: number;
let otherTenantId: number;
let adminId: number;
let cookie: string;

const matchDay = {
  kind: "matchDay",
  roundLabel: "ROUND 5",
  oppositionName: "Rivals CC",
  homeAway: "HOME",
  venue: "Home Oval",
  date: "SAT 14 FEB",
  startTime: "12:30pm",
  grade: "A Grade",
};

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-drafts-recaption";
  const tenants = await db
    .insert(tenantsTable)
    .values([
      { slug: `recaption-${STAMP}`, centralClubId: 9972, name: "Recaption Club", plan: "pro" },
      { slug: `recaption-o-${STAMP}`, centralClubId: 9973, name: "Other Club", plan: "pro" },
    ])
    .returning();
  tenantId = tenants[0].id;
  otherTenantId = tenants[1].id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `recap_${STAMP}`, displayName: "Recap", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  await db
    .delete(socialDraftsTable)
    .where(inArray(socialDraftsTable.tenantId, [tenantId, otherTenantId]));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, otherTenantId]));
});

const recaption = () =>
  request(app)
    .post("/api/social-drafts/recaption")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId));

async function insertDraft(
  tenant: number,
  name: string,
  values: Partial<typeof socialDraftsTable.$inferInsert> = {},
) {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      tenantId: tenant,
      engine: "matchday",
      family: "matchday",
      sourceKey: `recaption:${STAMP}:${name}`,
      status: "awaiting_review",
      cardInput: matchDay,
      appPath: "/fixtures",
      caption: "old caption",
      ...values,
    })
    .returning();
  return row;
}

const captionOf = async (id: number) => {
  const [row] = await db
    .select({ caption: socialDraftsTable.caption })
    .from(socialDraftsTable)
    .where(eq(socialDraftsTable.id, id));
  return row?.caption ?? null;
};

describe("POST /social-drafts/recaption", () => {
  it("needs an admin", async () => {
    const res = await request(app)
      .post("/api/social-drafts/recaption")
      .set("x-tenant-id", String(tenantId));
    expect(res.status).toBe(401);
  });

  it("rebuilds queued captions, keeps edited ones and leaves the rest alone", async () => {
    const waiting = await insertDraft(tenantId, "waiting");
    const ready = await insertDraft(tenantId, "ready", { status: "ready" });
    const edited = await insertDraft(tenantId, "edited", {
      caption: "my words",
      editedAt: new Date(),
    });
    const posted = await insertDraft(tenantId, "posted", { status: "posted" });
    const dismissed = await insertDraft(tenantId, "dismissed", { status: "dismissed" });
    const adhoc = await insertDraft(tenantId, "adhoc", {
      engine: "adhoc",
      sourceKey: null,
      caption: null,
    });
    const otherClub = await insertDraft(otherTenantId, "other");

    const res = await recaption();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recaptioned: 2, unchanged: 0, keptEdited: 1 });

    for (const id of [waiting.id, ready.id]) {
      const caption = await captionOf(id);
      expect(caption).not.toBe("old caption");
      expect(caption).toContain("Rivals CC");
      expect(caption).not.toMatch(/\{[\w.]+\}/);
    }
    expect(await captionOf(edited.id)).toBe("my words");
    expect(await captionOf(posted.id)).toBe("old caption");
    expect(await captionOf(dismissed.id)).toBe("old caption");
    expect(await captionOf(adhoc.id)).toBeNull();
    expect(await captionOf(otherClub.id)).toBe("old caption");
  });

  it("is a no-op the second time", async () => {
    const res = await recaption();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recaptioned: 0, unchanged: 2, keptEdited: 1 });
  });
});
