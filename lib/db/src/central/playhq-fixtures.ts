import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  playhqGradesTable,
  playhqLaddersTable,
  playhqMatchesTable,
  playhqOrganisationsTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { inList } from "./where";

/**
 * Fixtures, results and ladders from the PlayHQ landing schema (`playhq.*`),
 * filtered to ONE PlayHQ organisation — the tenant's club
 * (`tenants.playhq_org_id`). Public-site data, so there is no privacy rule to
 * apply here; the club filter is still mandatory so a tenant only ever sees
 * its own fixtures. Junior grades are excluded (juniors isolation).
 */

/** `home_org_id = :org OR away_org_id = :org` over `playhq.matches`. */
export function playhqClubInvolvedWhere(orgId: string): SQL {
  return or(
    eq(playhqMatchesTable.homeOrgId, orgId),
    eq(playhqMatchesTable.awayOrgId, orgId),
  ) as SQL;
}

export interface PlayhqOpponent {
  orgId: string | null;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
}

export interface PlayhqFixture {
  playhqMatchId: string;
  gradeId: string;
  /** App grade label ("A Grade"), or the raw PlayHQ name when unmapped. */
  grade: string;
  gradeName: string;
  season: string | null;
  round: string | null;
  matchType: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  venue: string | null;
  surface: string | null;
  isHome: boolean;
  opponent: PlayhqOpponent | null;
  clubScore: string | null;
  opponentScore: string | null;
  resultText: string | null;
  outcome: "won" | "lost" | "draw" | null;
  /** Central match id for the scorecard link (central tenants only). */
  scorecardMatchId: number | null;
}

export interface PlayhqFixturesResult {
  seasons: string[];
  latestSeason: string | null;
  grades: string[];
  matches: PlayhqFixture[];
}

export interface PlayhqFixturesOpts {
  /** Season name as PlayHQ publishes it; absent → newest season with data. */
  season?: string | null;
  /** App grade label; absent → every grade. */
  grade?: string | null;
  /** Resolve `scorecardMatchId` via `central.matches.playhq_match_id` (central tenants). */
  withScorecardIds?: boolean;
}

const bySeasonNewestFirst = (a: string, b: string): number =>
  (parseSeasonStartYear(b) ?? 0) - (parseSeasonStartYear(a) ?? 0) || b.localeCompare(a);

/** Seasons the club has senior PlayHQ matches in, newest first. */
export async function playhqClubSeasons(orgId: string): Promise<string[]> {
  return withCentralCache(cacheKey("playhqClubSeasons", [orgId]), async () => {
    const rows = await centralDb
      .selectDistinct({ season: playhqGradesTable.seasonName })
      .from(playhqMatchesTable)
      .innerJoin(playhqGradesTable, eq(playhqGradesTable.id, playhqMatchesTable.gradeId))
      .where(and(playhqClubInvolvedWhere(orgId), eq(playhqGradesTable.isJunior, false)));
    return rows
      .map((r) => r.season)
      .filter((s): s is string => !!s)
      .sort(bySeasonNewestFirst);
  });
}

export async function playhqClubFixtures(
  orgId: string,
  opts: PlayhqFixturesOpts = {},
): Promise<PlayhqFixturesResult> {
  return withCentralCache(
    cacheKey("playhqClubFixtures", [
      orgId,
      opts.season ?? null,
      opts.grade ?? null,
      opts.withScorecardIds ?? false,
    ]),
    () => playhqClubFixturesImpl(orgId, opts),
  );
}

async function playhqClubFixturesImpl(
  orgId: string,
  opts: PlayhqFixturesOpts,
): Promise<PlayhqFixturesResult> {
  const seasons = await playhqClubSeasons(orgId);
  const latestSeason = seasons[0] ?? null;
  const season = opts.season ?? latestSeason;
  if (!season) return { seasons, latestSeason, grades: [], matches: [] };

  const m = playhqMatchesTable;
  const g = playhqGradesTable;
  const rows = await centralDb
    .select({
      id: m.id,
      gradeId: m.gradeId,
      gradeName: g.name,
      seasonName: g.seasonName,
      status: m.status,
      matchType: m.matchType,
      roundName: m.roundName,
      startAt: m.startAt,
      endAt: m.endAt,
      venueName: m.venueName,
      surfaceName: m.surfaceName,
      resultText: m.resultText,
      homeTeamId: m.homeTeamId,
      homeTeamName: m.homeTeamName,
      homeOrgId: m.homeOrgId,
      homeScore: m.homeScore,
      awayTeamId: m.awayTeamId,
      awayTeamName: m.awayTeamName,
      awayOrgId: m.awayOrgId,
      awayScore: m.awayScore,
      winnerTeamId: m.winnerTeamId,
    })
    .from(m)
    .innerJoin(g, eq(g.id, m.gradeId))
    .where(and(playhqClubInvolvedWhere(orgId), eq(g.isJunior, false), eq(g.seasonName, season)))
    .orderBy(sql`${m.startAt} asc nulls last`, asc(m.id));

  const gradeOf = (name: string | null): string =>
    (name ? appGradeFromCentral(name) : null) ?? name ?? "Unknown";
  const grades = [...new Set(rows.map((r) => gradeOf(r.gradeName)))].sort();
  const wanted = opts.grade ? rows.filter((r) => gradeOf(r.gradeName) === opts.grade) : rows;

  // Opponent branding and scorecard ids in two small batched lookups.
  const opponentOrgIds = [
    ...new Set(
      wanted
        .map((r) => (r.homeOrgId === orgId ? r.awayOrgId : r.homeOrgId))
        .filter((id): id is string => !!id && id !== orgId),
    ),
  ];
  const orgs = new Map<
    string,
    { name: string | null; shortName: string | null; logoUrl: string | null }
  >();
  if (opponentOrgIds.length) {
    const o = playhqOrganisationsTable;
    const orgRows = await centralDb
      .select({ id: o.id, name: o.name, shortName: o.shortName, logoUrl: o.logoUrl })
      .from(o)
      .where(inList(o.id, opponentOrgIds));
    for (const r of orgRows)
      orgs.set(r.id, { name: r.name, shortName: r.shortName, logoUrl: r.logoUrl });
  }
  const scorecardIds = new Map<string, number>();
  if (opts.withScorecardIds && wanted.length) {
    const c = centralMatchesTable;
    const scRows = await centralDb
      .select({ matchId: c.matchId, playhqMatchId: c.playhqMatchId })
      .from(c)
      .where(
        inList(
          c.playhqMatchId,
          wanted.map((r) => r.id),
        ),
      );
    for (const r of scRows) if (r.playhqMatchId) scorecardIds.set(r.playhqMatchId, r.matchId);
  }

  const matches: PlayhqFixture[] = wanted.map((r) => {
    const isHome = r.homeOrgId === orgId || r.awayOrgId !== orgId;
    const clubTeamId = isHome ? r.homeTeamId : r.awayTeamId;
    const oppOrgId = isHome ? r.awayOrgId : r.homeOrgId;
    const oppTeamName = isHome ? r.awayTeamName : r.homeTeamName;
    const org = oppOrgId ? orgs.get(oppOrgId) : undefined;
    const status = r.status ?? "UNKNOWN";
    let outcome: PlayhqFixture["outcome"] = null;
    if (status === "COMPLETED") {
      if (r.winnerTeamId && clubTeamId) outcome = r.winnerTeamId === clubTeamId ? "won" : "lost";
      else if (!r.winnerTeamId) outcome = "draw";
    }
    return {
      playhqMatchId: r.id,
      gradeId: r.gradeId ?? "",
      grade: gradeOf(r.gradeName),
      gradeName: r.gradeName ?? "",
      season: r.seasonName,
      round: r.roundName,
      matchType: r.matchType,
      status,
      startAt: r.startAt ? r.startAt.toISOString() : null,
      endAt: r.endAt ? r.endAt.toISOString() : null,
      venue: r.venueName,
      surface: r.surfaceName,
      isHome,
      opponent:
        oppOrgId || oppTeamName
          ? {
              orgId: oppOrgId,
              name: org?.name ?? oppTeamName ?? "TBC",
              shortName: org?.shortName ?? null,
              logoUrl: org?.logoUrl ?? null,
            }
          : null,
      clubScore: isHome ? r.homeScore : r.awayScore,
      opponentScore: isHome ? r.awayScore : r.homeScore,
      resultText: r.resultText,
      outcome,
      scorecardMatchId: scorecardIds.get(r.id) ?? null,
    };
  });

  return { seasons, latestSeason, grades, matches };
}

export interface PlayhqLadderTeam {
  teamId: string;
  teamName: string;
  orgId: string | null;
  isClub: boolean;
  rank: number | null;
  played: number | null;
  won: number | null;
  lost: number | null;
  ties: number | null;
  noResults: number | null;
  byes: number | null;
  forfeits: number | null;
  points: number | null;
  bonusPoints: number | null;
  quotient: number | null;
  netRunRate: number | null;
  runsFor: number | null;
  wicketsLost: number | null;
  oversFaced: number | null;
  runsAgainst: number | null;
  wicketsTaken: number | null;
  oversBowled: number | null;
}

export interface PlayhqLadder {
  gradeId: string;
  gradeName: string;
  season: string | null;
  ladders: { name: string; teams: PlayhqLadderTeam[] }[];
}

const num = (v: string | number | null): number | null =>
  v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** The published ladder(s) for one grade, with the club's own team flagged. */
export async function playhqGradeLadder(
  gradeId: string,
  orgId: string,
): Promise<PlayhqLadder | null> {
  return withCentralCache(cacheKey("playhqGradeLadder", [gradeId, orgId]), async () => {
    const [grade] = await centralDb
      .select({
        id: playhqGradesTable.id,
        name: playhqGradesTable.name,
        season: playhqGradesTable.seasonName,
        isJunior: playhqGradesTable.isJunior,
      })
      .from(playhqGradesTable)
      .where(eq(playhqGradesTable.id, gradeId));
    if (!grade || grade.isJunior) return null;

    const l = playhqLaddersTable;
    const rows = await centralDb
      .select()
      .from(l)
      .where(eq(l.gradeId, gradeId))
      .orderBy(asc(l.ladderName), sql`${l.rank} asc nulls last`, asc(l.teamName));

    const tables = new Map<string, PlayhqLadderTeam[]>();
    for (const r of rows) {
      const teams = tables.get(r.ladderName) ?? [];
      teams.push({
        teamId: r.teamId,
        teamName: r.teamName ?? "",
        orgId: r.orgId,
        isClub: r.orgId === orgId,
        rank: r.rank,
        played: r.played,
        won: r.won,
        lost: r.lost,
        ties: r.ties,
        noResults: r.noResults,
        byes: r.byes,
        forfeits: r.forfeits,
        points: num(r.competitionPoints),
        bonusPoints: num(r.bonusPoints),
        quotient: num(r.quotient),
        netRunRate: num(r.netRunRate),
        runsFor: r.runsFor,
        wicketsLost: r.wicketsLost,
        oversFaced: num(r.oversFaced),
        runsAgainst: r.runsAgainst,
        wicketsTaken: r.wicketsTaken,
        oversBowled: num(r.oversBowled),
      });
      tables.set(r.ladderName, teams);
    }
    return {
      gradeId: grade.id,
      gradeName: grade.name ?? "",
      season: grade.season,
      ladders: [...tables.entries()].map(([name, teams]) => ({ name, teams })),
    };
  });
}
