/**
 * The junior projection: an enabled club's junior grades in `playhq.*` → the club's
 * `junior_*` tables, from the 2026/27 season onward
 * (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md, U5; KTD5–KTD10, R8–R13, R22).
 *
 * What it writes, per enabled tenant (the API decides the set once, `junior-sync.ts`):
 *
 *  - `junior_fixtures`: every in-scope match without a published scorecard (upcoming, or
 *    played but unscored), upserted on (tenant, PlayHQ match id) so its status stays current.
 *    A scored match only refreshes an existing fixture's status (KTD9, KTD10).
 *  - `junior_team_lists`: the club's own side for fixtures starting within 8 days, or played
 *    in the last 7 days (the scorecard's side, else the last lineup), published, source
 *    `playhq`. An admin-saved list is never overwritten (KTD9).
 *  - `junior_participants`: the club's own players only, from lineups (so they exist before
 *    their first game) and scorecards, keyed (tenant, lowercased GUID). An admin rename and
 *    `privacy_override` are never overwritten; privacy only tightens (KTD8).
 *  - `junior_matches` + lines + roster: finished or in-progress matches with scorecard lines,
 *    ids from `junior_sync_id_seq`. Lines are updated in place, matched on (innings,
 *    participant) or batting order; only new lines get new ids. After each match is written
 *    its `junior_stat_corrections` are re-applied and its participant ids mapped through
 *    `junior_participant_merges`, mirroring the one-off loader's steps 6–7 (KTD7).
 *
 * It never writes `public.fixtures`, `public.team_lists`, `central.*` or a senior player
 * table, never reads a grade with `is_junior = false`, never touches a season before 2026/27
 * and never a row below the sync id band (loader rows, admin-added lines) (KTD5, KTD6, R12).
 * Opposition players keep their participant id and PlayHQ's short name on the scorecard
 * lines only and never become participants (R22).
 *
 * The planners are pure (unit-tested in junior-project.test.ts); `projectJuniors` is the
 * thin DB layer. Reads `playhq.*` through the caller's reader; writes the app database.
 */
import { sql } from "drizzle-orm";
import type { Queryable } from "./load";
import { lineupEntries, PLAYED_LOOKBACK_DAYS, TEAM_LIST_LOOKAHEAD_DAYS } from "./team-lists";
import {
  centralScore,
  centralStatus,
  givenFirst,
  initialsOnlyName,
  IN_PROGRESS,
  perthDate,
  type RawScorecard,
} from "./central-transform";
import { isWithheldName } from "./central-project";
import { juniorAgeBand, normaliseJuniorAge } from "../juniors/age-groups";
import {
  JUNIOR_SYNC_ID_START,
  type JuniorTeamListPlayer,
  type JuniorTeamListSource,
} from "../schema/juniors";
// Types only: the module itself is imported lazily inside `projectJuniors`.
import type * as DbModuleNs from "../index";

/** The first season the sync owns (2026/27). Earlier seasons belong to the one-off loader. */
export const JUNIOR_SYNC_FIRST_SEASON = 2026;

/** The label stored for a participant PlayHQ withholds and the club has no name for. */
export const JUNIOR_WITHHELD_NAME = "Private Player";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** An enabled tenant and its junior PlayHQ organisation (from the API's junior-sync gate). */
export interface JuniorSyncTenantRef {
  tenantId: number;
  orgId: string;
}

/** One junior PlayHQ match as read from `playhq.*` (with its scorecard, when fetched). */
export interface JuniorSourceMatch {
  id: string;
  gradeName: string | null;
  seasonName: string | null;
  isJunior: boolean;
  status: string | null;
  startAt: Date | null;
  roundName: string | null;
  venueName: string | null;
  surfaceName: string | null;
  venueLine1: string | null;
  venueSuburb: string | null;
  resultText: string | null;
  homeTeamId: string | null;
  homeTeamName: string | null;
  homeOrgId: string | null;
  homeOrgName: string | null;
  homeScore: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  awayOrgId: string | null;
  awayOrgName: string | null;
  awayScore: string | null;
  winnerTeamId: string | null;
  /** The association that runs the grade (the grade's owner organisation). */
  ownerOrgName: string | null;
  scorecard: RawScorecard | null;
}

export interface JuniorPlanContext {
  tenantId: number;
  /** The tenant's junior organisation. */
  orgId: string;
  /** Full names by lowercased participant GUID ("Surname, Given" from playhq.players). */
  fullNames: ReadonlyMap<string, string>;
  /** The tenant's merged duplicate GUID → keeper GUID (both lowercased). */
  merges: ReadonlyMap<string, string>;
  /** PlayHQ organisation (lowercased) → shared clubs register id, for opposition crests. */
  clubIdByOrg?: ReadonlyMap<string, number>;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface JuniorParticipantSeed {
  participantId: string;
  /** Best name PlayHQ gives, given name first; null when withheld or unknown. */
  name: string | null;
  isPrivate: boolean;
}

export interface JuniorFixturePlan {
  tenantId: number;
  playhqMatchId: string;
  seasonStartYear: number;
  ageGroup: string | null;
  grade: string | null;
  teamName: string | null;
  opponentName: string | null;
  venue: string | null;
  startAt: Date | null;
  isHome: boolean;
  status: string | null;
}

export interface JuniorMatchFields {
  tenantId: number;
  playhqMatchId: string;
  season: string;
  seasonStartYear: number;
  grade: string | null;
  ageGroup: string | null;
  ageGroupRaw: string | null;
  teamName: string | null;
  competition: string | null;
  association: string | null;
  round: string | null;
  matchDate: string | null;
  venue: string | null;
  venueOval: string | null;
  venueAddress: string | null;
  venueSuburb: string | null;
  status: string;
  team1: string | null;
  team1Score: string | null;
  team2: string | null;
  team2Score: string | null;
  hhTeamId: string | null;
  hhResult: string | null;
  winner: string | null;
  tossWinner: string | null;
  hhBattedFirst: boolean | null;
  opponentName: string | null;
  opponentClubId: number | null;
}

export interface JuniorBattingPlan {
  innings: number;
  battingTeam: string | null;
  isHallsHead: boolean;
  batOrder: number | null;
  participantId: string | null;
  playerName: string | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  strikeRate: number | null;
  dismissal: string | null;
}

export interface JuniorBowlingPlan {
  innings: number;
  bowlingTeam: string | null;
  isHallsHead: boolean;
  participantId: string | null;
  playerName: string | null;
  overs: number | null;
  maidens: number | null;
  runs: number | null;
  wickets: number | null;
  economy: number | null;
  wides: number | null;
  noBalls: number | null;
}

export interface JuniorRosterPlan {
  teamName: string | null;
  isHallsHead: boolean;
  participantId: string | null;
  playerName: string | null;
}

export interface JuniorMatchPlan {
  match: JuniorMatchFields;
  batting: JuniorBattingPlan[];
  bowling: JuniorBowlingPlan[];
  rosters: JuniorRosterPlan[];
  /** The club's own players on this match (own side only). */
  participants: JuniorParticipantSeed[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const lc = (s: string | null | undefined): string | null => (s ? s.toLowerCase() : null);

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const intOrNull = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** A merged duplicate GUID becomes its keeper. */
function mapped(id: string | null, merges: ReadonlyMap<string, string>): string | null {
  const key = lc(id);
  return key ? (merges.get(key) ?? key) : null;
}

/** Whether a PlayHQ name string marks the player as withheld (private on PlayHQ). */
function withheld(name: string | null | undefined): boolean {
  return !!name?.trim() && isWithheldName(name);
}

/** A usable display name, given name first; null when blank or withheld. */
function realName(name: string | null | undefined): string | null {
  if (!name?.trim() || withheld(name)) return null;
  return givenFirst(name);
}

/** Whether `candidate` should replace `current` as a stored name (never initials over full). */
function betterName(candidate: string, current: string | null | undefined): boolean {
  if (!current?.trim() || withheld(current) || current === JUNIOR_WITHHELD_NAME) return true;
  if (initialsOnlyName(candidate) && !initialsOnlyName(current)) return false;
  return true;
}

/**
 * The junior season of a match: PlayHQ's season name ("Summer 2026/27" → "2026/27"), else
 * the start date's Perth calendar (July onwards starts a season). Null when neither says.
 */
export function juniorSeason(
  seasonName: string | null | undefined,
  startAt: Date | string | null | undefined,
): { season: string; startYear: number } | null {
  const m = /(\d{4})\s*\/\s*(\d{2}|\d{4})\b/.exec(seasonName ?? "");
  let startYear: number | null = m ? Number(m[1]) : null;
  if (startYear === null) {
    const d = perthDate(startAt ?? null);
    if (!d) return null;
    const year = Number(d.slice(0, 4));
    const month = Number(d.slice(5, 7));
    startYear = month >= 7 ? year : year - 1;
  }
  return { season: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`, startYear };
}

/** The enabled tenants whose junior organisation plays in this match (junior grades only). */
export function juniorTenantsForMatch(
  m: Pick<JuniorSourceMatch, "isJunior" | "homeOrgId" | "awayOrgId">,
  tenants: readonly JuniorSyncTenantRef[],
): JuniorSyncTenantRef[] {
  if (!m.isJunior) return [];
  const orgs = new Set([lc(m.homeOrgId), lc(m.awayOrgId)].filter((o): o is string => !!o));
  return tenants
    .map((t) => ({ tenantId: t.tenantId, orgId: t.orgId.toLowerCase() }))
    .filter((t) => orgs.has(t.orgId));
}

/** A scorecard is published ("scored") when it has batting or bowling lines (KTD10). */
export function isScoredScorecard(raw: RawScorecard | null | undefined): boolean {
  return (raw?.innings ?? []).some(
    (inn) => (inn.batting?.length ?? 0) > 0 || (inn.bowling?.length ?? 0) > 0,
  );
}

/**
 * What to do with a match's existing `junior_matches` row: insert a new synced row, update
 * our own synced row, or leave a loader / out-of-band row alone (KTD6, AE2).
 */
export function juniorMatchWriteTarget(existingId: number | null): "insert" | "update" | "skip" {
  if (existingId === null) return "insert";
  return existingId >= JUNIOR_SYNC_ID_START ? "update" : "skip";
}

// ---------------------------------------------------------------------------
// Sides and scope
// ---------------------------------------------------------------------------

interface Side {
  teamId: string | null;
  orgId: string | null;
  /** How the side is labelled on junior rows: own team name, opposition club name. */
  label: string | null;
  teamName: string | null;
  score: string | null;
  own: boolean;
  isHome: boolean;
}

interface Scope {
  season: { season: string; startYear: number };
  /** The club's side (home in a club-vs-club derby). */
  ours: Side;
  theirs: Side;
  sideOfTeam: Map<string, Side>;
}

function scopeOf(m: JuniorSourceMatch, ctx: JuniorPlanContext): Scope | null {
  if (!m.isJunior) return null;
  const season = juniorSeason(m.seasonName, m.startAt);
  if (!season || season.startYear < JUNIOR_SYNC_FIRST_SEASON) return null;
  const org = ctx.orgId.toLowerCase();
  const side = (home: boolean): Side => {
    const orgId = lc(home ? m.homeOrgId : m.awayOrgId);
    const teamName = home ? m.homeTeamName : m.awayTeamName;
    const orgName = home ? m.homeOrgName : m.awayOrgName;
    const own = orgId === org;
    return {
      teamId: lc(home ? m.homeTeamId : m.awayTeamId),
      orgId,
      label: own ? teamName : (orgName ?? teamName),
      teamName,
      score: home ? m.homeScore : m.awayScore,
      own,
      isHome: home,
    };
  };
  const home = side(true);
  const away = side(false);
  if (!home.own && !away.own) return null;
  const ours = home.own ? home : away;
  const theirs = ours === home ? away : home;
  const sideOfTeam = new Map<string, Side>();
  for (const s of [home, away]) if (s.teamId) sideOfTeam.set(s.teamId, s);
  return { season, ours, theirs, sideOfTeam };
}

function ageGroups(grade: string | null): { ageGroup: string | null; ageGroupRaw: string | null } {
  const trimmed = grade?.trim() || null;
  return {
    ageGroup: juniorAgeBand(grade) ?? trimmed,
    ageGroupRaw: normaliseJuniorAge(grade) ?? trimmed,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The club's junior fixture for an in-scope match; null when out of scope. */
export function planJuniorFixture(
  m: JuniorSourceMatch,
  ctx: JuniorPlanContext,
): JuniorFixturePlan | null {
  const s = scopeOf(m, ctx);
  if (!s) return null;
  return {
    tenantId: ctx.tenantId,
    playhqMatchId: m.id.toLowerCase(),
    seasonStartYear: s.season.startYear,
    ageGroup: ageGroups(m.gradeName).ageGroup,
    grade: m.gradeName,
    teamName: s.ours.teamName,
    opponentName: s.theirs.label,
    venue: m.venueName,
    startAt: m.startAt,
    isHome: s.ours.isHome,
    status: (m.status ?? m.scorecard?.status ?? null)?.toUpperCase() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/** Combine seeds per participant: privacy tightens (any private wins), the best name wins. */
export function mergeParticipantSeeds(
  seeds: readonly JuniorParticipantSeed[],
): JuniorParticipantSeed[] {
  const out = new Map<string, JuniorParticipantSeed>();
  for (const s of seeds) {
    const id = s.participantId.toLowerCase();
    const prev = out.get(id);
    if (!prev) {
      out.set(id, { participantId: id, name: s.name, isPrivate: s.isPrivate });
      continue;
    }
    prev.isPrivate = prev.isPrivate || s.isPrivate;
    if (s.name && betterName(s.name, prev.name)) prev.name = s.name;
  }
  return [...out.values()];
}

/** Participants from the club's named side (`playhq.match_lineups.players`). */
export function seedsFromLineup(players: unknown, ctx: JuniorPlanContext): JuniorParticipantSeed[] {
  const seeds: JuniorParticipantSeed[] = [];
  for (const e of lineupEntries(players)) {
    const id = mapped(e.participantId, ctx.merges);
    if (!id) continue;
    const isPrivate = withheld(e.name);
    const full = e.participantId ? ctx.fullNames.get(e.participantId.toLowerCase()) : undefined;
    seeds.push({
      participantId: id,
      name: givenFirst(full) ?? (isPrivate ? null : realName(e.name)),
      isPrivate,
    });
  }
  return mergeParticipantSeeds(seeds);
}

/** The participant columns the sync compares. */
export interface ExistingParticipant {
  displayName: string | null;
  isPrivate: boolean;
}

export type ParticipantWrite =
  | { kind: "insert"; displayName: string; isPrivate: boolean }
  | { kind: "update"; displayName?: string; isPrivate?: true }
  | { kind: "none" };

/**
 * How the sync writes one participant (KTD8): insert a new one; otherwise tighten privacy
 * when PlayHQ now withholds the player, and refresh the name unless an admin renamed them
 * (`renamed`) or the new name is worse. `privacy_override*` and the senior link are never
 * written, and `is_private` never goes back to false here.
 */
export function planParticipantWrite(
  existing: ExistingParticipant | null,
  seed: JuniorParticipantSeed,
  renamed: boolean,
): ParticipantWrite {
  if (!existing)
    return {
      kind: "insert",
      displayName: seed.name ?? JUNIOR_WITHHELD_NAME,
      isPrivate: seed.isPrivate,
    };
  const out: { displayName?: string; isPrivate?: true } = {};
  if (seed.isPrivate && !existing.isPrivate) out.isPrivate = true;
  if (
    !renamed &&
    seed.name &&
    seed.name !== existing.displayName &&
    betterName(seed.name, existing.displayName)
  )
    out.displayName = seed.name;
  return Object.keys(out).length ? { kind: "update", ...out } : { kind: "none" };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

/** "Did Not Bat" rows: the loaded junior history has none, and they'd count as innings. */
function didNotBat(b: { dismissalText?: string | null; dismissalType?: string | null }): boolean {
  return /did\s*not\s*bat/i.test(`${b.dismissalType ?? ""} ${b.dismissalText ?? ""}`);
}

function resultFor(
  m: JuniorSourceMatch,
  s: Scope,
  status: string,
): { hhResult: string | null; winner: string | null } {
  if (status === IN_PROGRESS) return { hhResult: null, winner: null };
  const summary = m.scorecard?.matchSummary?.teams ?? [];
  const winnerId = lc(m.winnerTeamId) ?? lc(summary.find((t) => t.isWinner)?.id);
  const winnerSide = winnerId ? s.sideOfTeam.get(winnerId) : undefined;
  if (winnerSide)
    return { hhResult: winnerSide === s.ours ? "Won" : "Lost", winner: winnerSide.label };
  if (status !== "COMPLETED") return { hhResult: "No Result", winner: null };
  const text = `${m.scorecard?.matchSummary?.resultText ?? ""} ${m.resultText ?? ""}`;
  if (/\btie[d]?\b/i.test(text)) return { hhResult: "Tied", winner: null };
  if (/\bdraw/i.test(text)) return { hhResult: "Drawn", winner: null };
  return { hhResult: null, winner: null };
}

/**
 * A scored, in-scope match as the club's junior match: the match row from the club's
 * perspective, both sides' batting / bowling lines and rosters, and the club's own players.
 * Null when out of scope or when the scorecard has no lines (an unscored grade, KTD10).
 */
export function planJuniorMatch(
  m: JuniorSourceMatch,
  ctx: JuniorPlanContext,
): JuniorMatchPlan | null {
  const s = scopeOf(m, ctx);
  const raw = m.scorecard;
  if (!s || !raw || !isScoredScorecard(raw)) return null;

  const summary = raw.matchSummary?.teams ?? [];
  const summaryOf = (teamId: string | null) =>
    teamId ? summary.find((t) => lc(t.id) === teamId) : undefined;
  const status = centralStatus(raw.status ?? m.status);
  const { hhResult, winner } = resultFor(m, s, status);
  const tossTeam = lc(summary.find((t) => t.wonToss)?.id);
  const innings = [...(raw.innings ?? [])].sort(
    (a, b) => (a.inningsOrder ?? a.inningsNumber ?? 1) - (b.inningsOrder ?? b.inningsNumber ?? 1),
  );
  const firstBat = lc(innings[0]?.battingTeamId);
  const [team1, team2] = s.ours.isHome ? [s.ours, s.theirs] : [s.theirs, s.ours];
  const score = (side: Side) => centralScore(summaryOf(side.teamId)?.scoreText ?? side.score);
  const { ageGroup, ageGroupRaw } = ageGroups(m.gradeName);

  const match: JuniorMatchFields = {
    tenantId: ctx.tenantId,
    playhqMatchId: m.id.toLowerCase(),
    season: s.season.season,
    seasonStartYear: s.season.startYear,
    grade: m.gradeName,
    ageGroup,
    ageGroupRaw,
    teamName: s.ours.teamName,
    competition: m.gradeName,
    association: m.ownerOrgName,
    round: m.roundName,
    matchDate: perthDate(m.startAt),
    venue: m.venueName,
    venueOval: m.surfaceName,
    venueAddress: m.venueLine1,
    venueSuburb: m.venueSuburb,
    status,
    team1: team1.label,
    team1Score: score(team1),
    team2: team2.label,
    team2Score: score(team2),
    hhTeamId: s.ours.teamId,
    hhResult,
    winner,
    tossWinner: tossTeam ? (s.sideOfTeam.get(tossTeam)?.label ?? null) : null,
    hhBattedFirst: firstBat ? s.sideOfTeam.get(firstBat) === s.ours : null,
    opponentName: s.theirs.label,
    opponentClubId: (s.theirs.orgId && ctx.clubIdByOrg?.get(s.theirs.orgId)) || null,
  };

  // The club's own players, with the best name any source gives.
  const seeds: JuniorParticipantSeed[] = [];
  const seed = (id: string | null, names: (string | null | undefined)[]) => {
    const key = lc(id);
    const pid = mapped(id, ctx.merges);
    if (!key || !pid) return;
    const isPrivate = names.some(withheld);
    const full = ctx.fullNames.get(key);
    const name = givenFirst(full) ?? names.map(realName).find((n): n is string => !!n) ?? null;
    seeds.push({ participantId: pid, name, isPrivate });
  };
  for (const t of raw.teams ?? []) {
    const side = s.sideOfTeam.get(lc(t.id) ?? "");
    if (side?.own)
      for (const p of t.players ?? []) seed(p.participantId ?? null, [p.name, p.shortName]);
  }
  for (const inn of innings) {
    const bat = s.sideOfTeam.get(lc(inn.battingTeamId) ?? "");
    for (const b of inn.batting ?? [])
      if (bat?.own) seed(b.participantId ?? null, [b.playerShortName]);
    for (const w of inn.bowling ?? [])
      if (bat && !bat.own) seed(w.participantId ?? null, [w.playerShortName]);
  }
  const participants = mergeParticipantSeeds(seeds);
  const nameOf = new Map(participants.map((p) => [p.participantId, p.name]));
  const lineName = (own: boolean, pid: string | null, short: string | null | undefined) =>
    (own && pid ? nameOf.get(pid) : null) ?? short ?? null;

  const batting: JuniorBattingPlan[] = [];
  const bowling: JuniorBowlingPlan[] = [];
  for (const inn of innings) {
    const order = inn.inningsOrder ?? inn.inningsNumber ?? 1;
    const bat = s.sideOfTeam.get(lc(inn.battingTeamId) ?? "");
    const field = bat ? (bat === s.ours ? s.theirs : s.ours) : undefined;
    for (const b of inn.batting ?? []) {
      if (didNotBat(b)) continue;
      const own = !!bat?.own;
      const pid = mapped(b.participantId ?? null, ctx.merges);
      batting.push({
        innings: order,
        battingTeam: bat?.label ?? null,
        isHallsHead: own,
        batOrder: intOrNull(b.batOrder),
        participantId: pid,
        playerName: lineName(own, pid, b.playerShortName),
        runs: intOrNull(b.runsScored),
        balls: intOrNull(b.ballsFaced),
        fours: intOrNull(b.foursScored),
        sixes: intOrNull(b.sixesScored),
        strikeRate: num(b.strikeRate),
        dismissal: b.dismissalText ?? null,
      });
    }
    for (const w of inn.bowling ?? []) {
      const own = !!field?.own;
      const pid = mapped(w.participantId ?? null, ctx.merges);
      bowling.push({
        innings: order,
        bowlingTeam: field?.label ?? null,
        isHallsHead: own,
        participantId: pid,
        playerName: lineName(own, pid, w.playerShortName),
        overs: num(w.oversBowled),
        maidens: intOrNull(w.maidensBowled),
        runs: intOrNull(w.runsConceded),
        wickets: intOrNull(w.wicketsTaken),
        economy: num(w.economy),
        wides: intOrNull(w.wideBalls),
        noBalls: intOrNull(w.noBalls),
      });
    }
  }

  // Rosters: the scorecard's team sheets (else everyone on a line), one entry per player.
  const rosters: JuniorRosterPlan[] = [];
  const rostered = new Set<string>();
  const addRoster = (side: Side | undefined, pid: string | null, short: string | null) => {
    if (!side) return;
    if (pid) {
      if (rostered.has(pid)) return;
      rostered.add(pid);
    }
    rosters.push({
      teamName: side.label,
      isHallsHead: side.own,
      participantId: pid,
      playerName: lineName(side.own, pid, short),
    });
  };
  if ((raw.teams ?? []).some((t) => (t.players?.length ?? 0) > 0)) {
    for (const t of raw.teams ?? []) {
      const side = s.sideOfTeam.get(lc(t.id) ?? "");
      for (const p of t.players ?? [])
        addRoster(side, mapped(p.participantId ?? null, ctx.merges), p.shortName ?? null);
    }
  } else {
    for (const b of batting)
      addRoster(b.isHallsHead ? s.ours : s.theirs, b.participantId, b.playerName);
    for (const w of bowling)
      addRoster(w.isHallsHead ? s.ours : s.theirs, w.participantId, w.playerName);
  }

  return { match, batting, bowling, rosters, participants };
}

// ---------------------------------------------------------------------------
// Stable lines (KTD7)
// ---------------------------------------------------------------------------

type LineKeyInput = {
  innings?: number | null;
  participantId: string | null;
  batOrder?: number | null;
  isHallsHead: boolean;
  playerName: string | null;
};

const nameKey = (n: string | null) => (n ?? "").trim().toLowerCase();

/** A batting line's identity: (innings, participant), else (innings, batting order, side). */
export function battingLineKey(l: LineKeyInput): string {
  const pid = lc(l.participantId);
  return pid
    ? `${l.innings ?? ""}|p|${pid}`
    : `${l.innings ?? ""}|o|${l.batOrder ?? ""}|${l.isHallsHead}`;
}

/** A bowling line's identity: (innings, participant), else (innings, side, name). */
export function bowlingLineKey(l: LineKeyInput): string {
  const pid = lc(l.participantId);
  return pid
    ? `${l.innings ?? ""}|p|${pid}`
    : `${l.innings ?? ""}|n|${l.isHallsHead}|${nameKey(l.playerName)}`;
}

/** A roster entry's identity: participant, else (side, name). */
export function rosterLineKey(l: LineKeyInput): string {
  const pid = lc(l.participantId);
  return pid ? `p|${pid}` : `n|${l.isHallsHead}|${nameKey(l.playerName)}`;
}

export interface LineReconciliation<T> {
  updates: { id: number; row: T }[];
  inserts: T[];
  /** Synced lines PlayHQ no longer has. */
  removes: number[];
}

/**
 * Match the planned lines to the match's existing lines by identity. Only synced lines
 * (`id >= JUNIOR_SYNC_ID_START`) are considered: loader rows and admin-added lines are never
 * updated or removed. A planned line whose identity an admin deleted is not re-created.
 */
export function reconcileLines<T>(
  existing: readonly { id: number; key: string }[],
  planned: readonly T[],
  keyOf: (row: T) => string,
  deletedKeys: ReadonlySet<string>,
): LineReconciliation<T> {
  const byKey = new Map<string, number[]>();
  for (const e of existing) {
    if (e.id < JUNIOR_SYNC_ID_START) continue;
    const ids = byKey.get(e.key) ?? [];
    ids.push(e.id);
    byKey.set(e.key, ids);
  }
  const out: LineReconciliation<T> = { updates: [], inserts: [], removes: [] };
  for (const row of planned) {
    const key = keyOf(row);
    const ids = byKey.get(key);
    const id = ids?.shift();
    if (id !== undefined) out.updates.push({ id, row });
    else if (!deletedKeys.has(key)) out.inserts.push(row);
  }
  for (const ids of byKey.values()) out.removes.push(...ids);
  out.removes.sort((a, b) => a - b);
  return out;
}

/**
 * The participant a synced line had from PlayHQ, before any admin correction re-pointed it:
 * the pre-image of the first participant correction (journal order), else the current id.
 */
export function syncIdentityParticipant(
  current: string | null,
  participantCorrections: readonly { participantId: string | null | undefined }[],
): string | null {
  if (participantCorrections.length) return lc(participantCorrections[0]!.participantId ?? null);
  return lc(current);
}

export type JuniorLineTable =
  "junior_match_batting" | "junior_match_bowling" | "junior_match_rosters";

/**
 * Identities of synced lines an admin deleted (journal `op = 'delete'`, `prev_values` = the
 * full row), so a re-sync does not bring them back.
 */
export function deletedLineKeys(
  table: JuniorLineTable,
  deletions: readonly { targetId: string; prevValues: unknown }[],
): Set<string> {
  const keyOf =
    table === "junior_match_batting"
      ? battingLineKey
      : table === "junior_match_bowling"
        ? bowlingLineKey
        : rosterLineKey;
  const out = new Set<string>();
  for (const d of deletions) {
    if (!(Number(d.targetId) >= JUNIOR_SYNC_ID_START)) continue;
    const p = (d.prevValues ?? {}) as Record<string, unknown>;
    out.add(
      keyOf({
        innings: typeof p.innings === "number" ? p.innings : num(p.innings as string),
        participantId: typeof p.participant_id === "string" ? p.participant_id : null,
        batOrder: typeof p.bat_order === "number" ? p.bat_order : num(p.bat_order as string),
        isHallsHead: p.is_halls_head === true || p.is_halls_head === "true",
        playerName: typeof p.player_name === "string" ? p.player_name : null,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Team lists (KTD9)
// ---------------------------------------------------------------------------

/** The club's side as a junior team list: by participant only, PlayHQ's order, roles kept. */
export function planJuniorTeamList(
  players: unknown,
  merges: ReadonlyMap<string, string>,
): JuniorTeamListPlayer[] {
  const seen = new Set<string>();
  const entries = lineupEntries(players)
    .map((e) => ({ ...e, participantId: mapped(e.participantId, merges) }))
    .filter((e) => {
      if (!e.participantId || seen.has(e.participantId)) return false;
      seen.add(e.participantId);
      return true;
    })
    .sort(
      (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
    );
  return entries.map((e, i) => {
    const role: JuniorTeamListPlayer["role"] =
      e.isCaptain && e.isWicketKeeper
        ? "C/WK"
        : e.isCaptain
          ? "C"
          : e.isWicketKeeper
            ? "WK"
            : undefined;
    return { order: i + 1, participantId: e.participantId!, ...(role ? { role } : {}) };
  });
}

function sameJuniorTeamList(
  a: readonly JuniorTeamListPlayer[],
  b: readonly JuniorTeamListPlayer[],
): boolean {
  const norm = (l: readonly JuniorTeamListPlayer[]) =>
    JSON.stringify(l.map((p) => [p.order, p.participantId.toLowerCase(), p.role ?? null]));
  return norm(a) === norm(b);
}

/** Whether the sync writes a fixture's team list: never over an admin's, never a no-op. */
export function teamListAction(
  existing: {
    source: JuniorTeamListSource | string;
    isPublished: boolean;
    players: readonly JuniorTeamListPlayer[];
  } | null,
  players: readonly JuniorTeamListPlayer[],
): "write" | "keepAdmin" | "unchanged" {
  if (players.length === 0) return "unchanged";
  if (!existing) return "write";
  if (existing.source !== "playhq") return "keepAdmin";
  if (existing.isPublished && sameJuniorTeamList(existing.players, players)) return "unchanged";
  return "write";
}

/** Whether a fixture's side is copied now: upcoming within 8 days, or played in the last 7. */
export function teamListWindow(startAt: Date | null, now: Date): "upcoming" | "played" | null {
  if (!startAt) return null;
  const t = startAt.getTime();
  const n = now.getTime();
  const day = 24 * 3600 * 1000;
  if (t > n) return t <= n + TEAM_LIST_LOOKAHEAD_DAYS * day ? "upcoming" : null;
  return t > n - PLAYED_LOOKBACK_DAYS * day ? "played" : null;
}

// ---------------------------------------------------------------------------
// DB layer
// ---------------------------------------------------------------------------

type DbModule = typeof DbModuleNs;
type Db = DbModule["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Pick<Db, "execute">;

export interface JuniorProjectionOpts {
  /** The enabled tenants and their junior organisations (the API's junior-sync gate). */
  tenants: readonly JuniorSyncTenantRef[];
  /** Reader for `playhq.*`. */
  central: Queryable;
  /** Restrict to these PlayHQ matches (the ingest passes its dump's); absent → every one. */
  matchIds?: string[];
  now?: Date;
  log?: (line: string) => void;
}

export interface JuniorProjectionError {
  stage: "participants" | "fixtures" | "teamLists" | "match";
  playhqMatchId?: string;
  message: string;
}

export interface JuniorProjectionSummary {
  tenantId: number;
  /** In-scope junior matches read for the tenant. */
  matches: number;
  fixturesWritten: number;
  teamListsWritten: number;
  teamListsKeptAdmin: number;
  matchesCreated: number;
  matchesUpdated: number;
  /** Matches whose row belongs to the loader (below the sync band): left alone. */
  matchesSkipped: number;
  participantsCreated: number;
  participantsUpdated: number;
  /** Lowercased GUIDs whose stored metadata the caller should recompute. */
  touchedParticipantIds: string[];
  errors: JuniorProjectionError[];
}

type SourceRow = {
  id: string;
  grade_name: string | null;
  season_name: string | null;
  is_junior: boolean;
  status: string | null;
  start_at: Date | string | null;
  round_name: string | null;
  venue_name: string | null;
  surface_name: string | null;
  venue_line1: string | null;
  venue_suburb: string | null;
  result_text: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  home_org_id: string | null;
  home_org_name: string | null;
  home_score: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  away_org_id: string | null;
  away_org_name: string | null;
  away_score: string | null;
  winner_team_id: string | null;
  owner_org_name: string | null;
  scorecard: RawScorecard | null;
};

/** Junior matches of one organisation (2026 onward, coarse; the planners decide exactly). */
async function loadSourceMatches(
  central: Queryable,
  orgId: string,
  matchIds: string[] | undefined,
): Promise<JuniorSourceMatch[]> {
  const params: unknown[] = [orgId.toLowerCase(), `${JUNIOR_SYNC_FIRST_SEASON}-01-01`];
  let filter = "";
  if (matchIds) {
    params.push(matchIds.map((id) => id.toLowerCase()));
    filter = `and lower(m.id::text) = any($3::text[])`;
  }
  const { rows } = await central.query<SourceRow>(
    `select m.id::text as id, g.name as grade_name, g.season_name, g.is_junior,
            m.status, m.start_at, m.round_name, m.venue_name, m.surface_name,
            m.venue_line1, m.venue_suburb, m.result_text,
            m.home_team_id::text as home_team_id, m.home_team_name,
            m.home_org_id::text as home_org_id, ho.name as home_org_name, m.home_score,
            m.away_team_id::text as away_team_id, m.away_team_name,
            m.away_org_id::text as away_org_id, ao.name as away_org_name, m.away_score,
            m.winner_team_id::text as winner_team_id, oo.name as owner_org_name,
            s.raw as scorecard
       from playhq.matches m
       join playhq.grades g on g.id = m.grade_id
       left join playhq.organisations ho on ho.id = m.home_org_id
       left join playhq.organisations ao on ao.id = m.away_org_id
       left join playhq.organisations oo on oo.id = g.owner_org_id
       left join playhq.scorecards s on s.match_id = m.id
      where g.is_junior = true
        and (lower(m.home_org_id::text) = $1 or lower(m.away_org_id::text) = $1)
        and (m.start_at is null or m.start_at >= $2::date)
        ${filter}
      order by m.start_at nulls last, m.id`,
    params,
  );
  return rows.map((r) => ({
    id: r.id.toLowerCase(),
    gradeName: r.grade_name,
    seasonName: r.season_name,
    isJunior: r.is_junior === true,
    status: r.status,
    startAt: r.start_at ? new Date(r.start_at) : null,
    roundName: r.round_name,
    venueName: r.venue_name,
    surfaceName: r.surface_name,
    venueLine1: r.venue_line1,
    venueSuburb: r.venue_suburb,
    resultText: r.result_text,
    homeTeamId: r.home_team_id,
    homeTeamName: r.home_team_name,
    homeOrgId: r.home_org_id,
    homeOrgName: r.home_org_name,
    homeScore: r.home_score,
    awayTeamId: r.away_team_id,
    awayTeamName: r.away_team_name,
    awayOrgId: r.away_org_id,
    awayOrgName: r.away_org_name,
    awayScore: r.away_score,
    winnerTeamId: r.winner_team_id,
    ownerOrgName: r.owner_org_name,
    scorecard: r.scorecard,
  }));
}

async function rowsOf<R>(exec: Exec, q: ReturnType<typeof sql>): Promise<R[]> {
  const res = await exec.execute(q);
  return (res as unknown as { rows: R[] }).rows;
}

/** Every participant GUID on these matches' team sheets and lines, plus these lineups. */
function guidsIn(matches: JuniorSourceMatch[], lineups: { players: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    for (const t of m.scorecard?.teams ?? [])
      for (const p of t.players ?? []) if (p.participantId) ids.add(p.participantId.toLowerCase());
    for (const inn of m.scorecard?.innings ?? []) {
      for (const b of inn.batting ?? [])
        if (b.participantId) ids.add(b.participantId.toLowerCase());
      for (const w of inn.bowling ?? [])
        if (w.participantId) ids.add(w.participantId.toLowerCase());
    }
  }
  for (const l of lineups)
    for (const e of lineupEntries(l.players))
      if (e.participantId) ids.add(e.participantId.toLowerCase());
  return [...ids];
}

/**
 * Project the enabled tenants' junior grades from `playhq.*` into their `junior_*` tables.
 * One tenant's failure never stops another's; one match's failure never stops the rest
 * (each is its own transaction and is reported in `errors`, with ids only).
 */
export async function projectJuniors(
  opts: JuniorProjectionOpts,
): Promise<JuniorProjectionSummary[]> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? new Date();
  if (opts.tenants.length === 0 || (opts.matchIds && opts.matchIds.length === 0)) return [];
  const { db, clubsTable } = await import("../index");
  const { isNotNull } = await import("drizzle-orm");

  const clubs = await db
    .select({ id: clubsTable.id, orgId: clubsTable.playhqOrgId })
    .from(clubsTable)
    .where(isNotNull(clubsTable.playhqOrgId));
  const clubIdByOrg = new Map<string, number>();
  for (const c of clubs) if (c.orgId) clubIdByOrg.set(c.orgId.toLowerCase(), c.id);

  const summaries: JuniorProjectionSummary[] = [];
  for (const t of opts.tenants) {
    const summary: JuniorProjectionSummary = {
      tenantId: t.tenantId,
      matches: 0,
      fixturesWritten: 0,
      teamListsWritten: 0,
      teamListsKeptAdmin: 0,
      matchesCreated: 0,
      matchesUpdated: 0,
      matchesSkipped: 0,
      participantsCreated: 0,
      participantsUpdated: 0,
      touchedParticipantIds: [],
      errors: [],
    };
    summaries.push(summary);
    await projectTenant(db, opts.central, t, now, clubIdByOrg, opts.matchIds, summary);
    log(
      `tenant ${t.tenantId}: ${summary.matches} junior match(es) → ${summary.fixturesWritten} fixture(s), ` +
        `${summary.teamListsWritten} team list(s) (${summary.teamListsKeptAdmin} kept: admin's), ` +
        `${summary.matchesCreated} new / ${summary.matchesUpdated} refreshed match(es), ` +
        `${summary.matchesSkipped} loader match(es) left alone, ${summary.participantsCreated} new / ` +
        `${summary.participantsUpdated} refreshed participant(s), ${summary.errors.length} error(s)`,
    );
  }
  return summaries;
}

/**
 * An error as safe text for warnings and logs: the Postgres error code and the first line of
 * the message, with key values and failing rows (which can hold a player's name) removed.
 */
export function juniorProjectionErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const first = (err instanceof Error ? err.message : String(err)).split("\n")[0] ?? "";
  const text = first
    .replace(/Failing row contains.*$/i, "")
    .replace(/\([^()]*\)=\([^()]*\)/g, "(…)")
    .trim();
  return typeof code === "string" && code ? `${code}: ${text}` : text;
}

const errMessage = juniorProjectionErrorText;

async function projectTenant(
  db: Db,
  central: Queryable,
  t: JuniorSyncTenantRef,
  now: Date,
  clubIdByOrg: Map<string, number>,
  matchIds: string[] | undefined,
  summary: JuniorProjectionSummary,
): Promise<void> {
  const tenantId = t.tenantId;
  const all = await loadSourceMatches(central, t.orgId, matchIds);
  const ref = { tenantId, orgId: t.orgId.toLowerCase() };
  const lineups = all.length
    ? (
        await central.query<{ match_id: string; team_id: string; players: unknown }>(
          `select lower(match_id::text) as match_id, lower(team_id::text) as team_id, players
             from playhq.match_lineups where match_id = any($1::uuid[])`,
          [all.map((m) => m.id)],
        )
      ).rows
    : [];
  const guids = guidsIn(all, lineups);
  const fullNames = new Map<string, string>();
  if (guids.length) {
    const { rows } = await central.query<{ participant_id: string; full_name: string }>(
      `select lower(participant_id::text) as participant_id, full_name
         from playhq.players
        where participant_id = any($1::uuid[]) and full_name is not null`,
      [guids],
    );
    for (const r of rows) fullNames.set(r.participant_id, r.full_name);
  }
  const merges = new Map<string, string>();
  for (const r of await rowsOf<{ dup: string; keeper: string }>(
    db,
    sql`select lower(m.duplicate_participant_id) as dup, lower(m.keeper_participant_id) as keeper
          from junior_participant_merges m
         where m.tenant_id = ${tenantId}
           and exists (select 1 from junior_participants k
                        where k.tenant_id = ${tenantId}
                          and k.participant_id = m.keeper_participant_id)`,
  ))
    merges.set(r.dup, r.keeper);
  const ctx: JuniorPlanContext = { tenantId, orgId: ref.orgId, fullNames, merges, clubIdByOrg };

  // Plans for this tenant's in-scope matches.
  const inScope = all.filter(
    (m) => juniorTenantsForMatch(m, [ref]).length > 0 && planJuniorFixture(m, ctx) !== null,
  );
  summary.matches = inScope.length;
  if (inScope.length === 0) return;
  const lineupOf = new Map<string, unknown>();
  for (const l of lineups) lineupOf.set(`${l.match_id}|${l.team_id}`, l.players);
  const ownTeamIds = (m: JuniorSourceMatch) =>
    [
      lc(m.homeOrgId) === ref.orgId ? lc(m.homeTeamId) : null,
      lc(m.awayOrgId) === ref.orgId ? lc(m.awayTeamId) : null,
    ].filter((x): x is string => !!x);

  const matchPlans = new Map<string, JuniorMatchPlan>();
  const seeds: JuniorParticipantSeed[] = [];
  for (const m of inScope) {
    const plan = planJuniorMatch(m, ctx);
    if (plan) {
      matchPlans.set(m.id, plan);
      seeds.push(...plan.participants);
    }
    for (const team of ownTeamIds(m))
      seeds.push(...seedsFromLineup(lineupOf.get(`${m.id}|${team}`), ctx));
  }

  // 1. Participants: before the lines and lists that name them.
  try {
    await writeParticipants(db, tenantId, mergeParticipantSeeds(seeds), summary);
  } catch (err) {
    summary.errors.push({ stage: "participants", message: errMessage(err) });
  }

  // 2. Fixtures: unscored matches upserted; a scored match only refreshes an existing status.
  try {
    for (const m of inScope) {
      const f = planJuniorFixture(m, ctx)!;
      const written = matchPlans.has(m.id)
        ? await rowsOf<{ id: number }>(
            db,
            sql`update junior_fixtures set status = ${f.status}, updated_at = now()
                 where tenant_id = ${tenantId} and playhq_match_id = ${f.playhqMatchId}
                   and status is distinct from ${f.status}
                returning id`,
          )
        : await rowsOf<{ id: number }>(
            db,
            sql`insert into junior_fixtures
                  (tenant_id, playhq_match_id, season_start_year, age_group, grade, team_name,
                   opponent_name, venue, start_at, is_home, status)
                values (${tenantId}, ${f.playhqMatchId}, ${f.seasonStartYear}, ${f.ageGroup},
                        ${f.grade}, ${f.teamName}, ${f.opponentName}, ${f.venue},
                        ${f.startAt ? f.startAt.toISOString() : null}::timestamptz, ${f.isHome}, ${f.status})
                on conflict (tenant_id, playhq_match_id) do update set
                  season_start_year = excluded.season_start_year, age_group = excluded.age_group,
                  grade = excluded.grade, team_name = excluded.team_name,
                  opponent_name = excluded.opponent_name, venue = excluded.venue,
                  start_at = excluded.start_at, is_home = excluded.is_home,
                  status = excluded.status, updated_at = now()
                where (junior_fixtures.season_start_year, junior_fixtures.age_group,
                       junior_fixtures.grade, junior_fixtures.team_name,
                       junior_fixtures.opponent_name, junior_fixtures.venue,
                       junior_fixtures.start_at, junior_fixtures.is_home, junior_fixtures.status)
                  is distinct from
                      (excluded.season_start_year, excluded.age_group, excluded.grade,
                       excluded.team_name, excluded.opponent_name, excluded.venue,
                       excluded.start_at, excluded.is_home, excluded.status)
                returning id`,
          );
      summary.fixturesWritten += written.length;
    }
  } catch (err) {
    summary.errors.push({ stage: "fixtures", message: errMessage(err) });
  }

  // 3. Team lists: the club's side for fixtures in the window, never over an admin's.
  try {
    await writeTeamLists(db, tenantId, inScope, lineupOf, ctx, now, summary);
  } catch (err) {
    summary.errors.push({ stage: "teamLists", message: errMessage(err) });
  }

  // 4. Scored matches, one transaction each.
  const touched = new Set(summary.touchedParticipantIds);
  for (const [playhqMatchId, plan] of matchPlans) {
    try {
      const outcome = await db.transaction((tx) => writeMatch(tx, tenantId, plan));
      if (outcome.kind === "skip") summary.matchesSkipped++;
      else if (outcome.kind === "insert") summary.matchesCreated++;
      else summary.matchesUpdated++;
      for (const p of outcome.participants) touched.add(p);
    } catch (err) {
      summary.errors.push({ stage: "match", playhqMatchId, message: errMessage(err) });
    }
  }
  summary.touchedParticipantIds = [...touched].sort();
}

async function writeParticipants(
  db: Db,
  tenantId: number,
  seeds: JuniorParticipantSeed[],
  summary: JuniorProjectionSummary,
): Promise<void> {
  if (seeds.length === 0) return;
  const ids = seeds.map((s) => s.participantId);
  await db.transaction(async (tx) => {
    const existing = new Map<string, ExistingParticipant>();
    // The stored spelling of each GUID (a legacy row may not be lowercased).
    const stored = new Map<string, string>();
    for (const r of await rowsOf<{
      participant_id: string;
      display_name: string | null;
      is_private: boolean;
    }>(
      tx,
      sql`select participant_id, display_name, is_private from junior_participants
           where tenant_id = ${tenantId} and lower(participant_id) = any(${sql.param(ids)}::text[])
           for update`,
    )) {
      existing.set(r.participant_id.toLowerCase(), {
        displayName: r.display_name,
        isPrivate: r.is_private,
      });
      stored.set(r.participant_id.toLowerCase(), r.participant_id);
    }
    // Admin renames: a journalled display_name correction (the loader's rule, ETL 0f).
    const renamed = new Set(
      (
        await rowsOf<{ target_id: string }>(
          tx,
          sql`select distinct lower(target_id) as target_id from junior_stat_corrections
               where tenant_id = ${tenantId} and target_table = 'junior_participants'
                 and op = 'update' and patch ? 'display_name'
                 and lower(target_id) = any(${sql.param(ids)}::text[])`,
        )
      ).map((r) => r.target_id),
    );
    for (const seed of seeds) {
      const w = planParticipantWrite(
        existing.get(seed.participantId) ?? null,
        seed,
        renamed.has(seed.participantId),
      );
      if (w.kind === "insert") {
        const r = await rowsOf<{ participant_id: string }>(
          tx,
          sql`insert into junior_participants (tenant_id, participant_id, display_name, is_private)
              values (${tenantId}, ${seed.participantId}, ${w.displayName}, ${w.isPrivate})
              on conflict (tenant_id, participant_id) do nothing
              returning participant_id`,
        );
        summary.participantsCreated += r.length;
      } else if (w.kind === "update") {
        const key = stored.get(seed.participantId) ?? seed.participantId;
        await tx.execute(
          sql`update junior_participants set
                display_name = coalesce(${w.displayName ?? null}::text, display_name),
                is_private = is_private or ${w.isPrivate === true}
              where tenant_id = ${tenantId} and participant_id = ${key}`,
        );
        summary.participantsUpdated++;
      }
    }
  });
  const touched = new Set(summary.touchedParticipantIds);
  for (const s of seeds) touched.add(s.participantId);
  summary.touchedParticipantIds = [...touched];
}

async function writeTeamLists(
  db: Db,
  tenantId: number,
  matches: JuniorSourceMatch[],
  lineupOf: Map<string, unknown>,
  ctx: JuniorPlanContext,
  now: Date,
  summary: JuniorProjectionSummary,
): Promise<void> {
  const candidates = matches.filter((m) => teamListWindow(m.startAt, now) !== null);
  if (candidates.length === 0) return;
  const fixtures = await rowsOf<{ id: number; playhq_match_id: string }>(
    db,
    sql`select id, playhq_match_id from junior_fixtures
         where tenant_id = ${tenantId}
           and playhq_match_id = any(${sql.param(candidates.map((m) => m.id))}::text[])`,
  );
  const fixtureOf = new Map(fixtures.map((f) => [f.playhq_match_id.toLowerCase(), f.id]));
  const lists = fixtures.length
    ? await rowsOf<{
        junior_fixture_id: number;
        source: string;
        is_published: boolean;
        players: JuniorTeamListPlayer[];
      }>(
        db,
        sql`select junior_fixture_id, source, is_published, players from junior_team_lists
             where tenant_id = ${tenantId}
               and junior_fixture_id = any(${sql.param(fixtures.map((f) => f.id))}::int[])`,
      )
    : [];
  const listOf = new Map(lists.map((l) => [l.junior_fixture_id, l]));

  for (const m of candidates) {
    const fixtureId = fixtureOf.get(m.id);
    if (fixtureId === undefined) continue;
    const s = scopeOf(m, ctx);
    if (!s?.ours.teamId) continue;
    // After the start: the scorecard's side when PlayHQ has one, else the last lineup.
    let side: unknown = lineupOf.get(`${m.id}|${s.ours.teamId}`);
    if (teamListWindow(m.startAt, now) === "played") {
      const sheet = (m.scorecard?.teams ?? []).find((x) => lc(x.id) === s.ours.teamId)?.players;
      if (sheet?.length) side = sheet;
    }
    const players = planJuniorTeamList(side, ctx.merges);
    const current = listOf.get(fixtureId) ?? null;
    const action = teamListAction(
      current
        ? { source: current.source, isPublished: current.is_published, players: current.players }
        : null,
      players,
    );
    if (action === "keepAdmin") summary.teamListsKeptAdmin++;
    if (action !== "write") continue;
    const written = await rowsOf<{ id: number }>(
      db,
      sql`insert into junior_team_lists (tenant_id, junior_fixture_id, players, is_published, source)
          values (${tenantId}, ${fixtureId}, ${JSON.stringify(players)}::jsonb, true, 'playhq')
          on conflict (tenant_id, junior_fixture_id) do update set
            players = excluded.players, is_published = true, updated_at = now()
          where junior_team_lists.source = 'playhq'
          returning id`,
    );
    summary.teamListsWritten += written.length;
  }
}

interface ExistingLine {
  id: number;
  innings: number | null;
  is_halls_head: boolean;
  bat_order?: number | null;
  participant_id: string | null;
  player_name: string | null;
}

/**
 * Write one scored match and its lines (KTD7), then re-apply its corrections and merges
 * (the loader's steps 6–7, scoped to this tenant and this match). Returns the club's
 * participants on the match, for the metadata recompute.
 */
async function writeMatch(
  tx: Tx,
  tenantId: number,
  plan: JuniorMatchPlan,
): Promise<{ kind: "insert" | "update" | "skip"; participants: string[] }> {
  const f = plan.match;
  const [existing] = await rowsOf<{ id: number }>(
    tx,
    sql`select id from junior_matches
         where tenant_id = ${tenantId} and playhq_match_id = ${f.playhqMatchId}
         for update`,
  );
  const kind = juniorMatchWriteTarget(existing?.id ?? null);
  if (kind === "skip") return { kind, participants: [] };

  const cols = sql`season = ${f.season}, season_start_year = ${f.seasonStartYear},
    grade = ${f.grade}, age_group = ${f.ageGroup}, age_group_raw = ${f.ageGroupRaw},
    team_name = ${f.teamName}, competition = ${f.competition}, association = ${f.association},
    round = ${f.round}, match_date = ${f.matchDate}, venue = ${f.venue},
    venue_oval = ${f.venueOval}, venue_address = ${f.venueAddress},
    venue_suburb = ${f.venueSuburb}, status = ${f.status}, team1 = ${f.team1},
    team1_score = ${f.team1Score}, team2 = ${f.team2}, team2_score = ${f.team2Score},
    hh_team_id = ${f.hhTeamId}, hh_result = ${f.hhResult}, winner = ${f.winner},
    toss_winner = ${f.tossWinner}, hh_batted_first = ${f.hhBattedFirst},
    opponent_name = ${f.opponentName}, opponent_club_id = ${f.opponentClubId}`;
  let matchId: number;
  if (kind === "insert") {
    const [row] = await rowsOf<{ id: number }>(
      tx,
      sql`insert into junior_matches (id, tenant_id, playhq_match_id)
          values (nextval('junior_sync_id_seq'), ${tenantId}, ${f.playhqMatchId})
          returning id`,
    );
    matchId = row!.id;
  } else matchId = existing!.id;
  await tx.execute(
    sql`update junior_matches set ${cols} where id = ${matchId} and tenant_id = ${tenantId}`,
  );

  // Journal entries that shape line identity: participant re-points and deletions.
  const journal = await rowsOf<{
    id: number;
    target_table: JuniorLineTable;
    target_id: string;
    op: string;
    prev_values: Record<string, unknown> | null;
  }>(
    tx,
    sql`select id, target_table, target_id, op, prev_values from junior_stat_corrections
         where tenant_id = ${tenantId}
           and target_table in ('junior_match_batting', 'junior_match_bowling', 'junior_match_rosters')
           and (match_id = ${matchId} or playhq_match_id = ${f.playhqMatchId}
                or prev_values->>'match_id' = ${String(matchId)})
           and (op = 'delete' or (op = 'update' and patch ? 'participant_id'))
         order by id`,
  );
  const merges = new Map<string, string>();
  for (const r of await rowsOf<{ dup: string; keeper: string }>(
    tx,
    sql`select lower(duplicate_participant_id) as dup, lower(keeper_participant_id) as keeper
          from junior_participant_merges where tenant_id = ${tenantId}`,
  ))
    merges.set(r.dup, r.keeper);

  const tables = [
    {
      table: "junior_match_batting" as const,
      planned: plan.batting as LineKeyInput[],
      keyOf: battingLineKey,
    },
    {
      table: "junior_match_bowling" as const,
      planned: plan.bowling as LineKeyInput[],
      keyOf: bowlingLineKey,
    },
    {
      table: "junior_match_rosters" as const,
      planned: plan.rosters as LineKeyInput[],
      keyOf: rosterLineKey,
    },
  ];
  for (const { table, planned, keyOf } of tables) {
    const lines = await rowsOf<ExistingLine>(
      tx,
      table === "junior_match_batting"
        ? sql`select id, innings, is_halls_head, bat_order, participant_id, player_name
                from junior_match_batting where match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`
        : table === "junior_match_bowling"
          ? sql`select id, innings, is_halls_head, participant_id, player_name
                  from junior_match_bowling where match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`
          : sql`select id, null::int as innings, is_halls_head, participant_id, player_name
                  from junior_match_rosters where match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`,
    );
    const existingKeys = lines.map((l) => {
      const repoints = journal
        .filter(
          (j) => j.target_table === table && j.op === "update" && j.target_id === String(l.id),
        )
        .map((j) => ({ participantId: (j.prev_values?.participant_id as string | null) ?? null }));
      const pid = syncIdentityParticipant(l.participant_id, repoints);
      return {
        id: l.id,
        key: keyOf({
          innings: l.innings,
          participantId: pid ? (merges.get(pid) ?? pid) : null,
          batOrder: l.bat_order ?? null,
          isHallsHead: l.is_halls_head,
          playerName: l.player_name,
        }),
      };
    });
    const deleted = deletedLineKeys(
      table,
      journal
        .filter((j) => j.target_table === table && j.op === "delete")
        .map((j) => ({ targetId: j.target_id, prevValues: j.prev_values })),
    );
    const r = reconcileLines(existingKeys, planned, keyOf, deleted);
    for (const id of r.removes)
      await tx.execute(
        sql`delete from ${sql.raw(table)} where id = ${id} and match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`,
      );
    for (const u of r.updates) await writeLine(tx, table, matchId, u.row, u.id);
    for (const row of r.inserts) await writeLine(tx, table, matchId, row, null);
  }

  await reapplyCorrections(tx, tenantId, matchId);
  await reapplyMerges(tx, tenantId, matchId);

  const own = new Set<string>();
  for (const l of [...plan.batting, ...plan.bowling, ...plan.rosters])
    if (l.isHallsHead && l.participantId) own.add(l.participantId);
  for (const r of await rowsOf<{ participant_id: string }>(
    tx,
    sql`select participant_id from junior_match_batting where match_id = ${matchId} and is_halls_head and participant_id is not null
        union select participant_id from junior_match_bowling where match_id = ${matchId} and is_halls_head and participant_id is not null
        union select participant_id from junior_match_rosters where match_id = ${matchId} and is_halls_head and participant_id is not null`,
  ))
    own.add(r.participant_id);
  return { kind, participants: [...own] };
}

async function writeLine(
  tx: Tx,
  table: JuniorLineTable,
  matchId: number,
  row: LineKeyInput,
  id: number | null,
): Promise<void> {
  const idSql = id === null ? sql`nextval('junior_sync_id_seq')` : sql`${id}`;
  if (table === "junior_match_batting") {
    const b = row as unknown as JuniorBattingPlan;
    await tx.execute(
      sql`insert into junior_match_batting
            (id, match_id, innings, batting_team, is_halls_head, bat_order, participant_id,
             player_name, runs, balls, fours, sixes, strike_rate, dismissal)
          values (${idSql}, ${matchId}, ${b.innings}, ${b.battingTeam}, ${b.isHallsHead},
                  ${b.batOrder}, ${b.participantId}, ${b.playerName}, ${b.runs}, ${b.balls},
                  ${b.fours}, ${b.sixes}, ${b.strikeRate}, ${b.dismissal})
          on conflict (id) do update set
            innings = excluded.innings, batting_team = excluded.batting_team,
            is_halls_head = excluded.is_halls_head, bat_order = excluded.bat_order,
            participant_id = excluded.participant_id, player_name = excluded.player_name,
            runs = excluded.runs, balls = excluded.balls, fours = excluded.fours,
            sixes = excluded.sixes, strike_rate = excluded.strike_rate,
            dismissal = excluded.dismissal
          where junior_match_batting.match_id = ${matchId}`,
    );
  } else if (table === "junior_match_bowling") {
    const w = row as unknown as JuniorBowlingPlan;
    await tx.execute(
      sql`insert into junior_match_bowling
            (id, match_id, innings, bowling_team, is_halls_head, participant_id, player_name,
             overs, maidens, runs, wickets, economy, wides, no_balls)
          values (${idSql}, ${matchId}, ${w.innings}, ${w.bowlingTeam}, ${w.isHallsHead},
                  ${w.participantId}, ${w.playerName}, ${w.overs}, ${w.maidens}, ${w.runs},
                  ${w.wickets}, ${w.economy}, ${w.wides}, ${w.noBalls})
          on conflict (id) do update set
            innings = excluded.innings, bowling_team = excluded.bowling_team,
            is_halls_head = excluded.is_halls_head, participant_id = excluded.participant_id,
            player_name = excluded.player_name, overs = excluded.overs,
            maidens = excluded.maidens, runs = excluded.runs, wickets = excluded.wickets,
            economy = excluded.economy, wides = excluded.wides, no_balls = excluded.no_balls
          where junior_match_bowling.match_id = ${matchId}`,
    );
  } else {
    const r = row as unknown as JuniorRosterPlan;
    await tx.execute(
      sql`insert into junior_match_rosters
            (id, match_id, team_name, is_halls_head, participant_id, player_name)
          values (${idSql}, ${matchId}, ${r.teamName}, ${r.isHallsHead}, ${r.participantId},
                  ${r.playerName})
          on conflict (id) do update set
            team_name = excluded.team_name, is_halls_head = excluded.is_halls_head,
            participant_id = excluded.participant_id, player_name = excluded.player_name
          where junior_match_rosters.match_id = ${matchId}`,
    );
  }
}

/**
 * Re-apply this match's admin corrections (the loader's step 6, scoped to one tenant and one
 * synced match): admin-added lines (6a), per-column last-write-wins update patches (6b),
 * then deletions (6c). Anchored on the stored PlayHQ match id like the loader.
 */
async function reapplyCorrections(tx: Tx, tenantId: number, matchId: number): Promise<void> {
  const anchor = sql`exists (select 1 from junior_matches m
      where m.id = ${matchId} and m.tenant_id = ${tenantId}
        and (c.playhq_match_id is null or m.playhq_match_id = c.playhq_match_id))`;
  // 6a. Admin-added rows (patch = the full row).
  await tx.execute(sql`
    insert into junior_match_batting (
      id, match_id, innings, batting_team, is_halls_head, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal)
    select (c.patch->>'id')::int, (c.patch->>'match_id')::int, (c.patch->>'innings')::int,
      c.patch->>'batting_team', coalesce((c.patch->>'is_halls_head')::boolean, true),
      (c.patch->>'bat_order')::int, c.patch->>'participant_id', c.patch->>'player_name',
      (c.patch->>'runs')::int, (c.patch->>'balls')::int, (c.patch->>'fours')::int,
      (c.patch->>'sixes')::int, (c.patch->>'strike_rate')::real, c.patch->>'dismissal'
    from junior_stat_corrections c
    where c.tenant_id = ${tenantId} and c.target_table = 'junior_match_batting' and c.op = 'insert'
      and (c.patch->>'match_id')::int = ${matchId} and ${anchor}
    on conflict (id) do nothing`);
  await tx.execute(sql`
    insert into junior_match_bowling (
      id, match_id, innings, bowling_team, is_halls_head, participant_id,
      player_name, overs, maidens, runs, wickets, economy, wides, no_balls)
    select (c.patch->>'id')::int, (c.patch->>'match_id')::int, (c.patch->>'innings')::int,
      c.patch->>'bowling_team', coalesce((c.patch->>'is_halls_head')::boolean, true),
      c.patch->>'participant_id', c.patch->>'player_name', (c.patch->>'overs')::real,
      (c.patch->>'maidens')::int, (c.patch->>'runs')::int, (c.patch->>'wickets')::int,
      (c.patch->>'economy')::real, (c.patch->>'wides')::int, (c.patch->>'no_balls')::int
    from junior_stat_corrections c
    where c.tenant_id = ${tenantId} and c.target_table = 'junior_match_bowling' and c.op = 'insert'
      and (c.patch->>'match_id')::int = ${matchId} and ${anchor}
    on conflict (id) do nothing`);
  await tx.execute(sql`
    insert into junior_match_rosters (id, match_id, team_name, is_halls_head, participant_id, player_name)
    select (c.patch->>'id')::int, (c.patch->>'match_id')::int, c.patch->>'team_name',
      coalesce((c.patch->>'is_halls_head')::boolean, true), c.patch->>'participant_id',
      c.patch->>'player_name'
    from junior_stat_corrections c
    where c.tenant_id = ${tenantId} and c.target_table = 'junior_match_rosters' and c.op = 'insert'
      and (c.patch->>'match_id')::int = ${matchId} and ${anchor}
    on conflict (id) do nothing`);

  // 6b. Merged update patches: later journal rows win per column.
  const eff = (table: string, targets: ReturnType<typeof sql>) => sql`(
    select c.target_id, jsonb_object_agg(kv.key, kv.value order by c.id) as eff,
           max(c.playhq_match_id) as playhq_match_id
      from junior_stat_corrections c
      cross join lateral jsonb_each(c.patch) kv
     where c.tenant_id = ${tenantId} and c.op = 'update' and c.patch is not null
       and c.target_table = ${table} and c.target_id in (${targets})
     group by c.target_id)`;
  const uAnchor = sql`(u.playhq_match_id is null or exists (select 1 from junior_matches m
      where m.id = ${matchId} and m.playhq_match_id = u.playhq_match_id))`;
  await tx.execute(sql`
    update junior_matches t set
      team1_score     = case when u.eff ? 'team1_score'     then u.eff->>'team1_score'                else t.team1_score end,
      team2_score     = case when u.eff ? 'team2_score'     then u.eff->>'team2_score'                else t.team2_score end,
      hh_result       = case when u.eff ? 'hh_result'       then u.eff->>'hh_result'                  else t.hh_result end,
      winner          = case when u.eff ? 'winner'          then u.eff->>'winner'                     else t.winner end,
      toss_winner     = case when u.eff ? 'toss_winner'     then u.eff->>'toss_winner'                else t.toss_winner end,
      hh_batted_first = case when u.eff ? 'hh_batted_first' then (u.eff->>'hh_batted_first')::boolean else t.hh_batted_first end,
      status          = case when u.eff ? 'status'          then u.eff->>'status'                     else t.status end,
      match_date      = case when u.eff ? 'match_date'      then u.eff->>'match_date'                 else t.match_date end,
      round           = case when u.eff ? 'round'           then u.eff->>'round'                      else t.round end,
      venue           = case when u.eff ? 'venue'           then u.eff->>'venue'                      else t.venue end
    from ${eff("junior_matches", sql`${String(matchId)}`)} u
    where t.id = ${matchId} and t.tenant_id = ${tenantId} and ${uAnchor}`);
  await tx.execute(sql`
    update junior_match_batting t set
      runs           = case when u.eff ? 'runs'           then (u.eff->>'runs')::int         else t.runs end,
      balls          = case when u.eff ? 'balls'          then (u.eff->>'balls')::int        else t.balls end,
      fours          = case when u.eff ? 'fours'          then (u.eff->>'fours')::int        else t.fours end,
      sixes          = case when u.eff ? 'sixes'          then (u.eff->>'sixes')::int        else t.sixes end,
      strike_rate    = case when u.eff ? 'strike_rate'    then (u.eff->>'strike_rate')::real else t.strike_rate end,
      dismissal      = case when u.eff ? 'dismissal'      then u.eff->>'dismissal'           else t.dismissal end,
      bat_order      = case when u.eff ? 'bat_order'      then (u.eff->>'bat_order')::int    else t.bat_order end,
      participant_id = case when u.eff ? 'participant_id' then u.eff->>'participant_id'      else t.participant_id end,
      player_name    = case when u.eff ? 'player_name'    then u.eff->>'player_name'         else t.player_name end
    from ${eff("junior_match_batting", sql`select id::text from junior_match_batting where match_id = ${matchId}`)} u
    where t.match_id = ${matchId} and t.id = u.target_id::int and ${uAnchor}`);
  await tx.execute(sql`
    update junior_match_bowling t set
      overs          = case when u.eff ? 'overs'          then (u.eff->>'overs')::real      else t.overs end,
      maidens        = case when u.eff ? 'maidens'        then (u.eff->>'maidens')::int     else t.maidens end,
      runs           = case when u.eff ? 'runs'           then (u.eff->>'runs')::int        else t.runs end,
      wickets        = case when u.eff ? 'wickets'        then (u.eff->>'wickets')::int     else t.wickets end,
      economy        = case when u.eff ? 'economy'        then (u.eff->>'economy')::real    else t.economy end,
      wides          = case when u.eff ? 'wides'          then (u.eff->>'wides')::int       else t.wides end,
      no_balls       = case when u.eff ? 'no_balls'       then (u.eff->>'no_balls')::int    else t.no_balls end,
      participant_id = case when u.eff ? 'participant_id' then u.eff->>'participant_id'     else t.participant_id end,
      player_name    = case when u.eff ? 'player_name'    then u.eff->>'player_name'        else t.player_name end
    from ${eff("junior_match_bowling", sql`select id::text from junior_match_bowling where match_id = ${matchId}`)} u
    where t.match_id = ${matchId} and t.id = u.target_id::int and ${uAnchor}`);
  await tx.execute(sql`
    update junior_match_rosters t set
      participant_id = case when u.eff ? 'participant_id' then u.eff->>'participant_id' else t.participant_id end,
      player_name    = case when u.eff ? 'player_name'    then u.eff->>'player_name'    else t.player_name end
    from ${eff("junior_match_rosters", sql`select id::text from junior_match_rosters where match_id = ${matchId}`)} u
    where t.match_id = ${matchId} and t.id = u.target_id::int and ${uAnchor}`);

  // 6c. Deletions last.
  for (const table of ["junior_match_batting", "junior_match_bowling", "junior_match_rosters"]) {
    await tx.execute(sql`
      delete from ${sql.raw(table)} t
      using junior_stat_corrections c
      where c.tenant_id = ${tenantId} and c.target_table = ${table} and c.op = 'delete'
        and t.id = c.target_id::int and t.match_id = ${matchId} and ${anchor}`);
  }
}

/**
 * Map this match's lines through the tenant's merge map (the loader's step 7a–7b, scoped to
 * one tenant and one synced match), then put the club's directory names on its own lines
 * (7d, and the rename propagation of 6b).
 */
async function reapplyMerges(tx: Tx, tenantId: number, matchId: number): Promise<void> {
  const map = sql`(select m.duplicate_participant_id as dup, m.keeper_participant_id as keeper
      from junior_participant_merges m
     where m.tenant_id = ${tenantId}
       and exists (select 1 from junior_participants k
                    where k.tenant_id = ${tenantId} and k.participant_id = m.keeper_participant_id))`;
  for (const table of ["junior_match_batting", "junior_match_bowling", "junior_match_rosters"])
    await tx.execute(sql`
      update ${sql.raw(table)} t set participant_id = jpm.keeper
      from ${map} jpm
      where lower(t.participant_id) = lower(jpm.dup) and t.match_id = ${matchId}`);
  await tx.execute(sql`
    delete from junior_match_rosters a
    using junior_match_rosters b
    where a.match_id = ${matchId} and b.match_id = ${matchId}
      and a.participant_id is not null and a.participant_id = b.participant_id
      and a.id > b.id`);
  for (const table of ["junior_match_batting", "junior_match_bowling", "junior_match_rosters"])
    await tx.execute(sql`
      update ${sql.raw(table)} t set player_name = p.display_name
      from junior_participants p
      where p.tenant_id = ${tenantId} and p.participant_id = t.participant_id
        and p.display_name is not null and t.is_halls_head and t.match_id = ${matchId}
        and t.player_name is distinct from p.display_name`);
}
