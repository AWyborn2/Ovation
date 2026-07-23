import { and, desc, eq, gte, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  centralDb,
  centralClubsTable,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
  centralPlayersTable,
  centralLadderTable,
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

/**
 * SQL mirror of {@link classifyInnings}, evaluated on `central.match_batting`
 * rows so the per-player aggregation can run as a GROUP BY in the database
 * instead of fetching every raw line. The branches translate the JS VERBATIM
 * and in the same order:
 *   - dismissal text "did not bat"                     → 'dnb'
 *   - dismissal text "retired hurt"/"retired not out"  → 'notout'
 *   - dismissal_type "not out" OR empty/NULL           → 'notout'
 *   - everything else                                  → 'out'
 * (Bare "retired" deliberately falls through to the type → 'out', same as JS.)
 * Keep the two definitions in lockstep — the *-consistency tests and the live
 * equivalence checks (Jul 2026) rely on them classifying identically.
 */
const battingInningsKindSql = sql<string>`case
  when lower(trim(coalesce(${centralMatchBattingTable.dismissal}, ''))) = 'did not bat' then 'dnb'
  when lower(trim(coalesce(${centralMatchBattingTable.dismissal}, ''))) in ('retired hurt', 'retired not out') then 'notout'
  when lower(trim(coalesce(${centralMatchBattingTable.dismissalType}, ''))) in ('not out', '') then 'notout'
  else 'out'
end`;

/**
 * The three fielding-dismissal buckets the app tracks. `central.fielding.kind`
 * is free text ("caught"/"c", "stumped"/"st", "run out"/"ro", …); classify it
 * into one bucket so leaderboards and player pages can report catches,
 * stumpings and run-outs separately (their sum is the "dismissals" total).
 */
export type CentralFieldingKind = "catch" | "stumping" | "runOut";

export function classifyFieldingKind(
  kind: string | null | undefined,
): CentralFieldingKind | null {
  const k = (kind ?? "").trim().toLowerCase();
  if (!k) return null;
  // Order matters: run-out and stumping are checked before catch so a keeper's
  // "st" / a "run out" never falls through to the broad catch matcher.
  if (/run\s*-?\s*out|^ro$/.test(k)) return "runOut";
  if (/stump|^st$/.test(k)) return "stumping";
  if (/catch|caught|^c$|^ct$/.test(k)) return "catch";
  return null;
}

interface FieldingTally {
  catches: number;
  stumpings: number;
  runOuts: number;
}

/** Empty fielding tally (all-zero), used as the default for players who fielded nothing. */
function emptyFieldingTally(): FieldingTally {
  return { catches: 0, stumpings: 0, runOuts: 0 };
}

/**
 * Aggregate `central.fielding` rows (already scoped to a club + match set) into
 * per-participant catch/stumping/run-out tallies. `n` is the row's grouped
 * count (or 1 when the caller selects raw rows).
 */
function tallyFielding(
  rows: { participantId: string | null; kind: string | null; n?: number }[],
): Map<string, FieldingTally> {
  const byPid = new Map<string, FieldingTally>();
  for (const f of rows) {
    if (!f.participantId) continue;
    const cls = classifyFieldingKind(f.kind);
    if (!cls) continue;
    let t = byPid.get(f.participantId);
    if (!t) {
      t = emptyFieldingTally();
      byPid.set(f.participantId, t);
    }
    const n = Number(f.n ?? 1);
    if (cls === "catch") t.catches += n;
    else if (cls === "stumping") t.stumpings += n;
    else t.runOuts += n;
  }
  return byPid;
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

// ---------------------------------------------------------------------------
// Short-TTL result cache for the exported central reads.
//
// The central DB is a REMOTE Supabase Postgres reached over the internet, so
// every query is a full network round trip, and the underlying data changes at
// most weekly (external ingest). A 5-minute in-process cache (mirroring the
// tenant-config cache in api-server/src/lib/tenant.ts) is therefore safe by
// design and removes repeated multi-second fan-outs on hot pages.
//
// Override with CENTRAL_CACHE_TTL_MS (0 disables caching entirely — useful for
// tests and the comparison tooling); call clearCentralQueriesCache() to reset
// between test cases.
// ---------------------------------------------------------------------------

const DEFAULT_CENTRAL_CACHE_TTL_MS = 5 * 60 * 1000;

function centralCacheTtlMs(): number {
  const raw = process.env.CENTRAL_CACHE_TTL_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_CENTRAL_CACHE_TTL_MS;
}

const centralCache = new Map<string, { value: unknown; at: number }>();

/** Drop every cached central read (tests; or after a central re-ingest). */
export function clearCentralQueriesCache(): void {
  centralCache.clear();
}

/**
 * Stable, order-insensitive serialisation of a cache-key argument. Maps (the
 * leaderboard's tenant crosswalk/rename overrides) are folded into the key by
 * their sorted entries so two tenants sharing a central club id but carrying
 * different crosswalks never share a cache entry.
 */
function stableCacheArg(value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __map: [...value.entries()]
        .map(([k, v]) => [String(k), v] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    };
  }
  if (Array.isArray(value)) return value.map(stableCacheArg);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stableCacheArg(v)]),
    );
  }
  return value;
}

function cacheKey(fn: string, args: unknown[]): string {
  return `${fn}:${JSON.stringify(args.map(stableCacheArg))}`;
}

/** Hard ceiling on cached entries; expired ones are swept before eviction. */
const MAX_CENTRAL_CACHE_ENTRIES = 500;

/** In-flight builds, so concurrent misses on one key share a single query run. */
const centralInFlight = new Map<string, Promise<unknown>>();

/**
 * Drop expired entries; if still over the ceiling, evict oldest-first. Without
 * this the Map only ever grows — entries expire logically but were never removed.
 */
function pruneCentralCache(ttl: number): void {
  if (centralCache.size <= MAX_CENTRAL_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of centralCache) {
    if (now - v.at >= ttl) centralCache.delete(k);
  }
  if (centralCache.size <= MAX_CENTRAL_CACHE_ENTRIES) return;
  const excess = centralCache.size - MAX_CENTRAL_CACHE_ENTRIES;
  let dropped = 0;
  for (const k of centralCache.keys()) {
    if (dropped++ >= excess) break;
    centralCache.delete(k);
  }
}

/**
 * Run `fn` through the short-TTL cache. Resolved values only (a failed read is
 * never cached); TTL <= 0 bypasses the cache completely.
 *
 * Single-flight: the in-flight promise is shared, so N concurrent misses on a
 * cold key run `fn` once rather than N times. These reads are unbounded scans
 * against a central DB with no secondary indexes, so a stampede is expensive.
 */
export async function withCentralCache<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ttl = centralCacheTtlMs();
  if (ttl <= 0) return fn();
  const hit = centralCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;

  const existing = centralInFlight.get(key);
  if (existing) return existing as Promise<T>;

  const run = (async () => {
    const value = await fn();
    centralCache.set(key, { value, at: Date.now() });
    pruneCentralCache(ttl);
    return value;
  })().finally(() => {
    centralInFlight.delete(key);
  });

  centralInFlight.set(key, run);
  return run as Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared club-match-rows fetch. Almost every read here starts from "all central
// matches involving this club" — previously each function issued that query
// itself, so a composite read like centralDashboard paid for it four times.
// Fetch it once and thread the rows through the aggregate functions via their
// optional `preloadedMatchRows` parameter (absent → they fetch their own, so
// route handlers calling them individually are unchanged).
// ---------------------------------------------------------------------------

/** One central match involving the club: id + the grade/season labels. */
export interface CentralClubMatchRow {
  matchId: number;
  grade: string | null;
  season: string | null;
}

/** All central matches where the club played (home or away), fetched once. */
async function getClubMatchRows(clubId: number): Promise<CentralClubMatchRow[]> {
  return centralDb
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
}

/**
 * Career (or, when `seasonStartYear` is given, single-season) batting leaderboard
 * for a tenant club, read entirely from the central PCA database. Rows are sorted
 * games-desc to mirror the tenant endpoint.
 */
export async function centralGradeLeaderboard(
  appGrade: string,
  opts: {
    /**
     * REQUIRED tenant club filter. Never defaulted — an omitted club id must be
     * a compile error, not a silent read of another club's data.
     */
    clubId: number;
    seasonStartYear?: number;
    /**
     * Tenant crosswalk (central participant GUID -> app player id). When
     * supplied, each row's `playerId` is resolved so leaderboard players are
     * clickable and correctly separated. Built and passed by the route (the
     * crosswalk lives in the tenant DB, not central). Absent -> `playerId` 0.
     */
    intByGuid?: Map<string, number>;
    /**
     * Tenant rename overrides (GUID -> display name). Applied over the central
     * "Initial Surname" so a club's curated names show on its leaderboard.
     */
    nameByGuid?: Map<string, string>;
  },
): Promise<PlayerGradeStat[]> {
  const clubId = opts.clubId;
  return withCentralCache(
    cacheKey("centralGradeLeaderboard", [appGrade, clubId, opts]),
    () => centralGradeLeaderboardImpl(appGrade, clubId, opts),
  );
}

async function centralGradeLeaderboardImpl(
  appGrade: string,
  clubId: number,
  opts: {
    seasonStartYear?: number;
    intByGuid?: Map<string, number>;
    nameByGuid?: Map<string, string>;
  },
): Promise<PlayerGradeStat[]> {
  // 1. Central matches involving this club, narrowed to the requested app grade
  //    (and optionally a single season). Grade mapping is per-label, so resolve
  //    it in JS rather than SQL.
  const matchRows = await getClubMatchRows(clubId);

  const matchIds = matchRows
    .filter((m) => appGradeFromCentral(m.grade) === appGrade)
    .filter(
      (m) =>
        opts.seasonStartYear === undefined ||
        centralSeasonMatchesStartYear(m.season, opts.seasonStartYear),
    )
    .map((m) => m.matchId);

  if (matchIds.length === 0) return [];

  // 2. One SQL round trip replaces the old fetch-every-line-and-aggregate-in-JS
  //    approach (index-backed by (club_id, match_id) on match_batting/rosters):
  //      - `i`     classifies each of the club's batting lines exactly like
  //                classifyInnings() (see battingInningsKindSql);
  //      - `bat`   is the per-participant GROUP BY (innings excludes DNB,
  //                fifties are 50..99, hundreds 100+, matching the JS
  //                if/else-if);
  //      - hs_enc  encodes high-score-with-not-out-flag as runs*2 + notOut so a
  //                single max() picks the top score AND whether any innings of
  //                that score was not out (ties prefer the not-out, exactly
  //                like the old runs===highScore && notout promotion);
  //      - `games` counts distinct matches from batting lines (DNB included)
  //                unioned with roster lines, restricted to players who have a
  //                batting line — the same Set union the JS built;
  //      - names + privacy left-join central.players (was a 2nd round trip).
  // Fielding dismissals (catches/stumpings/run-outs) run in parallel with the
  // batting aggregate — they're keyed on the same (club, match) index and only
  // attach to players who already have a leaderboard row.
  const [result, fieldingRows] = await Promise.all([
    centralDb.execute(sql`
    with i as (
      select
        ${centralMatchBattingTable.participantId} as participant_id,
        ${centralMatchBattingTable.matchId} as match_id,
        coalesce(${centralMatchBattingTable.runs}, 0) as runs,
        ${battingInningsKindSql} as kind
      from ${centralMatchBattingTable}
      where ${centralMatchBattingTable.clubId} = ${clubId}
        and ${centralMatchBattingTable.matchId} = any(${sql.param(matchIds)})
        and ${centralMatchBattingTable.participantId} is not null
        and ${centralMatchBattingTable.participantId} <> ''
    ),
    bat as (
      select
        participant_id,
        (count(*) filter (where kind <> 'dnb'))::int as innings,
        coalesce(sum(runs) filter (where kind <> 'dnb'), 0)::int as runs,
        (count(*) filter (where kind = 'notout'))::int as not_outs,
        (count(*) filter (where kind <> 'dnb' and runs >= 100))::int as hundreds,
        (count(*) filter (where kind <> 'dnb' and runs >= 50 and runs < 100))::int as fifties,
        max(case when kind <> 'dnb' then runs * 2 + (kind = 'notout')::int end) as hs_enc
      from i
      group by participant_id
    ),
    games as (
      select participant_id, count(distinct match_id)::int as games
      from (
        select participant_id, match_id from i
        union
        select ${centralMatchRostersTable.participantId}, ${centralMatchRostersTable.matchId}
        from ${centralMatchRostersTable}
        where ${centralMatchRostersTable.clubId} = ${clubId}
          and ${centralMatchRostersTable.matchId} = any(${sql.param(matchIds)})
          and ${centralMatchRostersTable.participantId} in (select participant_id from bat)
      ) apps
      group by participant_id
    )
    select
      b.participant_id as "participantId",
      b.innings,
      b.runs,
      b.not_outs as "notOuts",
      b.hundreds,
      b.fifties,
      coalesce(b.hs_enc, 0)::int as "hsEnc",
      g.games,
      p.display_name as "displayName",
      p.is_private as "isPrivate"
    from bat b
    join games g on g.participant_id = b.participant_id
    left join ${centralPlayersTable} p on p.participant_id = b.participant_id
  `),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        kind: centralFieldingTable.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inArray(centralFieldingTable.matchId, matchIds),
        ),
      )
      .groupBy(centralFieldingTable.participantId, centralFieldingTable.kind),
  ]);
  const fieldingByPid = tallyFielding(fieldingRows);
  const aggRows = result.rows as Array<{
    participantId: string;
    innings: number;
    runs: number;
    notOuts: number;
    hundreds: number;
    fifties: number;
    hsEnc: number;
    games: number;
    displayName: string | null;
    isPrivate: number | null;
  }>;
  if (aggRows.length === 0) return [];

  // 3. Project to the PlayerGradeStat shape the endpoint contract requires.
  const rows: PlayerGradeStat[] = aggRows.map((r) => {
    const participantId = r.participantId;
    const innings = Number(r.innings);
    const runs = Number(r.runs);
    const notOuts = Number(r.notOuts);
    const hsEnc = Number(r.hsEnc);
    const highScore = hsEnc >> 1;
    const highScoreNotOut = (hsEnc & 1) === 1;
    const isPrivate = (r.isPrivate ?? 0) === 1;
    const name = isPrivate
      ? { givenName: "Private", surname: "Player" }
      : splitDisplayName(
          opts.nameByGuid?.get(participantId) ?? r.displayName ?? participantId,
        );
    const dismissals = innings - notOuts;
    const resolvedPlayerId = opts.intByGuid?.get(participantId) ?? 0;
    const fld = fieldingByPid.get(participantId);
    return {
      // Central has no per-grade-stat row id; use the resolved player id so the
      // client's React key (stat.id) stays distinct per row and the player link
      // (stat.playerId) resolves.
      id: resolvedPlayerId,
      playerId: resolvedPlayerId,
      surname: name.surname,
      givenName: name.givenName,
      grade: appGrade,
      season: null,
      games: Number(r.games),
      innings,
      notOuts,
      runs,
      batAvg: dismissals > 0 ? round2(runs / dismissals) : null,
      highScore:
        innings === 0 ? null : `${highScore}${highScoreNotOut ? "*" : ""}`,
      fifties: Number(r.fifties),
      hundreds: Number(r.hundreds),
      wickets: null,
      runsConceded: null,
      bowlAvg: null,
      bestBowling: null,
      fiveWickets: null,
      catches: fld?.catches ?? 0,
      stumpings: fld?.stumpings ?? 0,
      runOuts: fld?.runOuts ?? 0,
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
  clubId: number,
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
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<{
  players: number;
  games: number;
  runs: number;
  wickets: number;
  grades: number;
}> {
  return withCentralCache(cacheKey("centralClubTotals", [clubId]), () =>
    centralClubTotalsImpl(clubId, preloadedMatchRows),
  );
}

async function centralClubTotalsImpl(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<{
  players: number;
  games: number;
  runs: number;
  wickets: number;
  grades: number;
}> {
  const matchRows = preloadedMatchRows ?? (await getClubMatchRows(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) {
    return { players: 0, games: 0, runs: 0, wickets: 0, grades: 0 };
  }
  const grades = new Set(
    matchRows
      .map((m) => appGradeFromCentral(m.grade))
      .filter((g): g is string => Boolean(g)),
  ).size;

  // Roster counts, batting sum and bowling sum are independent given matchIds —
  // run the three round trips in parallel. The roster read is a SQL aggregate
  // now (was: fetch every roster row and count in JS): games = count(*) (one
  // appearance per roster line), players = count(distinct participant_id),
  // with nullif('') mirroring the old `.filter(Boolean)` that dropped both
  // NULL and empty-string ids.
  const [[roster], [bat], [bowl]] = await Promise.all([
    centralDb
      .select({
        games: sql<number>`count(*)::int`,
        players: sql<number>`count(distinct nullif(${centralMatchRostersTable.participantId}, ''))::int`,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inArray(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ runs: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)` })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inArray(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ wickets: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)` })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inArray(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
  ]);

  return {
    players: Number(roster?.players ?? 0),
    games: Number(roster?.games ?? 0),
    runs: Number(bat?.runs ?? 0),
    wickets: Number(bowl?.wickets ?? 0),
    grades,
  };
}

/**
 * Points awarded per result, used to DERIVE the ladder card's `points` — the
 * central `ladder` table stores no points column, so it is computed here.
 * Adjust if the association's points system differs (win 6 / tie or wash 3 is
 * the common Australian community system).
 */
const LADDER_POINTS = { win: 6, tie: 3, noResult: 3, loss: 0 } as const;

/**
 * One ladder standings row shaped for the Pack A "Ladder" social card (A7).
 * `isClub` marks the tenant's own club so the card can highlight its row.
 */
export interface CentralLadderCardRow {
  pos: number;
  team: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  isClub: boolean;
}

/**
 * Grade standings from the central `ladder` table, shaped for the Ladder card.
 * First (and currently only) consumer of `centralLadderTable`.
 *
 * IMPORTANT data-shape caveat (verified against the live central schema): the
 * central `ladder` table is an ALL-TIME cumulative record per (grade, club) —
 * it has NO `season`, `points` or position columns. Consequences:
 *   - `season` is accepted for API symmetry with the other prefill reads and
 *     forward-compat, but does NOT filter — the table carries no season
 *     dimension, so every season returns the same all-time standings today.
 *     A genuinely season-scoped ladder is a follow-up (a new central table or a
 *     matches-derived computation), out of scope for this unit.
 *   - `points` is DERIVED from won/tied/no-result via {@link LADDER_POINTS}.
 *   - `pos` is DERIVED by ordering (points, wins, net result, played, name).
 *
 * `grade` is an app grade (e.g. "A Grade"); it resolves to the central grade
 * labels that map to it (same free-text space as `matches.grade`). Because
 * several central labels ("A Grade", "A Grade: Wyllie Cup", …) fold into one
 * app grade, a club can appear more than once — we keep one row per club (its
 * fullest / most-played all-time record) so the ladder has no duplicate teams.
 * An empty ladder (no rows for the grade) returns [] — never throws.
 */
export async function centralLadder(
  clubId: number,
  season: number | null,
  grade: string,
): Promise<CentralLadderCardRow[]> {
  // season is part of the cache key (and the public contract) even though the
  // all-time table can't filter on it — see the caveat above.
  return withCentralCache(cacheKey("centralLadder", [clubId, season, grade]), () =>
    centralLadderImpl(clubId, grade),
  );
}

async function centralLadderImpl(
  clubId: number,
  grade: string,
): Promise<CentralLadderCardRow[]> {
  const rows = await centralDb
    .select({
      grade: centralLadderTable.grade,
      clubId: centralLadderTable.clubId,
      club: centralLadderTable.club,
      played: centralLadderTable.played,
      won: centralLadderTable.won,
      lost: centralLadderTable.lost,
      tied: centralLadderTable.tied,
      noResult: centralLadderTable.noResult,
    })
    .from(centralLadderTable);

  const mapped = rows.filter((r) => appGradeFromCentral(r.grade) === grade);
  if (mapped.length === 0) return [];

  // Dedupe folded labels: one row per club, keeping its most-played record.
  const bestByClub = new Map<number | string, (typeof mapped)[number]>();
  for (const r of mapped) {
    const key = r.clubId ?? `name:${r.club ?? ""}`;
    const prev = bestByClub.get(key);
    if (!prev || (r.played ?? 0) > (prev.played ?? 0)) bestByClub.set(key, r);
  }

  const ranked = [...bestByClub.values()].map((r) => {
    const won = r.won ?? 0;
    const lost = r.lost ?? 0;
    const tied = r.tied ?? 0;
    const noResult = r.noResult ?? 0;
    return {
      team: r.club ?? "",
      played: r.played ?? 0,
      won,
      lost,
      points:
        won * LADDER_POINTS.win +
        tied * LADDER_POINTS.tie +
        noResult * LADDER_POINTS.noResult +
        lost * LADDER_POINTS.loss,
      isClub: r.clubId != null && r.clubId === clubId,
    };
  });

  ranked.sort(
    (a, b) =>
      b.points - a.points ||
      b.won - a.won ||
      b.won - b.lost - (a.won - a.lost) ||
      b.played - a.played ||
      a.team.localeCompare(b.team),
  );

  return ranked.map((r, i) => ({
    pos: i + 1,
    team: r.team,
    played: r.played,
    won: r.won,
    lost: r.lost,
    points: r.points,
    isClub: r.isClub,
  }));
}

/**
 * Distinct central participants (PlayHQ GUIDs) who appeared for a club, with
 * display name + privacy flag. The source list for minting a tenant's
 * player_id_map. Unions roster, batting and bowling lines so a player who only
 * batted/bowled (no roster row) is still included.
 */
export async function centralClubParticipants(
  clubId: number,
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

/** Per-player career aggregate for a club, read from central (identity = GUID). */
export interface CentralPlayerCareer {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  games: number;
  runs: number;
  wickets: number;
  grades: string[];
}

/**
 * Career aggregates for every player a club fielded, read from the central PCA
 * database and keyed by PlayHQ `participant_id`. The API route translates the
 * GUID to the tenant's int id via player_id_map and shapes the player-directory
 * rows. Games = distinct matches the player appeared in (roster ∪ batting ∪
 * bowling); runs from batting; wickets from bowling; grades = the app grades of
 * those matches. Scorecard-era only.
 */
export async function centralPlayerCareers(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralPlayerCareer[]> {
  return withCentralCache(cacheKey("centralPlayerCareers", [clubId]), () =>
    centralPlayerCareersImpl(clubId, preloadedMatchRows),
  );
}

async function centralPlayerCareersImpl(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralPlayerCareer[]> {
  const matchRows = preloadedMatchRows ?? (await getClubMatchRows(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];

  // SQL-side aggregation (was: fetch every batting/bowling/roster line for the
  // club's whole history and fold them in a JS Map). Runs and wickets are
  // per-participant GROUP BY sums; `apps` unions the three sources' distinct
  // (participant, match) appearance pairs — the same Set-union the JS built —
  // and collapses them to one row per participant carrying the distinct match
  // count (games) and the distinct central grade LABELS of those matches. Only
  // the label -> app-grade mapping stays in JS (classifyCentralGrade is regex
  // logic that doesn't translate to SQL); it now runs on a handful of labels
  // per player instead of every raw line. The `is not null` / `<> ''` guards
  // mirror the old `if (!pid) continue` falsy check.
  const [batAgg, bowlAgg, appearanceRes] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        runs: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)::int`,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inArray(centralMatchBattingTable.matchId, matchIds),
          isNotNull(centralMatchBattingTable.participantId),
          ne(centralMatchBattingTable.participantId, ""),
        ),
      )
      .groupBy(centralMatchBattingTable.participantId),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        wickets: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)::int`,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inArray(centralMatchBowlingTable.matchId, matchIds),
          isNotNull(centralMatchBowlingTable.participantId),
          ne(centralMatchBowlingTable.participantId, ""),
        ),
      )
      .groupBy(centralMatchBowlingTable.participantId),
    centralDb.execute(sql`
      with apps as (
        select
          ${centralMatchBattingTable.participantId} as participant_id,
          ${centralMatchBattingTable.matchId} as match_id
        from ${centralMatchBattingTable}
        where ${centralMatchBattingTable.clubId} = ${clubId}
          and ${centralMatchBattingTable.matchId} = any(${sql.param(matchIds)})
          and ${centralMatchBattingTable.participantId} is not null
          and ${centralMatchBattingTable.participantId} <> ''
        union
        select
          ${centralMatchBowlingTable.participantId},
          ${centralMatchBowlingTable.matchId}
        from ${centralMatchBowlingTable}
        where ${centralMatchBowlingTable.clubId} = ${clubId}
          and ${centralMatchBowlingTable.matchId} = any(${sql.param(matchIds)})
          and ${centralMatchBowlingTable.participantId} is not null
          and ${centralMatchBowlingTable.participantId} <> ''
        union
        select
          ${centralMatchRostersTable.participantId},
          ${centralMatchRostersTable.matchId}
        from ${centralMatchRostersTable}
        where ${centralMatchRostersTable.clubId} = ${clubId}
          and ${centralMatchRostersTable.matchId} = any(${sql.param(matchIds)})
          and ${centralMatchRostersTable.participantId} is not null
          and ${centralMatchRostersTable.participantId} <> ''
      )
      select
        a.participant_id as "participantId",
        count(distinct a.match_id)::int as games,
        json_agg(distinct m.grade) as "gradeLabels"
      from apps a
      join ${centralMatchesTable} m on m.match_id = a.match_id
      group by a.participant_id
    `),
  ]);
  const appearances = appearanceRes.rows as Array<{
    participantId: string;
    games: number;
    gradeLabels: (string | null)[] | null;
  }>;
  if (appearances.length === 0) return [];
  const runsByPid = new Map(batAgg.map((b) => [b.participantId, Number(b.runs)]));
  const wktsByPid = new Map(bowlAgg.map((b) => [b.participantId, Number(b.wickets)]));

  const ids = appearances.map((a) => a.participantId);
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inArray(centralPlayersTable.participantId, ids));
  const byId = new Map(players.map((p) => [p.participantId, p]));

  return appearances.map((a) => {
    const p = byId.get(a.participantId);
    const grades = [
      ...new Set(
        (a.gradeLabels ?? [])
          .map((g) => appGradeFromCentral(g))
          .filter((g): g is string => Boolean(g)),
      ),
    ].sort();
    return {
      participantId: a.participantId,
      displayName: p?.displayName ?? null,
      isPrivate: (p?.isPrivate ?? 0) === 1,
      games: Number(a.games),
      runs: runsByPid.get(a.participantId) ?? 0,
      wickets: wktsByPid.get(a.participantId) ?? 0,
      grades,
    };
  });
}

/** One central player's club career: name + totals + per-grade PlayerGradeStat[]. */
export interface CentralPlayerDetail {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  games: number;
  runs: number;
  wickets: number;
  grades: string[];
  stats: PlayerGradeStat[];
}

/**
 * One player's career for a club, read from central and shaped as the player
 * detail page's per-grade `stats[]` (batting + bowling) plus career totals.
 * Keyed by participant GUID; the route translates the tenant int id → GUID via
 * player_id_map first. Returns null when the participant has no lines for the
 * club. Fielding/curated bits (premierships/awards) are not central — the route
 * returns them empty for central tenants. Scorecard-era only.
 */
export async function centralPlayerDetail(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerDetail | null> {
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
  if (matchIds.length === 0) return null;
  const matchGrade = new Map(
    matchRows.map((m) => [m.matchId, appGradeFromCentral(m.grade)]),
  );

  const [batting, bowling, rosters, players] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          eq(centralMatchBattingTable.participantId, participantId),
          inArray(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          eq(centralMatchBowlingTable.participantId, participantId),
          inArray(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ matchId: centralMatchRostersTable.matchId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          eq(centralMatchRostersTable.participantId, participantId),
          inArray(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        displayName: centralPlayersTable.displayName,
        isPrivate: centralPlayersTable.isPrivate,
      })
      .from(centralPlayersTable)
      .where(eq(centralPlayersTable.participantId, participantId)),
  ]);

  interface G {
    games: Set<number>;
    innings: number;
    notOuts: number;
    runs: number;
    fifties: number;
    hundreds: number;
    hs: number;
    hsNotOut: boolean;
    wickets: number;
    runsConceded: number;
    bestW: number;
    bestR: number;
    fiveW: number;
  }
  const byGrade = new Map<string, G>();
  const grp = (grade: string): G => {
    let a = byGrade.get(grade);
    if (!a) {
      a = {
        games: new Set(),
        innings: 0,
        notOuts: 0,
        runs: 0,
        fifties: 0,
        hundreds: 0,
        hs: 0,
        hsNotOut: false,
        wickets: 0,
        runsConceded: 0,
        bestW: 0,
        bestR: 0,
        fiveW: 0,
      };
      byGrade.set(grade, a);
    }
    return a;
  };

  for (const r of rosters) {
    if (r.matchId === null) continue;
    const grade = matchGrade.get(r.matchId);
    if (grade) grp(grade).games.add(r.matchId);
  }
  for (const b of batting) {
    if (b.matchId === null) continue;
    const grade = matchGrade.get(b.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(b.matchId);
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind !== "dnb") {
      const runs = b.runs ?? 0;
      a.innings += 1;
      a.runs += runs;
      if (kind === "notout") a.notOuts += 1;
      if (runs >= 100) a.hundreds += 1;
      else if (runs >= 50) a.fifties += 1;
      if (runs > a.hs) {
        a.hs = runs;
        a.hsNotOut = kind === "notout";
      } else if (runs === a.hs && kind === "notout") {
        a.hsNotOut = true;
      }
    }
  }
  for (const bw of bowling) {
    if (bw.matchId === null) continue;
    const grade = matchGrade.get(bw.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(bw.matchId);
    const w = bw.wickets ?? 0;
    const r = bw.runs ?? 0;
    a.wickets += w;
    a.runsConceded += r;
    if (w >= 5) a.fiveW += 1;
    if (w > a.bestW || (w === a.bestW && w > 0 && r < a.bestR)) {
      a.bestW = w;
      a.bestR = r;
    }
  }

  const stats: PlayerGradeStat[] = [...byGrade.entries()]
    .map(([grade, a]) => {
      const dismissals = a.innings - a.notOuts;
      return {
        id: 0,
        playerId: 0,
        surname: "",
        givenName: "",
        grade,
        season: null,
        games: a.games.size,
        innings: a.innings,
        notOuts: a.notOuts,
        runs: a.runs,
        batAvg: dismissals > 0 ? round2(a.runs / dismissals) : null,
        highScore: a.innings === 0 ? null : `${a.hs}${a.hsNotOut ? "*" : ""}`,
        fifties: a.fifties,
        hundreds: a.hundreds,
        wickets: a.wickets,
        runsConceded: a.runsConceded,
        bowlAvg: a.wickets > 0 ? round2(a.runsConceded / a.wickets) : null,
        bestBowling: a.bestW > 0 ? `${a.bestW}/${a.bestR}` : null,
        fiveWickets: a.fiveW,
        catches: null,
        stumpings: null,
        runOuts: null,
      };
    })
    .sort((x, y) => x.grade.localeCompare(y.grade));

  if (stats.length === 0) return null;

  return {
    participantId,
    displayName: players[0]?.displayName ?? null,
    isPrivate: (players[0]?.isPrivate ?? 0) === 1,
    games: stats.reduce((s, r) => s + (r.games ?? 0), 0),
    runs: stats.reduce((s, r) => s + (r.runs ?? 0), 0),
    wickets: stats.reduce((s, r) => s + (r.wickets ?? 0), 0),
    grades: stats.map((s) => s.grade),
    stats,
  };
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

/** Parse a central season text ("Summer 2002/03") to the app's int start year. */
function parseSeasonStartYear(season: string | null): number | null {
  if (!season) return null;
  const m = /(\d{4})/.exec(season);
  return m ? Number(m[1]) : null;
}

/** Parse a central round text to an int round, or null for finals/unparseable. */
function parseRound(round: string | null): number | null {
  if (!round) return null;
  if (/final|semi|grand|qualif|elimin|prelim/i.test(round)) return null;
  const m = /(\d+)/.exec(round);
  return m ? Number(m[1]) : null;
}

/** Map a central round/comp text to the app's MatchStage, or null for non-finals. */
function parseStage(text: string | null): string | null {
  if (!text) return null;
  if (/grand\s*final/i.test(text)) return "Grand Final";
  if (/qualif/i.test(text)) return "Qualifying Final";
  if (/elimin/i.test(text)) return "Elimination Final";
  if (/prelim/i.test(text)) return "Preliminary Final";
  if (/semi/i.test(text)) return "Semi Final";
  if (/\bfinal\b/i.test(text)) return "Grand Final";
  return null;
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
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );
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
    or(
      eq(centralMatchesTable.homeClubId, clubId),
      eq(centralMatchesTable.awayClubId, clubId),
    ),
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
          inArray(centralMatchRostersTable.matchId, matchIds),
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
        .where(inArray(centralPlayersTable.participantId, [...perfIds]))
    : [];
  const playerById = new Map(players.map((p) => [p.participantId, p]));
  const nameOf = (participantId: string): string | null => {
    const p = playerById.get(participantId);
    if ((p?.isPrivate ?? 0) === 1) return null;
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

/** One row of a player's per-(grade, season) breakdown — native
 *  /players/:id/seasons shape (zeros collapse to null like the SQL NULLIFs). */
export interface CentralPlayerSeasonRow {
  grade: string;
  season: number;
  games: number | null;
  innings: number | null;
  notOuts: number | null;
  runs: number | null;
  batAvg: number | null;
  highScore: string | null;
  fifties: number | null;
  hundreds: number | null;
  wickets: number | null;
  runsConceded: number | null;
  bowlAvg: number | null;
  bestBowling: string | null;
  fiveWickets: number | null;
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
}

/** Private players get no public career breakdown ([] — same as no data). */
async function isPrivateParticipant(participantId: string): Promise<boolean> {
  const [p] = await centralDb
    .select({ isPrivate: centralPlayersTable.isPrivate })
    .from(centralPlayersTable)
    .where(eq(centralPlayersTable.participantId, participantId));
  return (p?.isPrivate ?? 0) === 1;
}

/**
 * A club player's per-(grade, season) career breakdown from central, mirroring
 * the native /players/:id/seasons rows (which the season-history tab renders).
 * Grades map via classifyCentralGrade; unmapped grades and unparseable seasons
 * are excluded, like every other central read.
 */
export async function centralPlayerSeasons(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerSeasonRow[]> {
  if (await isPrivateParticipant(participantId)) return [];

  const matchRows = await getClubMatchRows(clubId);
  const keyOfMatch = new Map<number, { grade: string; season: number }>();
  for (const m of matchRows) {
    const grade = appGradeFromCentral(m.grade);
    const season = parseSeasonStartYear(m.season);
    if (!grade || season === null) continue;
    keyOfMatch.set(m.matchId, { grade, season });
  }
  if (keyOfMatch.size === 0) return [];
  const matchIds = [...keyOfMatch.keys()];

  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          eq(centralMatchBattingTable.participantId, participantId),
          inArray(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          eq(centralMatchBowlingTable.participantId, participantId),
          inArray(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ matchId: centralMatchRostersTable.matchId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          eq(centralMatchRostersTable.participantId, participantId),
          inArray(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          eq(centralFieldingTable.participantId, participantId),
          inArray(centralFieldingTable.matchId, matchIds),
        ),
      ),
  ]);

  interface Agg {
    games: Set<number>;
    innings: number;
    notOuts: number;
    runs: number;
    fifties: number;
    hundreds: number;
    hs: number;
    hsNotOut: boolean;
    hasBat: boolean;
    wickets: number;
    runsConceded: number;
    bestW: number;
    bestR: number;
    fiveW: number;
    catches: number;
    stumpings: number;
    runOuts: number;
  }
  const byKey = new Map<string, { grade: string; season: number; a: Agg }>();
  const grp = (matchId: number | null): Agg | null => {
    if (matchId === null) return null;
    const key = keyOfMatch.get(matchId);
    if (!key) return null;
    const k = `${key.grade}|${key.season}`;
    let e = byKey.get(k);
    if (!e) {
      e = {
        grade: key.grade,
        season: key.season,
        a: {
          games: new Set(),
          innings: 0,
          notOuts: 0,
          runs: 0,
          fifties: 0,
          hundreds: 0,
          hs: -1,
          hsNotOut: false,
          hasBat: false,
          wickets: 0,
          runsConceded: 0,
          bestW: -1,
          bestR: -1,
          fiveW: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
        },
      };
      byKey.set(k, e);
    }
    return e.a;
  };

  for (const r of rosters) {
    const a = grp(r.matchId);
    if (a && r.matchId !== null) a.games.add(r.matchId);
  }
  for (const b of batting) {
    const a = grp(b.matchId);
    if (!a || b.matchId === null) continue;
    a.games.add(b.matchId);
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind === "dnb") continue;
    const runs = b.runs ?? 0;
    a.hasBat = true;
    a.innings += 1;
    a.runs += runs;
    if (kind === "notout") a.notOuts += 1;
    if (runs >= 100) a.hundreds += 1;
    else if (runs >= 50) a.fifties += 1;
    if (runs > a.hs || (runs === a.hs && kind === "notout" && !a.hsNotOut)) {
      a.hs = runs;
      a.hsNotOut = kind === "notout";
    }
  }
  for (const b of bowling) {
    const a = grp(b.matchId);
    if (!a || b.matchId === null) continue;
    a.games.add(b.matchId);
    const w = b.wickets ?? 0;
    const r = b.runs ?? 0;
    a.wickets += w;
    a.runsConceded += r;
    if (w >= 5) a.fiveW += 1;
    if (w > a.bestW || (w === a.bestW && r < a.bestR)) {
      a.bestW = w;
      a.bestR = r;
    }
  }
  for (const f of fielding) {
    const a = grp(f.matchId);
    if (!a) continue;
    const cls = classifyFieldingKind(f.kind);
    if (cls === "catch") a.catches += 1;
    else if (cls === "stumping") a.stumpings += 1;
    else if (cls === "runOut") a.runOuts += 1;
  }

  const nz = (n: number): number | null => (n === 0 ? null : n);
  return [...byKey.values()]
    .map(({ grade, season, a }) => {
      const dismissals = a.innings - a.notOuts;
      return {
        grade,
        season,
        games: nz(a.games.size),
        innings: nz(a.innings),
        notOuts: nz(a.notOuts),
        runs: nz(a.runs),
        batAvg: dismissals > 0 ? a.runs / dismissals : null,
        highScore: a.hasBat && a.hs >= 0 ? `${a.hs}${a.hsNotOut ? "*" : ""}` : null,
        fifties: nz(a.fifties),
        hundreds: nz(a.hundreds),
        wickets: nz(a.wickets),
        runsConceded: nz(a.runsConceded),
        bowlAvg: a.wickets > 0 ? a.runsConceded / a.wickets : null,
        bestBowling: a.bestW >= 0 ? `${a.bestW}/${Math.max(a.bestR, 0)}` : null,
        fiveWickets: nz(a.fiveW),
        catches: nz(a.catches),
        stumpings: nz(a.stumpings),
        runOuts: nz(a.runOuts),
      };
    })
    .sort((x, y) => x.grade.localeCompare(y.grade) || x.season - y.season);
}

/** One row of a player's game-by-game log — native /players/:id/matches shape. */
export interface CentralPlayerMatchRow {
  matchId: number;
  grade: string;
  season: number;
  round: number | null;
  stage: string | null;
  matchDate: string | null;
  opponent: string | null;
  venue: string | null;
  result: string | null;
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
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
}

/**
 * A club player's game-by-game match log from central, mirroring the native
 * /players/:id/matches rows. Two-innings matches collapse to one row (sums;
 * first-innings batting position/dismissal), matching the one-line-per-match
 * native table. Sorted newest first (season, then round).
 */
export async function centralPlayerMatchLog(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerMatchRow[]> {
  if (await isPrivateParticipant(participantId)) return [];

  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        innings: centralMatchBattingTable.innings,
        batOrder: centralMatchBattingTable.batOrder,
        runs: centralMatchBattingTable.runs,
        balls: centralMatchBattingTable.balls,
        fours: centralMatchBattingTable.fours,
        sixes: centralMatchBattingTable.sixes,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          eq(centralMatchBattingTable.participantId, participantId),
        ),
      ),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        overs: centralMatchBowlingTable.overs,
        maidens: centralMatchBowlingTable.maidens,
        runs: centralMatchBowlingTable.runs,
        wickets: centralMatchBowlingTable.wickets,
        wides: centralMatchBowlingTable.wides,
        noBalls: centralMatchBowlingTable.noBalls,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          eq(centralMatchBowlingTable.participantId, participantId),
        ),
      ),
    centralDb
      .select({ matchId: centralMatchRostersTable.matchId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          eq(centralMatchRostersTable.participantId, participantId),
        ),
      ),
    centralDb
      .select({
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          eq(centralFieldingTable.participantId, participantId),
        ),
      ),
  ]);

  const playedIds = new Set<number>();
  for (const rows of [batting, bowling, rosters, fielding])
    for (const r of rows) if (r.matchId !== null) playedIds.add(r.matchId);
  if (playedIds.size === 0) return [];

  const matches = await centralDb
    .select()
    .from(centralMatchesTable)
    .where(
      and(
        or(
          eq(centralMatchesTable.homeClubId, clubId),
          eq(centralMatchesTable.awayClubId, clubId),
        ),
        inArray(centralMatchesTable.matchId, [...playedIds]),
      ),
    );

  const out: CentralPlayerMatchRow[] = [];
  for (const m of matches) {
    const grade = appGradeFromCentral(m.grade);
    const season = parseSeasonStartYear(m.season);
    if (!grade || season === null) continue;

    const isHome = m.homeClubId === clubId;
    const batLines = batting
      .filter((b) => b.matchId === m.matchId)
      .sort((a, b) => (a.innings ?? 0) - (b.innings ?? 0));
    const played = batLines.filter(
      (b) => classifyInnings(b.dismissalType, b.dismissal) !== "dnb",
    );
    const bowlLines = bowling.filter((b) => b.matchId === m.matchId);
    const fld = emptyFieldingTally();
    for (const f of fielding) {
      if (f.matchId !== m.matchId) continue;
      const cls = classifyFieldingKind(f.kind);
      if (cls === "catch") fld.catches += 1;
      else if (cls === "stumping") fld.stumpings += 1;
      else if (cls === "runOut") fld.runOuts += 1;
    }

    const sumOf = <T>(rows: T[], pick: (r: T) => number | null): number | null => {
      let any = false;
      let total = 0;
      for (const r of rows) {
        const v = pick(r);
        if (v !== null) {
          any = true;
          total += v;
        }
      }
      return any ? total : null;
    };

    const lastBat = played[played.length - 1];
    const totalOvers = sumOf(bowlLines, (b) => b.overs);
    out.push({
      matchId: m.matchId,
      grade,
      season,
      round: parseRound(m.round),
      stage: parseStage(m.round),
      matchDate: m.matchDate,
      opponent: isHome ? m.awayTeam : m.homeTeam,
      venue: m.venue,
      result:
        m.resultText ??
        (m.winnerClubId == null ? null : m.winnerClubId === clubId ? "Won" : "Lost"),
      batted: played.length > 0,
      battingPos: played[0]?.batOrder ?? null,
      runs: sumOf(played, (b) => b.runs),
      balls: sumOf(played, (b) => b.balls),
      fours: sumOf(played, (b) => b.fours),
      sixes: sumOf(played, (b) => b.sixes),
      notOut:
        lastBat !== undefined &&
        classifyInnings(lastBat.dismissalType, lastBat.dismissal) === "notout",
      dismissal: played.map((b) => b.dismissal).filter(Boolean).join("; ") || null,
      bowled: bowlLines.length > 0,
      overs: totalOvers === null ? null : String(totalOvers),
      maidens: sumOf(bowlLines, (b) => b.maidens),
      runsConceded: sumOf(bowlLines, (b) => b.runs),
      wickets: sumOf(bowlLines, (b) => b.wickets),
      wides: sumOf(bowlLines, (b) => b.wides),
      noBalls: sumOf(bowlLines, (b) => b.noBalls),
      catches: fld.catches || null,
      stumpings: fld.stumpings || null,
      runOuts: fld.runOuts || null,
    });
  }

  out.sort(
    (a, b) => b.season - a.season || (b.round ?? -1) - (a.round ?? -1) || b.matchId - a.matchId,
  );
  return out;
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
      isPrivate: (p?.isPrivate ?? 0) === 1,
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

/** Distinct season start-years a club played, newest-first (for the season picker). */
export async function centralClubSeasons(clubId: number): Promise<number[]> {
  const rows = await centralDb
    .select({ season: centralMatchesTable.season })
    .from(centralMatchesTable)
    .where(
      or(
        eq(centralMatchesTable.homeClubId, clubId),
        eq(centralMatchesTable.awayClubId, clubId),
      ),
    );
  const set = new Set<number>();
  for (const r of rows) {
    const y = parseSeasonStartYear(r.season);
    if (y !== null) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

/** A season's top run-scorers / wicket-takers for a club, from central (top 5,
 *  private players excluded). Keyed by participant GUID; route maps to int id.
 *  Optional `appGrade` narrows to matches whose central grade maps to it. */
export async function centralSeasonLeaders(
  clubId: number,
  season: number,
  metric: "runs" | "wickets",
  appGrade?: string,
): Promise<{ participantId: string; displayName: string | null; value: number }[]> {
  return centralLeadersImpl(clubId, metric, { season, appGrade });
}

/** All-time (career) top run-scorers / wicket-takers for a club, from central
 *  (top 5, private players excluded). Optional `appGrade` filter as above. */
export async function centralAllTimeLeaders(
  clubId: number,
  metric: "runs" | "wickets",
  appGrade?: string,
): Promise<{ participantId: string; displayName: string | null; value: number }[]> {
  return centralLeadersImpl(clubId, metric, { appGrade });
}

/**
 * Distinct app grades a club's central matches map to, optionally narrowed to
 * one season. Feeds the Top Performers grade-filter chips.
 */
export async function centralGradesForSeason(
  clubId: number,
  season: number | null,
): Promise<string[]> {
  const matchRows = await getClubMatchRows(clubId);
  const grades = new Set<string>();
  for (const m of matchRows) {
    if (season !== null && parseSeasonStartYear(m.season) !== season) continue;
    const g = appGradeFromCentral(m.grade);
    if (g) grades.add(g);
  }
  return [...grades].sort((a, b) => a.localeCompare(b));
}

async function centralLeadersImpl(
  clubId: number,
  metric: "runs" | "wickets",
  opts: { season?: number; appGrade?: string },
): Promise<{ participantId: string; displayName: string | null; value: number }[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows
    .filter(
      (m) =>
        opts.season === undefined || parseSeasonStartYear(m.season) === opts.season,
    )
    .filter(
      (m) => opts.appGrade === undefined || appGradeFromCentral(m.grade) === opts.appGrade,
    )
    .map((m) => m.matchId);
  if (matchIds.length === 0) return [];

  const agg =
    metric === "runs"
      ? await centralDb
          .select({
            participantId: centralMatchBattingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)`,
          })
          .from(centralMatchBattingTable)
          .where(
            and(
              eq(centralMatchBattingTable.clubId, clubId),
              inArray(centralMatchBattingTable.matchId, matchIds),
            ),
          )
          .groupBy(centralMatchBattingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBattingTable.runs}), 0)`))
          .limit(25)
      : await centralDb
          .select({
            participantId: centralMatchBowlingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`,
          })
          .from(centralMatchBowlingTable)
          .where(
            and(
              eq(centralMatchBowlingTable.clubId, clubId),
              inArray(centralMatchBowlingTable.matchId, matchIds),
            ),
          )
          .groupBy(centralMatchBowlingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`))
          .limit(25);

  const ids = agg
    .map((a) => a.participantId)
    .filter((p): p is string => Boolean(p));
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

  const out: { participantId: string; displayName: string | null; value: number }[] = [];
  for (const a of agg) {
    if (!a.participantId) continue;
    const p = byId.get(a.participantId);
    if ((p?.isPrivate ?? 0) === 1) continue; // private excluded from leaderboards
    const value = Number(a.value ?? 0);
    if (value <= 0) continue;
    out.push({ participantId: a.participantId, displayName: p?.displayName ?? null, value });
    if (out.length >= 5) break;
  }
  return out;
}

/** A grade's season leaders for the Club Runs/Wickets leaderboard card
 *  (A19/A20). Each of `topRunScorer` / `topWicketTaker` is one card row
 *  ({gradeLabel, playerName, value}); the card picks the category. */
export interface CentralClubSeasonGradeLeaders {
  gradeLabel: string;
  topRunScorer: { playerName: string; value: number } | null;
  topWicketTaker: { playerName: string; value: number } | null;
}

/**
 * Season-scoped, per-grade version of {@link centralClubTotals} for the Club
 * Leaderboard card (A19/A20). For each senior grade the club fielded in the
 * season it returns the top run scorer and top wicket taker (name + value), so
 * the card can render its four rows for either category.
 *
 * Seniors-only by construction: junior grades never exist in central data and
 * `appGradeFromCentral` returns null for anything it can't map, so junior
 * grades are excluded from this senior prefill (R20).
 *
 * Fill-in exclusion (`playerId >= 90000`) is inherited from upstream: central
 * identifies players by PlayHQ GUID (no int fill-in sentinel exists), and the
 * batting/bowling reads already drop null/empty participant ids — so there is
 * no fill-in floor to apply here, and none is silently introduced. Private
 * players are excluded from the leader picks (same rule as the leaderboards).
 */
export async function centralClubTotalsBySeason(
  clubId: number,
  season: number,
): Promise<CentralClubSeasonGradeLeaders[]> {
  return withCentralCache(
    cacheKey("centralClubTotalsBySeason", [clubId, season]),
    () => centralClubTotalsBySeasonImpl(clubId, season),
  );
}

async function centralClubTotalsBySeasonImpl(
  clubId: number,
  season: number,
): Promise<CentralClubSeasonGradeLeaders[]> {
  const matchRows = await getClubMatchRows(clubId);
  const gradeMatchIds = new Map<string, number[]>();
  for (const m of matchRows) {
    if (parseSeasonStartYear(m.season) !== season) continue;
    const g = appGradeFromCentral(m.grade);
    if (!g) continue; // unmapped / junior grades never contribute (R20)
    const arr = gradeMatchIds.get(g);
    if (arr) arr.push(m.matchId);
    else gradeMatchIds.set(g, [m.matchId]);
  }
  if (gradeMatchIds.size === 0) return [];

  const grades = [...gradeMatchIds.keys()].sort((a, b) => a.localeCompare(b));

  // Per grade: a few top run scorers + wicket takers, so a private top scorer
  // can be skipped (mirrors centralLeadersImpl's top-N-then-filter).
  const perGrade = await Promise.all(
    grades.map(async (grade) => {
      const ids = gradeMatchIds.get(grade) ?? [];
      const [batAgg, bowlAgg] = await Promise.all([
        centralDb
          .select({
            participantId: centralMatchBattingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)`,
          })
          .from(centralMatchBattingTable)
          .where(
            and(
              eq(centralMatchBattingTable.clubId, clubId),
              inArray(centralMatchBattingTable.matchId, ids),
            ),
          )
          .groupBy(centralMatchBattingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBattingTable.runs}), 0)`))
          .limit(5),
        centralDb
          .select({
            participantId: centralMatchBowlingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`,
          })
          .from(centralMatchBowlingTable)
          .where(
            and(
              eq(centralMatchBowlingTable.clubId, clubId),
              inArray(centralMatchBowlingTable.matchId, ids),
            ),
          )
          .groupBy(centralMatchBowlingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`))
          .limit(5),
      ]);
      return { grade, batAgg, bowlAgg };
    }),
  );

  // One round trip resolves display names + privacy for every candidate.
  const ids = new Set<string>();
  for (const g of perGrade) {
    for (const r of g.batAgg) if (r.participantId) ids.add(r.participantId);
    for (const r of g.bowlAgg) if (r.participantId) ids.add(r.participantId);
  }
  const players = ids.size
    ? await centralDb
        .select({
          participantId: centralPlayersTable.participantId,
          displayName: centralPlayersTable.displayName,
          isPrivate: centralPlayersTable.isPrivate,
        })
        .from(centralPlayersTable)
        .where(inArray(centralPlayersTable.participantId, [...ids]))
    : [];
  const byId = new Map(players.map((p) => [p.participantId, p]));

  const pick = (
    agg: { participantId: string | null; value: number }[],
  ): { playerName: string; value: number } | null => {
    for (const a of agg) {
      if (!a.participantId) continue;
      const p = byId.get(a.participantId);
      if ((p?.isPrivate ?? 0) === 1) continue; // private excluded
      const value = Number(a.value ?? 0);
      if (value <= 0) continue;
      const name = p?.displayName?.trim();
      return { playerName: name && name.length ? name : a.participantId, value };
    }
    return null;
  };

  return perGrade.map((g) => ({
    gradeLabel: g.grade,
    topRunScorer: pick(g.batAgg),
    topWicketTaker: pick(g.bowlAgg),
  }));
}

/** A club-record holder (top player for a counting stat). */
export interface CentralRecordHolder {
  participantId: string;
  displayName: string | null;
  value: number;
  grades: string[];
}
/** A single-innings club record (highest score / best bowling). */
export interface CentralRecordInnings {
  participantId: string;
  displayName: string | null;
  grade: string | null;
  value: string; // "107*" or "5/12"
}

export interface CentralClubRecords {
  mostGames: CentralRecordHolder | null;
  mostRuns: CentralRecordHolder | null;
  mostWickets: CentralRecordHolder | null;
  mostCatches: CentralRecordHolder | null;
  mostFifties: CentralRecordHolder | null;
  mostHundreds: CentralRecordHolder | null;
  highestScore: CentralRecordInnings | null;
  bestBowling: CentralRecordInnings | null;
}

/**
 * All-time club records from central: most games/runs/wickets/catches/50s/100s
 * (top non-private player), plus the highest individual score and best bowling
 * (single innings). Keyed by participant GUID; the route maps the holders' ids
 * via player_id_map. Scorecard-era only.
 */
export async function centralClubRecords(clubId: number): Promise<CentralClubRecords> {
  return withCentralCache(cacheKey("centralClubRecords", [clubId]), () =>
    centralClubRecordsImpl(clubId),
  );
}

async function centralClubRecordsImpl(clubId: number): Promise<CentralClubRecords> {
  // Deliberately still JS-aggregated (unlike centralGradeLeaderboard): the
  // single-innings records (highestScore / bestBowling) and every topBy()
  // holder resolve ties by FIRST-encountered row/insertion order, which is the
  // database's unspecified fetch order — a SQL `order by ... limit 1` would
  // silently pick a different (if equally arbitrary) holder on ties, and this
  // read is cold + cached. The fetches below are already minimal-column;
  // fielding is additionally grouped to counts per (participant, kind) so the
  // catch regex runs per distinct kind instead of per row.
  const matchRows = await getClubMatchRows(clubId);
  const empty: CentralClubRecords = {
    mostGames: null, mostRuns: null, mostWickets: null, mostCatches: null,
    mostFifties: null, mostHundreds: null, highestScore: null, bestBowling: null,
  };
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return empty;
  const matchGrade = new Map(matchRows.map((m) => [m.matchId, appGradeFromCentral(m.grade)]));

  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb.select({
      participantId: centralMatchBattingTable.participantId,
      matchId: centralMatchBattingTable.matchId,
      runs: centralMatchBattingTable.runs,
      dismissal: centralMatchBattingTable.dismissal,
      dismissalType: centralMatchBattingTable.dismissalType,
    }).from(centralMatchBattingTable).where(and(eq(centralMatchBattingTable.clubId, clubId), inArray(centralMatchBattingTable.matchId, matchIds))),
    centralDb.select({
      participantId: centralMatchBowlingTable.participantId,
      matchId: centralMatchBowlingTable.matchId,
      wickets: centralMatchBowlingTable.wickets,
      runs: centralMatchBowlingTable.runs,
    }).from(centralMatchBowlingTable).where(and(eq(centralMatchBowlingTable.clubId, clubId), inArray(centralMatchBowlingTable.matchId, matchIds))),
    centralDb.select({
      participantId: centralMatchRostersTable.participantId,
      matchId: centralMatchRostersTable.matchId,
    }).from(centralMatchRostersTable).where(and(eq(centralMatchRostersTable.clubId, clubId), inArray(centralMatchRostersTable.matchId, matchIds))),
    centralDb.select({
      participantId: centralFieldingTable.participantId,
      kind: centralFieldingTable.kind,
      n: sql<number>`count(*)::int`,
    }).from(centralFieldingTable).where(and(eq(centralFieldingTable.clubId, clubId), inArray(centralFieldingTable.matchId, matchIds)))
      .groupBy(centralFieldingTable.participantId, centralFieldingTable.kind),
  ]);

  interface Agg {
    games: Set<number>; runs: number; wickets: number; catches: number;
    fifties: number; hundreds: number; grades: Set<string>;
  }
  const agg = new Map<string, Agg>();
  const get = (pid: string): Agg => {
    let a = agg.get(pid);
    if (!a) { a = { games: new Set(), runs: 0, wickets: 0, catches: 0, fifties: 0, hundreds: 0, grades: new Set() }; agg.set(pid, a); }
    return a;
  };
  const addGrade = (a: Agg, matchId: number) => { const g = matchGrade.get(matchId); if (g) a.grades.add(g); };

  let bestScore: { participantId: string; grade: string | null; runs: number; notOut: boolean } | null = null;
  for (const b of batting) {
    if (!b.participantId || b.matchId === null) continue;
    const a = get(b.participantId);
    a.games.add(b.matchId); addGrade(a, b.matchId);
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind === "dnb") continue;
    const runs = b.runs ?? 0;
    a.runs += runs;
    if (runs >= 100) a.hundreds += 1; else if (runs >= 50) a.fifties += 1;
    if (!bestScore || runs > bestScore.runs) {
      bestScore = { participantId: b.participantId, grade: matchGrade.get(b.matchId) ?? null, runs, notOut: kind === "notout" };
    }
  }
  let bestBowl: { participantId: string; grade: string | null; wkts: number; runs: number } | null = null;
  for (const b of bowling) {
    if (!b.participantId || b.matchId === null) continue;
    const a = get(b.participantId);
    a.games.add(b.matchId); addGrade(a, b.matchId);
    const w = b.wickets ?? 0; const r = b.runs ?? 0;
    a.wickets += w;
    if (!bestBowl || w > bestBowl.wkts || (w === bestBowl.wkts && w > 0 && r < bestBowl.runs)) {
      if (w > 0) bestBowl = { participantId: b.participantId, grade: matchGrade.get(b.matchId) ?? null, wkts: w, runs: r };
    }
  }
  for (const r of rosters) {
    if (!r.participantId || r.matchId === null) continue;
    const a = get(r.participantId); a.games.add(r.matchId); addGrade(a, r.matchId);
  }
  for (const f of fielding) {
    if (!f.participantId) continue;
    if (/catch|caught|^c$|^c\b/i.test(f.kind ?? "")) get(f.participantId).catches += Number(f.n);
  }

  const ids = [...agg.keys()];
  const players = ids.length
    ? await centralDb.select({
        participantId: centralPlayersTable.participantId,
        displayName: centralPlayersTable.displayName,
        isPrivate: centralPlayersTable.isPrivate,
      }).from(centralPlayersTable).where(inArray(centralPlayersTable.participantId, ids))
    : [];
  const byId = new Map(players.map((p) => [p.participantId, p]));
  const isPrivate = (pid: string) => (byId.get(pid)?.isPrivate ?? 0) === 1;
  const nameOf = (pid: string) => byId.get(pid)?.displayName ?? null;

  const topBy = (pick: (a: Agg) => number): CentralRecordHolder | null => {
    let best: { pid: string; value: number; a: Agg } | null = null;
    for (const [pid, a] of agg) {
      if (isPrivate(pid)) continue;
      const value = pick(a);
      if (value <= 0) continue;
      if (!best || value > best.value) best = { pid, value, a };
    }
    return best
      ? { participantId: best.pid, displayName: nameOf(best.pid), value: best.value, grades: [...best.a.grades].sort() }
      : null;
  };

  return {
    mostGames: topBy((a) => a.games.size),
    mostRuns: topBy((a) => a.runs),
    mostWickets: topBy((a) => a.wickets),
    mostCatches: topBy((a) => a.catches),
    mostFifties: topBy((a) => a.fifties),
    mostHundreds: topBy((a) => a.hundreds),
    highestScore:
      bestScore && !isPrivate(bestScore.participantId)
        ? { participantId: bestScore.participantId, displayName: nameOf(bestScore.participantId), grade: bestScore.grade, value: `${bestScore.runs}${bestScore.notOut ? "*" : ""}` }
        : null,
    bestBowling:
      bestBowl && !isPrivate(bestBowl.participantId)
        ? { participantId: bestBowl.participantId, displayName: nameOf(bestBowl.participantId), grade: bestBowl.grade, value: `${bestBowl.wkts}/${bestBowl.runs}` }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Central reads for the endpoints that were missed in the first migration pass
// (dashboard, grades, centuries, five-wicket hauls, milestones). All seniors-
// only and scorecard-era (2002/03+), keyed by central club id; routes map the
// participant GUIDs to tenant int ids via player_id_map where they need them.
// ---------------------------------------------------------------------------

/** One grade's club-wide aggregate, matching the app's grade_summaries shape. */
export interface CentralGradeSummary {
  grade: string;
  players: number;
  games: number;
  innings: number;
  runs: number;
  wickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

export async function centralGradeSummaries(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralGradeSummary[]> {
  return withCentralCache(cacheKey("centralGradeSummaries", [clubId]), () =>
    centralGradeSummariesImpl(clubId, preloadedMatchRows),
  );
}

async function centralGradeSummariesImpl(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralGradeSummary[]> {
  const matchRows = preloadedMatchRows ?? (await getClubMatchRows(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const gradeOf = new Map(matchRows.map((m) => [m.matchId, appGradeFromCentral(m.grade)]));

  // Partially SQL-aggregated. The per-grade rollup itself must stay in JS —
  // "grade" is the JS label mapping (classifyCentralGrade) applied per match,
  // and the distinct players-per-grade count needs (participant, match)
  // granularity — but the per-row work is pushed down:
  //   - batting groups to one row per (participant, match) with the DNB-aware
  //     innings count and runs sum (classification via battingInningsKindSql),
  //     so the dismissal text columns never travel;
  //   - bowling groups to one wickets sum per match;
  //   - fielding groups to counts per (match, kind) — the JS regexes then run
  //     per distinct kind instead of per row.
  // Rosters stay row-level: every (participant, match) pair feeds the distinct
  // players/games sets and there is nothing smaller to fetch.
  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        innings: sql<number>`(count(*) filter (where ${battingInningsKindSql} <> 'dnb'))::int`,
        runs: sql<number>`coalesce(sum(coalesce(${centralMatchBattingTable.runs}, 0)) filter (where ${battingInningsKindSql} <> 'dnb'), 0)::int`,
      })
      .from(centralMatchBattingTable)
      .where(and(eq(centralMatchBattingTable.clubId, clubId), inArray(centralMatchBattingTable.matchId, matchIds)))
      .groupBy(centralMatchBattingTable.participantId, centralMatchBattingTable.matchId),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        wickets: sql<number>`coalesce(sum(coalesce(${centralMatchBowlingTable.wickets}, 0)), 0)::int`,
      })
      .from(centralMatchBowlingTable)
      .where(and(eq(centralMatchBowlingTable.clubId, clubId), inArray(centralMatchBowlingTable.matchId, matchIds)))
      .groupBy(centralMatchBowlingTable.matchId),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(and(eq(centralMatchRostersTable.clubId, clubId), inArray(centralMatchRostersTable.matchId, matchIds))),
    centralDb
      .select({
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(centralFieldingTable)
      .where(and(eq(centralFieldingTable.clubId, clubId), inArray(centralFieldingTable.matchId, matchIds)))
      .groupBy(centralFieldingTable.matchId, centralFieldingTable.kind),
  ]);

  interface G {
    players: Set<string>;
    games: Set<number>;
    innings: number;
    runs: number;
    wickets: number;
    catches: number;
    stumpings: number;
    runOuts: number;
  }
  const byGrade = new Map<string, G>();
  const grp = (grade: string): G => {
    let a = byGrade.get(grade);
    if (!a) {
      a = { players: new Set(), games: new Set(), innings: 0, runs: 0, wickets: 0, catches: 0, stumpings: 0, runOuts: 0 };
      byGrade.set(grade, a);
    }
    return a;
  };

  for (const r of rosters) {
    if (r.matchId === null) continue;
    const grade = gradeOf.get(r.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(r.matchId);
    if (r.participantId) a.players.add(r.participantId);
  }
  for (const b of batting) {
    if (b.matchId === null) continue;
    const grade = gradeOf.get(b.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(b.matchId);
    if (b.participantId) a.players.add(b.participantId);
    a.innings += Number(b.innings);
    a.runs += Number(b.runs);
  }
  for (const b of bowling) {
    if (b.matchId === null) continue;
    const grade = gradeOf.get(b.matchId);
    if (!grade) continue;
    grp(grade).wickets += Number(b.wickets);
  }
  for (const f of fielding) {
    if (f.matchId === null) continue;
    const grade = gradeOf.get(f.matchId);
    if (!grade) continue;
    const a = grp(grade);
    const kind = (f.kind ?? "").toLowerCase();
    const n = Number(f.n);
    if (/stump/.test(kind)) a.stumpings += n;
    else if (/run\s*out/.test(kind)) a.runOuts += n;
    else if (/catch|caught|^c$/.test(kind)) a.catches += n;
  }

  return [...byGrade.entries()]
    .map(([grade, a]) => ({
      grade,
      players: a.players.size,
      games: a.games.size,
      innings: a.innings,
      runs: a.runs,
      wickets: a.wickets,
      catches: a.catches,
      stumpings: a.stumpings,
      runOuts: a.runOuts,
    }))
    .sort((x, y) => x.grade.localeCompare(y.grade));
}

export interface CentralDashboard {
  totalPlayers: number;
  totalGames: number;
  totalRuns: number;
  totalWickets: number;
  gradesCount: number;
  topRunScorer: { participantId: string; displayName: string | null; value: number } | null;
  topWicketTaker: { participantId: string; displayName: string | null; value: number } | null;
  topFielder: { participantId: string; displayName: string | null; value: number } | null;
  gradeSummaries: CentralGradeSummary[];
}

export async function centralDashboard(clubId: number): Promise<CentralDashboard> {
  return withCentralCache(cacheKey("centralDashboard", [clubId]), () =>
    centralDashboardImpl(clubId),
  );
}

async function centralDashboardImpl(clubId: number): Promise<CentralDashboard> {
  // Fetch the club's match rows ONCE and thread them into the three aggregate
  // reads (each used to re-issue the identical matches query) and this
  // function's own fielding fetch — 4 redundant round trips saved, and the
  // fielding read runs in parallel with the aggregates.
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);

  const [totals, gradeSummaries, careers, fielding] = await Promise.all([
    centralClubTotals(clubId, matchRows),
    centralGradeSummaries(clubId, matchRows),
    centralPlayerCareers(clubId, matchRows),
    matchIds.length
      ? centralDb
          .select({ participantId: centralFieldingTable.participantId, kind: centralFieldingTable.kind })
          .from(centralFieldingTable)
          .where(and(eq(centralFieldingTable.clubId, clubId), inArray(centralFieldingTable.matchId, matchIds)))
      : Promise.resolve([]),
  ]);
  const catchesByPid = new Map<string, number>();
  for (const f of fielding) {
    if (!f.participantId) continue;
    const kind = (f.kind ?? "").toLowerCase();
    if (/catch|caught|^c$/.test(kind) && !/run\s*out|stump/.test(kind)) {
      catchesByPid.set(f.participantId, (catchesByPid.get(f.participantId) ?? 0) + 1);
    }
  }

  const ids = careers.map((c) => c.participantId);
  const privateById = new Map(careers.map((c) => [c.participantId, c.isPrivate]));
  const nameById = new Map(careers.map((c) => [c.participantId, c.displayName]));

  const pickTop = (
    score: (pid: string) => number,
  ): { participantId: string; displayName: string | null; value: number } | null => {
    let best: { participantId: string; value: number } | null = null;
    for (const pid of ids) {
      if (privateById.get(pid)) continue;
      const v = score(pid);
      if (v <= 0) continue;
      if (!best || v > best.value) best = { participantId: pid, value: v };
    }
    return best ? { participantId: best.participantId, displayName: nameById.get(best.participantId) ?? null, value: best.value } : null;
  };

  const runsByPid = new Map(careers.map((c) => [c.participantId, c.runs]));
  const wktsByPid = new Map(careers.map((c) => [c.participantId, c.wickets]));

  return {
    totalPlayers: totals.players,
    totalGames: totals.games,
    totalRuns: totals.runs,
    totalWickets: totals.wickets,
    gradesCount: gradeSummaries.length,
    topRunScorer: pickTop((pid) => runsByPid.get(pid) ?? 0),
    topWicketTaker: pickTop((pid) => wktsByPid.get(pid) ?? 0),
    topFielder: pickTop((pid) => catchesByPid.get(pid) ?? 0),
    gradeSummaries,
  };
}

export interface CentralCentury {
  participantId: string;
  displayName: string | null;
  grade: string;
  score: string;
  season: string;
}

export interface CentralFiveWicketHaul {
  participantId: string;
  displayName: string | null;
  grade: string;
  figures: string;
  season: string;
}

async function centralPlayerNames(
  ids: string[],
): Promise<Map<string, { displayName: string | null; isPrivate: boolean }>> {
  if (ids.length === 0) return new Map();
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inArray(centralPlayersTable.participantId, ids));
  return new Map(players.map((p) => [p.participantId, { displayName: p.displayName, isPrivate: (p.isPrivate ?? 0) === 1 }]));
}

function seasonLabelFromStartYear(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export async function centralCenturies(clubId: number): Promise<CentralCentury[]> {
  return withCentralCache(cacheKey("centralCenturies", [clubId]), () =>
    centralCenturiesImpl(clubId),
  );
}

async function centralCenturiesImpl(clubId: number): Promise<CentralCentury[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const metaOf = new Map(matchRows.map((m) => [m.matchId, { grade: appGradeFromCentral(m.grade), season: parseSeasonStartYear(m.season) }]));

  // Threshold pushed into SQL: only the century lines travel over the wire
  // (was: every batting line the club ever recorded, filtered in JS). SQL
  // `runs >= 100` ≡ the old `(runs ?? 0) >= 100` — NULL runs fail both.
  const batting = await centralDb
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
        gte(centralMatchBattingTable.runs, 100),
      ),
    );

  const hundreds = batting.filter((b) => b.participantId);
  const names = await centralPlayerNames([...new Set(hundreds.map((b) => b.participantId as string))]);

  const rows: CentralCentury[] = [];
  for (const b of hundreds) {
    if (b.matchId === null) continue;
    const meta = metaOf.get(b.matchId);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    const notOut = classifyInnings(b.dismissalType, b.dismissal) === "notout";
    rows.push({
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      score: `${b.runs ?? 0}${notOut ? "*" : ""}`,
      season: seasonLabelFromStartYear(meta.season),
    });
  }
  rows.sort((a, b) => a.grade.localeCompare(b.grade) || (b.season).localeCompare(a.season));
  return rows;
}

export interface CentralMilestone {
  kind: "century" | "fiveFor" | "career";
  participantId: string;
  displayName: string | null;
  grade: string;
  season: number;
  matchId: number;
  matchDate: string | null;
  opponent: string | null;
  value: number;
  /** Career crossings only: which running total crossed a tier. */
  boardKey?: "games" | "runs" | "wickets" | "dismissals";
  tierIndex?: number;
  threshold?: number;
}

/** Default significance tiers, mirroring the native milestone board defaults. */
const DEFAULT_CAREER_TIERS = {
  games: [100, 150, 200, 250, 300],
  runs: [1000, 2000, 3000, 5000, 7500, 10000],
  wickets: [100, 150, 200, 300],
};

// Career dismissal tiers (catches + stumpings + run-outs). The native milestone
// board has no dismissals column, so this ladder is central-only; it mirrors the
// client-side "Dismissals Club" bands on the honour-boards page (10/25/50/75/100).
const DEFAULT_DISMISSALS_TIERS = [10, 25, 50, 75, 100];

export async function centralMilestones(
  clubId: number,
  tiers: {
    games: number[];
    runs: number[];
    wickets: number[];
    dismissals?: number[];
  } = DEFAULT_CAREER_TIERS,
): Promise<CentralMilestone[]> {
  return withCentralCache(cacheKey("centralMilestones", [clubId, tiers]), () =>
    centralMilestonesImpl(clubId, tiers),
  );
}

async function centralMilestonesImpl(
  clubId: number,
  tiers: {
    games: number[];
    runs: number[];
    wickets: number[];
    dismissals?: number[];
  },
): Promise<CentralMilestone[]> {
  // Deliberately still JS-aggregated: career tier-crossings need each player's
  // full per-match running totals walked in chronological order against
  // caller-supplied tier arrays — a sequential scan that doesn't reduce to a
  // GROUP BY (a SQL window-function port would be a rewrite, not a pushdown).
  // The fetches below already select only the 2–3 columns the walk consumes,
  // and the read is cold + cached.
  const matchRows = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      season: centralMatchesTable.season,
      matchDate: centralMatchesTable.matchDate,
      homeClubId: centralMatchesTable.homeClubId,
      awayClubId: centralMatchesTable.awayClubId,
      homeTeam: centralMatchesTable.homeTeam,
      awayTeam: centralMatchesTable.awayTeam,
    })
    .from(centralMatchesTable)
    .where(or(eq(centralMatchesTable.homeClubId, clubId), eq(centralMatchesTable.awayClubId, clubId)));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const metaOf = new Map(
    matchRows.map((m) => [
      m.matchId,
      {
        grade: appGradeFromCentral(m.grade),
        season: parseSeasonStartYear(m.season),
        matchDate: m.matchDate,
        opponent: m.homeClubId === clubId ? m.awayTeam : m.homeTeam,
      },
    ]),
  );

  // Batting, bowling, rosters (rosters give the games count — a player counts as
  // having played even in matches where they didn't bat or bowl) and fielding
  // (for the dismissals career ladder) are independent given matchIds — run all
  // four round trips in parallel.
  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
      })
      .from(centralMatchBattingTable)
      .where(and(eq(centralMatchBattingTable.clubId, clubId), inArray(centralMatchBattingTable.matchId, matchIds))),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
      })
      .from(centralMatchBowlingTable)
      .where(and(eq(centralMatchBowlingTable.clubId, clubId), inArray(centralMatchBowlingTable.matchId, matchIds))),
    centralDb
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
      ),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inArray(centralFieldingTable.matchId, matchIds),
        ),
      ),
  ]);

  const centuries = batting.filter((b) => (b.runs ?? 0) >= 100 && b.participantId && b.matchId !== null);
  const fivers = bowling.filter((b) => (b.wickets ?? 0) >= 5 && b.participantId && b.matchId !== null);

  // Per-participant running-total inputs: runs and wickets per match, and the
  // set of matches played (rosters unioned with batted/bowled matches).
  interface CareerAcc {
    runsByMatch: Map<number, number>;
    wktsByMatch: Map<number, number>;
    dismByMatch: Map<number, number>;
    matches: Set<number>;
  }
  const byPid = new Map<string, CareerAcc>();
  const accFor = (pid: string): CareerAcc => {
    let a = byPid.get(pid);
    if (!a) {
      a = {
        runsByMatch: new Map(),
        wktsByMatch: new Map(),
        dismByMatch: new Map(),
        matches: new Set(),
      };
      byPid.set(pid, a);
    }
    return a;
  };
  for (const b of batting) {
    if (!b.participantId || b.matchId === null) continue;
    const a = accFor(b.participantId);
    a.runsByMatch.set(b.matchId, (a.runsByMatch.get(b.matchId) ?? 0) + (b.runs ?? 0));
    a.matches.add(b.matchId);
  }
  for (const b of bowling) {
    if (!b.participantId || b.matchId === null) continue;
    const a = accFor(b.participantId);
    a.wktsByMatch.set(b.matchId, (a.wktsByMatch.get(b.matchId) ?? 0) + (b.wickets ?? 0));
    a.matches.add(b.matchId);
  }
  for (const r of rosters) {
    if (!r.participantId || r.matchId === null) continue;
    accFor(r.participantId).matches.add(r.matchId);
  }
  for (const f of fielding) {
    if (!f.participantId || f.matchId === null) continue;
    if (!classifyFieldingKind(f.kind)) continue;
    // Every classified catch/stumping/run-out counts one dismissal. Deliberately
    // NOT added to `matches` (the games/appearance set) — a fielding row must not
    // inflate the games tally; the walk below unions these in for dismissals only.
    const a = accFor(f.participantId);
    a.dismByMatch.set(f.matchId, (a.dismByMatch.get(f.matchId) ?? 0) + 1);
  }

  // Names for every participant that could cross a tier (superset of the
  // century/five-for authors).
  const names = await centralPlayerNames([...byPid.keys()]);

  const out: CentralMilestone[] = [];
  for (const b of centuries) {
    const meta = metaOf.get(b.matchId as number);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    out.push({
      kind: "century",
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      season: meta.season,
      matchId: b.matchId as number,
      matchDate: meta.matchDate,
      opponent: meta.opponent,
      value: b.runs ?? 0,
    });
  }
  for (const b of fivers) {
    const meta = metaOf.get(b.matchId as number);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    out.push({
      kind: "fiveFor",
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      season: meta.season,
      matchId: b.matchId as number,
      matchDate: meta.matchDate,
      opponent: meta.opponent,
      value: b.wickets ?? 0,
    });
  }

  // Career crossings: walk each participant's matches in chronological order
  // (season, then match id), accumulate games/runs/wickets, and emit a
  // milestone at the match where a running total first crosses each tier.
  const chrono = (x: number, y: number): number => {
    const mx = metaOf.get(x);
    const my = metaOf.get(y);
    return (mx?.season ?? 0) - (my?.season ?? 0) || x - y;
  };
  const tierSpecs = [
    { key: "games" as const, tiers: tiers.games },
    { key: "runs" as const, tiers: tiers.runs },
    { key: "wickets" as const, tiers: tiers.wickets },
    { key: "dismissals" as const, tiers: tiers.dismissals ?? DEFAULT_DISMISSALS_TIERS },
  ];
  for (const [pid, acc] of byPid) {
    const p = names.get(pid);
    if (p?.isPrivate) continue;
    // Walk over appearances unioned with fielding-only matches so dismissal
    // crossings still fire in a match where the player neither batted nor bowled;
    // `games` contrib stays gated on a real appearance so the games tally is
    // unchanged.
    const ordered = [
      ...new Set([...acc.matches, ...acc.dismByMatch.keys()]),
    ].sort(chrono);
    const totals = { games: 0, runs: 0, wickets: 0, dismissals: 0 };
    for (const mId of ordered) {
      const meta = metaOf.get(mId);
      const contrib = {
        games: acc.matches.has(mId) ? 1 : 0,
        runs: acc.runsByMatch.get(mId) ?? 0,
        wickets: acc.wktsByMatch.get(mId) ?? 0,
        dismissals: acc.dismByMatch.get(mId) ?? 0,
      };
      for (const spec of tierSpecs) {
        const prev = totals[spec.key];
        const now = prev + contrib[spec.key];
        totals[spec.key] = now;
        if (!meta?.grade || meta.season === null) continue;
        for (let i = 0; i < spec.tiers.length; i++) {
          const tier = spec.tiers[i];
          if (prev < tier && now >= tier) {
            out.push({
              kind: "career",
              participantId: pid,
              displayName: p?.displayName ?? null,
              grade: meta.grade,
              season: meta.season,
              matchId: mId,
              matchDate: meta.matchDate,
              opponent: meta.opponent,
              value: now,
              boardKey: spec.key,
              tierIndex: i,
              threshold: tier,
            });
          }
        }
      }
    }
  }

  out.sort((a, b) => b.season - a.season || b.matchId - a.matchId);
  return out;
}

export async function centralFiveWicketHauls(clubId: number): Promise<CentralFiveWicketHaul[]> {
  return withCentralCache(cacheKey("centralFiveWicketHauls", [clubId]), () =>
    centralFiveWicketHaulsImpl(clubId),
  );
}

async function centralFiveWicketHaulsImpl(clubId: number): Promise<CentralFiveWicketHaul[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const metaOf = new Map(matchRows.map((m) => [m.matchId, { grade: appGradeFromCentral(m.grade), season: parseSeasonStartYear(m.season) }]));

  // Threshold pushed into SQL: only the five-for lines travel over the wire
  // (was: every bowling line, filtered in JS). SQL `wickets >= 5` ≡ the old
  // `(wickets ?? 0) >= 5` — NULL wickets fail both.
  const bowling = await centralDb
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
        gte(centralMatchBowlingTable.wickets, 5),
      ),
    );

  const fivers = bowling.filter((b) => b.participantId);
  const names = await centralPlayerNames([...new Set(fivers.map((b) => b.participantId as string))]);

  const rows: CentralFiveWicketHaul[] = [];
  for (const b of fivers) {
    if (b.matchId === null) continue;
    const meta = metaOf.get(b.matchId);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    rows.push({
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      figures: `${b.wickets ?? 0}/${b.runs ?? 0}`,
      season: seasonLabelFromStartYear(meta.season),
    });
  }
  rows.sort((a, b) => a.grade.localeCompare(b.grade) || (b.season).localeCompare(a.season));
  return rows;
}
