/**
 * hh-cutover-preview-report.ts — assembles the Halls Head cut-over preview
 * (hybrid stats plan U13) from data the runner has already read. No database
 * access and no file I/O: it takes the native rows, the raw central rows and
 * the HYBRID read the API's club overlay produced, runs the rules in
 * hh-cutover-preview-core.ts, and returns the report files as strings plus the
 * summary and the console lines. The runner (hh-cutover-preview.ts) does the
 * reading and the writing of local files; the test drives this end to end on
 * a small fixture through the real overlay code.
 */
import {
  HALLS_HEAD_CENTRAL_CLUB_ID,
  appGradeFromCentral,
  isSeniorAppGrade,
  parseSeasonStartYear,
  type CentralClubRecords,
  type CentralMilestone,
} from "@workspace/db/central-queries";
import { isSyntheticParticipantKey } from "@workspace/db";
import { CAP_CATEGORY_TO_GRADE } from "../../artifacts/api-server/src/lib/cap-sync";
import {
  clubRecords,
  type ClubOverlay,
  type ClubStats,
} from "../../artifacts/api-server/src/lib/club-overlay";
import { parseMatchDate } from "../../artifacts/api-server/src/lib/match-date";
import {
  nativeCareerCrossings,
  nativeMilestoneTiers,
  type MilestoneTierSettings,
} from "../../artifacts/api-server/src/lib/milestone-crossings";
import {
  recordsFromSeasonRows,
  type NativeRecordSeasonRow,
} from "../../artifacts/api-server/src/lib/records-native";
import { isFillIn, linkNativeToCentral, toCsv } from "./hh-central-crosswalk-core";
import {
  HALLS_HEAD_TENANT_ID,
  isCentralPrivate,
  type CentralData,
  type NativeData,
} from "./hh-central-crosswalk-read";
import {
  REASON_CODES,
  REASON_LABEL,
  RECORD_KEYS,
  STAT_KEYS,
  countReasons,
  diffCareers,
  diffDebutOrder,
  diffMilestones,
  diffRecords,
  hybridDebuts,
  nativeAllTimeRecords,
  nativeDebuts,
  pickCatchesSamples,
  resolveCurated,
  topDeltas,
  type BaselineAdjustment,
  type CapRow,
  type CareerDiff,
  type CentralMatchInfo,
  type Crossing,
  type CuratedRef,
  type Figures,
  type HybridBucket,
  type MilestoneBoard,
  type NativeGradeCareer,
  type NativeMatchInfo,
  type PreviewIdentity,
  type ReasonCode,
  type RecordSet,
} from "./hh-cutover-preview-core";

const TENANT = HALLS_HEAD_TENANT_ID;
const CLUB = HALLS_HEAD_CENTRAL_CLUB_ID;

/** Everything the runner reads, plus the hybrid read it built with the API's overlay. */
export interface ReportInput {
  /** tenants.reads_from_central for tenant 1 (false until the cut-over). */
  tenantReadsFromCentral: boolean;
  /** Warnings the runner already has (carried into the summary). */
  warnings: readonly string[];
  /** Native players, matches, scorecard lines (hh-central-crosswalk-read). */
  native: NativeData;
  /** Stored native per-grade careers (`player_grade_stats`). */
  gradeStats: NativeGradeCareer[];
  /** Native season snapshots with names, ordered as the native records read orders them. */
  seasonRows: NativeRecordSeasonRow[];
  adjustments: BaselineAdjustment[];
  matchMeta: Array<{ id: number; round: number | null; matchDate: string | null }>;
  playerTotals: Array<{
    id: number;
    totalGames: number | null;
    totalRuns: number | null;
    totalWickets: number | null;
  }>;
  caps: CapRow[];
  tierSettings: MilestoneTierSettings | null;
  curated: CuratedRef[];
  /** The club's raw central rows (hh-central-crosswalk-read readCentral). */
  central: CentralData;
  /** Tenant 1's club overlay, from the API's own loader. */
  overlay: ClubOverlay;
  /** The hybrid read: `buildClubStats(overlay, 1, club)`. */
  stats: ClubStats;
  /** The hybrid milestone walk: `overlayMilestones(overlay, 1, club, tiers)`. */
  hybridMilestones: CentralMilestone[];
  /** Where the runner will write the files (recorded in the summary only). */
  outDir: string;
}

export interface Report {
  /** File name → contents (CSV / JSON). */
  files: Record<string, string>;
  summary: Record<string, unknown> & {
    curated: { blocking: number };
    careers: { playersChanged: number };
  };
  /** The console summary, line by line. */
  lines: string[];
}

// ── Formatting ───────────────────────────────────────────────────────────────

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
const figureText = (f: Figures): string =>
  STAT_KEYS.filter((k) => f[k] !== 0)
    .map((k) => `${k} ${signed(f[k])}`)
    .join(" ");
const componentsText = (row: CareerDiff): string =>
  row.reasons
    .map((r) => (row.components[r] ? `${r}: ${figureText(row.components[r])}` : r))
    .join(" | ");

function recordSetFromCentral(
  records: CentralClubRecords,
  playerIdOf: (participantId: string) => number | null,
): RecordSet {
  const holder = (h: { participantId: string; value: number | string } | null) =>
    h ? { playerId: playerIdOf(h.participantId), value: String(h.value) } : null;
  return {
    mostGames: holder(records.mostGames),
    mostRuns: holder(records.mostRuns),
    mostWickets: holder(records.mostWickets),
    mostCatches: holder(records.mostCatches),
    mostFifties: holder(records.mostFifties),
    mostHundreds: holder(records.mostHundreds),
    highestScore: holder(records.highestScore),
    bestBowling: holder(records.bestBowling),
  };
}

function recordSetFromNative(records: ReturnType<typeof recordsFromSeasonRows>): RecordSet {
  const holder = (h: { playerId: number; value: number } | null) =>
    h ? { playerId: h.playerId, value: String(h.value) } : null;
  return {
    mostGames: holder(records.mostGames),
    mostRuns: holder(records.mostRuns),
    mostWickets: holder(records.mostWickets),
    mostCatches: holder(records.mostCatches),
    mostFifties: holder(records.mostFifties),
    mostHundreds: holder(records.mostHundreds),
    highestScore: records.highestScore
      ? {
          playerId: records.highestScore.playerId,
          value: (records.highestScore.highScore ?? "").trim(),
        }
      : null,
    bestBowling: records.bestBowling
      ? {
          playerId: records.bestBowling.playerId,
          value: (records.bestBowling.bestBowling ?? "").trim(),
        }
      : null,
  };
}

// ── Report ───────────────────────────────────────────────────────────────────

/** Build the whole preview from already-read data. Pure. */
export function buildReport(input: ReportInput): Report {
  const { native, central, overlay, stats, hybridMilestones, outDir } = input;
  const warnings = [...input.warnings];
  const tiers = nativeMilestoneTiers(input.tierSettings);
  const files: Record<string, string> = {};
  const write = (file: string, body: string): void => {
    files[file] = body;
  };
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
  };

  const privatePlayerIds = new Set<number>();
  const hybridBuckets: HybridBucket[] = [];
  const unmappedParticipants = new Set<string>();
  for (const b of stats.buckets) {
    const playerId = stats.intByGuid.get(b.participantId);
    if (playerId === undefined) {
      unmappedParticipants.add(b.participantId);
      continue;
    }
    if (stats.players.get(b.participantId)?.isPrivate) privatePlayerIds.add(playerId);
    hybridBuckets.push({
      playerId,
      grade: b.grade,
      season: b.season,
      source: b.source,
      careerGrain: b.careerGrain,
      games: b.games,
      innings: b.innings,
      runs: b.runs,
      wickets: b.wickets,
      catches: b.catches,
      highScore: b.highScore === null ? null : `${b.highScore}${b.highScoreNotOut ? "*" : ""}`,
      bestBowling:
        b.bestBowlingWickets !== null && b.bestBowlingWickets > 0
          ? `${b.bestBowlingWickets}/${b.bestBowlingRuns ?? 0}`
          : null,
    });
  }

  // ---- Identity + match evidence ------------------------------------------
  const id = overlay.identity;
  const identity: PreviewIdentity = {
    guidsOf: (playerId) => {
      const keeper = id.guidForPlayerId(playerId);
      return keeper === null
        ? []
        : id.membersOf(keeper).filter((g) => !isSyntheticParticipantKey(g));
    },
    presentedId: (playerId) => {
      const keeper = id.guidForPlayerId(playerId);
      return keeper === null ? null : (id.intByGuid.get(keeper) ?? null);
    },
    ownedIds: (playerId) => {
      const keeper = id.guidForPlayerId(playerId);
      return keeper === null ? [] : id.intsOf(keeper);
    },
    playerIdOfGuid: (guid) => id.intByGuid.get(guid) ?? null,
  };

  const {
    appIndex,
    linkByNativeMatch,
    nativeMatchByCentral,
    assignments,
    seniorLines,
    juniorExcludedNative,
  } = linkNativeToCentral({ native, central });

  const metaById = new Map(input.matchMeta.map((m) => [m.id, m]));
  const nativeMatches: NativeMatchInfo[] = native.matches.map((m) => ({
    id: m.id,
    grade: m.grade,
    season: m.season,
    abandoned: m.abandoned,
    round: metaById.get(m.id)?.round ?? null,
    matchDate: parseMatchDate(metaById.get(m.id)?.matchDate),
  }));
  const centralMatches: CentralMatchInfo[] = central.matches.map((m) => ({
    matchId: m.matchId,
    grade: appGradeFromCentral(m.grade),
    season: parseSeasonStartYear(m.season),
    ladiesT20: /\bladies\s*t20\b/i.test(m.grade ?? ""),
    matchDate: parseMatchDate(m.matchDate),
  }));

  const nativeGrades: NativeGradeCareer[] = input.gradeStats;
  const nonSeniorNativeGrades = [
    ...new Set(nativeGrades.filter((g) => !isSeniorAppGrade(g.grade)).map((g) => g.grade)),
  ].sort();
  if (nonSeniorNativeGrades.length > 0) {
    warnings.push(
      `native careers exist in grades the senior central read never produces: ${nonSeniorNativeGrades.join(", ")}`,
    );
  }

  // ---- Diff ----------------------------------------------------------------
  const careers = diffCareers({
    nativeGrades,
    nativeSeasons: input.seasonRows,
    adjustments: input.adjustments,
    nativeMatches,
    nativeLines: seniorLines,
    linkByNativeMatch,
    assignments,
    centralMatches,
    appearances: appIndex.byMatch,
    identity,
    boundaries: overlay.data.boundaries,
    hybridBuckets,
    correctionDeltas: stats.matchDeltas,
  });

  const playerName = new Map(
    native.players.map((p) => [p.id, `${p.givenName} ${p.surname}`.replace(/\s+/g, " ").trim()]),
  );
  const centralPrivate = new Map(
    central.players.map((p) => [p.participantId, isCentralPrivate(p.isPrivate)]),
  );
  const centralName = new Map(central.players.map((p) => [p.participantId, p.displayName]));
  const guidName = (guid: string): string =>
    centralPrivate.get(guid) ? "(private)" : (centralName.get(guid) ?? "");
  const nameOf = (playerId: number | null): string => {
    if (playerId === null) return "";
    const n = playerName.get(playerId);
    if (n) return n;
    if (privatePlayerIds.has(playerId)) return "(private)";
    const keeper = id.guidForPlayerId(playerId);
    return keeper === null ? "" : (id.nameFor(keeper, guidName(keeper)) ?? "");
  };
  const reasonsText = (reasons: readonly ReasonCode[]): string => reasons.join("; ");

  // Records: all-time, then per senior grade (the honour-display boards).
  const playerIdOf = (participantId: string): number | null =>
    stats.intByGuid.get(participantId) ?? null;
  const recordGrades = [
    ...new Set([
      ...nativeGrades.filter((g) => isSeniorAppGrade(g.grade)).map((g) => g.grade),
      ...hybridBuckets.map((b) => b.grade),
    ]),
  ].sort();
  const recordRows = diffRecords(
    [
      {
        scope: "all",
        native: nativeAllTimeRecords(nativeGrades),
        hybrid: recordSetFromCentral(clubRecords(stats), playerIdOf),
      },
      ...recordGrades.map((grade) => ({
        scope: grade,
        native: recordSetFromNative(
          recordsFromSeasonRows(input.seasonRows.filter((r) => r.grade === grade)),
        ),
        hybrid: recordSetFromCentral(clubRecords(stats, { grade }), playerIdOf),
      })),
    ],
    (playerId, scope) =>
      scope === "all"
        ? (careers.reasonsByPlayer.get(playerId) ?? [])
        : (careers.reasonsByPlayerGrade.get(`${playerId}|${scope}`) ?? []),
  );

  // Milestones: the native board's walk against the overlay's walk.
  const nativeMatchRaw = new Map(input.matchMeta.map((m) => [m.id, { matchDate: m.matchDate }]));
  const nativeMatchById = new Map(nativeMatches.map((m) => [m.id, m]));
  const careerById = new Map(
    input.playerTotals.map((p) => [
      p.id,
      { games: p.totalGames ?? 0, runs: p.totalRuns ?? 0, wickets: p.totalWickets ?? 0 },
    ]),
  );
  const nativeCrossings: Crossing[] = nativeCareerCrossings({
    lines: native.lines.filter((l) => !isFillIn(l.playerId)),
    matchById: nativeMatchRaw,
    careerById,
    gamesTiers: tiers.games,
    runsTiers: tiers.runs,
    wicketsTiers: tiers.wickets,
  }).map((c) => ({
    playerId: c.playerId,
    board: c.boardKey,
    threshold: c.tier,
    season: nativeMatchById.get(c.matchId)?.season ?? null,
    matchDate: nativeMatchById.get(c.matchId)?.matchDate ?? null,
    matchId: c.matchId,
  }));
  const hybridCrossings: Crossing[] = [];
  let dismissalsCrossings = 0;
  for (const m of hybridMilestones) {
    if (m.kind !== "career") continue;
    if (m.boardKey === "dismissals") {
      dismissalsCrossings += 1;
      continue;
    }
    const playerId = id.intByGuid.get(m.participantId);
    if (playerId === undefined || !m.boardKey || m.threshold === undefined) continue;
    hybridCrossings.push({
      playerId,
      board: m.boardKey as MilestoneBoard,
      threshold: m.threshold,
      season: m.season,
      matchDate: parseMatchDate(m.matchDate),
      matchId: m.matchId,
    });
  }
  const board = (f: Figures) => ({ games: f.games, runs: f.runs, wickets: f.wickets });
  const milestoneRows = diffMilestones({
    tiers,
    // The native board walks from the directory totals (players.total_*).
    nativeTotals: new Map(
      [...careerById].filter(([playerId]) => playerId > 0 && !isFillIn(playerId)),
    ),
    // A player central marks private never appears on the hybrid board, so
    // every tier they hold today disappears.
    hybridTotals: new Map(
      [...careers.totals]
        .filter(([playerId]) => !privatePlayerIds.has(playerId))
        .map(([playerId, v]) => [playerId, board(v.hybrid)]),
    ),
    nativeCrossings,
    hybridCrossings,
    nativeMatchByCentral,
    reasonsFor: (playerId) => careers.reasonsByPlayer.get(playerId) ?? [],
  });

  // Debut order against the cap register. Cap numbers are never changed.
  const caps: CapRow[] = input.caps;
  const capGrades = Object.values(CAP_CATEGORY_TO_GRADE);
  const gradeOfCategory = (category: string): string =>
    CAP_CATEGORY_TO_GRADE[category === "female" ? "female" : "male"];
  const debutRows = diffDebutOrder({
    caps,
    gradeOf: gradeOfCategory,
    nativeDebut: nativeDebuts({
      grades: capGrades,
      matches: nativeMatches,
      lines: native.lines,
      seasons: input.seasonRows,
    }),
    hybridDebut: hybridDebuts({
      grades: capGrades,
      playerIds: caps.map((c) => c.playerId).filter((p): p is number => p !== null),
      identity,
      boundaries: overlay.data.boundaries,
      centralMatches,
      appearances: appIndex.byMatch,
      hybridBuckets,
    }),
    sameMatch: (nativeMatchId, centralMatchId) =>
      linkByNativeMatch.get(nativeMatchId) === centralMatchId,
  });

  // Curated links.
  const nativeIds = new Set(native.players.map((p) => p.id));
  const hybridIds = new Set(hybridBuckets.map((b) => b.playerId));
  const curatedRows = resolveCurated(input.curated, {
    nativePlayerExists: (playerId) => nativeIds.has(playerId),
    presentedId: identity.presentedId,
    hybridVisibility: (playerId) =>
      privatePlayerIds.has(playerId) ? "private" : hybridIds.has(playerId) ? "ok" : "no_career",
  });
  const curatedBlocking = curatedRows.filter((r) => r.blocking);

  // Catches samples (R6).
  const samples = pickCatchesSamples(careers.commonMatches, 10);
  const kindsByMatchGuid = new Map<string, string[]>();
  for (const f of central.fielding) {
    if (f.matchId === null || !f.participantId) continue;
    const k = `${f.matchId}|${f.participantId}`;
    const arr = kindsByMatchGuid.get(k) ?? [];
    arr.push((f.kind ?? "").trim() || "(blank)");
    kindsByMatchGuid.set(k, arr);
  }
  const kindsText = (centralMatchId: number, playerId: number): string => {
    const counts = new Map<string, number>();
    for (const g of identity.guidsOf(playerId)) {
      for (const kind of kindsByMatchGuid.get(`${centralMatchId}|${g}`) ?? []) {
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
    }
    return [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, n]) => `${kind} x${n}`)
      .join(" | ");
  };
  const centralMatchById = new Map(central.matches.map((m) => [m.matchId, m]));

  // ---- Report files ----------------------------------------------------

  const careerHeader = ["scope", "player_id", "name", "grade"];
  for (const k of STAT_KEYS) careerHeader.push(`native_${k}`, `hybrid_${k}`, `delta_${k}`);
  careerHeader.push(
    "native_high_score",
    "hybrid_high_score",
    "high_score_changed",
    "native_best_bowling",
    "hybrid_best_bowling",
    "best_bowling_changed",
    "reasons",
    "components",
    "hidden_after_cutover_private",
    "notes",
  );
  const careerCsvRow = (scope: string, r: CareerDiff): unknown[] => {
    const row: unknown[] = [scope, r.playerId, nameOf(r.playerId), r.grade];
    for (const k of STAT_KEYS) row.push(r.native[k], r.hybrid[k], r.delta[k]);
    row.push(
      r.nativeHighScore ?? "",
      r.hybridHighScore ?? "",
      r.highScoreChanged ? 1 : 0,
      r.nativeBestBowling ?? "",
      r.hybridBestBowling ?? "",
      r.bestBowlingChanged ? 1 : 0,
      reasonsText(r.reasons),
      componentsText(r),
      privatePlayerIds.has(r.playerId) ? 1 : 0,
      r.notes.join("; "),
    );
    return row;
  };
  write(
    "careers-diff.csv",
    toCsv(careerHeader, [
      ...topDeltas(careers.players, careers.players.length).map((r) => careerCsvRow("player", r)),
      ...careers.grades.map((r) => careerCsvRow("grade", r)),
    ]),
  );

  write(
    "records-diff.csv",
    toCsv(
      [
        "scope",
        "record",
        "change",
        "native_player_id",
        "native_holder",
        "native_value",
        "hybrid_player_id",
        "hybrid_holder",
        "hybrid_value",
        "reasons",
      ],
      recordRows.map((r) => [
        r.scope,
        r.record,
        r.change,
        r.nativePlayerId ?? "",
        nameOf(r.nativePlayerId),
        r.nativeValue ?? "",
        r.hybridPlayerId ?? "",
        r.hybridValue !== null && r.hybridPlayerId === null
          ? "(central player with no Halls Head player id)"
          : nameOf(r.hybridPlayerId),
        r.hybridValue ?? "",
        reasonsText(r.reasons),
      ]),
    ),
  );

  write(
    "milestones-diff.csv",
    toCsv(
      [
        "player_id",
        "name",
        "board",
        "tier",
        "status",
        "direction",
        "native_total",
        "hybrid_total",
        "native_crossed_season",
        "native_crossed_date",
        "hybrid_crossed_season",
        "hybrid_crossed_date",
        "reasons",
      ],
      milestoneRows.map((r) => [
        r.playerId,
        nameOf(r.playerId),
        r.board,
        r.threshold,
        r.status,
        r.direction,
        r.nativeValue,
        r.hybridValue,
        r.nativeSeason ?? "",
        r.nativeDate ?? "",
        r.hybridSeason ?? "",
        r.hybridDate ?? "",
        reasonsText(r.reasons),
      ]),
    ),
  );

  write(
    "debut-order.csv",
    toCsv(
      [
        "category",
        "cap_number",
        "cap_number_after_cutover",
        "player_id",
        "cap_name",
        "grade",
        "debut_moved",
        "native_debut_season",
        "native_debut_date",
        "hybrid_debut_season",
        "hybrid_debut_date",
        "order_differs",
        "hybrid_debut_precedes_cap_number",
      ],
      debutRows.map((r) => [
        r.category,
        r.capNumber,
        r.capNumberAfter,
        r.playerId,
        r.name,
        r.grade,
        r.moved,
        r.nativeSeason ?? "",
        r.nativeDate ?? "",
        r.hybridSeason ?? "",
        r.hybridDate ?? "",
        r.orderDiffers ? 1 : 0,
        r.wouldPrecedeCap ?? "",
      ]),
    ),
  );

  const overlapHeader = ["player_id", "name", "grade", "boundary", "kind", "seasons"];
  for (const group of ["baseline", "central", "peeled", "double_counted"]) {
    for (const k of STAT_KEYS) overlapHeader.push(`${group}_${k}`);
  }
  write(
    "baseline-overlaps.csv",
    toCsv(
      overlapHeader,
      careers.overlaps.map((o) => {
        const row: unknown[] = [
          o.playerId,
          nameOf(o.playerId),
          o.grade,
          o.boundary ?? "",
          o.kind,
          o.seasons.join(" "),
        ];
        for (const f of [o.baseline, o.central, o.peeled, o.doubleCounted]) {
          for (const k of STAT_KEYS) row.push(f[k]);
        }
        return row;
      }),
    ),
  );

  const unlinkedHeader = [
    "participant_id",
    "central_display_name",
    "native_player_id",
    "native_name",
    "mapped_to_player_id",
    "mapped_to_name",
    "matches",
    "first_season",
    "last_season",
    "grades",
  ];
  for (const group of ["native_lost", "central_under_guid"]) {
    for (const k of STAT_KEYS) unlinkedHeader.push(`${group}_${k}`);
  }
  unlinkedHeader.push("guid_total_matches");
  for (const k of STAT_KEYS) unlinkedHeader.push(`guid_total_${k}`);
  write(
    "unlinked-identities.csv",
    toCsv(
      unlinkedHeader,
      careers.unlinked.map((u) => {
        const row: unknown[] = [
          u.participantId,
          guidName(u.participantId),
          u.nativePlayerId ?? "",
          nameOf(u.nativePlayerId),
          u.mappedToPlayerId ?? "",
          nameOf(u.mappedToPlayerId),
          u.matches,
          u.firstSeason ?? "",
          u.lastSeason ?? "",
          u.grades.join(" "),
        ];
        for (const f of [u.nativeFigures, u.centralFigures]) {
          for (const k of STAT_KEYS) row.push(f[k]);
        }
        row.push(u.guidMatches);
        for (const k of STAT_KEYS) row.push(u.guidFigures[k]);
        return row;
      }),
    ),
  );

  write(
    "curated-resolution.csv",
    toCsv(
      [
        "table",
        "row_id",
        "column",
        "label",
        "player_id",
        "native_name",
        "status",
        "blocking",
        "resolves_to_player_id",
        "resolves_to_name",
        "detail",
      ],
      curatedRows
        .filter((r) => r.status !== "same")
        .map((r) => [
          r.table,
          r.rowId,
          r.column,
          r.label,
          r.playerId,
          nameOf(r.playerId),
          r.status,
          r.blocking ? 1 : 0,
          r.resolvesTo ?? "",
          nameOf(r.resolvesTo),
          r.detail,
        ]),
    ),
  );

  const samplePlayer = new Map(samples.players.map((p) => [p.playerId, p]));
  write(
    "catches-samples.csv",
    toCsv(
      [
        "player_id",
        "name",
        "player_matches_differing",
        "player_absolute_difference",
        "player_net_difference_central_minus_native",
        "season",
        "grade",
        "native_match_id",
        "native_round",
        "native_match_date",
        "central_match_id",
        "playhq_match_id",
        "central_match_date",
        "native_catches",
        "central_catches",
        "differs",
        "native_stumpings",
        "central_stumpings",
        "native_run_outs",
        "central_run_outs",
        "central_fielding_rows_kind",
      ],
      samples.rows.map((r) => {
        const p = samplePlayer.get(r.playerId)!;
        const nm = nativeMatchById.get(r.nativeMatchId);
        const cm = centralMatchById.get(r.centralMatchId);
        return [
          r.playerId,
          nameOf(r.playerId),
          p.matchesDiffering,
          p.absoluteDifference,
          p.netDifference,
          r.season ?? "",
          r.grade,
          r.nativeMatchId,
          nm?.round ?? "",
          nm?.matchDate ?? "",
          r.centralMatchId,
          cm?.playhqMatchId ?? "",
          cm?.matchDate ?? "",
          r.nativeCatches,
          r.centralCatches,
          r.differs ? 1 : 0,
          r.nativeStumpings,
          r.centralStumpings,
          r.nativeRunOuts,
          r.centralRunOuts,
          kindsText(r.centralMatchId, r.playerId),
        ];
      }),
    ),
  );

  // ---- Summary -------------------------------------------------------------
  const curatedByTable: Record<string, Record<string, number>> = {};
  for (const r of curatedRows) {
    const byStatus = (curatedByTable[r.table] ??= {});
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  const milestoneCounts = { appears: 0, disappears: 0, moves: 0 };
  for (const r of milestoneRows) milestoneCounts[r.status] += 1;
  const directoryMismatch = [...careers.totals].filter(([playerId, v]) => {
    const d = careerById.get(playerId);
    return (
      d !== undefined &&
      (d.games !== v.native.games || d.runs !== v.native.runs || d.wickets !== v.native.wickets)
    );
  }).length;
  const top = topDeltas(careers.players, 25);
  const summary = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    tenantId: TENANT,
    centralClubId: CLUB,
    tenantReadsFromCentral: input.tenantReadsFromCentral,
    warnings,
    overlay: {
      active: overlay.active,
      boundaries: overlay.data.boundaries,
      historyRows: overlay.data.history.length,
      corrections: overlay.data.corrections.length,
      correctionsApplied: stats.corrections.applied,
      correctionsStale: stats.corrections.stale.map((s) => ({
        id: s.id,
        reason: s.reason,
        field: s.field,
        playhqMatchId: s.playhqMatchId,
      })),
      mappedGuids: overlay.identity.intByGuid.size,
      confirmedMerges: overlay.identity.merges.size,
    },
    native: {
      players: native.players.length,
      matches: native.matches.length,
      seniorLines: seniorLines.length,
      matchesLinkedToCentral: linkByNativeMatch.size,
      // No PlayHQ id to link on: their seasons are compared by season total.
      matchesNotLinkedToCentral:
        native.matches.length - linkByNativeMatch.size - juniorExcludedNative.size,
      matchesExcludedJuniorGrade: juniorExcludedNative.size,
      playersWhoseDirectoryTotalsDifferFromTheirGradeCareers: directoryMismatch,
    },
    hybrid: {
      players: hybridIds.size,
      buckets: stats.buckets.length,
      privatePlayersHiddenAfterCutover: privatePlayerIds.size,
      centralParticipantsWithNoPlayerId: unmappedParticipants.size,
    },
    careers: {
      playersCompared: careers.totals.size,
      playersChanged: careers.players.length,
      playerGradesChanged: careers.grades.length,
      playersByReason: countReasons(careers.players),
      playerGradesByReason: countReasons(careers.grades),
      top25: top.map((r) => ({
        playerId: r.playerId,
        name: nameOf(r.playerId),
        delta: r.delta,
        reasons: r.reasons,
      })),
    },
    reasonCodes: REASON_LABEL,
    records: {
      scopes: 1 + recordGrades.length,
      recordsPerScope: RECORD_KEYS.length,
      changed: recordRows.length,
      holdersChanged: recordRows.filter((r) => r.change === "holder").length,
    },
    milestones: {
      tiers,
      ...milestoneCounts,
      // The dismissals ladder is central-only: native has no such board, so
      // every one of these is new at cut-over and is not listed row by row.
      newDismissalsLadderCrossings: dismissalsCrossings,
    },
    debutOrder: {
      caps: caps.length,
      listed: debutRows.length,
      movedEarlier: debutRows.filter((r) => r.moved === "earlier").length,
      movedLater: debutRows.filter((r) => r.moved === "later").length,
      orderDiffers: debutRows.filter((r) => r.orderDiffers).length,
      capNumbersChanged: 0,
    },
    baselineOverlaps: {
      rows: careers.overlaps.length,
      players: new Set(careers.overlaps.map((o) => o.playerId)).size,
      byKind: careers.overlaps.reduce<Record<string, number>>((acc, o) => {
        acc[o.kind] = (acc[o.kind] ?? 0) + 1;
        return acc;
      }, {}),
      doubleCounted: careers.overlaps.reduce<Figures>(
        (acc, o) => {
          for (const k of STAT_KEYS) acc[k] += o.doubleCounted[k];
          return acc;
        },
        { games: 0, innings: 0, runs: 0, wickets: 0, catches: 0 },
      ),
    },
    unlinkedIdentities: {
      rows: careers.unlinked.length,
      nativePlayersAffected: new Set(
        careers.unlinked.map((u) => u.nativePlayerId).filter((p) => p !== null),
      ).size,
      centralGuidsWithNoNativeMatch: careers.unlinked.filter((u) => u.nativePlayerId === null)
        .length,
    },
    curated: {
      links: curatedRows.length,
      // Must be zero to cut over (U14).
      blocking: curatedBlocking.length,
      different: curatedRows.filter((r) => r.status === "different").length,
      missing: curatedRows.filter((r) => r.status === "missing").length,
      unresolvedToday: curatedRows.filter((r) => r.status === "unresolved_before").length,
      byTable: curatedByTable,
    },
    catchesSamples: samples.players.map((p) => ({ ...p, name: nameOf(p.playerId) })),
    outputDir: outDir,
  };
  write("summary.json", JSON.stringify(summary, null, 2) + "\n");

  // ---- Console summary -----------------------------------------------------
  log("\n=== Halls Head cut-over preview (READ-ONLY) ===");
  for (const w of warnings) log(`WARNING: ${w}`);
  log(
    `Careers: ${careers.totals.size} players compared, ${careers.players.length} would change ` +
      `(${careers.grades.length} player-grade careers).`,
  );
  log("\nPlayers per reason code (a player with two reasons counts under both):");
  const byReason = countReasons(careers.players);
  const byReasonGrade = countReasons(careers.grades);
  for (const reason of REASON_CODES) {
    const players = byReason[reason] ?? 0;
    const grades = byReasonGrade[reason] ?? 0;
    if (players === 0 && grades === 0) continue;
    log(
      `  ${reason.padEnd(20)} ${String(players).padStart(5)} players ${String(grades).padStart(5)} player-grades`,
    );
  }
  log("\nTop 25 biggest career deltas (hybrid − native):");
  for (const r of top) {
    log(
      `  #${String(r.playerId).padEnd(6)} ${nameOf(r.playerId).padEnd(26).slice(0, 26)} ` +
        `${(figureText(r.delta) || "best figures only").padEnd(52)} [${reasonsText(r.reasons)}]`,
    );
  }
  log(
    `\nRecords: ${recordRows.length} would change (${summary.records.holdersChanged} change holder).`,
  );
  log(
    `Milestones: ${milestoneCounts.appears} appear, ${milestoneCounts.disappears} disappear, ` +
      `${milestoneCounts.moves} move; ${dismissalsCrossings} new dismissals-ladder crossings (central-only board).`,
  );
  log(
    `Debut order: ${debutRows.length} caps listed (${summary.debutOrder.movedEarlier} earlier, ` +
      `${summary.debutOrder.movedLater} later, ${summary.debutOrder.orderDiffers} out of cap order). Cap numbers changed: 0.`,
  );
  log(
    `Baseline overlaps: ${careers.overlaps.length} rows; estimated double count ${figureText(summary.baselineOverlaps.doubleCounted) || "none"}.`,
  );
  log(
    `Unlinked identities: ${careers.unlinked.length} rows ` +
      `(${summary.unlinkedIdentities.nativePlayersAffected} native players affected).`,
  );
  log(
    `Curated links: ${curatedRows.length} checked, ${curatedBlocking.length} would resolve to a different or missing player ` +
      `(${curatedBlocking.length === 0 ? "OK to cut over" : "MUST be zero to cut over"}).`,
  );
  log(
    `Catches samples: ${samples.players.length} players, ${samples.rows.length} match rows (catches-samples.csv).`,
  );
  return { files, summary, lines };
}
