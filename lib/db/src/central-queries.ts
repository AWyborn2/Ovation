import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPlayersTable,
} from "./central";
import type { PlayerGradeStat } from "./schema";

/**
 * Canonical read queries against the central PCA database, shared by the API
 * server (the feature-flagged `GET /grades/:grade/leaderboard` route) and the
 * comparison tooling so both exercise the SAME logic — no divergence between the
 * endpoint and the proof script.
 *
 * Lives in `@workspace/db` (beside `centralDb`) rather than the API server so the
 * scripts package, which only depends on `@workspace/db`, can import it. Importing
 * this module loads `./central`, which requires `CENTRAL_DATABASE_URL`; callers
 * gated behind `CENTRAL_READS` must import it lazily so the tenant-only path never
 * touches it.
 */

/**
 * Central-read grade batting leaderboard. Rebuilds the per-(player, grade) career
 * batting aggregate the endpoint normally serves from the tenant
 * `player_grade_stats` table, instead reading the shared central PCA database:
 * `central.match_batting` for figures, `central.matches` to scope by club +
 * grade. Output keeps the exact `PlayerGradeStat` shape so the API contract is
 * unchanged.
 *
 * Scope / known limitations (the EXPECTED, explainable differences the comparison
 * script surfaces — see scripts/src/compare-central-leaderboard.ts):
 *   - Central data is scorecard-era only (2002/03+). The tenant numbers fold in
 *     hand-kept pre-2002 history and curated corrections, so career totals differ.
 *   - This is the BATTING leaderboard: bowling/fielding columns are left null
 *     (not derived from central here).
 *   - `playerId` can't be filled — central identifies players by PlayHQ
 *     `participant_id` (GUID); the int crosswalk (`player_id_map`) is a later
 *     step. It's set to 0; consumers key on name for now.
 *   - Seniors only — the central read never touches junior data.
 *   - Central data carries no fill-ins, so there is no `playerId >= 90000` floor
 *     to apply (that convention is tenant-only).
 */

/** Halls Head's club id in the central PCA database (tenant #1 / demo). */
export const HALLS_HEAD_CENTRAL_CLUB_ID = 1;

/**
 * Resolve a central `matches.grade` label to the app's grade name plus an
 * optional attributable `note` (sub-competition folding, divisions, sponsor
 * labels, deliberate exclusions). The note is for the comparison script's
 * output so mismatches are explainable.
 *
 * Built from the dump's ground-truth distinct labels. App grades:
 * "A Grade".."F Grade", "Female A Grade", "Female B Grade", "PPL", "Colts".
 * `appGrade: null` means deliberately unmapped (charity one-offs, Female C the
 * app doesn't have, the Ladies-T20 Female-B predecessor we don't auto-merge).
 */
export interface CentralGradeMapping {
  appGrade: string | null;
  note?: string;
}

export function classifyCentralGrade(
  centralGrade: string | null,
): CentralGradeMapping {
  if (!centralGrade) return { appGrade: null };
  const raw = centralGrade.trim();
  if (!raw) return { appGrade: null };
  const lower = raw.toLowerCase();

  // Format caveats — these comps were ingested into the base grade's season in
  // the HH app (per-match workbooks), so they belong to the base grade but are
  // worth flagging when numbers diverge.
  const thorny = /thorny devil/.test(lower);
  const midYear = /mid-?year/.test(lower);
  const t20 = /\bt20\b/.test(lower) || /\b20 match\b/.test(lower);
  const formatNote = thorny
    ? "Thorny Devil Mid-Year T20 — ingested into the base grade's season in the app"
    : midYear
      ? "Mid-Year T20 — ingested into the base grade's season in the app"
      : t20
        ? "T20 sub-competition — folded into the base grade in the app"
        : undefined;

  // Deliberate exclusion: charity one-offs.
  if (/charity/.test(lower) || /glen dehring/.test(lower)) {
    return { appGrade: null, note: "excluded: charity one-off" };
  }

  // PPL / Premier League, including the RetraVision/Retravision sponsor labels.
  if (
    /\bppl\b/.test(lower) ||
    /retravision/.test(lower) ||
    /peel premier/.test(lower) ||
    (/premier/.test(lower) && /league/.test(lower))
  ) {
    return {
      appGrade: "PPL",
      note: "PPL — the app recorded PPL as A Grade before 2019/20 (replit.md)",
    };
  }

  // Colts (incl. sponsor-prefixed "ID Athletic PCA Colts Competition").
  if (/\bcolts?\b/.test(lower)) return { appGrade: "Colts" };

  // Female grades — MUST precede the generic "<letter> Grade" matcher, since
  // "Female A Grade" contains "A Grade".
  if (/\bfemale\s*a\b/.test(lower)) {
    return { appGrade: "Female A Grade", note: formatNote };
  }
  if (/\bladies\s*t20\b/.test(lower)) {
    return {
      appGrade: null,
      note: "Female B predecessor (Ladies T20) — review, not auto-merged",
    };
  }
  if (/\bfemale\s*b\b/.test(lower)) {
    return { appGrade: "Female B Grade", note: formatNote };
  }
  if (/\bfemale\s*c\b/.test(lower)) {
    return { appGrade: null, note: "app has no Female C Grade (unmapped)" };
  }

  // C1 / C2 divisions — the generic matcher won't catch "C1 Grade" / "C2 Grade".
  if (/\bc1\s*grade\b/.test(lower)) {
    return { appGrade: "C Grade", note: "C1 division → C Grade" };
  }
  if (/\bc2\s*grade\b/.test(lower)) {
    return {
      appGrade: "C Grade",
      note: "C2 division → C Grade — verify the app didn't treat it separately",
    };
  }

  // Generic "<letter> Grade", with or without a cup suffix or sponsor prefix
  // ("A Grade", "A Grade: Wyllie Cup", "D Grade Ritchie Cup", "T20: B Grade").
  const labelled = /\b([a-f])\s*grade\b/.exec(lower);
  if (labelled) {
    return { appGrade: `${labelled[1].toUpperCase()} Grade`, note: formatNote };
  }
  // Bare single-letter grade code ("A", "B", …) with no "Grade" word.
  if (/^[a-f]$/.test(lower)) {
    return { appGrade: `${lower.toUpperCase()} Grade`, note: formatNote };
  }

  return { appGrade: null };
}

/**
 * The app grade a central `matches.grade` label rolls up to, or null when it
 * doesn't map (which excludes it from the central read). Thin wrapper over
 * {@link classifyCentralGrade} used for the leaderboard's grade filter.
 */
export function appGradeFromCentral(centralGrade: string | null): string | null {
  return classifyCentralGrade(centralGrade).appGrade;
}

/**
 * True when a central `matches.season` text (e.g. "Summer 2002/03") belongs to
 * the app's integer start-year season (2002). Used only by the optional
 * season-scoped comparison; the live endpoint aggregates all seasons (career).
 */
export function centralSeasonMatchesStartYear(
  centralSeason: string | null,
  startYear: number,
): boolean {
  if (!centralSeason) return false;
  const yy = String((startYear + 1) % 100).padStart(2, "0");
  // Match "<startYear>/<yy>" (e.g. "2002/03"); fall back to a bare year token.
  return (
    centralSeason.includes(`${startYear}/${yy}`) ||
    new RegExp(`\\b${startYear}\\b`).test(centralSeason)
  );
}

/**
 * Classify a central batting line into an innings outcome.
 *
 * `dismissal_type = 'other'` lumps "did not bat" together with retirements, so
 * the dismissal TEXT is authoritative for those — don't key on the type:
 *   - dismissal "did not bat"                      → NOT an innings (excluded).
 *   - dismissal "retired hurt" / "retired not out" → an innings, counts not out.
 *   - dismissal_type "not out"                     → an innings, not out.
 *   - everything else with a real dismissal_type   → an innings, out.
 */
function classifyInnings(
  dismissalType: string | null,
  dismissal: string | null,
): "out" | "notout" | "dnb" {
  const text = (dismissal ?? "").trim().toLowerCase();
  if (text === "did not bat") return "dnb";
  if (text === "retired hurt" || text === "retired not out") return "notout";

  const type = (dismissalType ?? "").trim().toLowerCase();
  if (type === "not out") return "notout";
  // No dismissal info at all: treat as not out rather than inventing a wicket
  // (doesn't affect the innings count — only "did not bat" is excluded).
  if (type === "") return "notout";

  // A genuine dismissal (caught, bowled, lbw, run out, stumped, or an 'other'
  // edge case that isn't DNB/retired) → the batter was out.
  return "out";
}

function splitDisplayName(displayName: string): {
  givenName: string;
  surname: string;
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0], surname: "" };
  return {
    givenName: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface BattingAgg {
  runs: number;
  innings: number;
  notOuts: number;
  fifties: number;
  hundreds: number;
  highScore: number;
  highScoreNotOut: boolean;
  matchIds: Set<number>;
}

/**
 * Career (or, when `seasonStartYear` is given, single-season) batting leaderboard
 * for a tenant club, read entirely from the central PCA database. Rows are sorted
 * games-desc to mirror the tenant endpoint.
 */
export async function centralGradeLeaderboard(
  appGrade: string,
  opts: { clubId?: number; seasonStartYear?: number } = {},
): Promise<PlayerGradeStat[]> {
  const clubId = opts.clubId ?? HALLS_HEAD_CENTRAL_CLUB_ID;

  // 1. Central matches involving this club, narrowed to the requested app grade
  //    (and optionally a single season). Grade mapping is per-label, so resolve
  //    it in JS rather than SQL.
  const matchRows = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      season: centralMatchesTable.season,
    })
    .from(centralMatchesTable)
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );

  const matchIds = matchRows
    .filter((m) => appGradeFromCentral(m.grade) === appGrade)
    .filter(
      (m) =>
        opts.seasonStartYear === undefined ||
        centralSeasonMatchesStartYear(m.season, opts.seasonStartYear),
    )
    .map((m) => m.matchId);

  if (matchIds.length === 0) return [];

  // 2. This club's batting lines in those matches, aggregated per participant.
  const battingLines = await centralDb
    .select({
      participantId: centralMatchBattingTable.participantId,
      matchId: centralMatchBattingTable.matchId,
      runs: centralMatchBattingTable.runs,
      dismissal: centralMatchBattingTable.dismissal,
      dismissalType: centralMatchBattingTable.dismissalType,
    })
    .from(centralMatchBattingTable)
    .where(
      and(
        eq(centralMatchBattingTable.clubId, clubId),
        inArray(centralMatchBattingTable.matchId, matchIds),
      ),
    );

  const agg = new Map<string, BattingAgg>();
  for (const line of battingLines) {
    if (!line.participantId) continue;
    const kind = classifyInnings(line.dismissalType, line.dismissal);
    const a =
      agg.get(line.participantId) ??
      {
        runs: 0,
        innings: 0,
        notOuts: 0,
        fifties: 0,
        hundreds: 0,
        highScore: 0,
        highScoreNotOut: false,
        matchIds: new Set<number>(),
      };
    if (line.matchId !== null) a.matchIds.add(line.matchId);
    if (kind !== "dnb") {
      const runs = line.runs ?? 0;
      a.innings += 1;
      a.runs += runs;
      if (kind === "notout") a.notOuts += 1;
      if (runs >= 100) a.hundreds += 1;
      else if (runs >= 50) a.fifties += 1;
      if (runs > a.highScore) {
        a.highScore = runs;
        a.highScoreNotOut = kind === "notout";
      } else if (runs === a.highScore && kind === "notout") {
        a.highScoreNotOut = true;
      }
    }
    agg.set(line.participantId, a);
  }

  if (agg.size === 0) return [];

  // 3. Games = distinct appearances from rosters (a player counts as having
  //    played even in matches where they didn't bat), unioned with batted
  //    matches as a fallback for rows missing a roster entry.
  const rosterLines = await centralDb
    .select({
      participantId: centralMatchRostersTable.participantId,
      matchId: centralMatchRostersTable.matchId,
    })
    .from(centralMatchRostersTable)
    .where(
      and(
        eq(centralMatchRostersTable.clubId, clubId),
        inArray(centralMatchRostersTable.matchId, matchIds),
      ),
    );
  for (const r of rosterLines) {
    if (!r.participantId || r.matchId === null) continue;
    agg.get(r.participantId)?.matchIds.add(r.matchId);
  }

  // 4. Names + privacy flag from the central player register.
  const ids = [...agg.keys()];
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inArray(centralPlayersTable.participantId, ids));
  const playerById = new Map(players.map((p) => [p.participantId, p]));

  // 5. Project to the PlayerGradeStat shape the endpoint contract requires.
  const rows: PlayerGradeStat[] = ids.map((participantId) => {
    const a = agg.get(participantId)!;
    const p = playerById.get(participantId);
    const isPrivate = (p?.isPrivate ?? 0) === 1;
    const name = isPrivate
      ? { givenName: "Private", surname: "Player" }
      : splitDisplayName(p?.displayName ?? participantId);
    const dismissals = a.innings - a.notOuts;
    return {
      id: 0,
      playerId: 0,
      surname: name.surname,
      givenName: name.givenName,
      grade: appGrade,
      season: null,
      games: a.matchIds.size,
      innings: a.innings,
      notOuts: a.notOuts,
      runs: a.runs,
      batAvg: dismissals > 0 ? round2(a.runs / dismissals) : null,
      highScore:
        a.innings === 0
          ? null
          : `${a.highScore}${a.highScoreNotOut ? "*" : ""}`,
      fifties: a.fifties,
      hundreds: a.hundreds,
      wickets: null,
      runsConceded: null,
      bowlAvg: null,
      bestBowling: null,
      fiveWickets: null,
      catches: null,
      stumpings: null,
      runOuts: null,
    };
  });

  // Mirror the tenant endpoint's ordering (games desc); tie-break for stable
  // output across runs/environments.
  rows.sort(
    (x, y) =>
      (y.games ?? 0) - (x.games ?? 0) ||
      (y.runs ?? 0) - (x.runs ?? 0) ||
      x.surname.localeCompare(y.surname),
  );
  return rows;
}

/**
 * Distinct central `matches.grade` labels for a club, with the app grade each
 * maps to and any attributable note. Used by the comparison script to make
 * grade-mapping decisions (folded sub-comps, divisions, exclusions) visible.
 */
export async function listCentralGradesForClub(
  clubId: number = HALLS_HEAD_CENTRAL_CLUB_ID,
): Promise<{ centralGrade: string; appGrade: string | null; note?: string }[]> {
  const rows = await centralDb
    .selectDistinct({ grade: centralMatchesTable.grade })
    .from(centralMatchesTable)
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );
  return rows
    .map((r) => r.grade)
    .filter((g): g is string => Boolean(g))
    .sort()
    .map((centralGrade) => {
      const { appGrade, note } = classifyCentralGrade(centralGrade);
      return { centralGrade, appGrade, note };
    });
}

/**
 * Club-wide career totals for a tenant club, read from the central PCA database.
 * Identity-free (pure counts/sums, no GUID→int mapping needed), so it works for
 * any tenant club. Mirrors the app's home-overview `totals` block:
 *   - players: distinct participants who appeared for the club (from rosters)
 *   - games:   total appearances (one roster line per player per match)
 *   - runs:    sum of the club's batting runs
 *   - wickets: sum of the club's bowling wickets
 *   - grades:  distinct app-grades the club's matches map to
 *
 * Scorecard-era only (2002/03+), so for Halls Head (club 1) these differ from the
 * tenant totals that fold in pre-2002 history — the same expected divergence the
 * comparison script documents.
 */
export async function centralClubTotals(
  clubId: number = HALLS_HEAD_CENTRAL_CLUB_ID,
): Promise<{
  players: number;
  games: number;
  runs: number;
  wickets: number;
  grades: number;
}> {
  const matchRows = await centralDb
    .select({ matchId: centralMatchesTable.matchId, grade: centralMatchesTable.grade })
    .from(centralMatchesTable)
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) {
    return { players: 0, games: 0, runs: 0, wickets: 0, grades: 0 };
  }
  const grades = new Set(
    matchRows
      .map((m) => appGradeFromCentral(m.grade))
      .filter((g): g is string => Boolean(g)),
  ).size;

  const rosters = await centralDb
    .select({ participantId: centralMatchRostersTable.participantId })
    .from(centralMatchRostersTable)
    .where(
      and(
        eq(centralMatchRostersTable.clubId, clubId),
        inArray(centralMatchRostersTable.matchId, matchIds),
      ),
    );
  const players = new Set(
    rosters.map((r) => r.participantId).filter((p): p is string => Boolean(p)),
  ).size;
  const games = rosters.length;

  const [bat] = await centralDb
    .select({ runs: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)` })
    .from(centralMatchBattingTable)
    .where(
      and(
        eq(centralMatchBattingTable.clubId, clubId),
        inArray(centralMatchBattingTable.matchId, matchIds),
      ),
    );
  const [bowl] = await centralDb
    .select({ wickets: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)` })
    .from(centralMatchBowlingTable)
    .where(
      and(
        eq(centralMatchBowlingTable.clubId, clubId),
        inArray(centralMatchBowlingTable.matchId, matchIds),
      ),
    );

  return {
    players,
    games,
    runs: Number(bat?.runs ?? 0),
    wickets: Number(bowl?.wickets ?? 0),
    grades,
  };
}

/**
 * Distinct central participants (PlayHQ GUIDs) who appeared for a club, with
 * display name + privacy flag. The source list for minting a tenant's
 * player_id_map. Unions roster, batting and bowling lines so a player who only
 * batted/bowled (no roster row) is still included.
 */
export async function centralClubParticipants(
  clubId: number = HALLS_HEAD_CENTRAL_CLUB_ID,
): Promise<{ participantId: string; displayName: string | null; isPrivate: boolean }[]> {
  const matchRows = await centralDb
    .select({ matchId: centralMatchesTable.matchId })
    .from(centralMatchesTable)
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];

  const [rosters, batting, bowling] = await Promise.all([
    centralDb
      .selectDistinct({ participantId: centralMatchRostersTable.participantId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inArray(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .selectDistinct({ participantId: centralMatchBattingTable.participantId })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inArray(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .selectDistinct({ participantId: centralMatchBowlingTable.participantId })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inArray(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
  ]);

  const ids = [
    ...new Set(
      [...rosters, ...batting, ...bowling]
        .map((r) => r.participantId)
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  if (ids.length === 0) return [];

  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inArray(centralPlayersTable.participantId, ids));
  const byId = new Map(players.map((p) => [p.participantId, p]));

  return ids.map((participantId) => {
    const p = byId.get(participantId);
    return {
      participantId,
      displayName: p?.displayName ?? null,
      isPrivate: (p?.isPrivate ?? 0) === 1,
    };
  });
}
