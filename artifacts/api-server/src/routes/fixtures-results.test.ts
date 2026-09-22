import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable } from "@workspace/db";

/**
 * Public Fixtures & Results (PlayHQ landing schema).
 *
 * Real-DB integration in the fixtures.test.ts shape: two fresh tenants, one
 * unlinked and one linked to a PlayHQ organisation GUID that owns no rows.
 * The invariants: an unlinked tenant gets `linked: false` and nothing else
 * (never another club's fixtures); a linked tenant only ever sees rows for
 * its own organisation. The linked branch reads the live central DB, which
 * may be unavailable in CI, so it accepts a 5xx as long as nothing leaks.
 */

const STAMP = Date.now();
const FAKE_ORG = `00000000-0000-4000-8000-${STAMP.toString(16).padStart(12, "0").slice(-12)}`;

describe("fixtures-results (PlayHQ)", () => {
  let unlinkedId: number;
  let linkedId: number;

  beforeAll(async () => {
    const [unlinked] = await db
      .insert(tenantsTable)
      .values({
        slug: `fx-unlinked-${STAMP}`,
        centralClubId: 9601,
        name: "Fixtures Unlinked",
        readsFromCentral: true,
        plan: "pilot",
      })
      .returning();
    unlinkedId = unlinked.id;
    const [linked] = await db
      .insert(tenantsTable)
      .values({
        slug: `fx-linked-${STAMP}`,
        centralClubId: 9602,
        name: "Fixtures Linked",
        readsFromCentral: true,
        plan: "pilot",
        playhqOrgId: FAKE_ORG,
      })
      .returning();
    linkedId = linked.id;
  });

  afterAll(async () => {
    await db.delete(tenantsTable).where(eq(tenantsTable.id, unlinkedId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, linkedId));
  });

  it("an unlinked tenant gets linked:false and empty lists", async () => {
    const res = await request(app)
      .get("/api/fixtures-results")
      .set("x-tenant-id", String(unlinkedId))
      .expect(200);
    expect(res.body).toEqual({
      linked: false,
      seasons: [],
      latestSeason: null,
      grades: [],
      matches: [],
    });
  });

  it("an unlinked tenant gets 404 for a ladder", async () => {
    await request(app)
      .get("/api/fixtures-results/ladder?gradeId=1afe6794-5675-4123-ae59-b7a03e5a03f9")
      .set("x-tenant-id", String(unlinkedId))
      .expect(404);
  });

  it("rejects a ladder request without a gradeId", async () => {
    await request(app)
      .get("/api/fixtures-results/ladder")
      .set("x-tenant-id", String(linkedId))
      .expect(400);
  });

  it("a linked tenant only sees its own organisation's matches (none for a fresh GUID)", async () => {
    const res = await request(app)
      .get("/api/fixtures-results")
      .set("x-tenant-id", String(linkedId));
    if (res.status === 200) {
      expect(res.body.linked).toBe(true);
      expect(res.body.matches).toEqual([]);
      expect(res.body.seasons).toEqual([]);
    } else {
      // Central DB unavailable in this environment — nothing may leak either way.
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(JSON.stringify(res.body)).not.toContain("playhqMatchId");
    }
  });
});
