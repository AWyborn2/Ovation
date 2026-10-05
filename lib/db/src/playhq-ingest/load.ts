/**
 * PlayHQ ingest — the library half of the loader. Parses dumps produced by the
 * `playcricket-stats-scraper` skill's in-page harness
 * (`.claude/skills/playcricket-stats-scraper/harness.js`) and upserts them into the
 * `playhq.*` raw landing schema (`scripts/sql/playhq-schema.sql`).
 *
 * Two callers share it: the `scripts/src/playhq-load.ts` CLI (ops tooling) and the API's
 * `POST /api/internal/playhq/ingest` endpoint (scheduled sync). Both write `playhq.*` only:
 * the endpoint through the dedicated `PLAYHQ_INGEST_DATABASE_URL` role (see `./pool.ts`),
 * never through the read-only central handle. Every write is an idempotent upsert keyed on
 * PlayHQ GUIDs, so re-loading the same dump is a no-op and re-loading a newer dump records
 * what changed (see `playhq.fixture_changes`).
 */
// ---------------------------------------------------------------------------
// Dump shapes (what harness.js exports)
// ---------------------------------------------------------------------------

type J = Record<string, unknown>;
export interface DumpRecord {
  key: string;
  kind: string;
  id: string;
  meta: J;
  fetchedAt: string;
  data: unknown;
}
export interface Dump {
  version: string;
  exportedAt: string;
  origin?: string;
  records: DumpRecord[];
}
export type Row = Record<string, unknown>;

/** Junior / pathway grade labels (PCA "Year N", WA "Under 17s", "U15", …) — kept out of senior surfaces. */
export const JUNIOR_RE =
  /\b(year\s?\d{1,2}|u\s?\d{1,2}s?\b|under\s?\d{1,2}s?\b|junior|primary|stage\s?\d|blast|woolworths|pathway|school)\b/i;

// ---------------------------------------------------------------------------
// Small coercion helpers — API payloads are untyped JSON
// ---------------------------------------------------------------------------

const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.trunc(n);
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Cricket overs notation ("43.3" = 43 overs and 3 balls) → balls bowled. */
export function oversToBalls(v: unknown): number | null {
  const s = str(v);
  if (s == null) return null;
  const m = /^(\d+)(?:\.(\d))?$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 6 + Number(m[2] ?? 0);
}

// ---------------------------------------------------------------------------
// Pure transforms: dump records → rows per table
// ---------------------------------------------------------------------------

export interface LoadRows {
  organisations: Row[];
  seasons: Row[];
  grades: Row[];
  teams: Row[];
  matches: Row[];
  ladders: Row[];
  players: Row[];
  player_grade_stats: Row[];
  scorecards: Row[];
  match_innings: Row[];
  match_batting: Row[];
  match_bowling: Row[];
  match_fielding: Row[];
  fall_of_wickets: Row[];
  balls: Row[];
  /** Each upcoming match's named sides (one row per match and team, players as jsonb). */
  match_lineups: Row[];
  runs: Row[];
}

export function rowsFromDump(dump: Dump, sourceFile: string): LoadRows {
  const orgs = new Map<string, Row>();
  const seasons = new Map<string, Row>();
  const grades = new Map<string, Row>();
  const teams = new Map<string, Row>();
  const matches = new Map<string, Row>();
  const ladders = new Map<string, Row>();
  const players = new Map<string, Row & { _at: string }>();
  const stats = new Map<string, Row>();
  const scorecards: Row[] = [];
  const innings: Row[] = [];
  const batting: Row[] = [];
  const bowling: Row[] = [];
  const fielding: Row[] = [];
  const fow: Row[] = [];
  const balls: Row[] = [];
  const lineups = new Map<string, Row>();
  const runs: Row[] = [];

  const org = (o: unknown) => {
    const x = obj(o);
    const id = str(x.id);
    if (!id) return null;
    const prev = orgs.get(id) ?? { id, name: null, short_name: null, logo_url: null };
    orgs.set(id, {
      id,
      name: str(x.name) ?? prev.name,
      short_name: str(x.shortName) ?? prev.short_name,
      logo_url: str(x.logoUrl) ?? prev.logo_url,
    });
    return id;
  };
  const team = (t: unknown, gradeId: string | null) => {
    const x = obj(t);
    const id = str(x.id);
    if (!id) return null;
    const prev = teams.get(id);
    teams.set(id, {
      id,
      grade_id: gradeId ?? (prev?.grade_id as string | null) ?? null,
      name: str(x.name) ?? (prev?.name as string | null) ?? null,
      display_name: str(x.displayName) ?? (prev?.display_name as string | null) ?? null,
      org_id: org(x.owningOrganisation) ?? (prev?.org_id as string | null) ?? null,
    });
    return id;
  };

  // The plan record tells us which organisation the discovery ran for (source of seasons).
  let planOrgId: string | null = null;
  for (const r of dump.records)
    if (r.kind === "plan") {
      const p = obj(r.data);
      planOrgId = str(p.orgId) ?? planOrgId;
      runs.push({
        source_file: sourceFile,
        org_id: planOrgId,
        plan: p,
        exported_at: iso(dump.exportedAt),
        notes: `harness ${dump.version} started ${r.id}`,
        harness_version: str(dump.version),
      });
    }

  for (const r of dump.records) {
    const gradeId = str(obj(r.meta).gradeId) ?? (r.kind !== "plan" ? r.id : null);
    switch (r.kind) {
      case "grade": {
        const g = obj(r.data);
        const id = str(g.gradeId) ?? r.id;
        const ownerId = str(g.ownerOrgId);
        if (ownerId)
          org({ id: ownerId, name: g.ownerOrgName ?? null, shortName: g.ownerOrgShort ?? null });
        const seasonId = str(g.seasonId);
        const srcOrg = str(g.sourceOrgId) ?? planOrgId;
        if (seasonId && srcOrg)
          seasons.set(seasonId, {
            id: seasonId,
            org_id: srcOrg,
            name: str(g.seasonName) ?? "?",
            start_date: null,
            is_current: null,
          });
        const name = str(g.gradeName) ?? "?";
        grades.set(id, {
          id,
          name,
          season_id: seasonId,
          season_name: str(g.seasonName),
          owner_org_id: ownerId,
          source_org_id: srcOrg,
          is_junior: JUNIOR_RE.test(name),
          raw: g,
        });
        const ids = arr(g.teamIds);
        const names = arr(g.teamNames);
        ids.forEach((tid, i) =>
          team({ id: tid, name: names[i] ?? null, owningOrganisation: { id: srcOrg } }, id),
        );
        break;
      }
      case "gradeTeams": {
        const g = obj(obj(r.data).grade);
        const gid = str(g.id) ?? gradeId;
        org(g.organisation);
        for (const t of arr(g.teams)) team(t, gid);
        break;
      }
      case "matches": {
        for (const m of arr(obj(r.data).matches)) {
          const id = str(m.id);
          if (!id || !gradeId) continue;
          const sched = arr(m.matchSchedule)
            .map((s) => iso(s.startDateTime))
            .filter((x): x is string => !!x)
            .sort();
          const ts = arr(m.teams);
          const home = ts.find((t) => t.isHome === true) ?? ts[0] ?? {};
          const away = ts.find((t) => t !== home) ?? {};
          for (const t of ts) team(t, gradeId);
          const venue = obj(m.venue);
          const surface = obj(venue.playingSurface);
          const round = obj(m.round);
          const winner = ts.find((t) => t.isWinner === true);
          matches.set(id, {
            id,
            grade_id: gradeId,
            status: str(m.status),
            status_id: int(m.statusId),
            match_type: str(m.matchType),
            match_type_id: int(m.matchTypeId),
            round_id: str(round.id),
            round_name: str(round.name),
            round_short: str(round.shortName),
            start_at: sched[0] ?? null,
            end_at: sched[sched.length - 1] ?? null,
            match_days: sched.length || null,
            venue_name: str(venue.name),
            venue_line1: str(venue.line1),
            venue_suburb: str(venue.suburb),
            venue_state: str(venue.stateName),
            venue_postcode: str(venue.postCode),
            surface_name: str(surface.name),
            latitude: num(surface.latitude),
            longitude: num(surface.longitude),
            result_text: str(m.resultText),
            home_team_id: str(home.id),
            home_team_name: str(home.displayName),
            home_org_id: str(obj(home.owningOrganisation).id),
            home_score: str(home.scoreText),
            home_overs: num(home.oversBowled),
            away_team_id: str(away.id),
            away_team_name: str(away.displayName),
            away_org_id: str(obj(away.owningOrganisation).id),
            away_score: str(away.scoreText),
            away_overs: num(away.oversBowled),
            winner_team_id: str(winner?.id),
            is_live_streaming: bool(m.isLiveStreaming),
            raw: m,
            fetched_at: iso(r.fetchedAt),
          });
        }
        break;
      }
      case "ladder": {
        const d = obj(r.data);
        const gid = str(obj(d.grade).id) ?? gradeId;
        org(obj(d.grade).organisation);
        for (const l of arr(d.ladders)) {
          const ladderName = str(l.name) ?? "Overall";
          for (const pool of arr(l.pools))
            for (const t of arr(pool.teams)) {
              const tid = team(t, gid);
              if (!tid || !gid) continue;
              const v: J = {};
              for (const cell of arr(t.ladderData)) {
                const k = str(cell.id);
                if (k) v[k] = cell.val;
              }
              ladders.set(`${gid}|${ladderName}|${tid}`, {
                grade_id: gid,
                ladder_name: ladderName,
                team_id: tid,
                team_name: str(t.displayName),
                org_id: str(obj(t.owningOrganisation).id),
                rank: int(t.rank),
                played: int(v.played),
                competition_points: num(v.competitionPoints),
                bonus_points: num(v.bonusPoints),
                quotient: num(v.quotient),
                net_run_rate: num(v.netRunRate),
                won: int(v.won),
                lost: int(v.lost),
                ties: int(v.ties),
                no_results: int(v.noResults),
                byes: int(v.byes),
                forfeits: int(v.forfeits),
                disqualifications: int(v.disqualifications),
                adjustments: num(v.adjustments),
                runs_for: int(v.runsFor),
                overs_faced: num(v.oversFaced),
                wickets_lost: int(v.wicketsLost),
                runs_against: int(v.runsAgainst),
                overs_bowled: num(v.oversBowled),
                wickets_taken: int(v.wicketsTaken),
                includes_adjustments: bool(t.includesAdjustments),
                includes_unofficial: bool(t.includesUnofficial),
                raw: t,
                fetched_at: iso(r.fetchedAt),
              });
            }
        }
        break;
      }
      case "batting":
      case "bowling":
      case "fielding": {
        if (!gradeId) break;
        for (const p of arr(r.data)) {
          const pid = str(p.id);
          if (!pid) continue;
          const o = obj(p.organisation);
          org(o);
          const key = `${gradeId}|${pid}`;
          const prev = stats.get(key) ?? {
            grade_id: gradeId,
            participant_id: pid,
            full_name: null,
            short_name: null,
            org_id: null,
            org_name: null,
            matches: null,
            batting: null,
            bowling: null,
            fielding: null,
            fetched_at: null,
          };
          const s = obj(p.statistics);
          stats.set(key, {
            ...prev,
            full_name: str(p.name) ?? prev.full_name,
            short_name: str(p.shortName) ?? prev.short_name,
            org_id: str(o.id) ?? prev.org_id,
            org_name: str(o.name) ?? prev.org_name,
            matches: int(s.matches) ?? prev.matches,
            [r.kind]: s,
            fetched_at: iso(r.fetchedAt),
          });
          const at = r.fetchedAt ?? "";
          const pp = players.get(pid);
          if (!pp || pp._at <= at)
            players.set(pid, {
              participant_id: pid,
              full_name: str(p.name) ?? pp?.full_name ?? null,
              short_name: str(p.shortName) ?? pp?.short_name ?? null,
              last_org_id: str(o.id) ?? pp?.last_org_id ?? null,
              last_org_name: str(o.name) ?? pp?.last_org_name ?? null,
              _at: at,
            });
        }
        break;
      }
      case "scorecard": {
        const sc = obj(r.data);
        const matchId = str(sc.id) ?? r.id;
        const gid = str(obj(sc.grade).id) ?? gradeId;
        for (const t of arr(sc.teams)) team(t, gid);
        scorecards.push({
          match_id: matchId,
          grade_id: gid,
          status: str(sc.status),
          is_ball_by_ball: bool(sc.isBallByBall),
          result_text: str(obj(sc.matchSummary).resultText),
          raw: sc,
          fetched_at: iso(r.fetchedAt),
        });
        for (const inn of arr(sc.innings)) {
          const iid = str(inn.id);
          if (!iid) continue;
          innings.push({
            innings_id: iid,
            match_id: matchId,
            innings_number: int(inn.inningsNumber),
            innings_order: int(inn.inningsOrder),
            name: str(inn.name),
            batting_team_id: str(inn.battingTeamId),
            runs: int(inn.runsScored),
            wickets: int(inn.numberOfWicketsFallen),
            overs_text: str(inn.oversBowled),
            balls_bowled: oversToBalls(inn.oversBowled),
            is_declared: bool(inn.isDeclared),
            is_follow_on: bool(inn.isFollowOn),
            close_type: str(inn.inningsCloseType),
            byes: int(inn.byesRuns),
            leg_byes: int(inn.legByesRuns),
            wides: int(inn.wideBalls),
            no_balls: int(inn.noBalls),
            penalties: int(inn.penalties),
            extras: int(inn.totalExtras),
          });
          for (const b of arr(inn.batting)) {
            const pid = str(b.participantId);
            if (!pid) continue;
            batting.push({
              innings_id: iid,
              participant_id: pid,
              bat_instance: int(b.batInstance) ?? 1,
              bat_order: int(b.batOrder),
              short_name: str(b.playerShortName),
              runs: int(b.runsScored),
              balls: int(b.ballsFaced),
              fours: int(b.foursScored),
              sixes: int(b.sixesScored),
              strike_rate: num(b.strikeRate),
              minutes: int(b.battingMinutes),
              dismissal_text: str(b.dismissalText),
              dismissal_type: str(b.dismissalType),
              dismissal_type_id: int(b.dismissalTypeId),
            });
          }
          for (const w of arr(inn.bowling)) {
            const pid = str(w.participantId);
            if (!pid) continue;
            bowling.push({
              innings_id: iid,
              participant_id: pid,
              bowl_order: int(w.bowlOrder),
              short_name: str(w.playerShortName),
              overs_text: str(w.oversBowled),
              balls_bowled: oversToBalls(w.oversBowled),
              maidens: int(w.maidensBowled),
              runs: int(w.runsConceded),
              wickets: int(w.wicketsTaken),
              economy: num(w.economy),
              wides: int(w.wideBalls),
              no_balls: int(w.noBalls),
            });
          }
          for (const f of arr(inn.fielding)) {
            const pid = str(f.participantId);
            if (!pid) continue;
            fielding.push({
              innings_id: iid,
              participant_id: pid,
              short_name: str(f.playerShortName),
              catches: int(f.catches),
              wk_catches: int(f.wicketKeeperCatches),
              total_catches: int(f.totalCatches),
              stumpings: int(f.stumpings),
              run_outs: int(f.runOuts),
              assisted_run_outs: int(f.assistedRunOuts),
              unassisted_run_outs: int(f.unassistedRunOuts),
            });
          }
          for (const w of arr(inn.fallOfWickets)) {
            const wicket = int(w.order);
            if (wicket == null) continue;
            fow.push({
              innings_id: iid,
              wicket,
              participant_id: str(w.participantId),
              short_name: str(w.playerShortName),
              runs: int(w.runs),
            });
          }
        }
        break;
      }
      case "balls": {
        const d = obj(r.data);
        for (const t of arr(d.teams)) team(t, gradeId);
        for (const inn of arr(d.innings)) {
          const iid = str(inn.id);
          if (!iid) continue;
          arr(inn.balls).forEach((b, seq) => {
            const ballId = str(b.id);
            if (!ballId) return;
            const hl = obj(b.highlight);
            balls.push({
              ball_id: ballId,
              match_id: r.id,
              innings_id: iid,
              innings_number: int(inn.inningsNumber),
              batting_team_id: str(inn.battingTeamId),
              seq,
              over_number: int(b.overNumber),
              ball_number: int(b.ballNumber),
              ball_display_number: int(b.ballDisplayNumber),
              ball_time: iso(b.ballTime),
              striker_id: str(b.strikerParticipantId),
              striker_name: str(b.strikerShortName),
              non_striker_id: str(b.nonStrikerParticipantId),
              non_striker_name: str(b.nonStrikerShortName),
              bowler_id: str(b.bowlerParticipantId),
              bowler_name: str(b.bowlerShortName),
              runs_bat: int(b.runsBat),
              wides: int(b.wides),
              no_balls: int(b.noBalls),
              byes: int(b.byes),
              leg_byes: int(b.legByes),
              penalty_runs: int(b.penaltyRuns),
              is_wicket: b.dismissedParticipantId != null || b.dismissalTypeId != null,
              dismissal_type: str(b.dismissalType),
              dismissal_type_id: int(b.dismissalTypeId),
              dismissed_id: str(b.dismissedParticipantId),
              fielder_id: str(b.fielderParticipantId),
              fielder_name: str(b.fielderShortName),
              progress_runs: int(b.progressRuns),
              progress_wickets: int(b.progressWickets),
              progress_score: str(b.progressScore),
              striker_runs: int(b.strikerRunsScored),
              striker_balls: int(b.strikerBallsFaced),
              short_description: str(b.shortDescription),
              description: str(b.description),
              highlight_url: str(hl.highlightUrl ?? hl.highlightURL),
            });
          });
        }
        break;
      }
      case "lineup": {
        // An upcoming match's own record: each team's named side (empty until named).
        const d = obj(r.data);
        const matchId = str(d.id) ?? r.id;
        const gid = str(obj(d.grade).id) ?? gradeId;
        for (const t of arr(d.teams)) {
          const teamId = team(t, gid);
          if (!teamId) continue;
          lineups.set(`${matchId}|${teamId}`, {
            match_id: matchId,
            team_id: teamId,
            players: arr(t.players).map((p) => ({
              participantId: str(p.participantId),
              name: str(p.name),
              shortName: str(p.shortName),
              roles: arr(p.roles).map((x) => String(x)),
            })),
            fetched_at: iso(r.fetchedAt) ?? new Date().toISOString(),
          });
        }
        break;
      }
      default:
        break; // plan (handled above), rounds (informational only)
    }
  }

  return {
    organisations: [...orgs.values()],
    seasons: [...seasons.values()],
    grades: [...grades.values()],
    teams: [...teams.values()],
    matches: [...matches.values()],
    ladders: [...ladders.values()],
    players: [...players.values()].map(({ _at: _ignored, ...p }) => p),
    player_grade_stats: [...stats.values()],
    scorecards,
    match_innings: innings,
    match_batting: batting,
    match_bowling: bowling,
    match_fielding: fielding,
    fall_of_wickets: fow,
    balls,
    match_lineups: [...lineups.values()],
    runs,
  };
}

/** Fixture-facing fields whose change between loads is worth recording. */
export const FIXTURE_FIELDS = [
  "status",
  "start_at",
  "end_at",
  "venue_name",
  "surface_name",
  "home_team_id",
  "away_team_id",
  "match_type",
  "round_name",
  "result_text",
  "home_score",
  "away_score",
] as const;

const norm = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

/** Diff an existing matches row against the incoming one; returns fixture_changes rows. */
export function diffFixture(existing: Row, incoming: Row): Row[] {
  const out: Row[] = [];
  for (const f of FIXTURE_FIELDS) {
    const a = norm(existing[f]);
    const b = norm(incoming[f]);
    if (a !== b)
      out.push({
        match_id: incoming.id,
        grade_id: incoming.grade_id,
        field: f,
        old_value: a,
        new_value: b,
      });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

const JSONB_COLUMNS = new Set([
  "raw",
  "plan",
  "counts",
  "batting",
  "bowling",
  "fielding",
  "players",
]);

export function upsertSql(
  table: string,
  cols: string[],
  pk: string[],
  rowCount: number,
  noUpdate: string[] = [],
): string {
  const values: string[] = [];
  let p = 1;
  for (let r = 0; r < rowCount; r++) {
    const ph = cols.map((c) => (JSONB_COLUMNS.has(c) ? `$${p++}::jsonb` : `$${p++}`));
    values.push(`(${ph.join(",")})`);
  }
  const updates = cols
    .filter((c) => !pk.includes(c) && !noUpdate.includes(c))
    .map((c) => `${c} = excluded.${c}`);
  const conflict = pk.length
    ? updates.length
      ? `on conflict (${pk.join(",")}) do update set ${updates.join(", ")}`
      : `on conflict (${pk.join(",")}) do nothing`
    : "";
  return `insert into ${table} (${cols.join(",")}) values ${values.join(",")} ${conflict}`;
}

/** The slice of a pg Pool / PoolClient / Client the loader needs. */
export type Queryable = {
  query: <R extends Row = Row>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }>;
};

async function upsert(
  c: Queryable,
  table: string,
  pk: string[],
  rows: Row[],
  noUpdate: string[] = [],
): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]!);
  const batch = Math.max(1, Math.min(200, Math.floor(30000 / cols.length))); // ≤65k params, ~1 MB per statement
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const params: unknown[] = [];
    for (const row of slice)
      for (const col of cols) {
        const v = row[col];
        params.push(JSONB_COLUMNS.has(col) ? (v == null ? null : JSON.stringify(v)) : (v ?? null));
      }
    await c.query(upsertSql(table, cols, pk, slice.length, noUpdate), params);
  }
  return rows.length;
}

const TABLE_KEYS: Record<keyof Omit<LoadRows, "runs" | "match_lineups">, string[]> = {
  organisations: ["id"],
  seasons: ["id"],
  grades: ["id"],
  teams: ["id"],
  matches: ["id"],
  ladders: ["grade_id", "ladder_name", "team_id"],
  players: ["participant_id"],
  player_grade_stats: ["grade_id", "participant_id"],
  scorecards: ["match_id"],
  match_innings: ["innings_id"],
  match_batting: ["innings_id", "participant_id", "bat_instance"],
  match_bowling: ["innings_id", "participant_id"],
  match_fielding: ["innings_id", "participant_id"],
  fall_of_wickets: ["innings_id", "wicket"],
  balls: ["ball_id"],
};

/** Where a load came from and how its collection went; stamped on `playhq.scrape_runs`. */
export interface RunMeta {
  /** Which collector produced the dump: `cli`, `manual`, `gha-headless`, `public-api`, … */
  collector?: string;
  /** The scheduled plan this run served (`weekly`, `matchday`, …), when there is one. */
  planName?: string | null;
  /** `ok` unless the collector reported errors (`partial`) or gave up (`failed`). */
  status?: "ok" | "partial" | "failed";
  /** The collector's own error list (e.g. harness `__ov.status().errors`). */
  errors?: unknown[] | null;
  /** How long collection took, when the collector measured it. */
  durationMs?: number | null;
}

export interface LoadResult {
  counts: Record<string, number>;
  /** `playhq.scrape_runs` ids written for this load (one per plan record in the dump). */
  runIds: number[];
}

export async function loadRows(
  c: Queryable,
  rows: LoadRows,
  sourceFile: string,
  meta: RunMeta = {},
): Promise<LoadResult> {
  const counts: Record<string, number> = {};
  // Fixture change detection before the matches upsert overwrites the previous state.
  const ids = rows.matches.map((m) => m.id as string);
  const changes: Row[] = [];
  if (ids.length) {
    const existing = await c.query(
      `select id, ${FIXTURE_FIELDS.join(",")} from playhq.matches where id = any($1::uuid[])`,
      [ids],
    );
    const byId = new Map(existing.rows.map((r) => [r.id as string, r]));
    for (const m of rows.matches) {
      const prev = byId.get(m.id as string);
      if (prev) changes.push(...diffFixture(prev, m));
    }
  }
  for (const table of Object.keys(TABLE_KEYS) as (keyof typeof TABLE_KEYS)[]) {
    const noUpdate = table === "matches" ? ["first_seen_at"] : [];
    counts[table] = await upsert(c, `playhq.${table}`, TABLE_KEYS[table], rows[table], noUpdate);
  }
  if (rows.matches.length)
    await c.query(`update playhq.matches set updated_at = now() where id = any($1::uuid[])`, [ids]);
  // Named sides replace the stored row whole. Skipped (not failed) until the table exists, so
  // a database without it keeps syncing everything else.
  if (rows.match_lineups.length) {
    const exists = await c.query<{ ok: boolean }>(
      `select to_regclass('playhq.match_lineups') is not null as ok`,
    );
    counts.match_lineups = exists.rows[0]?.ok
      ? await upsert(c, "playhq.match_lineups", ["match_id", "team_id"], rows.match_lineups)
      : 0;
  }
  counts.fixture_changes = await upsert(c, "playhq.fixture_changes", [], changes);
  const runIds: number[] = [];
  for (const run of rows.runs) {
    const res = await c.query(
      `insert into playhq.scrape_runs
         (source_file, org_id, plan, exported_at, counts, notes,
          collector, plan_name, harness_version, status, errors, duration_ms)
       values ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12)
       returning id`,
      [
        sourceFile,
        run.org_id,
        JSON.stringify(run.plan),
        run.exported_at,
        JSON.stringify(counts),
        run.notes,
        meta.collector ?? null,
        meta.planName ?? null,
        run.harness_version ?? null,
        meta.status ?? "ok",
        meta.errors?.length ? JSON.stringify(meta.errors) : null,
        meta.durationMs ?? null,
      ],
    );
    runIds.push(Number(res.rows[0]?.id));
  }
  return { counts, runIds };
}

/**
 * Drop everything belonging to junior / pathway grades (juniors isolation: they are never
 * blended into senior surfaces). `juniorGradeIds` adds grades already known to be junior
 * (e.g. `playhq.grades.is_junior` for a grade this dump has no `grade` record for).
 * Pure; the scheduled-ingest path applies it, the hand-run CLI keeps its own behaviour.
 */
export function dropJuniorGrades(
  rows: LoadRows,
  juniorGradeIds: Iterable<string> = [],
): { rows: LoadRows; droppedGradeIds: string[] } {
  const junior = new Set<string>(juniorGradeIds);
  for (const g of rows.grades) if (g.is_junior === true) junior.add(g.id as string);
  if (junior.size === 0) return { rows, droppedGradeIds: [] };

  const keepGrade = (r: Row) => !junior.has(r.grade_id as string);
  const matches = rows.matches.filter(keepGrade);
  const scorecards = rows.scorecards.filter(keepGrade);
  const droppedMatchIds = new Set(
    [...rows.matches, ...rows.scorecards]
      .filter((r) => !keepGrade(r))
      .map((r) => (r.id ?? r.match_id) as string),
  );
  const keepMatch = (r: Row) => !droppedMatchIds.has(r.match_id as string);
  const match_innings = rows.match_innings.filter(keepMatch);
  const droppedInnings = new Set(
    rows.match_innings.filter((r) => !keepMatch(r)).map((r) => r.innings_id as string),
  );
  const keepInnings = (r: Row) => !droppedInnings.has(r.innings_id as string);
  const player_grade_stats = rows.player_grade_stats.filter(keepGrade);

  // A participant seen only in junior grade stats is a junior; keep everyone else.
  const seniorPlayers = new Set(player_grade_stats.map((r) => r.participant_id as string));
  const juniorOnly = new Set(
    rows.player_grade_stats
      .filter((r) => !keepGrade(r))
      .map((r) => r.participant_id as string)
      .filter((id) => !seniorPlayers.has(id)),
  );

  return {
    rows: {
      ...rows,
      grades: rows.grades.filter((g) => !junior.has(g.id as string)),
      teams: rows.teams.filter(keepGrade),
      matches,
      ladders: rows.ladders.filter(keepGrade),
      players: rows.players.filter((p) => !juniorOnly.has(p.participant_id as string)),
      player_grade_stats,
      scorecards,
      match_innings,
      match_batting: rows.match_batting.filter(keepInnings),
      match_bowling: rows.match_bowling.filter(keepInnings),
      match_fielding: rows.match_fielding.filter(keepInnings),
      fall_of_wickets: rows.fall_of_wickets.filter(keepInnings),
      balls: rows.balls.filter(keepMatch),
      match_lineups: rows.match_lineups.filter(keepMatch),
    },
    droppedGradeIds: [...junior],
  };
}
