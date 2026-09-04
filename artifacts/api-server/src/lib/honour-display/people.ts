/**
 * People boards: life members (with aggregated career stats), captains, committee and the captains grid.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  lifeMembersTable,
  clubRolesTable,
  playerGradeStatsTable,
} from "@workspace/db";

import { seasonLabel } from "./premierships";
import { composeSeasonGrid, gradeRank } from "./shared";
import { type GridColumnOptionOut, type HonourBoardOut, type LifeMemberStatsOut } from "./types";

// Grade sort order for a life member's "grades played" chips (mirrors the
// /life-members endpoint so the kiosk lists grades in the same order).
const LIFE_MEMBER_GRADE_ORDER = [
  "A Grade", "B Grade", "C Grade", "D Grade", "E Grade", "F Grade",
  "Female A Grade", "Female B Grade", "PPL", "Colts",
];

const lmParseHighScore = (hs: string | null | undefined): number => {
  if (!hs) return 0;
  const n = parseInt(String(hs).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};
const lmParseBestBowling = (
  bb: string | null | undefined,
): { wkts: number; runs: number } => {
  if (!bb) return { wkts: 0, runs: 0 };
  const m = String(bb).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { wkts: 0, runs: 0 };
  return { wkts: parseInt(m[1], 10), runs: parseInt(m[2], 10) };
};

/**
 * Aggregate each linked player's career stats across grades (skipping the
 * "CLUB TOTAL" roll-up row), mirroring the /life-members endpoint so the kiosk
 * board shows the same numbers as the app's Life Members page.
 */
async function aggregateLifeMemberStats(
  playerIds: number[],
): Promise<Map<number, LifeMemberStatsOut>> {
  const byPlayer = new Map<number, LifeMemberStatsOut>();
  if (playerIds.length === 0) return byPlayer;
  const allStats = await db
    .select()
    .from(playerGradeStatsTable)
    .where(inArray(playerGradeStatsTable.playerId, playerIds));
  for (const s of allStats) {
    let agg = byPlayer.get(s.playerId);
    if (!agg) {
      agg = {
        games: 0, innings: 0, notOuts: 0, runs: 0, highScore: null,
        fifties: 0, hundreds: 0, wickets: 0, runsConceded: 0, bestBowling: null,
        fiveWickets: 0, catches: 0, stumpings: 0, runOuts: 0, gradesPlayed: [],
      };
      byPlayer.set(s.playerId, agg);
    }
    if (s.grade === "CLUB TOTAL") continue;
    agg.games += s.games ?? 0;
    agg.innings += s.innings ?? 0;
    agg.notOuts += s.notOuts ?? 0;
    agg.runs += s.runs ?? 0;
    agg.fifties += s.fifties ?? 0;
    agg.hundreds += s.hundreds ?? 0;
    agg.wickets += s.wickets ?? 0;
    agg.runsConceded += s.runsConceded ?? 0;
    agg.fiveWickets += s.fiveWickets ?? 0;
    agg.catches += s.catches ?? 0;
    agg.stumpings += s.stumpings ?? 0;
    agg.runOuts += s.runOuts ?? 0;
    const hs = lmParseHighScore(s.highScore);
    if (hs > lmParseHighScore(agg.highScore)) agg.highScore = s.highScore ?? null;
    const bb = lmParseBestBowling(s.bestBowling);
    const cur = lmParseBestBowling(agg.bestBowling);
    if (bb.wkts > cur.wkts || (bb.wkts === cur.wkts && bb.wkts > 0 && bb.runs < cur.runs)) {
      agg.bestBowling = s.bestBowling ?? null;
    }
    if (!agg.gradesPlayed.includes(s.grade)) agg.gradesPlayed.push(s.grade);
  }
  for (const agg of byPlayer.values()) {
    agg.gradesPlayed.sort((a, b) => {
      const ai = LIFE_MEMBER_GRADE_ORDER.indexOf(a);
      const bi = LIFE_MEMBER_GRADE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  return byPlayer;
}

export async function buildLifeMembers(tenantId: number): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(lifeMembersTable)
    .where(eq(lifeMembersTable.tenantId, tenantId))
    .orderBy(asc(lifeMembersTable.inductionYear), asc(lifeMembersTable.name));
  if (rows.length === 0) return null;
  const statsByPlayer = await aggregateLifeMemberStats(
    rows.map((r) => r.playerId).filter((id): id is number => id != null),
  );
  return {
    id: "life_members",
    category: "life_members",
    layout: "lifeMembers",
    title: "Life Members",
    subtitle: "Honoured for outstanding service",
    entries: rows.map((r) => ({
      season: String(r.inductionYear),
      primaryText: r.name,
      detail: r.roleLabel ?? null,
      playerId: r.playerId ?? null,
      lifeMember: {
        inducted: r.inductionYear,
        roles: r.roleLabel ?? null,
        bio: r.blurb || null,
        playing: r.isPlayingMember,
        stats: r.playerId != null ? statsByPlayer.get(r.playerId) ?? null : null,
      },
    })),
  };
}

/** Grade captains — ONE board per grade that has any published captain. */
export async function buildCaptains(tenantId: number): Promise<HonourBoardOut[]> {
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(
      and(
        eq(clubRolesTable.tenantId, tenantId),
        eq(clubRolesTable.role, "Grade Captain"),
        eq(clubRolesTable.published, true),
      ),
    )
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder));
  if (rows.length === 0) return [];

  const byGrade = new Map<string, typeof rows>();
  for (const r of rows) {
    const grade = r.grade ?? "";
    if (!grade) continue;
    if (!byGrade.has(grade)) byGrade.set(grade, []);
    byGrade.get(grade)!.push(r);
  }

  return [...byGrade.entries()]
    .sort((a, b) => gradeRank(a[0]) - gradeRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([grade, recs]) => ({
      id: `captains:${grade}`,
      category: "captains",
      layout: "list" as const,
      title: `${grade} Captains`,
      subtitle: "Season-by-season leaders",
      entries: recs.map((r) => ({
        season: seasonLabel(r.season),
        primaryText: r.name,
        detail: null,
        playerId: r.playerId ?? null,
      })),
    }));
}

/**
 * Committee / office bearers — published club roles with NO grade (grade null).
 * Renders as a list by default; switches to a season × office grid when the
 * admin has chosen grid columns (each column is an office/role).
 */
export async function buildCommittee(
  tenantId: number,
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(and(eq(clubRolesTable.tenantId, tenantId), eq(clubRolesTable.published, true)))
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder), asc(clubRolesTable.id));
  const officeBearers = rows.filter((r) => r.grade == null);
  if (officeBearers.length === 0) return null;

  if (gridColumns && gridColumns.length > 0) {
    const columns: GridColumnOptionOut[] = gridColumns.map((k) => ({
      key: k,
      label: k,
    }));
    const grid = composeSeasonGrid(
      "Season",
      columns,
      officeBearers.map((r) => ({
        seasonLabel: seasonLabel(r.season),
        startYear: r.season,
        colKey: r.role,
        text: r.name,
        playerId: r.playerId ?? null,
      })),
    );
    return {
      id: "committee",
      category: "committee",
      layout: "grid",
      title: "Committee & Office Bearers",
      subtitle: "Those who served off the field",
      entries: [],
      grid,
    };
  }

  return {
    id: "committee",
    category: "committee",
    layout: "list",
    title: "Committee & Office Bearers",
    subtitle: "Those who served off the field",
    entries: officeBearers.map((r) => ({
      season: seasonLabel(r.season),
      primaryText: r.name,
      detail: r.role,
      playerId: r.playerId ?? null,
    })),
  };
}

/**
 * Opt-in grade-captains grid — season × grade matrix. Emitted ONLY when the
 * admin configures columns; the per-grade list boards (buildCaptains) remain.
 */
export async function buildCaptainsGrid(
  tenantId: number,
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  if (!gridColumns || gridColumns.length === 0) return null;
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(
      and(
        eq(clubRolesTable.tenantId, tenantId),
        eq(clubRolesTable.role, "Grade Captain"),
        eq(clubRolesTable.published, true),
      ),
    )
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder));
  if (rows.length === 0) return null;

  const columns: GridColumnOptionOut[] = gridColumns.map((k) => ({
    key: k,
    label: k,
  }));
  const grid = composeSeasonGrid(
    "Season",
    columns,
    rows
      .filter((r) => r.grade != null)
      .map((r) => ({
        seasonLabel: seasonLabel(r.season),
        startYear: r.season,
        colKey: r.grade!,
        text: r.name,
        playerId: r.playerId ?? null,
      })),
  );
  return {
    id: "captains_grid",
    category: "captains",
    layout: "grid",
    title: "Grade Captains",
    subtitle: "Season-by-season leaders by grade",
    entries: [],
    grid,
  };
}
