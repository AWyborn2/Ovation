import { describe, it, expect, beforeAll } from "vitest";
import { eq, isNotNull, and } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import type * as CentralQueries from "@workspace/db/central-queries";
import {
  applyClubOverlay,
  clubCareers,
  clubGradeLeaderboard,
  EMPTY_OVERLAY_DATA,
  loadClubOverlay,
  type ClubOverlay,
} from "../lib/club-overlay";

/**
 * Real-data consistency for the club overlay (hybrid stats plan U10,
 * Verification Contract): for every existing central tenant, careers are
 * unchanged until a boundary, history or correction is added.
 *
 * Two checks per tenant:
 *
 *   1. Gate: a tenant with no club layer is INACTIVE, so every handler keeps
 *      its original central read — today's numbers, byte for byte.
 *   2. Equivalence: the overlay pipeline itself (the (participant, grade,
 *      season) partial read + apply with an EMPTY club layer) reproduces the
 *      original careers — games, runs, wickets and grades per player — and the
 *      original milestone walk. This is what a tenant's numbers are built from
 *      the moment it gets a club layer, so it must start from the same place.
 *
 * Data-dependent (real tenants + the real central DB): excluded in CI via
 * CI_SKIP_DATA_TESTS, run locally or on the Repl like the other
 * *-consistency suites. Read-only: it never writes either database.
 */

const hasDbs = !!process.env.DATABASE_URL && !!process.env.CENTRAL_DATABASE_URL;

describe.skipIf(!hasDbs)("club overlay consistency: existing central tenants unchanged", () => {
  let central: typeof CentralQueries;
  let tenants: { id: number; slug: string; clubId: number }[] = [];

  beforeAll(async () => {
    central = await import("@workspace/db/central-queries");
    const rows = await db
      .select({
        id: tenantsTable.id,
        slug: tenantsTable.slug,
        clubId: tenantsTable.centralClubId,
      })
      .from(tenantsTable)
      .where(and(eq(tenantsTable.readsFromCentral, true), isNotNull(tenantsTable.centralClubId)));
    tenants = rows.map((r) => ({ ...r, clubId: r.clubId! }));
  }, 120_000);

  it("finds central tenants to check", () => {
    expect(tenants.length).toBeGreaterThan(0);
  });

  it("the overlay pipeline with an empty club layer reproduces today's careers", async () => {
    const problems: string[] = [];
    for (const t of tenants) {
      const overlay: ClubOverlay = await loadClubOverlay(t.id);
      if (overlay.active) continue; // has a club layer: its numbers are meant to differ
      const { merges } = overlay.identity;
      const [today, partials] = await Promise.all([
        central.centralPlayerCareers(t.clubId, undefined, merges),
        central.centralPlayerPartials(t.clubId, merges),
      ]);
      const stats = applyClubOverlay({
        partials,
        lines: [],
        identity: overlay.identity,
        data: EMPTY_OVERLAY_DATA,
        isSeniorGrade: central.isSeniorAppGrade,
      });
      const mine = new Map(clubCareers(stats).map((c) => [c.participantId, c]));
      for (const c of today) {
        // Fill-ins (crosswalk id >= 90000) are excluded by the overlay by design.
        if ((overlay.identity.intByGuid.get(c.participantId) ?? 0) >= 90000) continue;
        const m = mine.get(c.participantId);
        const want = [c.games, c.runs, c.wickets, c.grades.join(","), c.isPrivate];
        const got = m ? [m.games, m.runs, m.wickets, m.grades.join(","), m.isPrivate] : null;
        if (JSON.stringify(want) !== JSON.stringify(got)) {
          problems.push(
            `${t.slug} ${c.participantId}: today ${JSON.stringify(want)} overlay ${JSON.stringify(got)}`,
          );
        }
      }
      if (mine.size !== today.length) {
        problems.push(`${t.slug}: ${today.length} careers today, ${mine.size} via the overlay`);
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  }, 600_000);

  it("the overlay leaderboard matches today's runs and innings for every senior grade", async () => {
    const problems: string[] = [];
    for (const t of tenants) {
      const overlay = await loadClubOverlay(t.id);
      if (overlay.active) continue;
      const { merges, intByGuid, nameByGuid } = overlay.identity;
      const partials = await central.centralPlayerPartials(t.clubId, merges);
      const stats = applyClubOverlay({
        partials,
        lines: [],
        identity: overlay.identity,
        data: EMPTY_OVERLAY_DATA,
        isSeniorGrade: central.isSeniorAppGrade,
      });
      const grades = [...new Set(partials.buckets.map((b) => b.grade))];
      for (const grade of grades) {
        const today = await central.centralGradeLeaderboard(grade, {
          clubId: t.clubId,
          intByGuid,
          nameByGuid,
          merges,
        });
        const mine = new Map(
          clubGradeLeaderboard(stats, grade, { nameByGuid }).map((r) => [
            `${r.playerId}|${r.givenName}|${r.surname}`,
            r,
          ]),
        );
        for (const r of today) {
          if (r.playerId >= 90000) continue;
          const m = mine.get(`${r.playerId}|${r.givenName}|${r.surname}`);
          const want = [r.innings, r.notOuts, r.runs, r.highScore, r.fifties, r.hundreds];
          const got = m ? [m.innings, m.notOuts, m.runs, m.highScore, m.fifties, m.hundreds] : null;
          if (JSON.stringify(want) !== JSON.stringify(got)) {
            problems.push(
              `${t.slug} ${grade} ${r.playerId}: ${JSON.stringify(want)} vs ${JSON.stringify(got)}`,
            );
          }
        }
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  }, 600_000);

  it("the milestone walk without an overlay equals today's milestones", async () => {
    const tiers = { games: [100, 150, 200], runs: [1000, 2000], wickets: [100, 150] };
    const problems: string[] = [];
    for (const t of tenants) {
      const overlay = await loadClubOverlay(t.id);
      if (overlay.active) continue;
      const { merges } = overlay.identity;
      const [today, inputs] = await Promise.all([
        central.centralMilestones(t.clubId, tiers, merges),
        central.centralMilestoneInputs(t.clubId, merges),
      ]);
      const walked = central.walkCentralMilestones(inputs, tiers);
      if (JSON.stringify(walked) !== JSON.stringify(today)) {
        problems.push(`${t.slug}: ${today.length} milestones today, ${walked.length} walked`);
      }
    }
    expect(problems).toEqual([]);
  }, 600_000);
});
