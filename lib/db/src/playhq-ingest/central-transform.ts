/**
 * PlayHQ scorecard → central stats rows: the pure half of the projector.
 *
 * Plan: docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md (P0/P3). The shapes
 * follow what the external archive builder wrote for 2002/03–2025/26, so career views,
 * leaderboards and records cannot tell a projected match from a builder-loaded one. The builder's
 * conventions, established by the P0 golden diff on 2025/26 matches:
 *
 *  - `innings` is the PlayHQ `inningsOrder` (1, 2, 3, 4 across the match).
 *  - Home is the side with the LOWER central club id (not PlayHQ's `isHome`); an unresolved side
 *    is always away.
 *  - Scores are "runs/wickets" ("166/10"); PlayHQ writes "10-166", and omits wickets when all out.
 *  - `dismissal` is PlayHQ's `dismissalText` verbatim; `dismissal_type` is lowercased, with
 *    "Did Not Bat" and anything unrecognised stored as "other".
 *  - Did-not-bat players get a batting row (0 runs, 0 balls).
 *  - Rosters are the scorecard's team lists; fall of wickets keeps `wicket` null.
 *  - `match_date` is the local (Perth) calendar date of the start time.
 *
 * One deliberate difference: `central.fielding` is built from PlayHQ's own per-player fielding
 * counts (catches, stumpings, run-outs), one row per dismissal. The builder parsed names out of
 * dismissal text and lost some (P0 found 4 of 10 catches in one match), so the projected rows are
 * more complete than the builder's for the same match.
 *
 * No I/O here: the projector (central-project.ts) supplies the PlayHQ rows and crosswalks.
 */

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────

/** The parts of a PlayHQ IncludeScorecard payload the projection reads. */
export interface RawScorecard {
  id: string;
  status?: string | null;
  matchSummary?: {
    resultText?: string | null;
    teams?: Array<{
      id: string;
      displayName?: string | null;
      scoreText?: string | null;
      wonToss?: boolean | null;
      isWinner?: boolean | null;
    }>;
  } | null;
  teams?: Array<{
    id: string;
    players?: Array<{
      name?: string | null;
      shortName?: string | null;
      participantId?: string | null;
    }>;
  }> | null;
  innings?: Array<RawInnings> | null;
}

export interface RawInnings {
  inningsOrder?: number | null;
  inningsNumber?: number | null;
  battingTeamId?: string | null;
  runsScored?: number | null;
  numberOfWicketsFallen?: number | null;
  batting?: Array<{
    participantId?: string | null;
    playerShortName?: string | null;
    batOrder?: number | null;
    runsScored?: number | null;
    ballsFaced?: number | null;
    foursScored?: number | null;
    sixesScored?: number | null;
    strikeRate?: string | number | null;
    dismissalText?: string | null;
    dismissalType?: string | null;
  }> | null;
  bowling?: Array<{
    participantId?: string | null;
    playerShortName?: string | null;
    bowlOrder?: number | null;
    oversBowled?: number | string | null;
    maidensBowled?: number | null;
    runsConceded?: number | null;
    wicketsTaken?: number | null;
    economy?: string | number | null;
    wideBalls?: number | null;
    noBalls?: number | null;
  }> | null;
  fielding?: Array<{
    participantId?: string | null;
    playerShortName?: string | null;
    totalCatches?: number | null;
    catches?: number | null;
    wicketKeeperCatches?: number | null;
    stumpings?: number | null;
    runOuts?: number | null;
  }> | null;
  fallOfWickets?: Array<{
    order?: number | null;
    participantId?: string | null;
    runs?: number | null;
  }> | null;
}

/** The `playhq.matches` row (snake_case, as stored). */
export interface PlayhqMatchRow {
  id: string;
  status: string | null;
  match_type: string | null;
  round_name: string | null;
  start_at: string | Date | null;
  venue_name: string | null;
  surface_name: string | null;
  result_text: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_org_id: string | null;
  away_org_id: string | null;
  home_score: string | null;
  away_score: string | null;
  grade_id: string;
}

export interface TransformContext {
  /** PlayHQ grade name, e.g. "A Grade Wyllie Cup". */
  gradeName: string | null;
  /** Central grade label, from central.grade_playhq_map (falls back to `gradeName`). */
  centralGrade: string | null;
  /** PlayHQ season name, e.g. "Summer 2026/27" — the builder's `season` format. */
  seasonName: string | null;
  /** PlayHQ organisation GUID (lowercase) → central club id. */
  orgToClub: ReadonlyMap<string, number>;
  /** Full names by participant ("Surname, Firstname", from playhq.players), when known. */
  fullNames?: ReadonlyMap<string, string>;
}

// ── Outputs (central column names) ──────────────────────────────────────────────────────────

export interface CentralMatchRow {
  playhq_match_id: string;
  season: string | null;
  grade: string | null;
  grade_id: string;
  comp_type: string | null;
  round: string | null;
  match_date: string | null;
  venue: string | null;
  venue_oval: string | null;
  status: string | null;
  home_club_id: number | null;
  away_club_id: number | null;
  home_team: string | null;
  away_team: string | null;
  home_score: string | null;
  away_score: string | null;
  toss_winner_club_id: number | null;
  winner_club_id: number | null;
  result_text: string | null;
}

export interface CentralBattingRow {
  innings: number;
  club_id: number | null;
  team_name: string | null;
  bat_order: number | null;
  participant_id: string | null;
  player_name: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number | null;
  dismissal: string | null;
  dismissal_type: string;
  fielder: string | null;
}

export interface CentralBowlingRow {
  innings: number;
  club_id: number | null;
  team_name: string | null;
  participant_id: string | null;
  player_name: string | null;
  overs: number | null;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number | null;
  wides: number;
  no_balls: number;
}

export interface CentralRosterRow {
  club_id: number | null;
  team_name: string | null;
  participant_id: string | null;
  player_name: string | null;
}

export interface CentralFowRow {
  innings: number;
  wicket: null;
  runs: number | null;
  participant_id: string | null;
}

export interface CentralFieldingRow {
  club_id: number | null;
  participant_id: string | null;
  player_name: string | null;
  kind: "catch" | "stumping" | "run out";
}

export interface CentralPlayerSeed {
  participant_id: string;
  display_name: string;
  club_id: number;
}

export interface CentralProjection {
  match: CentralMatchRow;
  batting: CentralBattingRow[];
  bowling: CentralBowlingRow[];
  rosters: CentralRosterRow[];
  fallOfWickets: CentralFowRow[];
  fielding: CentralFieldingRow[];
  /** Participants on a resolved side, for central.players upserts. */
  players: CentralPlayerSeed[];
}

/** Why a match cannot be projected; the projector warns and skips. */
export class ProjectionSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionSkip";
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────

const DISMISSAL_TYPES: Record<string, string> = {
  caught: "caught",
  bowled: "bowled",
  "not out": "not out",
  lbw: "lbw",
  "run out": "run out",
  stumped: "stumped",
  "caught & bowled": "caught & bowled",
  "caught and bowled": "caught & bowled",
};

/**
 * PlayHQ dismissal type → the builder's lowercase vocabulary ("other" for the rest). PlayHQ types
 * a caught-and-bowled as plain "Caught" and only says so in the text ("c&b: J Wyllie"); the
 * builder stored those as "caught & bowled", so the text decides.
 */
export function centralDismissalType(t: string | null | undefined, text?: string | null): string {
  if (/^c\s*&\s*b\b/i.test(text ?? "")) return "caught & bowled";
  return DISMISSAL_TYPES[(t ?? "").trim().toLowerCase()] ?? "other";
}

/**
 * The fielder named in a dismissal: the catcher ("" when PlayHQ left the name blank, the bowler
 * for a caught-and-bowled), the stumper, or the run-out fielder(s); null for every other
 * dismissal. Informational only — no read uses `match_batting.fielder` (fielding stats come from
 * `central.fielding`), and where the builder blanked a name PlayHQ gives, this keeps it.
 */
export function dismissalFielder(text: string | null | undefined): string | null {
  const s = text ?? "";
  // Caught and bowled: the bowler is the catcher.
  let m = /^c\s*&\s*b:\s*(.*)$/i.exec(s);
  if (m) return m[1]!.trim();
  m = /^c:\s*(.*?)\s*b:/i.exec(s);
  if (m) return m[1]!.trim();
  m = /^st:\s*(.*?)\s*b:/i.exec(s);
  if (m) return m[1]!.trim();
  m = /^run out\s*\((.*)\)\s*$/i.exec(s);
  if (m) return m[1]!.trim() || null;
  return null;
}

/** PlayHQ "10-166" / "166" / "7-205d" / "3-120 & 2-40" → the builder's "166/10" style. */
export function centralScore(scoreText: string | null | undefined): string | null {
  const s = (scoreText ?? "").trim();
  if (!s) return null;
  return s
    .split("&")
    .map((part) => {
      const p = part.trim();
      const m = /^(\d+)\s*-\s*(\d+)(.*)$/.exec(p);
      if (m) return `${m[2]}/${m[1]}${m[3]!.trim()}`;
      const all = /^(\d+)(.*)$/.exec(p);
      return all ? `${all[1]}/10${all[2]!.trim()}` : p;
    })
    .join(" & ");
}

/** Perth calendar date (YYYY-MM-DD) of a start time; Perth has no daylight saving (UTC+8). */
export function perthDate(at: string | Date | null | undefined): string | null {
  if (!at) return null;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
}

/** The builder only labels one-day and T20 games; everything else (multi-day) is null. */
function centralCompType(t: string | null | undefined): string | null {
  const v = (t ?? "").trim();
  return v === "One Day" || v === "T20" ? v : null;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const int = (v: number | null | undefined): number => (typeof v === "number" ? v : 0);

/** "Jacob Barnes" → "Barnes, Jacob" (the builder's player display form). */
export function surnameFirst(full: string | null | undefined): string | null {
  const s = (full ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes(",")) return s;
  const i = s.lastIndexOf(" ");
  return i < 0 ? s : `${s.slice(i + 1)}, ${s.slice(0, i)}`;
}

// ── The transform ───────────────────────────────────────────────────────────────────────────

/**
 * Build the central rows for one PlayHQ match. `raw` may be null for a match with no scorecard
 * (abandoned or forfeited before a ball): the match row is still produced, with no lines.
 * Throws ProjectionSkip when neither side maps to a central club.
 */
export function scorecardToCentral(
  m: PlayhqMatchRow,
  raw: RawScorecard | null,
  ctx: TransformContext,
): CentralProjection {
  const clubOfOrg = (org: string | null) =>
    org ? (ctx.orgToClub.get(org.toLowerCase()) ?? null) : null;

  // The two sides as PlayHQ has them, resolved to central clubs.
  const playhqSides = [
    {
      teamId: m.home_team_id,
      name: m.home_team_name,
      club: clubOfOrg(m.home_org_id),
      score: m.home_score,
    },
    {
      teamId: m.away_team_id,
      name: m.away_team_name,
      club: clubOfOrg(m.away_org_id),
      score: m.away_score,
    },
  ];
  if (playhqSides.every((s) => s.club === null))
    throw new ProjectionSkip(
      `neither side of PlayHQ match ${m.id} maps to a central club (orgs ${m.home_org_id}, ${m.away_org_id})`,
    );

  // Builder convention: home = the lower central club id; an unresolved side is away.
  const [home, away] = [...playhqSides].sort((a, b) => {
    if (a.club === null) return 1;
    if (b.club === null) return -1;
    return a.club - b.club;
  }) as [(typeof playhqSides)[number], (typeof playhqSides)[number]];

  const sideOfTeam = new Map<string, (typeof playhqSides)[number]>();
  for (const s of playhqSides) if (s.teamId) sideOfTeam.set(s.teamId, s);
  const otherSide = (s: (typeof playhqSides)[number] | undefined) =>
    s ? playhqSides.find((x) => x !== s) : undefined;

  const summaryTeams = raw?.matchSummary?.teams ?? [];
  const summaryScore = (teamId: string | null) =>
    summaryTeams.find((t) => t.id === teamId)?.scoreText ?? null;
  const clubWhere = (pred: (t: (typeof summaryTeams)[number]) => boolean | null | undefined) => {
    const t = summaryTeams.find((x) => pred(x));
    return t ? (sideOfTeam.get(t.id)?.club ?? null) : null;
  };

  const match: CentralMatchRow = {
    playhq_match_id: m.id,
    season: ctx.seasonName,
    grade: ctx.centralGrade ?? ctx.gradeName,
    grade_id: m.grade_id,
    comp_type: centralCompType(m.match_type),
    round: m.round_name,
    match_date: perthDate(m.start_at),
    venue: m.venue_name,
    venue_oval: m.surface_name,
    status: raw?.status ?? m.status,
    home_club_id: home.club,
    away_club_id: away.club,
    home_team: home.name,
    away_team: away.name,
    home_score: centralScore(summaryScore(home.teamId) ?? home.score),
    away_score: centralScore(summaryScore(away.teamId) ?? away.score),
    toss_winner_club_id: clubWhere((t) => t.wonToss),
    winner_club_id: clubWhere((t) => t.isWinner),
    result_text: raw?.matchSummary?.resultText ?? m.result_text,
  };

  const out: CentralProjection = {
    match,
    batting: [],
    bowling: [],
    rosters: [],
    fallOfWickets: [],
    fielding: [],
    players: [],
  };
  if (!raw) return out;

  // Unresolved opposition keeps its names but carries no participant ids (builder convention).
  const pid = (club: number | null, id: string | null | undefined) =>
    club === null ? null : (id ?? null);

  for (const inn of raw.innings ?? []) {
    const innings = inn.inningsOrder ?? inn.inningsNumber ?? 1;
    const bat = inn.battingTeamId ? sideOfTeam.get(inn.battingTeamId) : undefined;
    const field = otherSide(bat);
    const batClub = bat?.club ?? null;
    const fieldClub = field?.club ?? null;

    for (const b of inn.batting ?? []) {
      out.batting.push({
        innings,
        club_id: batClub,
        team_name: bat?.name ?? null,
        bat_order: b.batOrder ?? null,
        participant_id: pid(batClub, b.participantId),
        player_name: b.playerShortName ?? null,
        runs: int(b.runsScored),
        balls: int(b.ballsFaced),
        fours: int(b.foursScored),
        sixes: int(b.sixesScored),
        strike_rate: num(b.strikeRate),
        dismissal: b.dismissalText ?? null,
        dismissal_type: centralDismissalType(b.dismissalType, b.dismissalText),
        fielder: dismissalFielder(b.dismissalText),
      });
    }
    for (const w of inn.bowling ?? []) {
      out.bowling.push({
        innings,
        club_id: fieldClub,
        team_name: field?.name ?? null,
        participant_id: pid(fieldClub, w.participantId),
        player_name: w.playerShortName ?? null,
        overs: num(w.oversBowled),
        maidens: int(w.maidensBowled),
        runs: int(w.runsConceded),
        wickets: int(w.wicketsTaken),
        economy: num(w.economy),
        wides: int(w.wideBalls),
        no_balls: int(w.noBalls),
      });
    }
    for (const f of [...(inn.fallOfWickets ?? [])].sort((a, b) => int(a.order) - int(b.order))) {
      out.fallOfWickets.push({
        innings,
        wicket: null,
        runs: f.runs ?? null,
        participant_id: pid(batClub, f.participantId),
      });
    }
    for (const f of inn.fielding ?? []) {
      const row = (kind: CentralFieldingRow["kind"]) => ({
        club_id: fieldClub,
        participant_id: pid(fieldClub, f.participantId),
        player_name: f.playerShortName ?? null,
        kind,
      });
      const catches = f.totalCatches ?? int(f.catches) + int(f.wicketKeeperCatches);
      for (let i = 0; i < catches; i++) out.fielding.push(row("catch"));
      for (let i = 0; i < int(f.stumpings); i++) out.fielding.push(row("stumping"));
      for (let i = 0; i < int(f.runOuts); i++) out.fielding.push(row("run out"));
    }
  }

  const seen = new Set<string>();
  for (const t of raw.teams ?? []) {
    const side = sideOfTeam.get(t.id);
    const club = side?.club ?? null;
    for (const p of t.players ?? []) {
      out.rosters.push({
        club_id: club,
        team_name: side?.name ?? null,
        participant_id: pid(club, p.participantId),
        player_name: p.shortName ?? null,
      });
      if (club !== null && p.participantId && !seen.has(p.participantId)) {
        seen.add(p.participantId);
        out.players.push({
          participant_id: p.participantId,
          display_name:
            ctx.fullNames?.get(p.participantId) ??
            surnameFirst(p.name) ??
            p.shortName ??
            "Unknown Player",
          club_id: club,
        });
      }
    }
  }
  return out;
}
