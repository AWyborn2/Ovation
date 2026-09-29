/**
 * hh-central-crosswalk-core.ts — PURE matching / classification / comparison
 * logic behind scripts/src/hh-central-crosswalk.ts. No database access and no
 * I/O here, so every rule is unit-tested (hh-central-crosswalk-core.test.ts).
 *
 * Identity rule (docs/solutions/architecture-patterns/
 * central-read-player-identity-crosswalk.md): a native Halls Head player is
 * linked to a central PlayHQ participant GUID ONLY on scorecard evidence —
 * batting position + runs (+ balls), bowling figures, fielding, roster presence.
 * Name compatibility is a TIE-BREAKER inside one match's assignment and never
 * evidence on its own: a candidate pair with no figure evidence is never
 * assigned, however well the names agree.
 */
import {
  appGradeFromCentral,
  centralOversToBalls,
  classifyFieldingKind,
  classifyInnings,
} from "@workspace/db/central-queries";

/** Native fill-in convention (replit.md): player ids >= 90000 are placeholders. */
export const FILL_IN_THRESHOLD = 90000;

export const isFillIn = (playerId: number): boolean => playerId >= FILL_IN_THRESHOLD;

// ---------------------------------------------------------------------------
// Input shapes (what the runner reads, already narrowed to plain values)
// ---------------------------------------------------------------------------

export interface NativePlayer {
  id: number;
  givenName: string;
  surname: string;
  isCapOnly?: boolean;
}

export interface NativeMatch {
  id: number;
  sourceKey: string | null;
  season: number;
  grade: string;
  abandoned: boolean;
}

export interface NativeLine {
  matchId: number;
  playerId: number;
  batted: boolean;
  battingPos: number | null;
  runs: number | null;
  balls: number | null;
  notOut: boolean;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  catches: number;
  stumpings: number;
  runOuts: number;
}

export interface CentralMatch {
  matchId: number;
  playhqMatchId: string | null;
  season: string | null;
  grade: string | null;
}

export interface CentralBattingRow {
  matchId: number | null;
  innings: number | null;
  batOrder: number | null;
  participantId: string | null;
  playerName: string | null;
  runs: number | null;
  balls: number | null;
  dismissal: string | null;
  dismissalType: string | null;
}

export interface CentralBowlingRow {
  matchId: number | null;
  innings?: number | null;
  participantId: string | null;
  playerName: string | null;
  overs: number | null;
  maidens: number | null;
  runs: number | null;
  wickets: number | null;
}

export interface CentralRosterRow {
  matchId: number | null;
  participantId: string | null;
  playerName: string | null;
}

export interface CentralFieldingRow {
  matchId: number | null;
  participantId: string | null;
  kind: string | null;
}

// ---------------------------------------------------------------------------
// Central appearances: one participant's collapsed line in one match
// ---------------------------------------------------------------------------

/**
 * A participant's whole contribution to ONE central match for the club,
 * collapsed the same way the app's central match log collapses two-innings
 * matches to the native one-line-per-match shape: batting runs/balls summed
 * over played innings, batting position from the earliest innings, bowling
 * summed across innings.
 */
export interface CentralAppearance {
  participantId: string;
  /** Scorecard name from the lines (fallback when the register has none). */
  lineName: string | null;
  /** Any batting row at all (played or "did not bat"). */
  hasBattingRow: boolean;
  /** At least one played (non-DNB) innings. */
  batted: boolean;
  /** Batting order from the earliest-innings batting row (played or DNB). */
  batOrder: number | null;
  runs: number;
  /** Summed balls over played innings; null when none recorded. */
  balls: number | null;
  innings: number;
  notOuts: number;
  bowled: boolean;
  bowlBalls: number | null;
  maidens: number;
  runsConceded: number;
  wickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  onRoster: boolean;
  /** Counts toward the app's central "games" (roster ∪ batting ∪ bowling). */
  countsAsGame: boolean;
}

function emptyAppearance(participantId: string): CentralAppearance {
  return {
    participantId,
    lineName: null,
    hasBattingRow: false,
    batted: false,
    batOrder: null,
    runs: 0,
    balls: null,
    innings: 0,
    notOuts: 0,
    bowled: false,
    bowlBalls: null,
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    onRoster: false,
    countsAsGame: false,
  };
}

export interface CentralAppearanceIndex {
  /** matchId → participantId → appearance. */
  byMatch: Map<number, Map<string, CentralAppearance>>;
  /** Scorecard rows skipped because participant_id was NULL/empty. */
  nullParticipantRows: number;
}

/**
 * Fold the club's raw central rows into per-(match, participant) appearances.
 * Rows with a NULL/empty participant_id can't be attributed to a person
 * (central-read rule 3) and are only counted.
 */
export function buildCentralAppearances(input: {
  batting: CentralBattingRow[];
  bowling: CentralBowlingRow[];
  rosters: CentralRosterRow[];
  fielding: CentralFieldingRow[];
}): CentralAppearanceIndex {
  const byMatch = new Map<number, Map<string, CentralAppearance>>();
  let nullParticipantRows = 0;
  const get = (matchId: number | null, pid: string | null): CentralAppearance | null => {
    if (matchId == null) return null;
    if (!pid) {
      nullParticipantRows += 1;
      return null;
    }
    let m = byMatch.get(matchId);
    if (!m) {
      m = new Map();
      byMatch.set(matchId, m);
    }
    let a = m.get(pid);
    if (!a) {
      a = emptyAppearance(pid);
      m.set(pid, a);
    }
    return a;
  };

  // Batting: earliest innings first so batOrder comes from the first innings.
  const batting = [...input.batting].sort((x, y) => (x.innings ?? 0) - (y.innings ?? 0));
  for (const b of batting) {
    const a = get(b.matchId, b.participantId);
    if (!a) continue;
    a.lineName ??= b.playerName;
    a.countsAsGame = true;
    if (!a.hasBattingRow) a.batOrder = b.batOrder;
    a.hasBattingRow = true;
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind === "dnb") continue;
    if (!a.batted) a.batOrder = b.batOrder ?? a.batOrder;
    a.batted = true;
    a.innings += 1;
    if (kind === "notout") a.notOuts += 1;
    a.runs += b.runs ?? 0;
    if (b.balls != null) a.balls = (a.balls ?? 0) + b.balls;
  }
  for (const w of input.bowling) {
    const a = get(w.matchId, w.participantId);
    if (!a) continue;
    a.lineName ??= w.playerName;
    a.countsAsGame = true;
    a.bowled = true;
    const balls = centralOversToBalls(w.overs);
    if (balls != null) a.bowlBalls = (a.bowlBalls ?? 0) + balls;
    a.maidens += w.maidens ?? 0;
    a.runsConceded += w.runs ?? 0;
    a.wickets += w.wickets ?? 0;
  }
  for (const r of input.rosters) {
    const a = get(r.matchId, r.participantId);
    if (!a) continue;
    a.lineName ??= r.playerName;
    a.countsAsGame = true;
    a.onRoster = true;
  }
  for (const f of input.fielding) {
    const a = get(f.matchId, f.participantId);
    if (!a) continue;
    const cls = classifyFieldingKind(f.kind);
    if (cls === "catch") a.catches += 1;
    else if (cls === "stumping") a.stumpings += 1;
    else if (cls === "runOut") a.runOuts += 1;
  }
  return { byMatch, nullParticipantRows };
}

// ---------------------------------------------------------------------------
// Pairwise scoring
// ---------------------------------------------------------------------------

/** Native overs text ("4", "4.3") → balls, using central's ball notation rule. */
export function nativeOversToBalls(overs: string | null): number | null {
  if (overs == null || overs.trim() === "") return null;
  const n = Number(overs.trim());
  if (!Number.isFinite(n)) return null;
  return centralOversToBalls(n);
}

export type Strength = "strong" | "medium" | "weak";

export interface PairScore {
  /** Scorecard evidence only (names excluded). */
  figure: number;
  /** Name compatibility, 0–3 — tie-breaker only. */
  name: number;
  strength: Strength;
  reasons: string[];
}

const norm = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s-]/g, "")
    .trim();

/**
 * Name compatibility between a native player and a central display name
 * ("J Smith" or "John Smith"): surname (last token, hyphen/apostrophe
 * insensitive) = 2, plus a matching first initial = 1. Tie-breaker only.
 */
export function nameCompatibility(
  native: { givenName: string; surname: string },
  centralName: string | null,
): number {
  const tokens = norm(centralName).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const squash = (s: string): string => s.replace(/[\s-]/g, "");
  const cSurname = squash(tokens[tokens.length - 1] ?? "");
  const nSurnameTokens = norm(native.surname).split(/\s+/).filter(Boolean);
  const nSurname = squash(nSurnameTokens[nSurnameTokens.length - 1] ?? "");
  const nFull = squash(norm(native.surname));
  let score = 0;
  if (cSurname && (cSurname === nSurname || cSurname === nFull)) score += 2;
  const cInitial = tokens.length > 1 ? (tokens[0] ?? "").charAt(0) : "";
  const nInitial = norm(native.givenName).charAt(0);
  if (score > 0 && cInitial && cInitial === nInitial) score += 1;
  return score;
}

/**
 * Score one native line against one central appearance in the SAME match.
 * Strong = exact batting position + runs (both batted), or exact bowling
 * overs + wickets + runs conceded. Contradictions subtract.
 */
export function scorePair(
  line: NativeLine,
  player: { givenName: string; surname: string },
  c: CentralAppearance,
  centralName: string | null,
): PairScore {
  let figure = 0;
  const reasons: string[] = [];
  let strongBat = false;
  let strongBowl = false;

  if (line.batted && c.batted) {
    const posEq = line.battingPos != null && c.batOrder != null && line.battingPos === c.batOrder;
    const runsEq = (line.runs ?? 0) === c.runs;
    if (posEq) {
      figure += 3;
      reasons.push("bat-pos");
    }
    if (runsEq) {
      figure += 3;
      reasons.push("runs");
    } else figure -= 1;
    if (line.balls != null && c.balls != null && line.balls > 0 && c.balls > 0) {
      if (line.balls === c.balls) {
        figure += 1;
        reasons.push("balls");
      } else figure -= 0.5;
    }
    strongBat = posEq && runsEq;
  } else if (line.batted !== c.batted) {
    figure -= 1;
  } else if (
    // Neither batted: a matching "did not bat" slot is weak corroboration.
    c.hasBattingRow &&
    line.battingPos != null &&
    c.batOrder != null &&
    line.battingPos === c.batOrder
  ) {
    figure += 1;
    reasons.push("dnb-pos");
  }

  if (line.bowled && c.bowled) {
    const ballsEq = nativeOversToBalls(line.overs) === c.bowlBalls && c.bowlBalls != null;
    const wktsEq = (line.wickets ?? 0) === c.wickets;
    const concEq = (line.runsConceded ?? 0) === c.runsConceded;
    for (const [eq, label] of [
      [ballsEq, "overs"],
      [wktsEq, "wkts"],
      [concEq, "conceded"],
    ] as const) {
      if (eq) {
        figure += 2;
        reasons.push(label);
      } else figure -= 0.5;
    }
    if ((line.maidens ?? 0) === c.maidens && c.maidens > 0) figure += 0.5;
    strongBowl = ballsEq && wktsEq && concEq;
  } else if (line.bowled !== c.bowled) {
    figure -= 1;
  }

  if (line.catches > 0 && line.catches === c.catches) {
    figure += 1;
    reasons.push("catches");
  }
  if (c.onRoster || c.countsAsGame) {
    figure += 0.5;
    reasons.push("present");
  }

  const strength: Strength = strongBat || strongBowl ? "strong" : figure >= 3 ? "medium" : "weak";
  return { figure, name: nameCompatibility(player, centralName), strength, reasons };
}

// ---------------------------------------------------------------------------
// One-to-one assignment within a match (Hungarian, maximising weight)
// ---------------------------------------------------------------------------

/**
 * Maximum-weight one-to-one assignment of rows to columns. Returns, for each
 * row, the assigned column index or -1. Weights <= 0 mean "not allowed" and are
 * never returned as an assignment.
 */
export function assignMax(weights: number[][]): number[] {
  const n = weights.length;
  const m = n === 0 ? 0 : Math.max(...weights.map((r) => r.length));
  if (n === 0 || m === 0) return new Array<number>(n).fill(-1);
  const size = Math.max(n, m);
  let maxW = 0;
  for (const r of weights) for (const w of r) if (w > maxW) maxW = w;
  // Square cost matrix (1-indexed, e-maxx Hungarian); cost = maxW - weight.
  const cost = (i: number, j: number): number => {
    const w = i <= n && j <= m ? (weights[i - 1]?.[j - 1] ?? 0) : 0;
    return maxW - Math.max(w, 0);
  };
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(size + 1).fill(0);
  const v = new Array<number>(size + 1).fill(0);
  const p = new Array<number>(size + 1).fill(0);
  const way = new Array<number>(size + 1).fill(0);
  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(size + 1).fill(INF);
    const used = new Array<boolean>(size + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0] ?? 0;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= size; j++) {
        if (used[j]) continue;
        const cur = cost(i0, j) - (u[i0] ?? 0) - (v[j] ?? 0);
        if (cur < (minv[j] ?? INF)) {
          minv[j] = cur;
          way[j] = j0;
        }
        if ((minv[j] ?? INF) < delta) {
          delta = minv[j] ?? INF;
          j1 = j;
        }
      }
      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j] ?? 0] = (u[p[j] ?? 0] ?? 0) + delta;
          v[j] = (v[j] ?? 0) - delta;
        } else minv[j] = (minv[j] ?? INF) - delta;
      }
      j0 = j1;
    } while ((p[j0] ?? 0) !== 0);
    do {
      const j1 = way[j0] ?? 0;
      p[j0] = p[j1] ?? 0;
      j0 = j1;
    } while (j0 !== 0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= size; j++) {
    const i = p[j] ?? 0;
    if (i >= 1 && i <= n && j <= m && (weights[i - 1]?.[j - 1] ?? 0) > 0) out[i - 1] = j - 1;
  }
  return out;
}

/** Name is a tie-breaker: it can never outweigh the smallest figure step (0.5). */
const NAME_WEIGHT = 0.01;
/** Minimum scorecard evidence for a pair to be assignable at all. */
export const MIN_FIGURE_SCORE = 0.5;

export interface LineAssignment {
  nativeMatchId: number;
  centralMatchId: number;
  nativePlayerId: number;
  participantId: string;
  figure: number;
  name: number;
  strength: Strength;
  reasons: string[];
}

/**
 * Resolve ONE match: native lines (non-fill-in) vs the club's central
 * appearances, one-to-one. Pairs below MIN_FIGURE_SCORE are never assigned —
 * a name match alone links nobody.
 */
export function assignMatch(
  nativeMatchId: number,
  centralMatchId: number,
  lines: NativeLine[],
  appearances: CentralAppearance[],
  players: Map<number, NativePlayer>,
  centralNames: Map<string, string | null>,
): LineAssignment[] {
  const eligible = lines.filter((l) => !isFillIn(l.playerId));
  const scores = eligible.map((l) => {
    const p = players.get(l.playerId) ?? { givenName: "", surname: "" };
    return appearances.map((c) =>
      scorePair(l, p, c, centralNames.get(c.participantId) ?? c.lineName),
    );
  });
  const weights = scores.map((row) =>
    row.map((s) => (s.figure >= MIN_FIGURE_SCORE ? s.figure + s.name * NAME_WEIGHT : 0)),
  );
  const assigned = assignMax(weights);
  const out: LineAssignment[] = [];
  eligible.forEach((l, i) => {
    const j = assigned[i] ?? -1;
    if (j < 0) return;
    const s = scores[i]?.[j];
    const c = appearances[j];
    if (!s || !c || s.figure < MIN_FIGURE_SCORE) return;
    out.push({
      nativeMatchId,
      centralMatchId,
      nativePlayerId: l.playerId,
      participantId: c.participantId,
      figure: s.figure,
      name: s.name,
      strength: s.strength,
      reasons: s.reasons,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Match linking (native source_key → central playhq_match_id), senior only
// ---------------------------------------------------------------------------

export interface MatchLink {
  nativeMatchId: number;
  centralMatchId: number | null;
  /** Central grade maps to a senior app grade (juniors isolation). */
  senior: boolean;
}

export function linkMatches(
  native: NativeMatch[],
  central: CentralMatch[],
): Map<number, MatchLink> {
  const byGuid = new Map<string, CentralMatch>();
  for (const c of central) if (c.playhqMatchId) byGuid.set(c.playhqMatchId.toLowerCase(), c);
  const out = new Map<number, MatchLink>();
  for (const m of native) {
    const c = m.sourceKey ? byGuid.get(m.sourceKey.toLowerCase()) : undefined;
    out.set(m.id, {
      nativeMatchId: m.id,
      centralMatchId: c?.matchId ?? null,
      // Native matches are senior by construction (juniors live in junior_*),
      // but when central classifies the linked match as junior/unmapped it is
      // excluded from both the link and the comparison.
      senior: c ? appGradeFromCentral(c.grade) !== null : true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-player classification
// ---------------------------------------------------------------------------

export type LinkStatus = "CLEAN" | "AMBIGUOUS" | "UNMATCHED" | "NO_LINES" | "EXCLUDED_FILL_IN";

export interface ParticipantEvidence {
  participantId: string;
  lines: number;
  strong: number;
  medium: number;
  weak: number;
}

export interface PlayerLink {
  nativePlayerId: number;
  status: LinkStatus;
  participantId: string | null;
  /** Lines assigned to the chosen/top participant. */
  matchedLines: number;
  /** All assigned lines (any participant). */
  assignedLines: number;
  /** Native lines in linkable senior matches (the denominator for coverage). */
  totalLines: number;
  /** Native lines in matches with no central counterpart. */
  unlinkedMatchLines: number;
  share: number;
  candidates: ParticipantEvidence[];
  notes: string[];
}

export const CLEAN_SHARE = 0.9;

export function classifyPlayer(
  nativePlayerId: number,
  assignments: LineAssignment[],
  totalLines: number,
  unlinkedMatchLines: number,
): PlayerLink {
  const byPid = new Map<string, ParticipantEvidence>();
  for (const a of assignments) {
    let e = byPid.get(a.participantId);
    if (!e) {
      e = { participantId: a.participantId, lines: 0, strong: 0, medium: 0, weak: 0 };
      byPid.set(a.participantId, e);
    }
    e.lines += 1;
    e[a.strength] += 1;
  }
  const candidates = [...byPid.values()].sort(
    (x, y) =>
      y.lines - x.lines || y.strong - x.strong || (x.participantId < y.participantId ? -1 : 1),
  );
  const assignedLines = assignments.length;
  const top = candidates[0];
  const notes: string[] = [];
  const base = {
    nativePlayerId,
    assignedLines,
    totalLines,
    unlinkedMatchLines,
    candidates,
  };
  if (isFillIn(nativePlayerId)) {
    return {
      ...base,
      status: "EXCLUDED_FILL_IN",
      participantId: null,
      matchedLines: 0,
      share: 0,
      notes: ["fill-in (player_id >= 90000) — excluded from linking"],
    };
  }
  if (totalLines + unlinkedMatchLines === 0) {
    return {
      ...base,
      status: "NO_LINES",
      participantId: null,
      matchedLines: 0,
      share: 0,
      notes: ["no scorecard lines (baseline/pre-scorecard history only)"],
    };
  }
  if (!top) {
    if (totalLines === 0) notes.push("all lines are in matches with no central counterpart");
    return { ...base, status: "UNMATCHED", participantId: null, matchedLines: 0, share: 0, notes };
  }
  const share = top.lines / assignedLines;
  const hasSolid = top.strong + top.medium > 0;
  const clean = share >= CLEAN_SHARE && (top.lines >= 2 || top.strong >= 1) && hasSolid;
  if (!hasSolid) notes.push("weak evidence only (presence/name tie-break)");
  if (share < CLEAN_SHARE)
    notes.push(`competing participants (top share ${(share * 100).toFixed(0)}%)`);
  if (top.lines < 2 && top.strong === 0) notes.push("single line without strong evidence");
  if (candidates.length > 1) {
    notes.push(
      `others: ${candidates
        .slice(1)
        .map((c) => `${c.participantId}×${c.lines}`)
        .join(", ")}`,
    );
  }
  if (assignedLines < totalLines) notes.push(`${totalLines - assignedLines} line(s) unassigned`);
  return {
    ...base,
    status: clean ? "CLEAN" : "AMBIGUOUS",
    participantId: top.participantId,
    matchedLines: top.lines,
    share,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export interface Conflict {
  type: "PARTICIPANT_MULTI_NATIVE" | "NATIVE_MULTI_PARTICIPANT";
  participantId: string | null;
  nativePlayerId: number | null;
  /** "id×lines" list of the other side. */
  detail: string;
  /** True when the participant is the TOP pick of 2+ native players. */
  severe: boolean;
}

/** Share a secondary participant must reach to be flagged as a split. */
export const SPLIT_MIN_SHARE = 0.1;

export function detectConflicts(links: PlayerLink[]): Conflict[] {
  const out: Conflict[] = [];
  // One participant claimed by 2+ native players (possible native duplicates
  // or one native id that merged two people).
  const byPid = new Map<string, { playerId: number; lines: number; top: boolean }[]>();
  for (const l of links) {
    for (const c of l.candidates) {
      const arr = byPid.get(c.participantId) ?? [];
      arr.push({
        playerId: l.nativePlayerId,
        lines: c.lines,
        top: l.participantId === c.participantId,
      });
      byPid.set(c.participantId, arr);
    }
  }
  for (const [pid, claims] of byPid) {
    if (claims.length < 2) continue;
    claims.sort((a, b) => b.lines - a.lines);
    out.push({
      type: "PARTICIPANT_MULTI_NATIVE",
      participantId: pid,
      nativePlayerId: null,
      detail: claims.map((c) => `${c.playerId}×${c.lines}${c.top ? "(top)" : ""}`).join(", "),
      severe: claims.filter((c) => c.top).length >= 2,
    });
  }
  // One native player spread over 2+ participants (possible central duplicate
  // identities, or a native id covering two people).
  for (const l of links) {
    if (l.candidates.length < 2 || l.assignedLines === 0) continue;
    const significant = l.candidates.filter(
      (c) => c.lines >= 2 || c.lines / l.assignedLines >= SPLIT_MIN_SHARE,
    );
    if (significant.length < 2) continue;
    out.push({
      type: "NATIVE_MULTI_PARTICIPANT",
      participantId: null,
      nativePlayerId: l.nativePlayerId,
      detail: l.candidates.map((c) => `${c.participantId}×${c.lines}`).join(", "),
      severe: significant.every((c) => c.strong + c.medium > 0),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The whole matcher: match linking → per-match assignment → classification
// ---------------------------------------------------------------------------

export interface MatcherInput {
  native: { players: NativePlayer[]; matches: NativeMatch[]; lines: NativeLine[] };
  central: {
    matches: CentralMatch[];
    batting: CentralBattingRow[];
    bowling: CentralBowlingRow[];
    rosters: CentralRosterRow[];
    fielding: CentralFieldingRow[];
    players: { participantId: string; displayName: string | null }[];
  };
}

export interface MatcherResult {
  /** Every native player's classification, sorted by native id. */
  playerLinks: PlayerLink[];
  /** Conflicts across the non-fill-in links. */
  conflicts: Conflict[];
  assignments: LineAssignment[];
  appIndex: CentralAppearanceIndex;
  /** Senior native match → central match id. */
  linkByNativeMatch: Map<number, number>;
  nativeMatchByCentral: Map<number, number>;
  /** Native matches whose central counterpart is a junior/unmapped grade. */
  juniorExcludedNative: Set<number>;
  /** Central matches that map to a senior app grade. */
  seniorCentral: Set<number>;
  /** Native lines that are neither fill-ins nor in a junior-excluded match. */
  seniorLines: NativeLine[];
  fillInLines: NativeLine[];
}

/**
 * Run the full scorecard-evidence matcher over already-read native + central
 * rows. Shared by the read-only diagnostic (hh-central-crosswalk.ts) and the
 * persistence script (persist-hh-crosswalk.ts) so both classify identically.
 */
export function linkNativeToCentral({ native, central }: MatcherInput): MatcherResult {
  const playerById = new Map(native.players.map((p) => [p.id, p]));
  const links = linkMatches(native.matches, central.matches);
  const seniorCentral = new Set(
    central.matches.filter((m) => appGradeFromCentral(m.grade) !== null).map((m) => m.matchId),
  );
  const linkByNativeMatch = new Map<number, number>();
  const nativeMatchByCentral = new Map<number, number>();
  const juniorExcludedNative = new Set<number>();
  for (const l of links.values()) {
    if (!l.senior) {
      juniorExcludedNative.add(l.nativeMatchId);
      continue;
    }
    if (l.centralMatchId != null) {
      linkByNativeMatch.set(l.nativeMatchId, l.centralMatchId);
      nativeMatchByCentral.set(l.centralMatchId, l.nativeMatchId);
    }
  }

  const appIndex = buildCentralAppearances(central);
  const centralName = new Map(central.players.map((p) => [p.participantId, p.displayName]));

  const fillInLines = native.lines.filter((l) => isFillIn(l.playerId));
  const seniorLines = native.lines.filter(
    (l) => !isFillIn(l.playerId) && !juniorExcludedNative.has(l.matchId),
  );
  const linesByMatch = new Map<number, NativeLine[]>();
  for (const l of seniorLines) {
    const arr = linesByMatch.get(l.matchId) ?? [];
    arr.push(l);
    linesByMatch.set(l.matchId, arr);
  }

  const assignments: LineAssignment[] = [];
  const totalLinesByPlayer = new Map<number, number>();
  const unlinkedLinesByPlayer = new Map<number, number>();
  for (const [nativeMatchId, lines] of linesByMatch) {
    const cid = linkByNativeMatch.get(nativeMatchId);
    if (cid == null) {
      for (const l of lines)
        unlinkedLinesByPlayer.set(l.playerId, (unlinkedLinesByPlayer.get(l.playerId) ?? 0) + 1);
      continue;
    }
    for (const l of lines)
      totalLinesByPlayer.set(l.playerId, (totalLinesByPlayer.get(l.playerId) ?? 0) + 1);
    const apps = [...(appIndex.byMatch.get(cid)?.values() ?? [])];
    assignments.push(...assignMatch(nativeMatchId, cid, lines, apps, playerById, centralName));
  }
  const assignByPlayer = new Map<number, LineAssignment[]>();
  for (const a of assignments) {
    const arr = assignByPlayer.get(a.nativePlayerId) ?? [];
    arr.push(a);
    assignByPlayer.set(a.nativePlayerId, arr);
  }

  const playerLinks: PlayerLink[] = native.players
    .map((p) =>
      classifyPlayer(
        p.id,
        assignByPlayer.get(p.id) ?? [],
        totalLinesByPlayer.get(p.id) ?? 0,
        unlinkedLinesByPlayer.get(p.id) ?? 0,
      ),
    )
    .sort((a, b) => a.nativePlayerId - b.nativePlayerId);
  const conflicts = detectConflicts(playerLinks.filter((l) => l.status !== "EXCLUDED_FILL_IN"));

  return {
    playerLinks,
    conflicts,
    assignments,
    appIndex,
    linkByNativeMatch,
    nativeMatchByCentral,
    juniorExcludedNative,
    seniorCentral,
    seniorLines,
    fillInLines,
  };
}

// ---------------------------------------------------------------------------
// Comparison (part 2)
// ---------------------------------------------------------------------------

export interface Totals {
  matches: number;
  innings: number;
  runs: number;
  wickets: number;
  catches: number;
}

export const zeroTotals = (): Totals => ({
  matches: 0,
  innings: 0,
  runs: 0,
  wickets: 0,
  catches: 0,
});

export const TOTAL_KEYS = ["matches", "innings", "runs", "wickets", "catches"] as const;

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    matches: a.matches + b.matches,
    innings: a.innings + b.innings,
    runs: a.runs + b.runs,
    wickets: a.wickets + b.wickets,
    catches: a.catches + b.catches,
  };
}

export function totalsEqual(a: Totals, b: Totals): boolean {
  return TOTAL_KEYS.every((k) => a[k] === b[k]);
}

const isZero = (t: Totals): boolean => TOTAL_KEYS.every((k) => t[k] === 0);

/**
 * Native career totals from the scorecard lines, mirroring the app's
 * derivation (match-aggregate.ts deriveSeasonSnapshotFromMatches): abandoned
 * matches and fill-ins excluded, games = distinct matches, innings = batted.
 */
export function nativeLineTotals(lines: NativeLine[]): Totals {
  const matches = new Set<number>();
  const t = zeroTotals();
  for (const l of lines) {
    matches.add(l.matchId);
    if (l.batted) {
      t.innings += 1;
      t.runs += l.runs ?? 0;
    }
    if (l.bowled) t.wickets += l.wickets ?? 0;
    t.catches += l.catches ?? 0;
  }
  t.matches = matches.size;
  return t;
}

/** Central totals for one participant over its appearances (senior matches only). */
export function centralTotals(appearances: CentralAppearance[]): Totals {
  const t = zeroTotals();
  for (const a of appearances) {
    if (a.countsAsGame) t.matches += 1;
    t.innings += a.innings;
    t.runs += a.runs;
    t.wickets += a.wickets;
    t.catches += a.catches;
  }
  return t;
}

export type DiffClass =
  "EQUAL" | "BASELINE" | "MISSING_MATCHES" | "FIGURES_DIFFER" | "SNAPSHOT_DIFFERS" | "UNEXPLAINED";

export interface MatchCoverage {
  /** Native (non-abandoned) matches with no central counterpart at all. */
  nativeMatchNotInCentral: number;
  /** Linked matches where the participant has no central appearance. */
  nativeOnlyParticipantAbsent: number;
  /** Participant's central matches that don't exist natively. */
  centralMatchNotInNative: number;
  /** Participant's central matches that exist natively but lack this player's line. */
  centralOnlyPlayerAbsent: number;
  /** Of the above, matches that are abandoned natively (excluded from native totals). */
  centralOnlyNativeAbandoned: number;
  /** Matches present on both sides for this player. */
  both: number;
  /** Common matches whose figures (innings/runs/wickets/catches) differ. */
  figuresDifferMatches: number;
}

export interface PlayerComparison {
  appCareer: Totals;
  pgssSeasonal: Totals;
  baseline: Totals;
  nativeScorecard: Totals;
  central: Totals;
  coverage: MatchCoverage;
  classes: DiffClass[];
}

/**
 * Compare one CLEAN-linked player. Inputs:
 *  - `nativeLines`: the player's senior native lines (fill-ins/juniors already
 *    dropped), abandoned matches INCLUDED — the function excludes them from
 *    totals itself, mirroring the app;
 *  - `abandoned`: native match ids flagged abandoned;
 *  - `linkByNativeMatch`: native match id → central match id (senior links);
 *  - `centralByMatch`: central match id → this participant's appearance;
 *  - `nativeMatchByCentral`: central match id → native match id (all senior
 *    native matches, so "match exists natively" can be told apart);
 *  - `pgssSeasonal` / `baseline`: player_grade_season_stats sums.
 */
export function comparePlayer(input: {
  nativeLines: NativeLine[];
  abandoned: Set<number>;
  linkByNativeMatch: Map<number, number>;
  centralByMatch: Map<number, CentralAppearance>;
  nativeMatchByCentral: Map<number, number>;
  pgssSeasonal: Totals;
  baseline: Totals;
}): PlayerComparison {
  const { abandoned, linkByNativeMatch, centralByMatch, nativeMatchByCentral } = input;
  const played = input.nativeLines.filter((l) => !abandoned.has(l.matchId));
  const nativeScorecard = nativeLineTotals(played);
  const central = centralTotals([...centralByMatch.values()]);
  const appCareer = addTotals(input.pgssSeasonal, input.baseline);

  const coverage: MatchCoverage = {
    nativeMatchNotInCentral: 0,
    nativeOnlyParticipantAbsent: 0,
    centralMatchNotInNative: 0,
    centralOnlyPlayerAbsent: 0,
    centralOnlyNativeAbandoned: 0,
    both: 0,
    figuresDifferMatches: 0,
  };
  const nativeCentralIds = new Set<number>();
  for (const l of played) {
    const cid = linkByNativeMatch.get(l.matchId);
    if (cid == null) {
      coverage.nativeMatchNotInCentral += 1;
      continue;
    }
    nativeCentralIds.add(cid);
    const c = centralByMatch.get(cid);
    if (!c || !c.countsAsGame) {
      coverage.nativeOnlyParticipantAbsent += 1;
      continue;
    }
    coverage.both += 1;
    const lineTotals = nativeLineTotals([l]);
    const cTotals = centralTotals([c]);
    if (
      lineTotals.innings !== cTotals.innings ||
      lineTotals.runs !== cTotals.runs ||
      lineTotals.wickets !== cTotals.wickets ||
      lineTotals.catches !== cTotals.catches
    ) {
      coverage.figuresDifferMatches += 1;
    }
  }
  for (const [cid, c] of centralByMatch) {
    if (!c.countsAsGame || nativeCentralIds.has(cid)) continue;
    const nid = nativeMatchByCentral.get(cid);
    if (nid == null) coverage.centralMatchNotInNative += 1;
    else {
      coverage.centralOnlyPlayerAbsent += 1;
      if (abandoned.has(nid)) coverage.centralOnlyNativeAbandoned += 1;
    }
  }

  const classes: DiffClass[] = [];
  if (totalsEqual(appCareer, central)) classes.push("EQUAL");
  else {
    if (!isZero(input.baseline)) classes.push("BASELINE");
    if (!totalsEqual(input.pgssSeasonal, nativeScorecard)) classes.push("SNAPSHOT_DIFFERS");
    const missing =
      coverage.nativeMatchNotInCentral +
      coverage.nativeOnlyParticipantAbsent +
      coverage.centralMatchNotInNative +
      coverage.centralOnlyPlayerAbsent;
    if (missing > 0) classes.push("MISSING_MATCHES");
    if (coverage.figuresDifferMatches > 0) classes.push("FIGURES_DIFFER");
    if (classes.length === 0) classes.push("UNEXPLAINED");
  }
  return {
    appCareer,
    pgssSeasonal: input.pgssSeasonal,
    baseline: input.baseline,
    nativeScorecard,
    central,
    coverage,
    classes,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Read-only CLI guard
// ---------------------------------------------------------------------------

/** Flags the runner accepts. Anything else is refused. */
export const ALLOWED_FLAGS = new Set(["--out", "--help", "-h"]);

const WRITE_FLAG_RE =
  /write|apply|commit|insert|update|delete|upsert|seed|backfill|persist|save-map|fix|migrate|force|yes|execute|mint/i;

/**
 * Validate argv for the strictly read-only runner. Returns an error message
 * (refuse to run) or null. Any flag implying a write is refused explicitly;
 * any other unknown flag is refused too, so nothing unexpected slips through.
 */
export function validateArgs(argv: string[]): string | null {
  for (const a of argv) {
    if (!a.startsWith("-")) return `Unexpected positional argument "${a}".`;
    const flag = a.split("=")[0] ?? a;
    if (WRITE_FLAG_RE.test(flag)) {
      return `Refusing "${a}": this script is strictly READ-ONLY and never writes to either database (no player_id_map writes, no DDL).`;
    }
    if (!ALLOWED_FLAGS.has(flag)) return `Unknown flag "${a}". Allowed: --out=<dir>, --help.`;
  }
  return null;
}
