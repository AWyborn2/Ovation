import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  playerGradeStatsTable,
  cardSetsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * C3 (N3) — DB-backed integration test for POST /card-sets/generate.
 *
 * Exercises the upsert transaction that the DB-free unit suite cannot: generate
 * a gradeLeader carousel, then regenerate the SAME (kind + grouping key) and
 * assert exactly ONE card_sets row exists (regenerate UPDATED it, not
 * duplicated) and its publish state is preserved.
 *
 * Real-DB integration test (needs DATABASE_URL) — skipped in the no-DATABASE_URL
 * sandbox, runs in CI's API integration suite. Runs against a synthetic NATIVE
 * tenant (readsFromCentral=false) so the native gradeLeader path reads the seeded
 * player_grade_stats row, and everything is fully tenant-scoped for cleanup.
 */

const STAMP = Date.now();
const TEST_GRADE = `C3 Test Grade ${STAMP}`;

describe("card-sets generate: idempotent regeneration (upsert)", () => {
  let tenantId: number;
  let adminCookie: string;
  let adminId: number;
  let playerId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-card-sets-generate";

    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        slug: `c3-gen-tenant-${STAMP}`,
        // centralClubId is NOT NULL; a sentinel is fine — with readsFromCentral
        // false the native path never uses it.
        centralClubId: 999,
        appClubId: null,
        readsFromCentral: false, // native path → reads seeded player_grade_stats
        name: "C3 Generate Test Tenant",
        plan: "pilot",
      })
      .returning();
    tenantId = tenant.id;

    const [player] = await db
      .insert(playersTable)
      .values({ surname: "Leader", givenName: "Top" })
      .returning();
    playerId = player.id;

    // One player in a unique grade → deterministically the grade's top scorer.
    await db.insert(playerGradeStatsTable).values({
      playerId,
      surname: "Leader",
      givenName: "Top",
      grade: TEST_GRADE,
      runs: 500,
      wickets: 0,
      games: 5,
    });

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: `c3_gen_admin_${STAMP}`,
        displayName: "C3 Gen Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(cardSetsTable).where(eq(cardSetsTable.tenantId, tenantId));
    await db.delete(playerGradeStatsTable).where(eq(playerGradeStatsTable.playerId, playerId));
    await db.delete(playersTable).where(eq(playersTable.id, playerId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  const body = {
    kind: "gradeLeader" as const,
    grades: [TEST_GRADE],
    platformSize: "square" as const,
  };

  it("regenerating the same group updates one row and preserves publish state", async () => {
    // First generation → a new draft set with one slide (the grade's leader).
    const first = await request(app)
      .post("/api/card-sets/generate")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenantId))
      .send(body)
      .expect(200);

    expect(first.body.sourceKind).toBe("gradeLeader");
    expect(first.body.isPublished).toBe(false);
    expect(first.body.slides).toHaveLength(1);
    expect(first.body.slides[0].input.kind).toBe("gradeLeader");
    expect(first.body.slides[0].input.playerName).toBe("Top Leader");
    const firstId: number = first.body.id;

    // Simulate the admin publishing the set (bypassing the 2-slide publish floor
    // — we only care that regeneration doesn't reset the flag).
    await db
      .update(cardSetsTable)
      .set({ isPublished: true })
      .where(eq(cardSetsTable.id, firstId));

    // Second generation of the SAME group → must update the SAME row.
    const second = await request(app)
      .post("/api/card-sets/generate")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenantId))
      .send(body)
      .expect(200);

    expect(second.body.id).toBe(firstId); // same row, not a duplicate
    expect(second.body.isPublished).toBe(true); // publish state preserved
    expect(second.body.slides).toHaveLength(1);

    // Exactly one generated gradeLeader row exists for this tenant.
    const rows = await db
      .select({ id: cardSetsTable.id })
      .from(cardSetsTable)
      .where(
        and(
          eq(cardSetsTable.tenantId, tenantId),
          eq(cardSetsTable.sourceKind, "gradeLeader"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstId);
  });
});
