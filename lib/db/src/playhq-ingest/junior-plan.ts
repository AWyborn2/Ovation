/**
 * The junior projection's pure planning half (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md,
 * U5; KTD5–KTD10, R8–R13, R22): the input and output shapes, scope (which junior matches an
 * enabled club owns, from 2026/27 onward), and the planners for fixtures, participants,
 * matches and their lines, stable line identity (KTD7) and team lists (KTD9).
 *
 * No database access: everything here is unit-tested in junior-project.test.ts. The writers
 * live in junior-write.ts and the orchestration in junior-project.ts, which re-exports this
 * module so callers keep importing from one place.
 */
import {
  lineupEntries,
  lineupRole,
  PLAYED_LOOKBACK_DAYS,
  TEAM_LIST_LOOKAHEAD_DAYS,
} from "./team-lists";
import {
  centralScore,
  centralStatus,
  givenFirst,
  initialsOnlyName,
  IN_PROGRESS,
  num,
  perthDate,
  type RawScorecard,
} from "./central-transform";
import { isWithheldName } from "./central-project";
import { juniorAgeBand, normaliseJuniorAge } from "../juniors/age-groups";
import { seasonStartYearFor } from "../seasons";
import { seasonLabelFromStartYear } from "../central/grades";
import {
  JUNIOR_SYNC_FIRST_SEASON,
  JUNIOR_SYNC_ID_START,
  JUNIOR_WITHHELD_NAME,
  type JuniorTeamListPlayer,
  type JuniorTeamListSource,
} from "../schema/juniors";

// The first season the sync owns, and the label stored for a participant PlayHQ withholds
// and the club has no name for (defined with the junior schema, re-exported here).
export { JUNIOR_SYNC_FIRST_SEASON, JUNIOR_WITHHELD_NAME };

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
    if (!startAt) return null;
    const at = new Date(startAt);
    if (Number.isNaN(at.getTime())) return null;
    startYear = seasonStartYearFor(at);
  }
  return { season: seasonLabelFromStartYear(startYear), startYear };
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

export interface JuniorSide {
  teamId: string | null;
  orgId: string | null;
  /** How the side is labelled on junior rows: own team name, opposition club name. */
  label: string | null;
  teamName: string | null;
  score: string | null;
  own: boolean;
  isHome: boolean;
}

export interface JuniorMatchScope {
  season: { season: string; startYear: number };
  /** The club's side (home in a club-vs-club derby). */
  ours: JuniorSide;
  theirs: JuniorSide;
  sideOfTeam: Map<string, JuniorSide>;
}

export function juniorMatchScope(
  m: JuniorSourceMatch,
  ctx: Pick<JuniorPlanContext, "orgId">,
): JuniorMatchScope | null {
  if (!m.isJunior) return null;
  const season = juniorSeason(m.seasonName, m.startAt);
  if (!season || season.startYear < JUNIOR_SYNC_FIRST_SEASON) return null;
  const org = ctx.orgId.toLowerCase();
  const side = (home: boolean): JuniorSide => {
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
  const sideOfTeam = new Map<string, JuniorSide>();
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
  ctx: Pick<JuniorPlanContext, "tenantId" | "orgId">,
): JuniorFixturePlan | null {
  const s = juniorMatchScope(m, ctx);
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
  | { kind: "update"; displayName?: string; isPrivate?: true; clearOverride?: true }
  | { kind: "none" };

/**
 * How the sync writes one participant (KTD8): insert a new one; otherwise tighten privacy
 * when PlayHQ now withholds the player, and refresh the name unless an admin renamed them
 * (`renamed`) or the new name is worse. The senior link is never written, and `is_private`
 * never goes back to false here. `privacy_override*` is only ever cleared, when privacy
 * tightens (`clearOverride`): an override left over from an earlier private spell would
 * otherwise name the child the moment PlayHQ withholds them again, with no fresh decision.
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
  const out: { displayName?: string; isPrivate?: true; clearOverride?: true } = {};
  if (seed.isPrivate && !existing.isPrivate) {
    out.isPrivate = true;
    out.clearOverride = true;
  }
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
  s: JuniorMatchScope,
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
  const s = juniorMatchScope(m, ctx);
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
  const score = (side: JuniorSide) => centralScore(summaryOf(side.teamId)?.scoreText ?? side.score);
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
  const addRoster = (side: JuniorSide | undefined, pid: string | null, short: string | null) => {
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

export type LineKeyInput = {
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

/** The junior scorecard line tables, in the order the sync writes them. */
export const JUNIOR_LINE_TABLES = [
  "junior_match_batting",
  "junior_match_bowling",
  "junior_match_rosters",
] as const;

export type JuniorLineTable = (typeof JUNIOR_LINE_TABLES)[number];

/**
 * The participant a synced line is keyed on (KTD7): its PlayHQ identity (before any admin
 * re-point, {@link syncIdentityParticipant}) mapped through the tenant's merge map. Used for
 * live lines and deleted-line tombstones alike, so both key the same way as a planned line.
 * `merges` must be the same map the planners used (keepers that still have a participant).
 */
export function lineIdentityParticipant(
  current: string | null,
  participantCorrections: readonly { participantId: string | null | undefined }[],
  merges: ReadonlyMap<string, string>,
): string | null {
  const pid = syncIdentityParticipant(current, participantCorrections);
  return pid ? (merges.get(pid) ?? pid) : null;
}

/**
 * Identities of synced lines an admin deleted (journal `op = 'delete'`, `prev_values` = the
 * full row), so a re-sync does not bring them back. `prev_values.participant_id` is the line's
 * participant at deletion time, so `identityOf` maps it back to the line's sync identity (undo
 * any re-point of that line, then apply the merge map) exactly as a live line is keyed;
 * without it the stored id is used as is.
 */
export function deletedLineKeys(
  table: JuniorLineTable,
  deletions: readonly { targetId: string; prevValues: unknown }[],
  identityOf: (targetId: string, participantId: string | null) => string | null = (_, pid) =>
    lc(pid),
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
        participantId: identityOf(
          d.targetId,
          typeof p.participant_id === "string" ? p.participant_id : null,
        ),
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
    const role = lineupRole(e);
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
  window: "upcoming" | "played" | null = "upcoming",
): "write" | "keepAdmin" | "unchanged" {
  if (players.length === 0) return "unchanged";
  if (!existing) return "write";
  // A side finalised in the Selection Hub stands until the match; then PlayHQ's
  // record of who played replaces it (as for seniors). An admin's list always stands.
  if (existing.source === "selection" && window === "played") return "write";
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
