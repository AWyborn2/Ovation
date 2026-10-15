import { eq, and, asc, desc, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  juniorParticipantsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorOfficeBearersTable,
  clubsTable,
  juniorMatchDisplaySettingsTable,
  type JuniorMatchDisplaySettingsRow,
  type JuniorNameStyle,
  type JuniorTeamPublishing,
} from "@workspace/db";
import { juniorParticipantJoin } from "./junior-participant-scope";
import {
  makeJuniorNaming,
  parseJuniorNameStyle,
  parseJuniorTeamPublishing,
  type JuniorNameFacts,
  type JuniorNaming,
} from "./junior-names";

// The pure naming rules (KTD12) live in junior-names.ts so they unit-test without a
// database; re-exported here as the one place junior routes import them from.
export {
  formatJuniorName,
  juniorInitials,
  juniorPublicName,
  isJuniorWithheld,
  makeJuniorNaming,
  JUNIOR_WITHHELD_NAME,
  type JuniorNaming,
} from "./junior-names";

/**
 * SQL condition: a participant whose name may appear publicly — not private, or
 * private with an admin's privacy override (KTD12). Directories, leaderboards and
 * profiles filter on this; a withheld participant is left out entirely.
 */
export const juniorParticipantIsPublic: SQL = or(
  eq(juniorParticipantsTable.isPrivate, false),
  eq(juniorParticipantsTable.privacyOverride, true),
) as SQL;

/** Participant ids whose names are withheld publicly (private and not overridden). */
export async function getPrivateIds(tenantId: number): Promise<Set<string>> {
  const rows = await db
    .select({ id: juniorParticipantsTable.participantId })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.tenantId, tenantId),
        eq(juniorParticipantsTable.isPrivate, true),
        eq(juniorParticipantsTable.privacyOverride, false),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/**
 * The club's junior display settings row, read only. These helpers run on public reads
 * and in the sweep, so they never create the row (that is the settings routes' job via
 * `getOrCreateSettings`): a club with no row gets the schema defaults through the
 * parsers below, and a read never leaves a row behind that pins the tenant.
 */
async function readJuniorDisplaySettings(
  tenantId: number,
): Promise<Pick<JuniorMatchDisplaySettingsRow, "nameStyle" | "teamPublishing"> | undefined> {
  const [row] = await db
    .select({
      nameStyle: juniorMatchDisplaySettingsTable.nameStyle,
      teamPublishing: juniorMatchDisplaySettingsTable.teamPublishing,
    })
    .from(juniorMatchDisplaySettingsTable)
    .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId));
  return row;
}

/** The club's public junior name style (`full` until an admin picks another). */
export async function getJuniorNameStyle(tenantId: number): Promise<JuniorNameStyle> {
  const settings = await readJuniorDisplaySettings(tenantId);
  return parseJuniorNameStyle(settings?.nameStyle);
}

/** The club's per-team junior social publishing map (KTD14); a missing team is `approval`. */
export async function loadJuniorTeamPublishing(tenantId: number): Promise<JuniorTeamPublishing> {
  const settings = await readJuniorDisplaySettings(tenantId);
  return parseJuniorTeamPublishing(settings?.teamPublishing);
}

/**
 * Load the club's naming style and its participants' privacy facts, bound into the
 * one public line namer (KTD12). Pass the participant ids on the surface being
 * rendered to load just those rows; omit them to load the whole club (batch use).
 */
export async function loadJuniorNaming(
  tenantId: number,
  participantIds?: Iterable<string | null | undefined>,
): Promise<JuniorNaming> {
  const ids =
    participantIds === undefined
      ? undefined
      : [
          ...new Set(
            [...participantIds].filter((id): id is string => !!id).map((id) => id.toLowerCase()),
          ),
        ];
  const [style, rows] = await Promise.all([
    getJuniorNameStyle(tenantId),
    ids !== undefined && ids.length === 0
      ? Promise.resolve([])
      : db
          .select({
            participantId: juniorParticipantsTable.participantId,
            displayName: juniorParticipantsTable.displayName,
            isPrivate: juniorParticipantsTable.isPrivate,
            privacyOverride: juniorParticipantsTable.privacyOverride,
          })
          .from(juniorParticipantsTable)
          .where(
            and(
              eq(juniorParticipantsTable.tenantId, tenantId),
              // Case-insensitive: a legacy row may keep a mixed-case GUID (makeJuniorNaming
              // matches the same way, so a private child is never missed).
              ids === undefined
                ? undefined
                : inArray(sql`lower(${juniorParticipantsTable.participantId})`, ids),
            ),
          ),
  ]);
  const facts = new Map<string, JuniorNameFacts>(
    rows.map((r) => [
      r.participantId,
      { displayName: r.displayName, isPrivate: r.isPrivate, privacyOverride: r.privacyOverride },
    ]),
  );
  return makeJuniorNaming(style, facts);
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
export async function ageGroupsForSeason(
  tenantId: number,
  season: string | null,
): Promise<string[]> {
  const battingConds = [
    eq(juniorMatchesTable.tenantId, tenantId),
    isNotNull(juniorMatchesTable.ageGroup),
    eq(juniorMatchBattingTable.isHallsHead, true),
    juniorParticipantIsPublic,
  ];
  const bowlingConds = [
    eq(juniorMatchesTable.tenantId, tenantId),
    isNotNull(juniorMatchesTable.ageGroup),
    eq(juniorMatchBowlingTable.isHallsHead, true),
    juniorParticipantIsPublic,
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
        juniorParticipantJoin(juniorMatchBattingTable.participantId, tenantId),
      )
      .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId))
      .where(and(...battingConds)),
    db
      .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
      .from(juniorMatchBowlingTable)
      .innerJoin(
        juniorParticipantsTable,
        juniorParticipantJoin(juniorMatchBowlingTable.participantId, tenantId),
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
    nameStyle: parseJuniorNameStyle(s.nameStyle),
    teamPublishing: parseJuniorTeamPublishing(s.teamPublishing),
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
