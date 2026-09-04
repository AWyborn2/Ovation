import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  centralDb,
  centralClubsTable,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPlayersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import {
  appGradeFromCentral,
  parseRound,
  parseSeasonStartYear,
  parseStage,
} from "./grades";
import { isPrivateRow } from "./privacy";
import { classifyInnings } from "./scoring";
import { clubInvolvedWhere, inList } from "./where";

/** Halls Head's club id in the central PCA database (tenant #1 / demo). */
export const HALLS_HEAD_CENTRAL_CLUB_ID = 1;

// ---------------------------------------------------------------------------
// Shared club-match-rows fetch. Almost every read here starts from "all central
// matches involving this club" — previously each function issued that query
// itself, so a composite read like centralDashboard paid for it four times.
// Fetch it once and thread the rows through the aggregate functions via their
// optional `preloadedMatchRows` parameter (absent → they fetch their own, so
// route handlers calling them individually are unchanged). The fetch itself is
// also cached, one key per club, so separate reads for the same club within
// the TTL share a single round trip.
// ---------------------------------------------------------------------------

/** One central match involving the club: id + the grade/season labels. */
export interface CentralClubMatchRow {
  matchId: number;
  grade: string | null;
  season: string | null;
}

/** All central matches where the club played (home or away), fetched once. */
export async function getClubMatchRows(clubId: number): Promise<CentralClubMatchRow[]> {
  return withCentralCache(cacheKey("getClubMatchRows", [clubId]), () =>
    centralDb
      .select({
        matchId: centralMatchesTable.matchId,
        grade: centralMatchesTable.grade,
        season: centralMatchesTable.season,
      })
      .from(centralMatchesTable)
      .where(clubInvolvedWhere(clubId)),
  );
}

/** A club's game, shaped as the app's MatchSummary (the club's perspective). */
export interface CentralMatchSummary {
  id: number;
  grade: string;
  season: number;
  round: number | null;
  stage: string | null;
  competition: string | null;
  matchDate: string | null;
  venue: string | null;
  result: string | null;
  opponent: string | null;
  clubScore: string | null;
  opponentScore: string | null;
  abandoned: boolean;
  playerCount: number;
  opponentClub: {
    id: number;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    logoUrl128: string | null;
    primaryColour: string | null;
    secondaryColour: string | null;
  } | null;
}

/** Optional filters/paging for {@link centralClubMatches} — all applied in SQL. */
export interface CentralClubMatchesOpts {
  /** App grade (e.g. "A Grade") — resolved to the central grade labels that map to it. */
  grade?: string;
  /** Season start year (e.g. 2023 for "2023/24") — matched against the first 4-digit run in `matches.season`. */
  season?: number;
  /** SQL LIMIT over the season/round/id-desc ordering. Absent → all rows. */
  limit?: number;
  /** SQL OFFSET over the same ordering. Absent → 0. */
  offset?: number;
}

/**
 * A club's game-by-game match list from central, shaped as MatchSummary from the
 * club's perspective (opponent = the other side). Match ids are central's own
 * ints, so no crosswalk is needed. Optional grade (app grade) / season (start
 * year) filters plus limit/offset paging — all pushed into SQL so only the
 * requested page's rows are fetched and shaped. Matches whose grade doesn't map
 * or whose season can't be parsed are excluded. Sorted newest-first (season,
 * then round, then id), identically in SQL and in the retained JS sort.
 */
export async function centralClubMatches(
  clubId: number,
  opts: CentralClubMatchesOpts = {},
): Promise<CentralMatchSummary[]> {
  return withCentralCache(cacheKey("centralClubMatches", [clubId, opts]), () =>
    centralClubMatchesImpl(clubId, opts),
  );
}

async function centralClubMatchesImpl(
  clubId: number,
  opts: CentralClubMatchesOpts,
): Promise<CentralMatchSummary[]> {
  // Grade-label boundary: `matches.grade` is a free-text central label and the
  // label -> app-grade mapping (classifyCentralGrade) is JS regex logic that
  // can't move into SQL. So resolve the club's DISTINCT labels first (a tiny
  // result), classify them in JS, and push the resulting label list into the
  // SQL WHERE — semantically identical to the old per-row JS filter, including
  // dropping unmapped labels when no grade filter is given.
  const labelRows = await centralDb
    .selectDistinct({ grade: centralMatchesTable.grade })
    .from(centralMatchesTable)
    .where(clubInvolvedWhere(clubId));
  const labels = labelRows
    .map((r) => r.grade)
    .filter((g): g is string => Boolean(g))
    .filter((g) => {
      const appGrade = appGradeFromCentral(g);
      if (appGrade === null) return false;
      // Truthy check (not !== undefined) to match the old JS row filter, which
      // treated an empty-string grade as "no filter".
      return !opts.grade || appGrade === opts.grade;
    });
  if (labels.length === 0) return [];

  // SQL twins of parseSeasonStartYear() (first 4-digit run in the season text)
  // and parseRound() (finals -> null -> sorts last via -1; else first number).
  const seasonStartYearSql = sql<number>`(substring(${centralMatchesTable.season} from '\\d{4}'))::int`;
  const roundSortSql = sql<number>`case
    when ${centralMatchesTable.round} ~* 'final|semi|grand|qualif|elimin|prelim' then -1
    else coalesce((substring(${centralMatchesTable.round} from '\\d+'))::int, -1)
  end`;

  const conditions = [
    clubInvolvedWhere(clubId),
    // A club's distinct grade labels — a couple of dozen at most.
    inArray(centralMatchesTable.grade, labels),
    // Unparseable seasons are excluded, exactly like the old JS `season === null`.
    sql`${centralMatchesTable.season} ~ '\\d{4}'`,
  ];
  if (opts.season !== undefined) {
    conditions.push(sql`${seasonStartYearSql} = ${opts.season}`);
  }

  let query = centralDb
    .select()
    .from(centralMatchesTable)
    .where(and(...conditions))
    .orderBy(
      desc(seasonStartYearSql),
      desc(roundSortSql),
      desc(centralMatchesTable.matchId),
    )
    .$dynamic();
  if (opts.limit !== undefined) query = query.limit(opts.limit);
  if (opts.offset !== undefined) query = query.offset(opts.offset);
  const matches = await query;
  if (matches.length === 0) return [];

  // Without a `limit` this is the club's whole (filtered) history, so bind the
  // id list as one array parameter.
  const matchIds = matches.map((m) => m.matchId);
  const oppIds = [
    ...new Set(
      matches
        .map((m) => (m.homeClubId === clubId ? m.awayClubId : m.homeClubId))
        .filter((id): id is number => id != null),
    ),
  ];

  // Roster counts (the "playerCount" display figure) and opponent club brands
  // (central.clubs has no logo; degrade to initials chip) are independent given
  // the match list — run the two round trips in parallel.
  const [rosterCounts, oppClubs] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchRostersTable.matchId,
        n: sql<number>`count(*)::int`,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      )
      .groupBy(centralMatchRostersTable.matchId),
    oppIds.length > 0
      ? centralDb
          .select({
            clubId: centralClubsTable.clubId,
            name: centralClubsTable.name,
            shortName: centralClubsTable.shortName,
            primaryColour: centralClubsTable.primaryColour,
          })
          .from(centralClubsTable)
          // At most the association's ~27 clubs.
          .where(inArray(centralClubsTable.clubId, oppIds))
      : Promise.resolve([]),
  ]);
  const countByMatch = new Map(rosterCounts.map((r) => [r.matchId, Number(r.n)]));
  const oppById = new Map(oppClubs.map((c) => [c.clubId, c]));

  const rows: CentralMatchSummary[] = [];
  for (const m of matches) {
    const grade = appGradeFromCentral(m.grade);
    if (!grade) continue;
    if (opts.grade && grade !== opts.grade) continue;
    const season = parseSeasonStartYear(m.season);
    if (season === null) continue;
    if (opts.season !== undefined && season !== opts.season) continue;

    const isHome = m.homeClubId === clubId;
    const oppClubId = isHome ? m.awayClubId : m.homeClubId;
    const opp = oppClubId != null ? oppById.get(oppClubId) : undefined;
    const result =
      m.resultText ??
      (m.winnerClubId == null
        ? null
        : m.winnerClubId === clubId
          ? "Won"
          : "Lost");

    rows.push({
      id: m.matchId,
      grade,
      season,
      round: parseRound(m.round),
      stage: parseStage(m.round),
      competition: m.grade,
      matchDate: m.matchDate,
      venue: m.venue,
      result,
      opponent: isHome ? m.awayTeam : m.homeTeam,
      clubScore: isHome ? m.homeScore : m.awayScore,
      opponentScore: isHome ? m.awayScore : m.homeScore,
      abandoned: /abandon/i.test(m.status ?? ""),
      playerCount: countByMatch.get(m.matchId) ?? 0,
      opponentClub: opp
        ? {
            id: opp.clubId,
            name: opp.name ?? (isHome ? m.awayTeam : m.homeTeam) ?? "Opposition",
            shortName: opp.shortName,
            logoUrl: null,
            logoUrl128: null,
            primaryColour: opp.primaryColour,
            secondaryColour: null,
          }
        : null,
    });
  }

  rows.sort(
    (a, b) =>
      b.season - a.season ||
      (b.round ?? -1) - (a.round ?? -1) ||
      b.id - a.id,
  );
  return rows;
}

const WRAP_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a central "YYYY-MM-DD" date as "D Mon YYYY"; falls back to the raw
 *  string when it can't be parsed. */
function formatWrapDate(ymd: string | null): { label: string; sort: string } | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return { label: ymd, sort: ymd };
  const [, y, mo, d] = m;
  const month = WRAP_MONTHS[Number(mo) - 1] ?? mo;
  return { label: `${Number(d)} ${month} ${y}`, sort: `${y}-${mo}-${d}` };
}

/** One grade's line in the Weekend Wrap card (A6). */
export interface CentralWeekendWrapMatch {
  gradeLabel: string;
  resultLine: string;
  performers: string;
  outcome: "WON" | "LOST" | "";
}

/** Weekend Wrap card prefill (A6): a round's completed senior results, one per
 *  grade. Junior grades never reach central data, so this is seniors-only (R20). */
export interface CentralWeekendWrap {
  roundLabel: string;
  dateRange: string;
  matches: CentralWeekendWrapMatch[];
}

/**
 * Weekend Wrap prefill for a round: the club's completed senior matches in that
 * round, one per grade, with a result line, outcome and a best-effort top
 * performer line. Built over {@link centralClubMatches} (the existing per-grade
 * recent-results read) plus a light per-match batting/bowling standout lookup.
 * Every field is editable in the builder (R14), so the performer line is a
 * convenience, not authoritative.
 */
export async function centralWeekendWrap(
  clubId: number,
  season: number,
  round: number,
): Promise<CentralWeekendWrap> {
  return withCentralCache(cacheKey("centralWeekendWrap", [clubId, season, round]), () =>
    centralWeekendWrapImpl(clubId, season, round),
  );
}

async function centralWeekendWrapImpl(
  clubId: number,
  season: number,
  round: number,
): Promise<CentralWeekendWrap> {
  const roundLabel = `Round ${round}`;
  const seasonMatches = await centralClubMatches(clubId, { season });
  // One completed match per grade for this round (centralClubMatches is already
  // newest-first, so the first per grade is the most recent).
  const byGrade = new Map<string, CentralMatchSummary>();
  for (const m of seasonMatches) {
    if (m.round !== round) continue;
    if (m.abandoned) continue;
    if (!byGrade.has(m.grade)) byGrade.set(m.grade, m);
  }
  const picked = [...byGrade.values()];
  if (picked.length === 0) {
    return { roundLabel, dateRange: "", matches: [] };
  }

  // One match per grade — a handful of ids, so plain inArray is fine here.
  const matchIds = picked.map((m) => m.id);

  // Standout batter (max runs) and bowler (max wickets) per match, club side.
  // Raw lines reduced in JS (small set) — mirrors centralClubRecords' approach.
  const [battingLines, bowlingLines] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inArray(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inArray(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
  ]);

  const topBat = new Map<number, { participantId: string; runs: number }>();
  for (const b of battingLines) {
    if (!b.participantId || b.matchId == null) continue;
    const runs = b.runs ?? 0;
    const prev = topBat.get(b.matchId);
    if (!prev || runs > prev.runs) topBat.set(b.matchId, { participantId: b.participantId, runs });
  }
  const topBowl = new Map<number, { participantId: string; wickets: number; runs: number }>();
  for (const b of bowlingLines) {
    if (!b.participantId || b.matchId == null) continue;
    const wickets = b.wickets ?? 0;
    const prev = topBowl.get(b.matchId);
    if (!prev || wickets > prev.wickets) {
      topBowl.set(b.matchId, { participantId: b.participantId, wickets, runs: b.runs ?? 0 });
    }
  }

  // Resolve performer names + privacy in one round trip (private players are
  // dropped from the performer line, same rule as the leaderboards).
  const perfIds = new Set<string>();
  for (const t of topBat.values()) perfIds.add(t.participantId);
  for (const t of topBowl.values()) perfIds.add(t.participantId);
  const players = perfIds.size
    ? await centralDb
        .select({
          participantId: centralPlayersTable.participantId,
          displayName: centralPlayersTable.displayName,
          isPrivate: centralPlayersTable.isPrivate,
        })
        .from(centralPlayersTable)
        // At most two performers per picked match.
        .where(inArray(centralPlayersTable.participantId, [...perfIds]))
    : [];
  const playerById = new Map(players.map((p) => [p.participantId, p]));
  const nameOf = (participantId: string): string | null => {
    const p = playerById.get(participantId);
    if (isPrivateRow(p)) return null;
    const name = p?.displayName?.trim();
    return name && name.length ? name : null;
  };

  const dates = picked
    .map((m) => formatWrapDate(m.matchDate))
    .filter((d): d is { label: string; sort: string } => d != null)
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  const dateRange =
    dates.length === 0
      ? ""
      : dates[0].label === dates[dates.length - 1].label
        ? dates[0].label
        : `${dates[0].label} – ${dates[dates.length - 1].label}`;

  const matches: CentralWeekendWrapMatch[] = picked.map((m) => {
    const outcome: "WON" | "LOST" | "" =
      m.result === "Won" ? "WON" : m.result === "Lost" ? "LOST" : "";
    const connector =
      outcome === "WON" ? "def" : outcome === "LOST" ? "def by" : "vs";
    const opp = m.opponent ?? m.opponentClub?.name ?? "Opposition";
    const clubScore = m.clubScore ?? "—";
    const oppScore = m.opponentScore ?? "—";
    const resultLine = `${clubScore} ${connector} ${opp} ${oppScore}`.trim();

    const bat = topBat.get(m.id);
    const bowl = topBowl.get(m.id);
    const parts: string[] = [];
    if (bat) {
      const n = nameOf(bat.participantId);
      if (n && bat.runs > 0) parts.push(`${n} ${bat.runs}`);
    }
    if (bowl) {
      const n = nameOf(bowl.participantId);
      if (n && bowl.wickets > 0) parts.push(`${n} ${bowl.wickets}/${bowl.runs}`);
    }

    return {
      gradeLabel: m.grade,
      resultLine,
      performers: parts.join(", "),
      outcome,
    };
  });

  return { roundLabel, dateRange, matches };
}

/** Club-side scorecard line (keyed by participant GUID; route maps to int id). */
export interface CentralScorecardLine {
  participantId: string | null;
  displayName: string | null;
  isPrivate: boolean;
  batted: boolean;
  battingPos: number | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  dismissal: string | null;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;
}

/** Opposition scorecard line — plain text, never linked. */
export interface CentralOppositionLine {
  name: string;
  batted: boolean;
  battingPos: number | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  dismissal: string | null;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;
}

export interface CentralMatchScorecard {
  summary: CentralMatchSummary;
  battedFirst: boolean;
  lines: CentralScorecardLine[];
  oppositionLines: CentralOppositionLine[];
}

const oversToText = (o: number | null): string | null => (o == null ? null : String(o));

/**
 * One match's branded two-innings scorecard for a club, from central. The club
 * side (`lines`) is keyed by participant GUID — the route maps those to the
 * tenant's int ids via player_id_map and masks private players; the opposition
 * side (`oppositionLines`) is plain text. `battedFirst` is taken from the central
 * innings order (innings 1 = batted first). Returns null if the match doesn't
 * exist or doesn't involve the club. Central has no fill-ins to exclude.
 */
export async function centralMatchScorecard(
  clubId: number,
  matchId: number,
): Promise<CentralMatchScorecard | null> {
  return withCentralCache(cacheKey("centralMatchScorecard", [clubId, matchId]), () =>
    centralMatchScorecardImpl(clubId, matchId),
  );
}

async function centralMatchScorecardImpl(
  clubId: number,
  matchId: number,
): Promise<CentralMatchScorecard | null> {
  const [m] = await centralDb
    .select()
    .from(centralMatchesTable)
    .where(eq(centralMatchesTable.matchId, matchId));
  if (!m) return null;
  if (m.homeClubId !== clubId && m.awayClubId !== clubId) return null;

  const grade = appGradeFromCentral(m.grade);
  const season = parseSeasonStartYear(m.season);

  const isHome = m.homeClubId === clubId;
  const oppClubId = isHome ? m.awayClubId : m.homeClubId;

  const [batting, bowling, opp] = await Promise.all([
    centralDb
      .select()
      .from(centralMatchBattingTable)
      .where(eq(centralMatchBattingTable.matchId, matchId)),
    centralDb
      .select()
      .from(centralMatchBowlingTable)
      .where(eq(centralMatchBowlingTable.matchId, matchId)),
    oppClubId != null
      ? centralDb
          .select({
            clubId: centralClubsTable.clubId,
            name: centralClubsTable.name,
            shortName: centralClubsTable.shortName,
            primaryColour: centralClubsTable.primaryColour,
          })
          .from(centralClubsTable)
          .where(eq(centralClubsTable.clubId, oppClubId))
      : Promise.resolve([]),
  ]);

  // innings 1 = batted first; whose club id sits at innings 1?
  const innings1 = batting.find((b) => b.innings === 1);
  const battedFirst = innings1 ? innings1.clubId === clubId : true;

  // Club-side names + privacy.
  const clubGuids = [
    ...new Set(
      [...batting, ...bowling]
        .filter((l) => l.clubId === clubId && l.participantId)
        .map((l) => l.participantId as string),
    ),
  ];
  const players =
    clubGuids.length > 0
      ? await centralDb
          .select({
            participantId: centralPlayersTable.participantId,
            displayName: centralPlayersTable.displayName,
            isPrivate: centralPlayersTable.isPrivate,
          })
          .from(centralPlayersTable)
          // One match's XI (plus subs) — a small list.
          .where(inArray(centralPlayersTable.participantId, clubGuids))
      : [];
  const playerById = new Map(players.map((p) => [p.participantId, p]));

  // Merge batting + bowling into one line per participant, per side.
  interface Line {
    participantId: string | null;
    playerName: string | null;
    batted: boolean;
    battingPos: number | null;
    runs: number | null;
    balls: number | null;
    fours: number | null;
    sixes: number | null;
    notOut: boolean;
    dismissal: string | null;
    bowled: boolean;
    overs: number | null;
    maidens: number | null;
    runsConceded: number | null;
    wickets: number | null;
    wides: number | null;
    noBalls: number | null;
  }
  const blank = (participantId: string | null, playerName: string | null): Line => ({
    participantId,
    playerName,
    batted: false,
    battingPos: null,
    runs: null,
    balls: null,
    fours: null,
    sixes: null,
    notOut: false,
    dismissal: null,
    bowled: false,
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    wides: null,
    noBalls: null,
  });

  const build = (side: number): Line[] => {
    const byKey = new Map<string, Line>();
    const keyOf = (pid: string | null, name: string | null) =>
      pid ?? `name:${name ?? ""}`;
    for (const b of batting) {
      if (b.clubId !== side) continue;
      const key = keyOf(b.participantId, b.playerName);
      const line = byKey.get(key) ?? blank(b.participantId, b.playerName);
      const kind = classifyInnings(b.dismissalType, b.dismissal);
      line.batted = kind !== "dnb";
      line.battingPos = b.batOrder ?? line.battingPos;
      line.runs = b.runs;
      line.balls = b.balls;
      line.fours = b.fours;
      line.sixes = b.sixes;
      line.notOut = kind === "notout";
      line.dismissal = b.dismissal;
      byKey.set(key, line);
    }
    for (const bw of bowling) {
      if (bw.clubId !== side) continue;
      const key = keyOf(bw.participantId, bw.playerName);
      const line = byKey.get(key) ?? blank(bw.participantId, bw.playerName);
      line.bowled = true;
      line.overs = bw.overs;
      line.maidens = bw.maidens;
      line.runsConceded = bw.runs;
      line.wickets = bw.wickets;
      line.wides = bw.wides;
      line.noBalls = bw.noBalls;
      byKey.set(key, line);
    }
    return [...byKey.values()].sort(
      (a, b) => (a.battingPos ?? 99) - (b.battingPos ?? 99),
    );
  };

  const clubLines = build(clubId).map((l): CentralScorecardLine => {
    const p = l.participantId ? playerById.get(l.participantId) : undefined;
    return {
      participantId: l.participantId,
      // First non-empty: central display_name, then the scorecard line's own
      // player_name (?? alone would keep an empty-string display_name).
      displayName:
        p?.displayName && p.displayName.trim() ? p.displayName : l.playerName,
      isPrivate: isPrivateRow(p),
      batted: l.batted,
      battingPos: l.battingPos,
      runs: l.runs,
      balls: l.balls,
      fours: l.fours,
      sixes: l.sixes,
      notOut: l.notOut,
      dismissal: l.dismissal,
      bowled: l.bowled,
      overs: oversToText(l.overs),
      maidens: l.maidens,
      runsConceded: l.runsConceded,
      wickets: l.wickets,
      wides: l.wides,
      noBalls: l.noBalls,
    };
  });

  const oppositionLines: CentralOppositionLine[] =
    oppClubId == null
      ? []
      : build(oppClubId).map((l) => ({
          name: l.playerName ?? "—",
          batted: l.batted,
          battingPos: l.battingPos,
          runs: l.runs,
          balls: l.balls,
          fours: l.fours,
          sixes: l.sixes,
          notOut: l.notOut,
          dismissal: l.dismissal,
          bowled: l.bowled,
          overs: oversToText(l.overs),
          maidens: l.maidens,
          runsConceded: l.runsConceded,
          wickets: l.wickets,
          wides: l.wides,
          noBalls: l.noBalls,
        }));

  const oppClub = opp[0];
  const result =
    m.resultText ??
    (m.winnerClubId == null ? null : m.winnerClubId === clubId ? "Won" : "Lost");

  const summary: CentralMatchSummary = {
    id: m.matchId,
    grade: grade ?? (m.grade ?? ""),
    season: season ?? 0,
    round: parseRound(m.round),
    stage: parseStage(m.round),
    competition: m.grade,
    matchDate: m.matchDate,
    venue: m.venue,
    result,
    opponent: isHome ? m.awayTeam : m.homeTeam,
    clubScore: isHome ? m.homeScore : m.awayScore,
    opponentScore: isHome ? m.awayScore : m.homeScore,
    abandoned: /abandon/i.test(m.status ?? ""),
    playerCount: clubLines.length,
    opponentClub: oppClub
      ? {
          id: oppClub.clubId,
          name: oppClub.name ?? (isHome ? m.awayTeam : m.homeTeam) ?? "Opposition",
          shortName: oppClub.shortName,
          logoUrl: null,
          logoUrl128: null,
          primaryColour: oppClub.primaryColour,
          secondaryColour: null,
        }
      : null,
  };

  return { summary, battedFirst, lines: clubLines, oppositionLines };
}
