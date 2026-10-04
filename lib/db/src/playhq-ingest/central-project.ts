import type pg from "pg";
import { classifyCentralGrade } from "../central/grades";
import {
  ProjectionSkip,
  scorecardToCentral,
  type CentralProjection,
  type PlayhqMatchRow,
  type RawScorecard,
} from "./central-transform";

/**
 * The PlayHQ → central projector: copies finished senior PlayHQ matches into the central stats
 * tables so results, leaderboards, records and careers update after every sync.
 *
 * Plan: docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md (P3). Guarantees:
 *
 *  - One transaction per match. The match row is upserted on `playhq_match_id` (a builder-loaded
 *    match keeps its `match_id`); its child rows are deleted and re-inserted from the latest
 *    scorecard, so an amended scorecard replaces the old lines exactly (R4).
 *  - New players are inserted; existing names and privacy flags are never overwritten (D4). A
 *    touched player's `matches`, `last_season` and `current_club_id` are recomputed from central.
 *  - Never writes a junior or unclassifiable grade, an ambiguous match (two central rows with the
 *    same PlayHQ id), or a match neither of whose clubs is known. Those are skipped and reported.
 *  - Runs on the dedicated `central_projector` pool only; the caller asserts its scope first.
 *
 * Callers clear the central read caches afterwards (the API's ingest hook does).
 */

/** PlayHQ statuses that are final enough to project. */
export const PROJECTABLE_STATUSES = [
  "COMPLETED",
  "ABANDONED",
  "CANCELLED",
  "FORFEIT",
  "FORFEITED",
] as const;

export interface ProjectOptions {
  /** PlayHQ match ids to project; omit to project every candidate in `season` (backfill). */
  matchIds?: string[];
  /** Restrict a backfill to one PlayHQ season name, e.g. "Summer 2026/27". */
  season?: string;
  /** Restrict to matches involving one PlayHQ organisation. */
  orgId?: string;
  /** Compute everything, write nothing. */
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface ProjectSummary {
  dryRun: boolean;
  considered: number;
  created: number;
  updated: number;
  skipped: Array<{ playhqMatchId: string; reason: string }>;
  playersInserted: number;
  /** Central match ids written (or that would be, in a dry run). */
  matchIds: number[];
}

type Queryable = Pick<pg.Pool, "query" | "connect">;

interface CandidateRow extends PlayhqMatchRow {
  grade_name: string | null;
  season_name: string | null;
  central_grade: string | null;
  raw: RawScorecard | null;
}

/** A PlayHQ name that hides the player (private on PlayHQ) — inserted private (D4). */
export function isWithheldName(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  return !s || /\bprivate\b|\bwithheld\b|\bhidden\b|\bunknown player\b/i.test(s);
}

async function loadCandidates(c: Queryable, o: ProjectOptions): Promise<CandidateRow[]> {
  const where: string[] = ["g.is_junior = false", "m.status = any($1::text[])"];
  const params: unknown[] = [[...PROJECTABLE_STATUSES]];
  if (o.matchIds) {
    params.push(o.matchIds);
    where.push(`m.id::text = any($${params.length}::text[])`);
  }
  if (o.season) {
    params.push(o.season);
    where.push(`g.season_name = $${params.length}`);
  }
  if (o.orgId) {
    params.push(o.orgId.toLowerCase());
    where.push(
      `(lower(m.home_org_id::text) = $${params.length} or lower(m.away_org_id::text) = $${params.length})`,
    );
  }
  const { rows } = await c.query<CandidateRow>(
    `select m.id::text as id, m.status, m.match_type, m.round_name, m.start_at,
            m.venue_name, m.surface_name, m.result_text,
            m.home_team_id::text as home_team_id, m.away_team_id::text as away_team_id,
            m.home_team_name, m.away_team_name,
            m.home_org_id::text as home_org_id, m.away_org_id::text as away_org_id,
            m.home_score, m.away_score, m.grade_id::text as grade_id,
            g.name as grade_name, g.season_name,
            gm.central_grade, s.raw
       from playhq.matches m
       join playhq.grades g on g.id = m.grade_id
       left join playhq.scorecards s on s.match_id = m.id
       left join central.grade_playhq_map gm on gm.grade_key = central.playhq_grade_key(g.name)
      where ${where.join(" and ")}
      order by m.start_at, m.id`,
    params,
  );
  return rows;
}

/**
 * PlayHQ organisation → central club. The crosswalk (`central.club_playhq_orgs`) is seeded from
 * history, which a database whose PlayHQ landing tables only hold the current season doesn't have;
 * each tenant's own settings (`tenants.playhq_org_id` → `central_club_id`, the pair its sync runs
 * on) fill the gap and win over a history vote. A projector role without the column grant (an
 * older central-projector.sql) still works from the crosswalk alone.
 */
async function loadOrgToClub(c: Queryable): Promise<Map<string, number>> {
  const { rows } = await c.query<{ playhq_org_id: string; club_id: number }>(
    `select lower(playhq_org_id) as playhq_org_id, club_id from central.club_playhq_orgs`,
  );
  const map = new Map(rows.map((r) => [r.playhq_org_id, r.club_id]));
  try {
    const tenants = await c.query<{ playhq_org_id: string; club_id: number }>(
      `select lower(playhq_org_id::text) as playhq_org_id, central_club_id as club_id
         from public.tenants
        where playhq_org_id is not null and central_club_id is not null`,
    );
    for (const r of tenants.rows) map.set(r.playhq_org_id, r.club_id);
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42501: no column grant yet; 42P01: no tenants table (a bare central database).
    if (code !== "42501" && code !== "42P01") throw err;
  }
  return map;
}

async function loadFullNames(c: Queryable, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { rows } = await c.query<{ participant_id: string; full_name: string }>(
    `select participant_id::text as participant_id, full_name
       from playhq.players where participant_id::text = any($1::text[]) and full_name is not null`,
    [ids],
  );
  return new Map(rows.map((r) => [r.participant_id, r.full_name]));
}

const MATCH_COLS = [
  "playhq_match_id",
  "season",
  "grade",
  "grade_id",
  "comp_type",
  "round",
  "match_date",
  "venue",
  "venue_oval",
  "status",
  "home_club_id",
  "away_club_id",
  "home_team",
  "away_team",
  "home_score",
  "away_score",
  "toss_winner_club_id",
  "winner_club_id",
  "result_text",
] as const;

/** Insert rows into a central child table with ids from the projector's line sequence. */
async function insertLines(
  c: pg.PoolClient,
  table: string,
  matchId: number,
  rows: object[],
  cols: string[],
): Promise<void> {
  if (!rows.length) return;
  const params: unknown[] = [matchId];
  const values = rows.map((r) => {
    const rec = r as Record<string, unknown>;
    const ph = cols.map((col) => {
      params.push(rec[col] ?? null);
      return `$${params.length}`;
    });
    return `(nextval('central.projected_line_id_seq'), $1, ${ph.join(", ")})`;
  });
  await c.query(
    `insert into central.${table} (id, match_id, ${cols.join(", ")}) values ${values.join(", ")}`,
    params,
  );
}

async function writeMatch(
  c: pg.PoolClient,
  p: CentralProjection,
): Promise<{
  matchId: number;
  created: boolean;
}> {
  const existing = await c.query<{ match_id: number }>(
    `select match_id from central.matches where playhq_match_id = $1 for update`,
    [p.match.playhq_match_id],
  );
  if (existing.rows.length > 1)
    throw new ProjectionSkip(
      `ambiguous: ${existing.rows.length} central matches carry PlayHQ id ${p.match.playhq_match_id}`,
    );
  const vals = MATCH_COLS.map((k) => p.match[k]);
  let matchId: number;
  let created = false;
  if (existing.rows[0]) {
    matchId = existing.rows[0].match_id;
    await c.query(
      `update central.matches set ${MATCH_COLS.map((k, i) => `${k} = $${i + 2}`).join(", ")}
        where match_id = $1`,
      [matchId, ...vals],
    );
  } else {
    const r = await c.query<{ match_id: number }>(
      `insert into central.matches (match_id, ${MATCH_COLS.join(", ")})
       values (nextval('central.projected_match_id_seq'), ${MATCH_COLS.map((_, i) => `$${i + 1}`).join(", ")})
       returning match_id`,
      vals,
    );
    matchId = r.rows[0]!.match_id;
    created = true;
  }

  for (const t of [
    "match_batting",
    "match_bowling",
    "match_rosters",
    "fall_of_wickets",
    "fielding",
  ])
    await c.query(`delete from central.${t} where match_id = $1`, [matchId]);

  await insertLines(c, "match_batting", matchId, p.batting, [
    "innings",
    "club_id",
    "team_name",
    "bat_order",
    "participant_id",
    "player_name",
    "runs",
    "balls",
    "fours",
    "sixes",
    "strike_rate",
    "dismissal",
    "dismissal_type",
    "fielder",
  ]);
  await insertLines(c, "match_bowling", matchId, p.bowling, [
    "innings",
    "club_id",
    "team_name",
    "participant_id",
    "player_name",
    "overs",
    "maidens",
    "runs",
    "wickets",
    "economy",
    "wides",
    "no_balls",
  ]);
  await insertLines(c, "match_rosters", matchId, p.rosters, [
    "club_id",
    "team_name",
    "participant_id",
    "player_name",
  ]);
  await insertLines(c, "fall_of_wickets", matchId, p.fallOfWickets, [
    "innings",
    "wicket",
    "runs",
    "participant_id",
  ]);
  await insertLines(c, "fielding", matchId, p.fielding, [
    "club_id",
    "participant_id",
    "player_name",
    "kind",
  ]);
  return { matchId, created };
}

/** Insert unseen players; never overwrite an existing name or privacy flag. */
async function insertPlayers(c: pg.PoolClient, p: CentralProjection): Promise<number> {
  let inserted = 0;
  for (const pl of p.players) {
    const r = await c.query(
      `insert into central.players
         (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
       values ($1, $2, $3, $4, $5, $5, 0)
       on conflict (participant_id) do nothing`,
      [
        pl.participant_id,
        isWithheldName(pl.display_name) ? "Private Player" : pl.display_name,
        isWithheldName(pl.display_name) ? 1 : 0,
        pl.club_id,
        p.match.season,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

/**
 * Recompute derived player fields from central for the touched participants: match count
 * (rosters), the club and season of their most recent match, and the earliest season.
 */
async function refreshPlayers(c: pg.PoolClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await c.query(
    `with appearances as (
       select r.participant_id, r.club_id, m.match_id, m.season, m.match_date
         from central.match_rosters r join central.matches m on m.match_id = r.match_id
        where r.participant_id = any($1::text[])
     ), agg as (
       select participant_id,
              count(distinct match_id) as matches,
              (array_agg(club_id order by match_date desc nulls last, match_id desc))[1] as club_id,
              (array_agg(season order by match_date desc nulls last, match_id desc))[1] as last_season,
              (array_agg(season order by match_date asc nulls last, match_id asc))[1] as first_season
         from appearances group by participant_id
     )
     update central.players p
        set matches = agg.matches,
            current_club_id = coalesce(agg.club_id, p.current_club_id),
            last_season = coalesce(agg.last_season, p.last_season),
            first_season = coalesce(p.first_season, agg.first_season)
       from agg
      where p.participant_id = agg.participant_id`,
    [ids],
  );
}

/**
 * Apply platform-admin privacy overrides (`public.player_privacy_overrides`, D4/P8) to
 * `central.players.is_private` — for the given participants, or every override when omitted.
 * An override is the only thing that lowers the flag. Returns the number of players changed.
 */
export async function applyPrivacyOverrides(
  c: Pick<pg.Pool, "query">,
  participantIds?: string[],
): Promise<number> {
  if (participantIds && !participantIds.length) return 0;
  const r = await c.query(
    `update central.players p
        set is_private = case when o.is_private then 1 else 0 end
       from public.player_privacy_overrides o
      where o.participant_id = p.participant_id
        and p.is_private is distinct from (case when o.is_private then 1 else 0 end)
        ${participantIds ? "and p.participant_id = any($1::text[])" : ""}`,
    participantIds ? [participantIds] : [],
  );
  return r.rowCount ?? 0;
}

/**
 * Project PlayHQ matches into central. `pool` must be the central_projector pool (scope already
 * asserted by the caller). Each match is its own transaction: one failure never blocks the rest.
 */
export async function projectToCentral(
  pool: Queryable,
  opts: ProjectOptions = {},
): Promise<ProjectSummary> {
  const log = opts.log ?? (() => {});
  const summary: ProjectSummary = {
    dryRun: !!opts.dryRun,
    considered: 0,
    created: 0,
    updated: 0,
    skipped: [],
    playersInserted: 0,
    matchIds: [],
  };
  if (opts.matchIds && opts.matchIds.length === 0) return summary;

  const candidates = await loadCandidates(pool, opts);
  summary.considered = candidates.length;
  if (!candidates.length) return summary;
  const orgToClub = await loadOrgToClub(pool);
  const allIds = [
    ...new Set(
      candidates.flatMap((m) =>
        (m.raw?.teams ?? []).flatMap((t) => (t.players ?? []).map((p) => p.participantId ?? "")),
      ),
    ),
  ].filter(Boolean);
  const fullNames = await loadFullNames(pool, allIds);

  for (const m of candidates) {
    const centralGrade = m.central_grade ?? m.grade_name;
    const cls = classifyCentralGrade(centralGrade);
    if (!cls.appGrade) {
      summary.skipped.push({
        playhqMatchId: m.id,
        reason: `grade "${centralGrade}" not projected (${cls.note ?? "unclassified grade"})`,
      });
      continue;
    }
    let projection: CentralProjection;
    try {
      projection = scorecardToCentral(m, m.raw, {
        gradeName: m.grade_name,
        centralGrade: m.central_grade,
        seasonName: m.season_name,
        orgToClub,
        fullNames,
      });
    } catch (err) {
      if (!(err instanceof ProjectionSkip)) throw err;
      summary.skipped.push({ playhqMatchId: m.id, reason: err.message });
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const { matchId, created } = await writeMatch(client, projection);
      const inserted = await insertPlayers(client, projection);
      const touched = [
        ...new Set(projection.rosters.map((r) => r.participant_id).filter((x): x is string => !!x)),
      ];
      await refreshPlayers(client, touched);
      await applyPrivacyOverrides(client, touched);
      if (opts.dryRun) await client.query("rollback");
      else await client.query("commit");
      summary.matchIds.push(matchId);
      summary.playersInserted += inserted;
      if (created) summary.created++;
      else summary.updated++;
      log(
        `${opts.dryRun ? "[dry] " : ""}${created ? "created" : "updated"} central match ${matchId} ← PlayHQ ${m.id} (${projection.batting.length} batting, ${projection.bowling.length} bowling, ${inserted} new players)`,
      );
    } catch (err) {
      await client.query("rollback").catch(() => {});
      if (err instanceof ProjectionSkip) {
        summary.skipped.push({ playhqMatchId: m.id, reason: err.message });
        continue;
      }
      summary.skipped.push({
        playhqMatchId: m.id,
        reason: `error: ${(err as Error).message}`,
      });
    } finally {
      client.release();
    }
  }
  return summary;
}
