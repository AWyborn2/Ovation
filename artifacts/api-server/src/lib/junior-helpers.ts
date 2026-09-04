import { eq, and, asc, desc, isNotNull, sql } from "drizzle-orm";
import {
  db,
  juniorParticipantsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorOfficeBearersTable,
  clubsTable,
  type JuniorMatchDisplaySettingsRow,
} from "@workspace/db";

const MASK_NAME = "Private Player";

export { MASK_NAME };

export async function getPrivateIds(tenantId: number): Promise<Set<string>> {
  const rows = await db
    .select({ id: juniorParticipantsTable.participantId })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.tenantId, tenantId),
        eq(juniorParticipantsTable.isPrivate, true),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

type MatchRow = typeof juniorMatchesTable.$inferSelect;

export function splitScores(m: MatchRow): {
  hhScore: string | null;
  opponentScore: string | null;
} {
  if (m.opponentName && m.team1 && m.team1 === m.opponentName) {
    return { hhScore: m.team2Score ?? null, opponentScore: m.team1Score ?? null };
  }
  return { hhScore: m.team1Score ?? null, opponentScore: m.team2Score ?? null };
}

// Columns selected from the shared clubs register to brand a junior match's
// opposition. clubs is a neutral reference table (not a senior stat table), so
// reading it here does not blend junior and senior data.
export const opponentClubColumns = {
  opponentClubId: clubsTable.id,
  opponentClubName: clubsTable.name,
  opponentClubShortName: clubsTable.shortName,
  opponentClubLogoUrl: clubsTable.logoUrl,
  opponentClubLogoUrl128: clubsTable.logoUrl128,
  opponentClubBackgroundColour: clubsTable.backgroundColour,
  opponentClubPrimaryColour: clubsTable.primaryColour,
};

type OpponentClubRow = {
  opponentClubId: number | null;
  opponentClubName: string | null;
  opponentClubShortName: string | null;
  opponentClubLogoUrl: string | null;
  opponentClubLogoUrl128: string | null;
  opponentClubBackgroundColour: string | null;
  opponentClubPrimaryColour: string | null;
};

// Collapse the joined club columns into a nullable branding object. Null when
// the junior match has no matched opposition club so renderers fall back.
export function toOpponentClub(row: OpponentClubRow) {
  if (row.opponentClubId == null || row.opponentClubName == null) return null;
  return {
    id: row.opponentClubId,
    name: row.opponentClubName,
    shortName: row.opponentClubShortName,
    logoUrl: row.opponentClubLogoUrl,
    logoUrl128: row.opponentClubLogoUrl128,
    backgroundColour: row.opponentClubBackgroundColour,
    primaryColour: row.opponentClubPrimaryColour,
  };
}

/**
 * Leading-year of a "2024/25" style season, for newest-first ordering. Parsed
 * once at load time into season_start_year (see juniors-etl.sql); fall back to
 * parsing the season text inline for any row that predates that column.
 */
export const seasonYear = sql<number>`coalesce(${juniorMatchesTable.seasonStartYear}, nullif(substring(${juniorMatchesTable.season} from 1 for 4), '')::int)`;

export function toMatchSummary(m: MatchRow, club: ReturnType<typeof toOpponentClub> = null) {
  const { hhScore, opponentScore } = splitScores(m);
  return {
    id: m.id,
    season: m.season,
    grade: m.grade,
    ageGroup: m.ageGroup,
    teamName: m.teamName,
    competition: m.competition,
    association: m.association,
    round: m.round,
    matchDate: m.matchDate,
    venue: m.venue,
    status: m.status,
    opponentName: m.opponentName,
    hhResult: m.hhResult,
    hhScore,
    opponentScore,
    hhBattedFirst: m.hhBattedFirst,
    isHallsHead: true,
    opponentClub: club,
  };
}

/** A dismissal counts as "not out" when there is no out-dismissal recorded. */
export function isNotOut(dismissal: string | null): boolean {
  if (!dismissal) return true;
  const d = dismissal.trim().toLowerCase();
  if (d === "") return true;
  return d.includes("not out") || d.startsWith("retired");
}

// Age groups that actually have leaderboard records in the resolved season
// (or every age group ever, for the all-time list) — derived from the SAME
// source as the leaders (HH lines + non-private participants) so a chip never
// appears for an age group whose matches have no recorded stats. Unions the
// batting and bowling sides since a player may only appear in one.
export async function ageGroupsForSeason(season: string | null): Promise<string[]> {
  const battingConds = [
    isNotNull(juniorMatchesTable.ageGroup),
    eq(juniorMatchBattingTable.isHallsHead, true),
    eq(juniorParticipantsTable.isPrivate, false),
  ];
  const bowlingConds = [
    isNotNull(juniorMatchesTable.ageGroup),
    eq(juniorMatchBowlingTable.isHallsHead, true),
    eq(juniorParticipantsTable.isPrivate, false),
  ];
  if (season !== null) {
    battingConds.push(eq(juniorMatchesTable.season, season));
    bowlingConds.push(eq(juniorMatchesTable.season, season));
  }
  const [batting, bowling] = await Promise.all([
    db
      .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
      .from(juniorMatchBattingTable)
      .innerJoin(
        juniorParticipantsTable,
        eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId),
      )
      .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId))
      .where(and(...battingConds)),
    db
      .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
      .from(juniorMatchBowlingTable)
      .innerJoin(
        juniorParticipantsTable,
        eq(juniorParticipantsTable.participantId, juniorMatchBowlingTable.participantId),
      )
      .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId))
      .where(and(...bowlingConds)),
  ]);
  const set = new Set<string>();
  for (const r of [...batting, ...bowling]) {
    if (r.ageGroup) set.add(r.ageGroup);
  }
  return [...set].sort();
}

export const JUNIOR_MILESTONE_TIERS = {
  runs: [250, 500, 1000, 1500, 2000, 2500, 3000],
  wickets: [25, 50, 75, 100, 150, 200],
  games: [25, 50, 75, 100, 150],
} as const;

export const JUNIOR_STAT_SINGULAR = { runs: "Run", wickets: "Wicket", games: "Game" } as const;

export function serializeJuniorMatchDisplaySettings(s: JuniorMatchDisplaySettingsRow) {
  return {
    defaultAgeGroup: s.defaultAgeGroup ?? "",
    defaultSeasonMode: s.defaultSeasonMode ?? "latest",
    defaultSeason: s.defaultSeason ?? null,
    ageGroupOrder: s.ageGroupOrder ?? [],
  };
}

export const officeBearersOrdered = () =>
  db
    .select()
    .from(juniorOfficeBearersTable)
    .orderBy(
      desc(juniorOfficeBearersTable.season),
      asc(juniorOfficeBearersTable.displayOrder),
      asc(juniorOfficeBearersTable.id),
    );
