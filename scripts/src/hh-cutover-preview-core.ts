/**
 * hh-cutover-preview-core.ts — PURE rules behind scripts/src/hh-cutover-preview.ts
 * (hybrid stats plan U13; R6, R19, R20, R21; AE6, AE7; KTD5, KTD6). No database
 * access and no I/O, so every rule is unit tested (hh-cutover-preview.test.ts).
 *
 * The runner computes every Halls Head senior career two ways and hands both
 * here:
 *   - NATIVE, as the site shows it today: the stored per-grade careers
 *     (`player_grade_stats`) and season snapshots (`player_grade_season_stats`,
 *     season NULL = career baseline);
 *   - HYBRID, as it would show after cut-over: the (player, grade, season)
 *     buckets the API's own club overlay produces for tenant 1
 *     (`loadClubOverlay` + `buildClubStats`), so the preview and the live read
 *     cannot diverge.
 *
 * This module explains the difference. For each (player, grade) it rebuilds the
 * delta from match evidence — the native scorecard lines against the central
 * appearances of the player's GUIDs — and gives every part a reason code
 * (R19). Whatever the evidence can't account for is "unexplained", so a hybrid
 * number that moves for a reason this script doesn't understand is never
 * silently filed under a tidy label.
 */
import { boundaryFor } from "@workspace/db";
import { isFillIn, type CentralAppearance, type NativeLine } from "./hh-central-crosswalk-core";

// ── Figures ──────────────────────────────────────────────────────────────────

export const STAT_KEYS = ["games", "innings", "runs", "wickets", "catches"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Figures = Record<StatKey, number>;

export const zeroFigures = (): Figures => ({
  games: 0,
  innings: 0,
  runs: 0,
  wickets: 0,
  catches: 0,
});
const isZero = (f: Figures): boolean => STAT_KEYS.every((k) => f[k] === 0);
const addInto = (into: Figures, f: Partial<Figures>, sign = 1): Figures => {
  for (const k of STAT_KEYS) into[k] += sign * (f[k] ?? 0);
  return into;
};
const minus = (a: Figures, b: Figures): Figures => addInto({ ...a }, b, -1);

type NullableFigures = { [K in StatKey]: number | null };
const figuresOf = (r: NullableFigures): Figures => ({
  games: r.games ?? 0,
  innings: r.innings ?? 0,
  runs: r.runs ?? 0,
  wickets: r.wickets ?? 0,
  catches: r.catches ?? 0,
});

// ── Reason codes (R19) ───────────────────────────────────────────────────────

/** In reporting order. */
export const REASON_CODES = [
  "extra_central_match",
  "games_rule",
  "ladies_t20",
  "catches_rule",
  "merge",
  "correction",
  "baseline_overlap",
  "unlinked_identity",
  "native_only_match",
  "figures_differ",
  "grade_reclassified",
  "unexplained",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_LABEL: Record<ReasonCode, string> = {
  extra_central_match:
    "extra central match (central has a match for the player that native doesn't)",
  games_rule: "games rule (rostered appearance with no batting or bowling line — KTD6)",
  ladies_t20: "Ladies T20 (counted as Female B Grade)",
  catches_rule: "catches rule (catches differ on a match both sides have — R6)",
  merge: "merge (a split identity folded into its keeper)",
  correction: "correction (a club correction changes the central figure)",
  baseline_overlap: "baseline overlap (history also covers a season central supplies — R20)",
  unlinked_identity: "unlinked identity (the player's central lines sit under another GUID)",
  native_only_match: "native-only match (central doesn't have it, so it is lost)",
  figures_differ: "figures differ (same match, different runs / wickets / innings — R21 review)",
  grade_reclassified: "grade reclassified (central files the match under another grade)",
  unexplained: "unexplained",
};

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface Boundary {
  grade: string | null;
  startSeason: number;
}

/** A stored native per-grade career (`player_grade_stats`). */
export interface NativeGradeCareer {
  playerId: number;
  grade: string;
  games: number | null;
  innings: number | null;
  runs: number | null;
  wickets: number | null;
  catches: number | null;
  fifties: number | null;
  hundreds: number | null;
  highScore: string | null;
  bestBowling: string | null;
}

/** A native season snapshot (`player_grade_season_stats`; season NULL = baseline). */
export interface NativeSeasonStat {
  playerId: number;
  grade: string;
  season: number | null;
  games: number | null;
  innings: number | null;
  runs: number | null;
  wickets: number | null;
  catches: number | null;
}

/** A peel record (`baseline_adjustments`): what a season took out of the baseline. */
export interface BaselineAdjustment extends Figures {
  playerId: number;
  grade: string;
  season: number;
}

export interface NativeMatchInfo {
  id: number;
  grade: string;
  season: number;
  abandoned: boolean;
  round: number | null;
  /** ISO date when the runner could parse it. */
  matchDate: string | null;
}

export interface CentralMatchInfo {
  matchId: number;
  /** Senior app grade; null for junior / pathway / unmapped (never counted). */
  grade: string | null;
  season: number | null;
  /** The central label is a Ladies T20 competition (counted as Female B Grade). */
  ladiesT20: boolean;
  matchDate: string | null;
}

/** One (player, grade, season) bucket of the HYBRID read (the API's club overlay). */
export interface HybridBucket extends Figures {
  /** Tenant player id the bucket presents under. */
  playerId: number;
  grade: string;
  season: number | null;
  source: "central" | "history";
  careerGrain: boolean;
  /** "87" / "87*"; null when the bucket has no played innings. */
  highScore: string | null;
  /** "5/23"; null when the bucket has no wicket-taking figures. */
  bestBowling: string | null;
}

/** Tenant 1's identity (crosswalk + confirmed merges), as plain lookups. */
export interface PreviewIdentity {
  /** The central GUIDs of the player's merge group, keeper first (synthetic keys excluded). */
  guidsOf(playerId: number): readonly string[];
  /** The id the player's group presents under after cut-over; null without a crosswalk row. */
  presentedId(playerId: number): number | null;
  /** Every crosswalk id the player's merge group owns. */
  ownedIds(playerId: number): readonly number[];
  /** The player id a GUID presents under; null when the GUID isn't in the crosswalk / merges. */
  playerIdOfGuid(guid: string): number | null;
}

export interface CareersInput {
  nativeGrades: NativeGradeCareer[];
  nativeSeasons: NativeSeasonStat[];
  adjustments: BaselineAdjustment[];
  nativeMatches: NativeMatchInfo[];
  /** Senior native scorecard lines (junior-excluded matches already dropped). */
  nativeLines: NativeLine[];
  /** Native match id → central match id (scorecard-evidence match linking). */
  linkByNativeMatch: ReadonlyMap<number, number>;
  /** Which central GUID each native line was matched to, from scorecard evidence. */
  assignments: ReadonlyArray<{
    nativeMatchId: number;
    nativePlayerId: number;
    participantId: string;
  }>;
  centralMatches: CentralMatchInfo[];
  /** Central match id → participant GUID → that participant's appearance for the club. */
  appearances: ReadonlyMap<number, ReadonlyMap<string, CentralAppearance>>;
  identity: PreviewIdentity;
  boundaries: Boundary[];
  hybridBuckets: HybridBucket[];
  /** Applied correction deltas, keyed `${keeper GUID}\u0000${central match id}`. */
  correctionDeltas: ReadonlyMap<string, { runs: number; wickets: number; dismissals: number }>;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export interface CareerDiff {
  playerId: number;
  /** A grade, or "ALL" for the player's whole senior career. */
  grade: string;
  native: Figures;
  hybrid: Figures;
  /** hybrid − native. */
  delta: Figures;
  nativeHighScore: string | null;
  hybridHighScore: string | null;
  highScoreChanged: boolean;
  nativeBestBowling: string | null;
  hybridBestBowling: string | null;
  bestBowlingChanged: boolean;
  /** How much of the delta each reason accounts for. */
  components: Partial<Record<ReasonCode, Figures>>;
  reasons: ReasonCode[];
  notes: string[];
}

export interface UnlinkedIdentityRow {
  participantId: string;
  /** The native player whose lines the GUID carries; null when no native line matched it. */
  nativePlayerId: number | null;
  /** The player the GUID is mapped to instead; null when it isn't in the crosswalk. */
  mappedToPlayerId: number | null;
  /** Matches of the native player whose central line is under this GUID. */
  matches: number;
  firstSeason: number | null;
  lastSeason: number | null;
  grades: string[];
  /** What the native player loses at cut-over. */
  nativeFigures: Figures;
  /** What sits under the GUID in those matches. */
  centralFigures: Figures;
  /** Every senior match central supplies under the GUID for the club. */
  guidMatches: number;
  guidFigures: Figures;
}

export type OverlapKind =
  /** Central supplies seasons native never ingested, so the baseline is their only native home. */
  | "UNCOVERED_CENTRAL_SEASONS"
  /** A peel already took these central seasons out of the baseline — confirm it took all of it. */
  | "PEELED_CENTRAL_SEASONS"
  /** A pre-boundary native season (now history) that central also supplies under another grade. */
  | "HISTORY_SEASON_ALSO_CENTRAL";

export interface BaselineOverlapRow {
  playerId: number;
  grade: string;
  boundary: number | null;
  kind: OverlapKind;
  seasons: number[];
  /** The native career baseline for the grade (what the career-grain history row holds). */
  baseline: Figures;
  /** What central supplies in those seasons. */
  central: Figures;
  /** What peel records removed from the baseline for those seasons. */
  peeled: Figures;
  /** The estimate of what would be counted twice. */
  doubleCounted: Figures;
}

/** A match both sides have for a player — the catches samples are picked from these. */
export interface CommonMatch {
  playerId: number;
  nativeMatchId: number;
  centralMatchId: number;
  participantId: string;
  grade: string;
  season: number | null;
  nativeCatches: number;
  nativeStumpings: number;
  nativeRunOuts: number;
  centralCatches: number;
  centralStumpings: number;
  centralRunOuts: number;
}

export interface CareersDiff {
  /** Changed (player, grade) careers. */
  grades: CareerDiff[];
  /** Changed whole careers (grade "ALL"). */
  players: CareerDiff[];
  unlinked: UnlinkedIdentityRow[];
  overlaps: BaselineOverlapRow[];
  commonMatches: CommonMatch[];
  /** Whole senior career per player, both ways (every player, changed or not). */
  totals: Map<number, { native: Figures; hybrid: Figures }>;
  /** Reasons per player (whole career) and per `${playerId}|${grade}`. */
  reasonsByPlayer: Map<number, ReasonCode[]>;
  reasonsByPlayerGrade: Map<string, ReasonCode[]>;
}

// ── Small parsers ────────────────────────────────────────────────────────────

const highScoreValue = (text: string | null): number | null => {
  const m = /^\s*(\d+)/.exec(text ?? "");
  return m ? Number(m[1]) : null;
};
const bowlingValue = (text: string | null): { w: number; r: number } | null => {
  const m = /^\s*(\d+)\s*[/-]\s*(\d+)/.exec(text ?? "");
  if (!m || Number(m[1]) <= 0) return null;
  return { w: Number(m[1]), r: Number(m[2]) };
};
const betterHighScore = (a: string | null, b: string | null): string | null => {
  const av = highScoreValue(a);
  const bv = highScoreValue(b);
  if (bv === null) return a;
  if (av === null || bv > av) return b;
  return bv === av && /\*/.test(b ?? "") ? b : a;
};
const betterBowling = (a: string | null, b: string | null): string | null => {
  const av = bowlingValue(a);
  const bv = bowlingValue(b);
  if (!bv) return a;
  if (!av || bv.w > av.w || (bv.w === av.w && bv.r < av.r)) return b;
  return a;
};
const bowlingEqual = (a: string | null, b: string | null): boolean => {
  const av = bowlingValue(a);
  const bv = bowlingValue(b);
  return av === null || bv === null ? av === bv : av.w === bv.w && av.r === bv.r;
};

/** A native line's counted figures, the way the app's native derivation counts them. */
const lineFigures = (l: NativeLine): Figures => ({
  games: 1,
  innings: l.batted ? 1 : 0,
  runs: l.batted ? (l.runs ?? 0) : 0,
  wickets: l.bowled ? (l.wickets ?? 0) : 0,
  catches: l.catches ?? 0,
});

/** A central appearance's counted figures, the way the central read counts them. */
const appFigures = (a: CentralAppearance): Figures => ({
  games: a.countsAsGame ? 1 : 0,
  innings: a.innings,
  runs: a.runs,
  wickets: a.wickets,
  catches: a.catches,
});

const rosterOnly = (a: CentralAppearance): boolean =>
  a.countsAsGame && !a.hasBattingRow && !a.bowled;

// ── Careers ──────────────────────────────────────────────────────────────────

const gs = (grade: string, season: number | null): string => `${grade}|${season ?? ""}`;

/**
 * Diff every Halls Head senior career, native against hybrid, per (player,
 * grade) and per player, with a reason code for every part of each delta.
 */
export function diffCareers(input: CareersInput): CareersDiff {
  const { identity, boundaries, appearances } = input;
  const real = (id: number): boolean => id > 0 && !isFillIn(id);
  /** True when central supplies (grade, season) for the club: at or after the boundary. */
  const supplied = (grade: string, season: number | null): boolean => {
    if (season === null) return true;
    const b = boundaryFor(boundaries, grade);
    return b === null || season >= b;
  };

  const nativeMatchById = new Map(input.nativeMatches.map((m) => [m.id, m]));
  const centralMatchById = new Map(input.centralMatches.map((m) => [m.matchId, m]));
  const nativeMatchByCentral = new Map([...input.linkByNativeMatch].map(([n, c]) => [c, n]));
  const assignedGuid = new Map(
    input.assignments.map((a) => [`${a.nativeMatchId}|${a.nativePlayerId}`, a.participantId]),
  );

  const linesByPlayer = new Map<number, NativeLine[]>();
  const linePlayersByMatch = new Map<number, Set<number>>();
  for (const l of input.nativeLines) {
    if (!real(l.playerId)) continue;
    push(linesByPlayer, l.playerId, l);
    let s = linePlayersByMatch.get(l.matchId);
    if (!s) linePlayersByMatch.set(l.matchId, (s = new Set()));
    s.add(l.playerId);
  }
  const seasonsByPlayer = new Map<number, NativeSeasonStat[]>();
  /** (grade, season) native ingested as its own season, for anyone. */
  const nativeLoaded = new Set<string>();
  for (const r of input.nativeSeasons) {
    if (!real(r.playerId)) continue;
    push(seasonsByPlayer, r.playerId, r);
    if (r.season !== null) nativeLoaded.add(gs(r.grade, r.season));
  }
  /** (grade, season) native holds scorecards for. */
  const nativeHasMatches = new Set<string>();
  for (const m of input.nativeMatches) {
    nativeHasMatches.add(gs(m.grade, m.season));
    nativeLoaded.add(gs(m.grade, m.season));
  }
  const nativeGradesByPlayer = new Map<number, NativeGradeCareer[]>();
  for (const r of input.nativeGrades)
    if (real(r.playerId)) push(nativeGradesByPlayer, r.playerId, r);
  const bucketsByPlayer = new Map<number, HybridBucket[]>();
  for (const b of input.hybridBuckets) if (real(b.playerId)) push(bucketsByPlayer, b.playerId, b);
  const adjustmentsByPlayer = new Map<number, BaselineAdjustment[]>();
  for (const a of input.adjustments) if (real(a.playerId)) push(adjustmentsByPlayer, a.playerId, a);

  /** GUID → its senior appearances central supplies (at or after the boundary). */
  const appsByGuid = new Map<string, Array<{ matchId: number; app: CentralAppearance }>>();
  for (const [matchId, byGuid] of appearances) {
    const cm = centralMatchById.get(matchId);
    if (!cm?.grade || !supplied(cm.grade, cm.season)) continue;
    for (const [guid, app] of byGuid) push(appsByGuid, guid, { matchId, app });
  }

  const playerIds = [
    ...new Set([
      ...nativeGradesByPlayer.keys(),
      ...seasonsByPlayer.keys(),
      ...linesByPlayer.keys(),
      ...bucketsByPlayer.keys(),
    ]),
  ].sort((a, b) => a - b);

  const out: CareersDiff = {
    grades: [],
    players: [],
    unlinked: [],
    overlaps: [],
    commonMatches: [],
    totals: new Map(),
    reasonsByPlayer: new Map(),
    reasonsByPlayerGrade: new Map(),
  };
  const unlinked = new Map<
    string,
    Omit<UnlinkedIdentityRow, "grades" | "guidMatches" | "guidFigures"> & { grades: Set<string> }
  >();

  for (const P of playerIds) {
    const comps = new Map<string, Map<ReasonCode, Figures>>();
    const notes = new Map<string, Set<string>>();
    const add = (grade: string, reason: ReasonCode, f: Partial<Figures>, sign = 1): void => {
      let byReason = comps.get(grade);
      if (!byReason) comps.set(grade, (byReason = new Map()));
      let c = byReason.get(reason);
      if (!c) byReason.set(reason, (c = zeroFigures()));
      addInto(c, f, sign);
    };
    const note = (grade: string, text: string): void => {
      let s = notes.get(grade);
      if (!s) notes.set(grade, (s = new Set()));
      s.add(text);
    };

    const nativeByGrade = new Map<string, { f: Figures; hs: string | null; bb: string | null }>();
    for (const r of nativeGradesByPlayer.get(P) ?? []) {
      const n = nativeByGrade.get(r.grade) ?? { f: zeroFigures(), hs: null, bb: null };
      addInto(n.f, figuresOf(r));
      n.hs = betterHighScore(n.hs, r.highScore);
      n.bb = betterBowling(n.bb, r.bestBowling);
      nativeByGrade.set(r.grade, n);
    }
    const hybridByGrade = new Map<string, { f: Figures; hs: string | null; bb: string | null }>();
    for (const b of bucketsByPlayer.get(P) ?? []) {
      const h = hybridByGrade.get(b.grade) ?? { f: zeroFigures(), hs: null, bb: null };
      addInto(h.f, b);
      h.hs = betterHighScore(h.hs, b.highScore);
      h.bb = betterBowling(h.bb, b.bestBowling);
      hybridByGrade.set(b.grade, h);
    }

    const presented = identity.presentedId(P);
    if (presented !== null && presented !== P) {
      // A merged-away player: the whole career moves onto the keeper's id.
      for (const [grade, n] of nativeByGrade) {
        add(grade, "merge", n.f, -1);
        note(grade, `folded into player #${presented}`);
      }
    } else {
      const guids = identity.guidsOf(P);
      const guidSet = new Set(guids);
      const keeper = guids[0] ?? null;
      const mergedIds = new Set(identity.ownedIds(P).filter((id) => id !== P));
      const mySeasons = seasonsByPlayer.get(P) ?? [];

      /** The career baseline held for (P + merged ids, grade). */
      const baselineOf = (grade: string): Figures => {
        const f = zeroFigures();
        for (const id of [P, ...mergedIds]) {
          for (const r of seasonsByPlayer.get(id) ?? []) {
            if (r.season === null && r.grade === grade) addInto(f, figuresOf(r));
          }
        }
        return f;
      };

      // History a confirmed merge brings with it (the merged ids' baselines and
      // pre-boundary seasons are history rows that fold to this keeper).
      for (const id of mergedIds) {
        for (const r of seasonsByPlayer.get(id) ?? []) {
          if (r.season !== null && supplied(r.grade, r.season)) continue;
          add(r.grade, "merge", figuresOf(r));
          note(r.grade, `includes merged player #${id}`);
        }
      }

      const correctedMatches = new Set<number>();
      const corrOf = (matchId: number): { runs: number; wickets: number; dismissals: number } => {
        const zero = { runs: 0, wickets: 0, dismissals: 0 };
        if (keeper === null || correctedMatches.has(matchId)) return zero;
        correctedMatches.add(matchId);
        return input.correctionDeltas.get(`${keeper}\u0000${matchId}`) ?? zero;
      };

      const consumed = new Set<string>();
      const overlapSeasons = new Map<string, { seasons: Set<number>; central: Figures }>();
      const historyAlsoCentral = new Map<string, { seasons: Set<number>; central: Figures }>();
      const accumulate = (
        into: Map<string, { seasons: Set<number>; central: Figures }>,
        grade: string,
        season: number | null,
        f: Figures,
      ): void => {
        let o = into.get(grade);
        if (!o) into.set(grade, (o = { seasons: new Set(), central: zeroFigures() }));
        if (season !== null) o.seasons.add(season);
        addInto(o.central, f);
      };

      // (grade, season) pools compared by season total, because the two sides
      // can't be paired match by match there: native matches with no link to a
      // central match, and seasons native holds only as a snapshot.
      type Pool = {
        grade: string;
        native: Figures;
        central: Figures;
        apps: number;
        rosterOnly: number;
      };
      const pools = new Map<string, Pool>();
      const poolFor = (grade: string, season: number | null): Pool => {
        const k = gs(grade, season);
        let p = pools.get(k);
        if (!p) {
          p = { grade, native: zeroFigures(), central: zeroFigures(), apps: 0, rosterOnly: 0 };
          pools.set(k, p);
        }
        return p;
      };

      // 1. Native scorecard lines, each against the central side of its match.
      for (const l of linesByPlayer.get(P) ?? []) {
        const m = nativeMatchById.get(l.matchId);
        if (!m || m.abandoned) continue; // abandoned matches never count natively
        const lf = lineFigures(l);
        const nativeSupplied = supplied(m.grade, m.season);
        const cid = input.linkByNativeMatch.get(m.id);
        const cm = cid === undefined ? undefined : centralMatchById.get(cid);
        const mine =
          cid === undefined || !cm?.grade
            ? []
            : guids
                .map((g) => appearances.get(cid)?.get(g))
                .filter((a): a is CentralAppearance => a !== undefined);

        if (cid !== undefined && cm?.grade && mine.length > 0) {
          for (const a of mine) consumed.add(`${cid}|${a.participantId}`);
          const centralSupplied = supplied(cm.grade, cm.season);
          const corr = centralSupplied ? corrOf(cid) : { runs: 0, wickets: 0, dismissals: 0 };
          const cf = zeroFigures();
          for (const a of mine) addInto(cf, appFigures(a));
          cf.runs += corr.runs;
          cf.wickets += corr.wickets;
          cf.catches += corr.dismissals;

          if (nativeSupplied && centralSupplied) {
            const sum = (pick: (a: CentralAppearance) => number) =>
              mine.reduce((s, a) => s + pick(a), 0);
            out.commonMatches.push({
              playerId: P,
              nativeMatchId: m.id,
              centralMatchId: cid,
              participantId: mine[0]!.participantId,
              grade: cm.grade,
              season: cm.season,
              nativeCatches: l.catches ?? 0,
              nativeStumpings: l.stumpings ?? 0,
              nativeRunOuts: l.runOuts ?? 0,
              centralCatches: sum((a) => a.catches),
              centralStumpings: sum((a) => a.stumpings),
              centralRunOuts: sum((a) => a.runOuts),
            });
            if (cm.grade === m.grade) {
              const net = minus(cf, lf);
              add(m.grade, "figures_differ", { games: net.games, innings: net.innings });
              add(m.grade, corr.runs !== 0 ? "correction" : "figures_differ", { runs: net.runs });
              add(m.grade, corr.wickets !== 0 ? "correction" : "figures_differ", {
                wickets: net.wickets,
              });
              add(m.grade, corr.dismissals !== 0 ? "correction" : "catches_rule", {
                catches: net.catches,
              });
            } else {
              add(m.grade, "grade_reclassified", lf, -1);
              add(cm.grade, "grade_reclassified", cf);
              note(m.grade, `central files some ${m.grade} matches as ${cm.grade}`);
              note(cm.grade, `central files some ${m.grade} matches as ${cm.grade}`);
            }
          } else if (nativeSupplied) {
            add(m.grade, "native_only_match", lf, -1);
            note(m.grade, `central has the match under ${cm.grade}, before that grade's boundary`);
          } else if (centralSupplied) {
            // The native season is before its grade's boundary (so it is a
            // history row) and central supplies the same match under another
            // grade: it would be counted twice.
            add(cm.grade, "baseline_overlap", cf);
            accumulate(historyAlsoCentral, cm.grade, cm.season, cf);
          }
          continue;
        }

        if (!nativeSupplied) continue; // a pre-boundary season: club history supplies it
        if (cid === undefined) {
          // No central match is linked to this native match (no PlayHQ id on
          // it): central may still hold the game, so compare the season.
          addInto(poolFor(m.grade, m.season).native, lf);
          continue;
        }
        const g = assignedGuid.get(`${m.id}|${P}`);
        if (g !== undefined && !guidSet.has(g)) {
          add(m.grade, "unlinked_identity", lf, -1);
          const key = `${g}|${P}`;
          let u = unlinked.get(key);
          if (!u) {
            u = {
              participantId: g,
              nativePlayerId: P,
              mappedToPlayerId: identity.playerIdOfGuid(g),
              matches: 0,
              firstSeason: null,
              lastSeason: null,
              grades: new Set(),
              nativeFigures: zeroFigures(),
              centralFigures: zeroFigures(),
            };
            unlinked.set(key, u);
          }
          u.matches += 1;
          u.firstSeason = u.firstSeason === null ? m.season : Math.min(u.firstSeason, m.season);
          u.lastSeason = u.lastSeason === null ? m.season : Math.max(u.lastSeason, m.season);
          u.grades.add(m.grade);
          addInto(u.nativeFigures, lf);
          const other = appearances.get(cid)?.get(g);
          if (other) addInto(u.centralFigures, appFigures(other));
        } else {
          add(m.grade, "native_only_match", lf, -1);
          note(m.grade, "central has the match but not the player");
        }
      }

      // 2. Seasons native ingested as a snapshot (a season row, no scorecards).
      for (const r of mySeasons) {
        if (r.season === null || !supplied(r.grade, r.season)) continue;
        if (nativeHasMatches.has(gs(r.grade, r.season))) continue;
        addInto(poolFor(r.grade, r.season).native, figuresOf(r));
      }

      // 3. Central appearances with no native line for this player.
      for (const g of guids) {
        for (const { matchId, app } of appsByGuid.get(g) ?? []) {
          if (consumed.has(`${matchId}|${g}`)) continue;
          const cm = centralMatchById.get(matchId)!;
          const grade = cm.grade!;
          const corr = corrOf(matchId);
          const cf = appFigures(app);
          cf.runs += corr.runs;
          cf.wickets += corr.wickets;
          cf.catches += corr.dismissals;

          const nid = nativeMatchByCentral.get(matchId);
          const mergedLine =
            nid !== undefined &&
            [...(linePlayersByMatch.get(nid) ?? [])].some((id) => mergedIds.has(id));
          const pool = pools.get(gs(grade, cm.season));
          if (mergedLine) {
            add(grade, "merge", cf);
          } else if (pool && nid === undefined) {
            addInto(pool.central, cf);
            pool.apps += 1;
            if (rosterOnly(app)) pool.rosterOnly += 1;
          } else if (cm.ladiesT20) {
            add(grade, "ladies_t20", cf);
          } else if (
            cm.season !== null &&
            !isZero(baselineOf(grade)) &&
            !nativeLoaded.has(gs(grade, cm.season))
          ) {
            add(grade, "baseline_overlap", cf);
            accumulate(overlapSeasons, grade, cm.season, cf);
          } else if (!app.countsAsGame || rosterOnly(app)) {
            add(grade, "games_rule", { games: cf.games });
            add(grade, "catches_rule", { catches: cf.catches });
            add(grade, "extra_central_match", {
              innings: cf.innings,
              runs: cf.runs,
              wickets: cf.wickets,
            });
          } else {
            add(grade, "extra_central_match", cf);
          }
        }
      }

      for (const s of pools.values()) {
        const d = minus(s.central, s.native);
        if (isZero(d)) continue;
        note(s.grade, "includes a season compared by season total (no match-by-match link)");
        // More games centrally: central has matches native doesn't (roster-only
        // appearances first — the games rule). Fewer: native has matches
        // central doesn't. The same games: the figures themselves differ.
        const byRule = d.games > 0 ? Math.min(s.rosterOnly, d.games) : 0;
        const rest: ReasonCode =
          d.games > 0
            ? "extra_central_match"
            : d.games < 0
              ? "native_only_match"
              : "figures_differ";
        add(s.grade, "games_rule", { games: byRule });
        add(s.grade, rest, {
          games: d.games - byRule,
          innings: d.innings,
          runs: d.runs,
          wickets: d.wickets,
        });
        add(s.grade, d.games === 0 ? "catches_rule" : rest, { catches: d.catches });
      }

      // 4. Baseline overlaps (R20).
      for (const [grade, o] of overlapSeasons) {
        const baseline = baselineOf(grade);
        const doubleCounted = zeroFigures();
        for (const k of STAT_KEYS) {
          doubleCounted[k] = Math.max(0, Math.min(baseline[k], o.central[k]));
        }
        out.overlaps.push({
          playerId: P,
          grade,
          boundary: boundaryFor(boundaries, grade),
          kind: "UNCOVERED_CENTRAL_SEASONS",
          seasons: [...o.seasons].sort((a, b) => a - b),
          baseline,
          central: o.central,
          peeled: zeroFigures(),
          doubleCounted,
        });
      }
      for (const [grade, o] of historyAlsoCentral) {
        out.overlaps.push({
          playerId: P,
          grade,
          boundary: boundaryFor(boundaries, grade),
          kind: "HISTORY_SEASON_ALSO_CENTRAL",
          seasons: [...o.seasons].sort((a, b) => a - b),
          baseline: baselineOf(grade),
          central: o.central,
          peeled: zeroFigures(),
          doubleCounted: { ...o.central },
        });
      }
      const peeledByGrade = new Map<string, { seasons: Set<number>; peeled: Figures }>();
      for (const a of adjustmentsByPlayer.get(P) ?? []) {
        if (!supplied(a.grade, a.season)) continue;
        let p = peeledByGrade.get(a.grade);
        if (!p) peeledByGrade.set(a.grade, (p = { seasons: new Set(), peeled: zeroFigures() }));
        p.seasons.add(a.season);
        addInto(p.peeled, a);
      }
      for (const [grade, p] of peeledByGrade) {
        const central = zeroFigures();
        for (const g of guids) {
          for (const { matchId, app } of appsByGuid.get(g) ?? []) {
            const cm = centralMatchById.get(matchId)!;
            if (cm.grade === grade && cm.season !== null && p.seasons.has(cm.season)) {
              addInto(central, appFigures(app));
            }
          }
        }
        out.overlaps.push({
          playerId: P,
          grade,
          boundary: boundaryFor(boundaries, grade),
          kind: "PEELED_CENTRAL_SEASONS",
          seasons: [...p.seasons].sort((a, b) => a - b),
          baseline: baselineOf(grade),
          central,
          peeled: p.peeled,
          doubleCounted: zeroFigures(),
        });
      }
    }

    // ── Settle each grade, then the whole career ────────────────────────────
    const total = {
      native: zeroFigures(),
      hybrid: zeroFigures(),
      nativeHs: null as string | null,
      hybridHs: null as string | null,
      nativeBb: null as string | null,
      hybridBb: null as string | null,
      comps: new Map<ReasonCode, Figures>(),
      notes: new Set<string>(),
    };
    const grades = [
      ...new Set([...nativeByGrade.keys(), ...hybridByGrade.keys(), ...comps.keys()]),
    ].sort((a, b) => a.localeCompare(b));
    for (const grade of grades) {
      const n = nativeByGrade.get(grade) ?? { f: zeroFigures(), hs: null, bb: null };
      const h = hybridByGrade.get(grade) ?? { f: zeroFigures(), hs: null, bb: null };
      const delta = minus(h.f, n.f);
      const byReason = comps.get(grade) ?? new Map<ReasonCode, Figures>();
      const explained = zeroFigures();
      for (const c of byReason.values()) addInto(explained, c);
      const residual = minus(delta, explained);
      if (!isZero(residual)) addInto(byReason.get("unexplained") ?? setNew(byReason), residual);

      addInto(total.native, n.f);
      addInto(total.hybrid, h.f);
      total.nativeHs = betterHighScore(total.nativeHs, n.hs);
      total.hybridHs = betterHighScore(total.hybridHs, h.hs);
      total.nativeBb = betterBowling(total.nativeBb, n.bb);
      total.hybridBb = betterBowling(total.hybridBb, h.bb);
      for (const [reason, c] of byReason) {
        addInto(total.comps.get(reason) ?? setNew(total.comps, reason), c);
      }
      for (const t of notes.get(grade) ?? []) total.notes.add(t);

      const row = careerRow(P, grade, n, h, byReason, [...(notes.get(grade) ?? [])]);
      if (row) {
        out.grades.push(row);
        out.reasonsByPlayerGrade.set(`${P}|${grade}`, row.reasons);
      }
    }
    out.totals.set(P, { native: total.native, hybrid: total.hybrid });
    const row = careerRow(
      P,
      "ALL",
      { f: total.native, hs: total.nativeHs, bb: total.nativeBb },
      { f: total.hybrid, hs: total.hybridHs, bb: total.hybridBb },
      total.comps,
      [...total.notes],
    );
    if (row) {
      out.players.push(row);
      out.reasonsByPlayer.set(P, row.reasons);
    }
  }

  // ── Unlinked identities ────────────────────────────────────────────────────
  const guidTotals = (guid: string): { matches: number; figures: Figures } => {
    const figures = zeroFigures();
    let matches = 0;
    for (const { app } of appsByGuid.get(guid) ?? []) {
      if (app.countsAsGame) matches += 1;
      addInto(figures, appFigures(app));
    }
    return { matches, figures };
  };
  const listed = new Set<string>();
  for (const u of unlinked.values()) {
    listed.add(u.participantId);
    const t = guidTotals(u.participantId);
    out.unlinked.push({
      ...u,
      grades: [...u.grades].sort(),
      guidMatches: t.matches,
      guidFigures: t.figures,
    });
  }
  // Central GUIDs for the club that no tenant player owns and no native line
  // matched: they have a hybrid career but no player page.
  for (const guid of appsByGuid.keys()) {
    if (listed.has(guid) || identity.playerIdOfGuid(guid) !== null) continue;
    const t = guidTotals(guid);
    if (t.matches === 0 && isZero(t.figures)) continue;
    const seasons: number[] = [];
    const grades = new Set<string>();
    for (const { matchId } of appsByGuid.get(guid) ?? []) {
      const cm = centralMatchById.get(matchId)!;
      if (cm.season !== null) seasons.push(cm.season);
      if (cm.grade) grades.add(cm.grade);
    }
    out.unlinked.push({
      participantId: guid,
      nativePlayerId: null,
      mappedToPlayerId: null,
      matches: 0,
      firstSeason: seasons.length ? Math.min(...seasons) : null,
      lastSeason: seasons.length ? Math.max(...seasons) : null,
      grades: [...grades].sort(),
      nativeFigures: zeroFigures(),
      centralFigures: zeroFigures(),
      guidMatches: t.matches,
      guidFigures: t.figures,
    });
  }
  out.unlinked.sort(
    (a, b) =>
      Number(a.nativePlayerId === null) - Number(b.nativePlayerId === null) ||
      b.matches - a.matches ||
      b.guidMatches - a.guidMatches ||
      a.participantId.localeCompare(b.participantId),
  );
  out.overlaps.sort(
    (a, b) =>
      a.playerId - b.playerId || a.grade.localeCompare(b.grade) || a.kind.localeCompare(b.kind),
  );
  return out;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

function setNew(m: Map<ReasonCode, Figures>, reason: ReasonCode = "unexplained"): Figures {
  const f = zeroFigures();
  m.set(reason, f);
  return f;
}

/** A diff row, or null when nothing the site shows would change. */
function careerRow(
  playerId: number,
  grade: string,
  n: { f: Figures; hs: string | null; bb: string | null },
  h: { f: Figures; hs: string | null; bb: string | null },
  byReason: ReadonlyMap<ReasonCode, Figures>,
  notes: string[],
): CareerDiff | null {
  const delta = minus(h.f, n.f);
  const highScoreChanged = highScoreValue(n.hs) !== highScoreValue(h.hs);
  const bestBowlingChanged = !bowlingEqual(n.bb, h.bb);
  if (isZero(delta) && !highScoreChanged && !bestBowlingChanged) return null;
  const components: Partial<Record<ReasonCode, Figures>> = {};
  for (const reason of REASON_CODES) {
    const c = byReason.get(reason);
    if (c && !isZero(c)) components[reason] = { ...c };
  }
  const reasons = REASON_CODES.filter((r) => components[r] !== undefined);
  return {
    playerId,
    grade,
    native: { ...n.f },
    hybrid: { ...h.f },
    delta,
    nativeHighScore: n.hs,
    hybridHighScore: h.hs,
    highScoreChanged,
    nativeBestBowling: n.bb,
    hybridBestBowling: h.bb,
    bestBowlingChanged,
    components,
    // A changed best with no counted delta has no match evidence behind it.
    reasons: reasons.length > 0 ? reasons : ["unexplained"],
    notes,
  };
}

/** Rows per reason code (a row with two reasons counts under both). */
export function countReasons(rows: readonly CareerDiff[]): Partial<Record<ReasonCode, number>> {
  const out: Partial<Record<ReasonCode, number>> = {};
  for (const reason of REASON_CODES) {
    const n = rows.filter((r) => r.reasons.includes(reason)).length;
    if (n > 0) out[reason] = n;
  }
  return out;
}

/** How big a career delta is, for ranking: a game ≈ 10 runs, a wicket ≈ 20, a catch ≈ 5. */
export const deltaMagnitude = (d: Figures): number =>
  Math.abs(d.games) * 10 + Math.abs(d.runs) + Math.abs(d.wickets) * 20 + Math.abs(d.catches) * 5;

/** The `n` biggest deltas, biggest first. */
export function topDeltas(rows: readonly CareerDiff[], n = 25): CareerDiff[] {
  return [...rows]
    .sort(
      (a, b) =>
        deltaMagnitude(b.delta) - deltaMagnitude(a.delta) ||
        a.playerId - b.playerId ||
        a.grade.localeCompare(b.grade),
    )
    .slice(0, n);
}

// ── Records ──────────────────────────────────────────────────────────────────

export const RECORD_KEYS = [
  "mostGames",
  "mostRuns",
  "mostWickets",
  "mostCatches",
  "mostFifties",
  "mostHundreds",
  "highestScore",
  "bestBowling",
] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];

export interface RecordHolder {
  /** Tenant player id; null when the holder has no player id (an unmapped central GUID). */
  playerId: number | null;
  value: string;
}
export type RecordSet = Partial<Record<RecordKey, RecordHolder | null>>;

export interface RecordDiffRow {
  /** "all" or a grade. */
  scope: string;
  record: RecordKey;
  change: "holder" | "value";
  nativePlayerId: number | null;
  nativeValue: string | null;
  hybridPlayerId: number | null;
  hybridValue: string | null;
  reasons: ReasonCode[];
}

/**
 * The native all-time record holders, from the stored per-grade careers — the
 * unfiltered native `/records` read (routes/grades.ts): counting records are
 * the highest sum across grades; the highest score and best bowling are the
 * best single per-grade figure.
 */
export function nativeAllTimeRecords(careers: readonly NativeGradeCareer[]): RecordSet {
  const rows = careers.filter((c) => c.playerId > 0 && !isFillIn(c.playerId));
  const top = (pick: (c: NativeGradeCareer) => number | null): RecordHolder | null => {
    const sums = new Map<number, number>();
    for (const c of rows) sums.set(c.playerId, (sums.get(c.playerId) ?? 0) + (pick(c) ?? 0));
    let best: { playerId: number; value: number } | null = null;
    for (const [playerId, value] of [...sums].sort(([a], [b]) => a - b)) {
      if (value > 0 && (!best || value > best.value)) best = { playerId, value };
    }
    return best ? { playerId: best.playerId, value: String(best.value) } : null;
  };
  let hs: NativeGradeCareer | null = null;
  let bb: NativeGradeCareer | null = null;
  for (const c of [...rows].sort((a, b) => a.playerId - b.playerId)) {
    const v = highScoreValue(c.highScore);
    if (v !== null && (hs === null || v > (highScoreValue(hs.highScore) ?? -1))) hs = c;
    const b = bowlingValue(c.bestBowling);
    const cur = bb ? bowlingValue(bb.bestBowling) : null;
    if (b && (!cur || b.w > cur.w || (b.w === cur.w && b.r < cur.r))) bb = c;
  }
  return {
    mostGames: top((c) => c.games),
    mostRuns: top((c) => c.runs),
    mostWickets: top((c) => c.wickets),
    mostCatches: top((c) => c.catches),
    mostFifties: top((c) => c.fifties),
    mostHundreds: top((c) => c.hundreds),
    highestScore: hs ? { playerId: hs.playerId, value: hs.highScore!.trim() } : null,
    bestBowling: bb ? { playerId: bb.playerId, value: bb.bestBowling!.trim() } : null,
  };
}

/** Records whose holder or value changes, per scope ("all" or a grade). */
export function diffRecords(
  scopes: ReadonlyArray<{ scope: string; native: RecordSet; hybrid: RecordSet }>,
  reasonsFor: (playerId: number, scope: string) => readonly ReasonCode[],
): RecordDiffRow[] {
  const out: RecordDiffRow[] = [];
  for (const { scope, native, hybrid } of scopes) {
    for (const record of RECORD_KEYS) {
      const n = native[record] ?? null;
      const h = hybrid[record] ?? null;
      if (n === null && h === null) continue;
      const holderChanged = (n?.playerId ?? null) !== (h?.playerId ?? null) || !n !== !h;
      const valueChanged = (n?.value ?? null) !== (h?.value ?? null);
      if (!holderChanged && !valueChanged) continue;
      const reasons = new Set<ReasonCode>();
      for (const id of [n?.playerId, h?.playerId]) {
        if (id != null) for (const r of reasonsFor(id, scope)) reasons.add(r);
      }
      out.push({
        scope,
        record,
        change: holderChanged ? "holder" : "value",
        nativePlayerId: n?.playerId ?? null,
        nativeValue: n?.value ?? null,
        hybridPlayerId: h?.playerId ?? null,
        hybridValue: h?.value ?? null,
        reasons: REASON_CODES.filter((r) => reasons.has(r)),
      });
    }
  }
  return out;
}

// ── Milestones ───────────────────────────────────────────────────────────────

export type MilestoneBoard = "games" | "runs" | "wickets";
const BOARDS: readonly MilestoneBoard[] = ["games", "runs", "wickets"];

/** The match where a running career total crossed a tier. */
export interface Crossing {
  playerId: number;
  board: MilestoneBoard;
  threshold: number;
  season: number | null;
  /** ISO date when known. */
  matchDate: string | null;
  /** Native match id on the native side, central match id on the hybrid side. */
  matchId: number | null;
}

export interface MilestoneDiffRow {
  playerId: number;
  board: MilestoneBoard;
  threshold: number;
  /** appears: only hybrid reaches the tier; disappears: only native does; moves: a different match. */
  status: "appears" | "disappears" | "moves";
  direction: "earlier" | "later" | "";
  nativeValue: number;
  hybridValue: number;
  nativeSeason: number | null;
  nativeDate: string | null;
  hybridSeason: number | null;
  hybridDate: string | null;
  reasons: ReasonCode[];
}

/** before(a, b): −1 when a is earlier, 1 when later, 0 when indistinguishable. */
function compareWhen(
  a: { season: number | null; date: string | null },
  b: { season: number | null; date: string | null },
): number {
  if (a.season !== null && b.season !== null && a.season !== b.season) {
    return a.season < b.season ? -1 : 1;
  }
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  return 0;
}

/** Tier crossings that appear, disappear or move at cut-over. */
export function diffMilestones(input: {
  tiers: Record<MilestoneBoard, readonly number[]>;
  nativeTotals: ReadonlyMap<number, Record<MilestoneBoard, number>>;
  hybridTotals: ReadonlyMap<number, Record<MilestoneBoard, number>>;
  nativeCrossings: readonly Crossing[];
  hybridCrossings: readonly Crossing[];
  /** Central match id → the native match it links to. */
  nativeMatchByCentral: ReadonlyMap<number, number>;
  reasonsFor: (playerId: number) => readonly ReasonCode[];
}): MilestoneDiffRow[] {
  const key = (c: { playerId: number; board: string; threshold: number }) =>
    `${c.playerId}|${c.board}|${c.threshold}`;
  const nativeAt = new Map(input.nativeCrossings.map((c) => [key(c), c]));
  const hybridAt = new Map(input.hybridCrossings.map((c) => [key(c), c]));
  const ids = [...new Set([...input.nativeTotals.keys(), ...input.hybridTotals.keys()])].sort(
    (a, b) => a - b,
  );
  const zero = { games: 0, runs: 0, wickets: 0 };
  const out: MilestoneDiffRow[] = [];
  for (const playerId of ids) {
    const n = input.nativeTotals.get(playerId) ?? zero;
    const h = input.hybridTotals.get(playerId) ?? zero;
    for (const board of BOARDS) {
      for (const threshold of [...input.tiers[board]].sort((a, b) => a - b)) {
        const nReached = n[board] >= threshold;
        const hReached = h[board] >= threshold;
        if (!nReached && !hReached) continue;
        const nc = nativeAt.get(key({ playerId, board, threshold }));
        const hc = hybridAt.get(key({ playerId, board, threshold }));
        let status: MilestoneDiffRow["status"];
        let direction: MilestoneDiffRow["direction"] = "";
        if (nReached !== hReached) status = hReached ? "appears" : "disappears";
        else {
          if (!nc && !hc) continue; // crossed before either side has a match for it
          if (nc && hc) {
            if (
              hc.matchId !== null &&
              nc.matchId !== null &&
              input.nativeMatchByCentral.get(hc.matchId) === nc.matchId
            ) {
              continue;
            }
            const cmp = compareWhen(
              { season: hc.season, date: hc.matchDate },
              { season: nc.season, date: nc.matchDate },
            );
            if (cmp === 0) continue;
            direction = cmp < 0 ? "earlier" : "later";
          }
          status = "moves";
        }
        out.push({
          playerId,
          board,
          threshold,
          status,
          direction,
          nativeValue: n[board],
          hybridValue: h[board],
          nativeSeason: nc?.season ?? null,
          nativeDate: nc?.matchDate ?? null,
          hybridSeason: hc?.season ?? null,
          hybridDate: hc?.matchDate ?? null,
          reasons: [...input.reasonsFor(playerId)],
        });
      }
    }
  }
  return out;
}

// ── Debut order vs the cap register (AE7) ────────────────────────────────────

export interface DebutPoint {
  season: number;
  date: string | null;
  matchId: number | null;
}

const debutKey = (playerId: number, grade: string): string => `${playerId}|${grade}`;

/**
 * Native debuts per `${playerId}|${grade}`, the way the native milestone board
 * dates them (routes/milestones.ts appendDebuts): the earliest (season, round)
 * scorecard line in the grade, and only for a player with no earlier games in
 * that grade (a baseline or an earlier season snapshot means the real debut
 * predates the scorecards, so it is left undated).
 */
export function nativeDebuts(input: {
  grades: readonly string[];
  matches: readonly NativeMatchInfo[];
  lines: readonly NativeLine[];
  seasons: readonly NativeSeasonStat[];
}): Map<string, DebutPoint> {
  const grades = new Set(input.grades);
  const matchById = new Map(input.matches.map((m) => [m.id, m]));
  const earliest = new Map<string, NativeMatchInfo>();
  for (const l of input.lines) {
    const m = matchById.get(l.matchId);
    if (!m || !grades.has(m.grade) || m.round === null) continue;
    const k = debutKey(l.playerId, m.grade);
    const cur = earliest.get(k);
    if (
      !cur ||
      m.season < cur.season ||
      (m.season === cur.season && m.round < (cur.round as number))
    ) {
      earliest.set(k, m);
    }
  }
  const prior = (playerId: number, grade: string, season: number): number =>
    input.seasons
      .filter(
        (s) =>
          s.playerId === playerId && s.grade === grade && (s.season === null || s.season < season),
      )
      .reduce((n, s) => n + (s.games ?? 0), 0);
  const out = new Map<string, DebutPoint>();
  for (const [k, m] of earliest) {
    const playerId = Number(k.split("|")[0]);
    if (prior(playerId, m.grade, m.season) !== 0) continue;
    out.set(k, { season: m.season, date: m.matchDate, matchId: m.id });
  }
  return out;
}

/**
 * Hybrid debuts per `${playerId}|${grade}`: the player's first central match in
 * the grade among the seasons central supplies — and only when the club history
 * holds no games for them in that grade (otherwise the debut is pre-boundary
 * and stays undated).
 */
export function hybridDebuts(input: {
  grades: readonly string[];
  playerIds: readonly number[];
  identity: Pick<PreviewIdentity, "guidsOf">;
  boundaries: readonly Boundary[];
  centralMatches: readonly CentralMatchInfo[];
  appearances: ReadonlyMap<number, ReadonlyMap<string, CentralAppearance>>;
  hybridBuckets: readonly HybridBucket[];
}): Map<string, DebutPoint> {
  const grades = new Set(input.grades);
  const historyGames = new Map<string, number>();
  for (const b of input.hybridBuckets) {
    if (b.source !== "history") continue;
    const k = debutKey(b.playerId, b.grade);
    historyGames.set(k, (historyGames.get(k) ?? 0) + b.games);
  }
  const matches = input.centralMatches
    .filter((m): m is CentralMatchInfo & { grade: string; season: number } => {
      if (!m.grade || m.season === null || !grades.has(m.grade)) return false;
      const b = boundaryFor(input.boundaries, m.grade);
      return b === null || m.season >= b;
    })
    .sort(
      (a, b) =>
        a.season - b.season ||
        (a.matchDate ?? "").localeCompare(b.matchDate ?? "") ||
        a.matchId - b.matchId,
    );
  const out = new Map<string, DebutPoint>();
  for (const playerId of input.playerIds) {
    const guids = input.identity.guidsOf(playerId);
    if (guids.length === 0) continue;
    for (const m of matches) {
      const k = debutKey(playerId, m.grade);
      if (out.has(k) || (historyGames.get(k) ?? 0) > 0) continue;
      const byGuid = input.appearances.get(m.matchId);
      if (guids.some((g) => byGuid?.get(g)?.countsAsGame)) {
        out.set(k, { season: m.season, date: m.matchDate, matchId: m.matchId });
      }
    }
  }
  return out;
}

export interface CapRow {
  category: string;
  capNumber: number;
  playerId: number | null;
  name: string;
}

export interface DebutOrderRow {
  category: string;
  capNumber: number;
  /** Always the same number: the preview never renumbers a cap (AE7). */
  capNumberAfter: number;
  playerId: number;
  name: string;
  grade: string;
  moved: "earlier" | "later" | "same" | "unknown";
  nativeSeason: number | null;
  nativeDate: string | null;
  hybridSeason: number | null;
  hybridDate: string | null;
  /** The hybrid debut is earlier than that of a player holding a LOWER cap number. */
  orderDiffers: boolean;
  /** The lowest cap number this player's hybrid debut would precede. */
  wouldPrecedeCap: number | null;
}

/**
 * Where the debut order would differ from the cap register after cut-over.
 * Cap numbers are never changed — this only lists the differences for manual
 * review (R22, AE7).
 */
export function diffDebutOrder(input: {
  caps: readonly CapRow[];
  /** The grade a cap category is awarded for ("male" → "A Grade"). */
  gradeOf: (category: string) => string;
  nativeDebut: ReadonlyMap<string, DebutPoint>;
  hybridDebut: ReadonlyMap<string, DebutPoint>;
  sameMatch: (nativeMatchId: number, centralMatchId: number) => boolean;
}): DebutOrderRow[] {
  const out: DebutOrderRow[] = [];
  const categories = [...new Set(input.caps.map((c) => c.category))].sort();
  for (const category of categories) {
    const grade = input.gradeOf(category);
    const caps = input.caps
      .filter((c) => c.category === category && c.playerId !== null)
      .sort((a, b) => a.capNumber - b.capNumber);
    const hybridOf = (c: CapRow) => input.hybridDebut.get(debutKey(c.playerId!, grade));
    for (const [i, c] of caps.entries()) {
      const n = input.nativeDebut.get(debutKey(c.playerId!, grade));
      const h = hybridOf(c);
      let moved: DebutOrderRow["moved"] = "unknown";
      if (n && h) {
        const same =
          n.matchId !== null && h.matchId !== null && input.sameMatch(n.matchId, h.matchId);
        const cmp = same ? 0 : compareWhen(h, n);
        moved = cmp === 0 ? "same" : cmp < 0 ? "earlier" : "later";
      }
      let wouldPrecedeCap: number | null = null;
      if (h) {
        for (const lower of caps.slice(0, i)) {
          const lh = hybridOf(lower);
          if (lh && compareWhen(h, lh) < 0) {
            wouldPrecedeCap = lower.capNumber;
            break;
          }
        }
      }
      const orderDiffers = wouldPrecedeCap !== null;
      if (moved !== "earlier" && moved !== "later" && !orderDiffers) continue;
      out.push({
        category,
        capNumber: c.capNumber,
        capNumberAfter: c.capNumber,
        playerId: c.playerId!,
        name: c.name,
        grade,
        moved,
        nativeSeason: n?.season ?? null,
        nativeDate: n?.date ?? null,
        hybridSeason: h?.season ?? null,
        hybridDate: h?.date ?? null,
        orderDiffers,
        wouldPrecedeCap,
      });
    }
  }
  return out;
}

// ── Curated links ────────────────────────────────────────────────────────────

/** One curated row's player link (award, cap, ballot pick, photo tag, honour …). */
export interface CuratedRef {
  table: string;
  rowId: number | string;
  column: string;
  playerId: number;
  label: string;
}

export interface CuratedResolutionRow extends CuratedRef {
  /** same: resolves to the same player; different / missing block the cut-over. */
  status: "same" | "different" | "missing" | "unresolved_before";
  resolvesTo: number | null;
  blocking: boolean;
  detail: string;
  /** The link points at a cap-only player (a cap number, no stats): same player, no career. */
  capOnly: boolean;
}

/**
 * Where each curated player link lands after cut-over. Today a tenant 1 link
 * is a native `players.id`; after cut-over it resolves only through the
 * crosswalk (merges folded), and the player's page exists only when the hybrid
 * read has a public career for them. Anything but "same" must be zero to cut
 * over — except links that are already dangling today.
 *
 * A cap-only native player (a cap number and no stats, ids 95001+) is never in
 * the crosswalk, but the live identity recognises it (`ClubIdentity.capOnly`):
 * its page still exists, with the native name and no career, so the link is
 * "same". Any other id in the fill-in range is still missing.
 */
export function resolveCurated(
  refs: readonly CuratedRef[],
  ctx: {
    nativePlayerExists: (playerId: number) => boolean;
    presentedId: (playerId: number) => number | null;
    hybridVisibility: (playerId: number) => "ok" | "private" | "no_career";
    /** The live identity knows this id as a cap-only player. */
    capOnly?: (playerId: number) => boolean;
  },
): CuratedResolutionRow[] {
  return refs.map((ref): CuratedResolutionRow => {
    const id = ref.playerId;
    const presented = ctx.presentedId(id);
    const row = (
      status: CuratedResolutionRow["status"],
      resolvesTo: number | null,
      detail: string,
    ): CuratedResolutionRow => ({
      ...ref,
      status,
      resolvesTo,
      blocking: status === "different" || status === "missing",
      detail,
      capOnly: false,
    });
    if (presented === null) {
      if (ctx.capOnly?.(id)) {
        return {
          ...row("same", id, "cap-only player: same player page, with no stats"),
          capOnly: true,
        };
      }
      if (!ctx.nativePlayerExists(id)) {
        return row("unresolved_before", null, "no such native player today either");
      }
      return row(
        "missing",
        null,
        isFillIn(id)
          ? "no crosswalk row: a fill-in id (>= 90000) that isn't a cap-only player is never in the hybrid read"
          : "no crosswalk row for this player id",
      );
    }
    if (presented !== id) return row("different", presented, `merged into player #${presented}`);
    const visibility = ctx.hybridVisibility(id);
    if (visibility === "private") {
      return row("missing", null, "central marks the player private: hidden after cut-over");
    }
    if (visibility === "no_career") {
      return row("missing", null, "no hybrid career: the player page would be a 404");
    }
    return row("same", id, "");
  });
}

// ── Catches samples (R6) ─────────────────────────────────────────────────────

export interface CatchesSamplePlayer {
  playerId: number;
  matchesDiffering: number;
  /** Sum over matches of |central − native| catches. */
  absoluteDifference: number;
  /** central − native. */
  netDifference: number;
}

export interface CatchesSampleRow extends CommonMatch {
  differs: boolean;
}

/**
 * The players whose catches differ most on matches both sides have, and their
 * per-match counts — the evidence Ash needs to choose the catches rule. Ranked
 * by the summed per-match difference so offsetting differences still count.
 */
export function pickCatchesSamples(
  common: readonly CommonMatch[],
  limit = 10,
): { players: CatchesSamplePlayer[]; rows: CatchesSampleRow[] } {
  const byPlayer = new Map<number, CatchesSamplePlayer>();
  for (const m of common) {
    const d = m.centralCatches - m.nativeCatches;
    if (d === 0) continue;
    const p = byPlayer.get(m.playerId) ?? {
      playerId: m.playerId,
      matchesDiffering: 0,
      absoluteDifference: 0,
      netDifference: 0,
    };
    p.matchesDiffering += 1;
    p.absoluteDifference += Math.abs(d);
    p.netDifference += d;
    byPlayer.set(m.playerId, p);
  }
  const players = [...byPlayer.values()]
    .sort(
      (a, b) =>
        b.absoluteDifference - a.absoluteDifference ||
        Math.abs(b.netDifference) - Math.abs(a.netDifference) ||
        a.playerId - b.playerId,
    )
    .slice(0, limit);
  const rank = new Map(players.map((p, i) => [p.playerId, i]));
  const rows = common
    .filter((m) => rank.has(m.playerId) && (m.nativeCatches > 0 || m.centralCatches > 0))
    .map((m) => ({ ...m, differs: m.nativeCatches !== m.centralCatches }))
    .sort(
      (a, b) =>
        rank.get(a.playerId)! - rank.get(b.playerId)! ||
        (a.season ?? 0) - (b.season ?? 0) ||
        a.nativeMatchId - b.nativeMatchId,
    );
  return { players, rows };
}
