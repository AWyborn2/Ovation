import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  importsTable,
  matchesTable,
  juniorMatchesTable,
  socialDraftsTable,
  socialSettingsTable,
  cardSetsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { NATIVE_STATS_TENANT_ID } from "../lib/tenant";

/**
 * C4 (N4) — DB-backed integration test for POST /card-sets/autoseed.
 *
 * Exercises the full path the DB-free unit suite cannot: gather a round's
 * APPROVED match-summary drafts, look up each match's (season, round, grade),
 * delegate to the shared C3 generate core, and UPSERT one card_sets row. Then
 * regenerate the SAME round and assert exactly ONE row exists (regenerate
 * UPDATED it, not duplicated) with its publish state preserved. Also checks the
 * dormant toggle: with autoseed_carousels OFF the endpoint is a no-op.
 *
 * Real-DB integration test (needs DATABASE_URL) — skipped in the no-DATABASE_URL
 * sandbox, runs in CI's API integration suite. Fully tenant-scoped for cleanup.
 */

const STAMP = Date.now();
const TEST_GRADE = `C4 Test Grade ${STAMP}`;
const SEASON = 2099;
const ROUND = 7;

describe("card-sets autoseed: approved drafts → carousel (idempotent)", () => {
  // Tenant #1: the matchSummary generate path reads the native matches table,
  // which only tenant #1 owns (the stats-core guard rejects any other tenant
  // configured for native reads). Everything created here is keyed on a
  // per-run grade string so cleanup only touches this run's rows.
  const tenantId = NATIVE_STATS_TENANT_ID;
  let adminCookie: string;
  let adminId: number;
  let importId: number;
  let matchIds: number[] = [];
  const draftIds: number[] = [];
  let juniorMatchId: number;
  /** Tenant #1's pre-existing autoseed toggle (null = no settings row yet). */
  let previousAutoseed: boolean | null = null;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-card-sets-autoseed";

    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `c4-${STAMP}.csv`, grade: TEST_GRADE, season: SEASON })
      .returning();
    importId = imp.id;

    // Two senior matches in the same (grade, season, round) → one carousel.
    // Manual uploads are unique per (grade, season, round, stage) — see
    // matches_identity_manual_uidx in scripts/src/ensure-constraints.ts — so
    // two matches in one round can only come from a bulk load, which carries a
    // source_key. Give these the bulk-load shape.
    const m = await db
      .insert(matchesTable)
      .values([
        {
          importId,
          grade: TEST_GRADE,
          season: SEASON,
          round: ROUND,
          opponent: "Rovers",
          sourceKey: `c4-${STAMP}-a`,
        },
        {
          importId,
          grade: TEST_GRADE,
          season: SEASON,
          round: ROUND,
          opponent: "United",
          sourceKey: `c4-${STAMP}-b`,
        },
      ])
      .returning({ id: matchesTable.id });
    matchIds = m.map((r) => r.id);

    // Autoseed toggle ON for the run; the prior state is restored in afterAll.
    const [existingSettings] = await db
      .select({ autoseedCarousels: socialSettingsTable.autoseedCarousels })
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    if (existingSettings) {
      previousAutoseed = existingSettings.autoseedCarousels;
      await db
        .update(socialSettingsTable)
        .set({ autoseedCarousels: true })
        .where(eq(socialSettingsTable.tenantId, tenantId));
    } else {
      await db.insert(socialSettingsTable).values({ tenantId, autoseedCarousels: true });
    }

    // Two APPROVED match-summary drafts, one per match.
    const seniorDrafts = await db
      .insert(socialDraftsTable)
      .values(
        matchIds.map((matchId) => ({
          tenantId,
          engine: "matchSummary",
          status: "approved",
          sourceKind: "matchSummary",
          sourceMatchId: matchId,
          sourceMatchIsJunior: false,
          cardInput: { kind: "matchSummary", matchId },
          appPath: `/matches/${matchId}`,
        })),
      )
      .returning({ id: socialDraftsTable.id });
    draftIds.push(...seniorDrafts.map((d) => d.id));

    // A JUNIOR match whose ageGroup is the IDENTICAL string as the senior grade,
    // in the same season/round — the worst-case collision for the dedupe key.
    // junior_matches.id is a plain (non-serial) int PK, so supply an explicit id
    // within int4 range, kept unique per run via the timestamp.
    juniorMatchId = 1_000_000_000 + (STAMP % 1_000_000_000);
    await db.insert(juniorMatchesTable).values({
      id: juniorMatchId,
      tenantId,
      seasonStartYear: SEASON,
      round: String(ROUND),
      ageGroup: TEST_GRADE,
      opponentName: "Junior Rovers",
    });

    // One APPROVED junior match-summary draft for it.
    const juniorDrafts = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: "matchSummary",
        status: "approved",
        sourceKind: "matchSummary",
        sourceMatchId: juniorMatchId,
        sourceMatchIsJunior: true,
        cardInput: { kind: "matchSummary", matchId: juniorMatchId, junior: true },
        appPath: `/juniors/matches/${juniorMatchId}`,
      })
      .returning({ id: socialDraftsTable.id });
    draftIds.push(...juniorDrafts.map((d) => d.id));

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: `c4_autoseed_admin_${STAMP}`,
        displayName: "C4 Autoseed Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db
      .delete(cardSetsTable)
      .where(and(eq(cardSetsTable.tenantId, tenantId), eq(cardSetsTable.grade, TEST_GRADE)));
    if (draftIds.length) {
      await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.id, draftIds));
    }
    // Put tenant #1's autoseed toggle back the way we found it.
    if (previousAutoseed === null) {
      await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
    } else {
      await db
        .update(socialSettingsTable)
        .set({ autoseedCarousels: previousAutoseed })
        .where(eq(socialSettingsTable.tenantId, tenantId));
    }
    if (matchIds.length) {
      await db.delete(matchesTable).where(inArray(matchesTable.id, matchIds));
    }
    if (juniorMatchId) {
      await db.delete(juniorMatchesTable).where(eq(juniorMatchesTable.id, juniorMatchId));
    }
    await db.delete(importsTable).where(eq(importsTable.id, importId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  const body = {
    season: SEASON,
    round: ROUND,
    grade: TEST_GRADE,
    platformSize: "square" as const,
  };

  it("seeds one carousel from the approved drafts, then regenerates the same row", async () => {
    // First autoseed → one new draft carousel holding both match summaries.
    const first = await request(app)
      .post("/api/card-sets/autoseed")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenantId))
      .send(body)
      .expect(200);

    expect(first.body.generated).toHaveLength(1);
    const set = first.body.generated[0];
    expect(set.sourceKind).toBe("matchSummary");
    expect(set.season).toBe(SEASON);
    expect(set.sourceRound).toBe(ROUND);
    expect(set.grade).toBe(TEST_GRADE);
    expect(set.isPublished).toBe(false);
    expect(set.slides).toHaveLength(2);
    const firstId: number = set.id;

    // Simulate the admin publishing the set.
    await db.update(cardSetsTable).set({ isPublished: true }).where(eq(cardSetsTable.id, firstId));

    // Re-run the SAME scope → must update the SAME row (grouping-key idempotency).
    const second = await request(app)
      .post("/api/card-sets/autoseed")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenantId))
      .send(body)
      .expect(200);

    expect(second.body.generated).toHaveLength(1);
    expect(second.body.generated[0].id).toBe(firstId); // same row, not a duplicate
    expect(second.body.generated[0].isPublished).toBe(true); // publish state preserved

    const rows = await db
      .select({ id: cardSetsTable.id })
      .from(cardSetsTable)
      .where(
        and(
          eq(cardSetsTable.tenantId, tenantId),
          eq(cardSetsTable.sourceKind, "matchSummary"),
          eq(cardSetsTable.grade, TEST_GRADE),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstId);
  });

  it("keeps junior and senior sets in DISTINCT dedupe keyspaces (S1) + cross-path shared key (N2)", async () => {
    const post = (path: string, payload: object) =>
      request(app)
        .post(path)
        .set("Cookie", adminCookie)
        .set("x-tenant-id", String(tenantId))
        .send(payload)
        .expect(200);

    // Senior set via the REAL /card-sets/generate matchSummary path — persists
    // sourceKind "matchSummary" for (SEASON, ROUND, TEST_GRADE). This shares the
    // exact dedupe key the senior autoseed used in the first test, so it finds +
    // UPDATES that same row (cross-path shared key — proves the extracted core).
    const genBody = {
      kind: "matchSummary" as const,
      season: SEASON,
      round: ROUND,
      grades: [TEST_GRADE],
      platformSize: "square" as const,
    };
    const gen1 = await post("/api/card-sets/generate", genBody);
    expect(gen1.body.sourceKind).toBe("matchSummary");
    const seniorId: number = gen1.body.id;

    // N2: repeat the SAME senior scope → shared grouping-key upsert updates the
    // same row (no duplicate), preserving publish state.
    const gen2 = await post("/api/card-sets/generate", genBody);
    expect(gen2.body.id).toBe(seniorId);
    expect(gen2.body.isPublished).toBe(true); // published in the first test

    // Junior autoseed with the IDENTICAL grade string + same season/round. Under
    // the old shared-"matchSummary" key this would COLLIDE and clobber the senior
    // row; the distinct "matchSummaryJunior" sourceKind gives it its own row.
    const jun = await post("/api/card-sets/autoseed", {
      season: SEASON,
      round: ROUND,
      grade: TEST_GRADE,
      junior: true,
      platformSize: "square",
    });
    expect(jun.body.generated).toHaveLength(1);
    const juniorSet = jun.body.generated[0];
    expect(juniorSet.sourceKind).toBe("matchSummaryJunior");
    const juniorId: number = juniorSet.id;

    // TWO DISTINCT rows for the same (season, round, grade string) — no clobber.
    expect(juniorId).not.toBe(seniorId);
    const rows = await db
      .select({ id: cardSetsTable.id, sourceKind: cardSetsTable.sourceKind })
      .from(cardSetsTable)
      .where(
        and(
          eq(cardSetsTable.tenantId, tenantId),
          eq(cardSetsTable.season, SEASON),
          eq(cardSetsTable.sourceRound, ROUND),
          eq(cardSetsTable.grade, TEST_GRADE),
        ),
      );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.sourceKind))).toEqual(
      new Set(["matchSummary", "matchSummaryJunior"]),
    );

    // The senior row still carries senior content (its 2 senior summaries), i.e.
    // the junior autoseed did NOT overwrite it.
    const [seniorRow] = await db
      .select({ slides: cardSetsTable.slides })
      .from(cardSetsTable)
      .where(eq(cardSetsTable.id, seniorId));
    expect(seniorRow.slides).toHaveLength(2);
  });

  it("is a no-op when the autoseed toggle is off", async () => {
    await db
      .update(socialSettingsTable)
      .set({ autoseedCarousels: false })
      .where(eq(socialSettingsTable.tenantId, tenantId));

    const res = await request(app)
      .post("/api/card-sets/autoseed")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenantId))
      .send(body)
      .expect(200);

    expect(res.body.generated).toHaveLength(0);
    expect(res.body.skipped).toBe("disabled");

    // Restore for any later assertions / reruns.
    await db
      .update(socialSettingsTable)
      .set({ autoseedCarousels: true })
      .where(eq(socialSettingsTable.tenantId, tenantId));
  });
});
