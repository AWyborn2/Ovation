/**
 * Match Day optional data (ADR-010 P5): ladder positions, the last meeting and
 * milestone watch for a fixture. The builder (`match-day.ts`) calls these only
 * for fields that are visible; each returns null when its data is missing, and
 * the builder turns a thrown read into a hidden field plus a warning. Central
 * reads go through `@workspace/db/central-queries` only.
 *
 * Junior fixtures never reach these (the builder skips them): juniors
 * isolation. Milestone watch is senior only, leaves fill-ins
 * (`player_id >= 90000`) and private players out, and counts the same senior
 * club careers the milestone board does, against the board's tiers.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import {
  db,
  milestoneBoardSettingsTable,
  playersTable,
  teamListsTable,
  type FixtureRow,
  type TeamListPlayer,
} from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import type * as CentralQueries from "@workspace/db/central-queries";
import type { MilestoneWithinReach } from "@workspace/scorecard/card-content";
import {
  centralMilestoneTiers,
  milestoneWithinReach,
  nativeMilestoneTiers,
  type WatchCareer,
} from "../milestone-crossings";
import { buildClubStats, clubCareers, loadClubOverlay } from "../club-overlay";
import { NATIVE_STATS_TENANT_ID, tenantReadsFromCentral } from "../tenant";

/** What the optional reads need to know about the club, loaded once per build. */
export interface OptionalDataTenant {
  tenantId: number;
  /** PlayHQ organisation (`tenants.playhq_org_id`): the ladder needs it. */
  orgId: string | null;
  /** Central club (`tenants.central_club_id`): the last meeting needs it. */
  centralClubId: number | null;
}

const central = (): Promise<typeof CentralQueries> => import("@workspace/db/central-queries");

/** Both teams' season ladder positions for a PlayHQ fixture; null hides the field. */
export async function loadFixtureLadder(
  t: OptionalDataTenant,
  fixture: Pick<FixtureRow, "playhqMatchId">,
  now: Date,
) {
  if (!t.orgId || !fixture.playhqMatchId) return null;
  const { fixtureLadderPositions } = await central();
  return fixtureLadderPositions({ orgId: t.orgId, playhqMatchId: fixture.playhqMatchId, now });
}

/**
 * The opposition's central club: the fixture's own link when it has one, else
 * the club on the other side of the PlayHQ match. Null when it can't be told.
 */
async function opponentCentralClubId(
  t: OptionalDataTenant,
  fixture: Pick<FixtureRow, "opponentClubId" | "playhqMatchId">,
): Promise<number | null> {
  if (fixture.opponentClubId != null) return fixture.opponentClubId;
  if (!t.orgId || !fixture.playhqMatchId) return null;
  const q = await central();
  const sides = await q.playhqFixtureSides(fixture.playhqMatchId, t.orgId);
  if (!sides?.opponentOrgId) return null;
  return q.centralClubIdForPlayhqOrg(sides.opponentOrgId);
}

/** The clubs' last finished senior meeting in this grade before the fixture; null hides. */
export async function loadLastMeeting(
  t: OptionalDataTenant,
  fixture: Pick<FixtureRow, "grade" | "competitionName" | "opponentClubId" | "playhqMatchId">,
  /** The fixture's club-time day (YYYY-MM-DD): meetings before it count. */
  before: string,
) {
  if (t.centralClubId == null) return null;
  const q = await central();
  const appGrade =
    q.appGradeFromCentral(fixture.grade) ?? q.appGradeFromCentral(fixture.competitionName ?? null);
  if (!appGrade) return null;
  const opponent = await opponentCentralClubId(t, fixture);
  if (opponent == null) return null;
  return q.centralLastMeeting({
    clubId: t.centralClubId,
    opponentClubId: opponent,
    appGrade,
    before,
  });
}

/** The published side for each fixture, fill-ins left out. */
export async function publishedSides(
  tenantId: number,
  fixtureIds: readonly number[],
): Promise<Map<number, TeamListPlayer[]>> {
  const out = new Map<number, TeamListPlayer[]>();
  if (!fixtureIds.length) return out;
  const rows = await db
    .select({ fixtureId: teamListsTable.fixtureId, players: teamListsTable.players })
    .from(teamListsTable)
    .where(
      and(
        eq(teamListsTable.tenantId, tenantId),
        inArray(teamListsTable.fixtureId, [...fixtureIds]),
        eq(teamListsTable.isPublished, true),
      ),
    );
  for (const r of rows) {
    out.set(
      r.fixtureId,
      (r.players ?? []).filter((p) => p.playerId == null || p.playerId < FILL_IN_THRESHOLD),
    );
  }
  return out;
}

/**
 * A loader for each fixture's milestone watch. Career totals and tiers are
 * read once (per build), the side per fixture. Players who can't be matched
 * to a career (a free-typed name, an unmapped id) and private players are
 * left out rather than guessed.
 */
export async function milestoneWatchLoader(
  t: OptionalDataTenant,
): Promise<(side: readonly TeamListPlayer[]) => MilestoneWithinReach | null> {
  const [settings] = await db
    .select()
    .from(milestoneBoardSettingsTable)
    .where(eq(milestoneBoardSettingsTable.tenantId, t.tenantId));

  // The fail-closed stats-source decision every stats read makes.
  if (await tenantReadsFromCentral(t.tenantId)) {
    if (t.centralClubId == null) return () => null;
    const clubId = t.centralClubId;
    const tiers = centralMilestoneTiers(settings);
    // The same careers the players directory and honour boards use.
    const overlay = await loadClubOverlay(t.tenantId);
    const stats = overlay.active ? await buildClubStats(overlay, t.tenantId, clubId) : null;
    const careers = stats
      ? clubCareers(stats)
      : await (await central()).centralPlayerCareers(clubId, undefined, overlay.identity.merges);
    const byKey = new Map(careers.map((c) => [c.participantId, c]));
    const keyOf = (p: TeamListPlayer): string | null => {
      if (p.playerId != null) {
        const guid = overlay.identity.guidForPlayerId(p.playerId);
        if (guid) return guid;
        if (stats && byKey.has(`player:${p.playerId}`)) return `player:${p.playerId}`;
      }
      return p.participantId ? overlay.identity.canonicalOf(p.participantId.toLowerCase()) : null;
    };
    return (side) => {
      const watch: WatchCareer[] = [];
      for (const p of side) {
        const key = keyOf(p);
        const c = key ? byKey.get(key) : undefined;
        if (!c || c.isPrivate) continue;
        watch.push({
          playerName: p.displayName,
          games: c.games,
          runs: c.runs,
          wickets: c.wickets,
        });
      }
      return milestoneWithinReach(watch, tiers);
    };
  }

  // Native stats belong to tenant #1 alone (the tables carry no tenant id).
  if (t.tenantId !== NATIVE_STATS_TENANT_ID) return () => null;
  const tiers = nativeMilestoneTiers(settings);
  const players = await db
    .select({
      id: playersTable.id,
      games: playersTable.totalGames,
      runs: playersTable.totalRuns,
      wickets: playersTable.totalWickets,
    })
    .from(playersTable)
    .where(lt(playersTable.id, FILL_IN_THRESHOLD));
  const byId = new Map(players.map((p) => [p.id, p]));
  return (side) =>
    milestoneWithinReach(
      side.flatMap((p) => {
        const c = p.playerId != null ? byId.get(p.playerId) : undefined;
        return c
          ? [
              {
                playerName: p.displayName,
                games: c.games ?? 0,
                runs: c.runs ?? 0,
                wickets: c.wickets ?? 0,
              },
            ]
          : [];
      }),
      tiers,
    );
}
