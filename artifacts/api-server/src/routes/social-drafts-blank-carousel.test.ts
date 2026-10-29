import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db, adminsTable, tenantsTable, socialDraftsTable } from "@workspace/db";
import { primaryPage } from "@workspace/scorecard/kind-templates";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * New Studio's Create → "Pick by hand" (studio-create-consolidation S4): a blank
 * carousel of the club's own pages is a draft whose design is a free set. It waits
 * for review, and the set editor reads it as pages.
 *
 * Real-DB integration test (needs DATABASE_URL): CI only.
 */
const STAMP = Date.now();

describe("a blank carousel from Create", () => {
  let tenant = 0;
  let cookie = "";
  const ids: number[] = [];
  const asAdmin = (r: request.Test) => r.set("x-tenant-id", String(tenant)).set("Cookie", cookie);

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-blank-carousel";
    const [t] = await db
      .insert(tenantsTable)
      .values({ slug: `sbc-${STAMP}`, centralClubId: 99_000 + (STAMP % 1000), name: "SBC" })
      .returning();
    tenant = t.id;
    const [a] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant,
        username: `test_admin_sbc_${STAMP}`,
        displayName: "a",
        passwordHash: "x",
      })
      .returning();
    cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: a.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    if (ids.length) await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.id, ids));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenant));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant));
  });

  it("stores the free set and the set editor opens it as pages", async () => {
    const kind = "announcement";
    // The document Create's blankCarouselDocument() sends: three blank pages.
    const set = {
      formatVersion: 2,
      set: "free",
      pages: [1, 2, 3].map((n) => ({
        id: `page-${n}`,
        role: "fixed",
        slot: "page",
        kind,
        page: primaryPage(kind),
        name: `Page ${n}`,
        layers: [],
      })),
    };
    const res = await asAdmin(request(app).post("/api/social-drafts"))
      .send({ cardInput: { kind }, packId: "blank", adjustments: set })
      .expect(201);
    ids.push(res.body.id);
    expect(res.body.status).toBe("awaiting_review");
    const design = await asAdmin(
      request(app).get(`/api/social-drafts/${res.body.id}/set-design`),
    ).expect(200);
    expect(design.body.layout).toBe("pages");
    expect(design.body.document.pages).toHaveLength(3);
  });
});
