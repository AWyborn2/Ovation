/**
 * seed-hh-club-layer.ts — seed Halls Head's club layer from its native tables
 * (hybrid stats plan U12; R11, R12, R20, R21; KTD3, KTD5, KTD9).
 *
 * What it plans (rules in seed-hh-club-layer-core.ts, unit tested):
 *   1. the Halls Head boundary — default 2003/04, per-grade overrides from the
 *      first season club 1 has central batting lines in each grade;
 *   2. native career baselines as career-grain history, and native seasons
 *      BEFORE each grade's boundary as season history, against the native
 *      player ids (tenant 1's ids, KTD3), through the U11 history-import
 *      library (one `club_history_batches` row, source "hh-native-seed");
 *   3. fill-ins (id >= 90000) never produce history rows;
 *   4. U4's review players (AMBIGUOUS, WEAK_ONLY …) resolved ONLY from a
 *      decisions CSV Ash fills in: "map" → a crosswalk row to the native id,
 *      "unmapped" → recorded by a pinned synthetic row. Nothing is guessed;
 *   5. baseline-only players (no scorecard lines) as synthetic crosswalk
 *      entries PINNED to their existing native ids (never >= 90000);
 *   6. a review list of players whose runs or wickets differ from central —
 *      review only, NO corrections are created;
 *   plus a list of career baselines that may overlap central seasons (U13).
 *
 *   # preview (default — writes nothing to any database; report files only)
 *   pnpm --filter @workspace/scripts run seed-hh-club-layer -- --tenant=1
 *   # preview with Ash's decisions
 *   pnpm --filter @workspace/scripts run seed-hh-club-layer -- --tenant=1 --decisions=<csv>
 *   # write, in ONE transaction, after Ash has reviewed the preview
 *   pnpm --filter @workspace/scripts run seed-hh-club-layer -- --tenant=1 --decisions=<csv> --commit
 *   # undo the seeded history batch (U11 batch undo)
 *   pnpm --filter @workspace/scripts run seed-hh-club-layer -- --tenant=1 --undo=<batchId> [--commit]
 *
 * Needs DATABASE_URL (app DB) and CENTRAL_DATABASE_URL (central, read only —
 * never written). Idempotent: a re-run reports everything unchanged and
 * writes nothing. If migrations 0021/0022 aren't applied, the preview still
 * runs (against an empty store) and --commit / --undo refuse with a clear
 * message instead of failing half way.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import {
  baselineAdjustmentsTable,
  clubHistoryBatchesTable,
  clubHistoryBoundariesTable,
  closeDb,
  db,
  getPool,
  isSyntheticParticipantKey,
  playerCurationTable,
  playerGradeSeasonStatsTable,
  playerIdMapTable,
  tenantsTable,
} from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import { HALLS_HEAD_CENTRAL_CLUB_ID, parseSeasonStartYear } from "@workspace/db/central-queries";
import {
  HistoryStoreMissingError,
  isUndefinedTable,
  listHistoryBatches,
  loadSeniorGradeNormaliser,
  seasonLabel,
  undoHistoryBatch,
  withHistoryStore,
} from "../../artifacts/api-server/src/lib/history-import";
import { linkNativeToCentral, matchesByParticipant, toCsv } from "./hh-central-crosswalk-core";
import {
  HALLS_HEAD_TENANT_ID,
  isCentralPrivate,
  readCentral,
  readNative,
} from "./hh-central-crosswalk-read";
import { planPersistence } from "./persist-hh-crosswalk-core";
import { writeSeedPlan } from "./seed-hh-club-layer-write";
import {
  SEED_SOURCE,
  decisionsCsv,
  flagBaselineOverlaps,
  parseDecisionsCsv,
  parseSeedArgs,
  planDifferenceReview,
  planMatchDifferences,
  planSeed,
  seasonList,
  seedWriteSet,
  zeroPeelFigures,
  type CentralBattingCoverage,
  type NativeStatRow,
  type PeelFigures,
  type SeedDecision,
  type SeedPlan,
  type SeedPlanInput,
} from "./seed-hh-club-layer-core";

const USAGE = `seed-hh-club-layer — seed Halls Head's club layer (boundary, history, pinned players) from native data.

  pnpm --filter @workspace/scripts run seed-hh-club-layer -- --tenant=1 [--decisions=<csv>] [--commit] [--out=<dir>]
  pnpm --filter @workspace/scripts run seed-hh-club-layer -- --tenant=1 --undo=<batchId> [--commit]

  --tenant=1          required (Halls Head only)
  --decisions=<csv>   Ash's decisions for U4's review players (start from decisions-needed.csv)
  --commit            write in one transaction (default: preview, writes nothing)
  --undo=<batchId>    undo the seeded history batch (U11 batch undo)
  --out=<dir>         parent directory for the timestamped report folder (default: OS temp dir)`;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/** Exit with a clear message when the club history tables aren't there. */
function storeMissingExit(err: unknown): never {
  console.error(
    err instanceof Error ? err.message : "The club history tables aren't in this database yet.",
  );
  process.exit(3);
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Full native snapshots + peel records, in one READ ONLY transaction (rolled back). */
async function readSeedNative(): Promise<{
  pgss: NativeStatRow[];
  adjustments: Array<{ playerId: number; grade: string; season: number }>;
}> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '300s'");
    const ro = drizzle(client);
    const pgss = await ro
      .select({
        playerId: playerGradeSeasonStatsTable.playerId,
        grade: playerGradeSeasonStatsTable.grade,
        season: playerGradeSeasonStatsTable.season,
        games: playerGradeSeasonStatsTable.games,
        innings: playerGradeSeasonStatsTable.innings,
        notOuts: playerGradeSeasonStatsTable.notOuts,
        runs: playerGradeSeasonStatsTable.runs,
        highScore: playerGradeSeasonStatsTable.highScore,
        fifties: playerGradeSeasonStatsTable.fifties,
        hundreds: playerGradeSeasonStatsTable.hundreds,
        wickets: playerGradeSeasonStatsTable.wickets,
        runsConceded: playerGradeSeasonStatsTable.runsConceded,
        bestBowling: playerGradeSeasonStatsTable.bestBowling,
        fiveWickets: playerGradeSeasonStatsTable.fiveWickets,
        catches: playerGradeSeasonStatsTable.catches,
        stumpings: playerGradeSeasonStatsTable.stumpings,
        runOuts: playerGradeSeasonStatsTable.runOuts,
      })
      .from(playerGradeSeasonStatsTable);
    const adjustments = await ro
      .select({
        playerId: baselineAdjustmentsTable.playerId,
        grade: baselineAdjustmentsTable.grade,
        season: baselineAdjustmentsTable.season,
      })
      .from(baselineAdjustmentsTable);
    return { pgss, adjustments };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

interface TenantState {
  map: Array<{ participantId: string; playerId: number }>;
  curation: Array<{
    participantId: string;
    mergedIntoParticipantId: string | null;
    mergeStatus: string | null;
  }>;
  boundaries: Array<{ grade: string | null; startSeason: number }>;
  seedBatches: Array<{ id: number; label: string; source: string }>;
  storeMissing: boolean;
}

/**
 * Tenant 1's crosswalk, curation, boundaries and seed batches. Outside a
 * transaction a missing club history store is tolerated (reported as
 * `storeMissing`); inside one it throws, since commit is refused before that.
 */
async function readTenantState(
  reader: Reader,
  tenantId: number,
  tolerateMissingStore: boolean,
): Promise<TenantState> {
  const map = await reader
    .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const curation = await reader
    .select({
      participantId: playerCurationTable.participantId,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
      mergeStatus: playerCurationTable.mergeStatus,
    })
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId));
  try {
    const boundaries = await reader
      .select({
        grade: clubHistoryBoundariesTable.grade,
        startSeason: clubHistoryBoundariesTable.startSeason,
      })
      .from(clubHistoryBoundariesTable)
      .where(eq(clubHistoryBoundariesTable.tenantId, tenantId));
    const seedBatches = await reader
      .select({
        id: clubHistoryBatchesTable.id,
        label: clubHistoryBatchesTable.label,
        source: clubHistoryBatchesTable.source,
      })
      .from(clubHistoryBatchesTable)
      .where(
        and(
          eq(clubHistoryBatchesTable.tenantId, tenantId),
          eq(clubHistoryBatchesTable.source, SEED_SOURCE),
        ),
      );
    return { map, curation, boundaries, seedBatches, storeMissing: false };
  } catch (err) {
    if (tolerateMissingStore && isUndefinedTable(err)) {
      return { map, curation, boundaries: [], seedBatches: [], storeMissing: true };
    }
    throw err;
  }
}

// ── Undo ─────────────────────────────────────────────────────────────────────

async function runUndo(tenantId: number, batchId: number, commit: boolean): Promise<void> {
  const batches = await withHistoryStore(() => listHistoryBatches(tenantId)).catch((err) => {
    if (err instanceof HistoryStoreMissingError) storeMissingExit(err);
    throw err;
  });
  const batch = batches.find((b) => b.id === batchId);
  if (!batch) {
    console.error(`No history batch #${batchId} for tenant ${tenantId}.`);
    process.exit(2);
  }
  if (batch.source !== SEED_SOURCE) {
    console.error(
      `Batch #${batchId} came from "${batch.source}", not this seed — undo it from the ` +
        "platform admin history page instead.",
    );
    process.exit(2);
  }
  console.log(
    `Batch #${batch.id} "${batch.label}" (${batch.createdAt}): ${batch.rows} history row(s), ` +
      `${batch.coverage.length} coverage row(s).`,
  );
  if (!commit) {
    console.log("\nPREVIEW only — nothing removed. Re-run with --commit to undo this batch.");
    return;
  }
  const res = await undoHistoryBatch(tenantId, batchId).catch((err) => {
    if (err instanceof HistoryStoreMissingError) storeMissingExit(err);
    throw err;
  });
  console.log(
    `UNDONE batch #${res.batchId}: ${res.rowsRemoved} history row(s) removed, ` +
      `${res.playersRemoved} unreferenced synthetic player(s) removed.`,
  );
  console.log(
    "Kept on purpose: the club boundaries, decision crosswalk rows, and pinned players that " +
      "curated content still references (they keep curated links resolving). The seed's " +
      "reversal.json lists them if they must go too.",
  );
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const args = parseSeedArgs(argv);
  if ("error" in args) {
    console.error(args.error);
    console.error(USAGE);
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL (app) must be set.");
    process.exit(2);
  }
  const tenantId = args.tenantId;
  if (tenantId !== HALLS_HEAD_TENANT_ID) throw new Error("only tenant 1 is supported");
  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      centralClubId: tenantsTable.centralClubId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) throw new Error(`tenant ${tenantId} not found`);
  if (tenant.centralClubId !== HALLS_HEAD_CENTRAL_CLUB_ID) {
    throw new Error(
      `tenant ${tenantId} (${tenant.slug}) has central club ${tenant.centralClubId}, expected ` +
        `${HALLS_HEAD_CENTRAL_CLUB_ID} — refusing.`,
    );
  }

  if (args.undo !== undefined) {
    console.log(args.commit ? "MODE: UNDO (COMMIT)" : "MODE: UNDO PREVIEW (nothing is written)");
    await runUndo(tenantId, args.undo, args.commit);
    return;
  }
  if (!process.env.CENTRAL_DATABASE_URL) {
    console.error("CENTRAL_DATABASE_URL (central, read only) must be set.");
    process.exit(2);
  }

  let decisions = new Map<number, SeedDecision>();
  if (args.decisions) {
    const parsed = parseDecisionsCsv(readFileSync(args.decisions, "utf8"));
    if (parsed.errors.length > 0) {
      for (const e of parsed.errors) console.error(`decisions row ${e.row}: ${e.message}`);
      process.exit(2);
    }
    decisions = parsed.decisions;
  }

  console.log(args.commit ? "MODE: COMMIT" : "MODE: PREVIEW (nothing is written)");
  console.log("Reading native (READ ONLY transaction)…");
  const native = await readNative();
  const seedNative = await readSeedNative();
  console.log(`Reading central club_id=${HALLS_HEAD_CENTRAL_CLUB_ID} (read-only proxy)…`);
  const central = await readCentral();
  const seniorGrade = await loadSeniorGradeNormaliser();

  const { playerLinks, appIndex, linkByNativeMatch } = linkNativeToCentral({ native, central });
  const privateByGuid = new Map(
    central.players.map((p) => [p.participantId, isCentralPrivate(p.isPrivate)]),
  );
  const centralMatchesByGuid = matchesByParticipant(appIndex);
  const centralName = new Map(central.players.map((p) => [p.participantId, p.displayName]));
  const matchById = new Map(central.matches.map((m) => [m.matchId, m]));

  // Central batting coverage per senior grade and season (for the boundary).
  const coverageMap = new Map<string, CentralBattingCoverage>();
  for (const b of central.batting) {
    const m = b.matchId == null ? undefined : matchById.get(b.matchId);
    const grade = m?.grade ? seniorGrade(m.grade) : null;
    const season = parseSeasonStartYear(m?.season ?? null);
    if (!grade || season === null) continue;
    const key = `${grade}|${season}`;
    const c = coverageMap.get(key) ?? { grade, season, lines: 0 };
    c.lines += 1;
    coverageMap.set(key, c);
  }

  // Central figures per (GUID, grade, season), for the career baseline peel.
  const centralFigures = new Map<string, Map<string, PeelFigures>>();
  const gradeSeasonOf = (matchId: number | null): string | null => {
    const m = matchId == null ? undefined : matchById.get(matchId);
    const grade = m?.grade ? seniorGrade(m.grade) : null;
    const season = parseSeasonStartYear(m?.season ?? null);
    return grade && season !== null ? `${grade}|${season}` : null;
  };
  const figuresFor = (guid: string, key: string): PeelFigures => {
    const byKey = centralFigures.get(guid) ?? new Map<string, PeelFigures>();
    centralFigures.set(guid, byKey);
    let f = byKey.get(key);
    if (!f) byKey.set(key, (f = zeroPeelFigures()));
    return f;
  };
  for (const [mid, apps] of appIndex.byMatch) {
    const key = gradeSeasonOf(mid);
    if (!key) continue;
    for (const [guid, a] of apps) {
      const f = figuresFor(guid, key);
      f.games += a.countsAsGame ? 1 : 0;
      f.innings += a.innings;
      f.notOuts += a.notOuts;
      f.runs += a.runs;
      f.wickets += a.wickets;
      f.runsConceded += a.runsConceded;
      f.catches += a.catches;
      f.stumpings += a.stumpings;
      f.runOuts += a.runOuts;
    }
  }
  // Fifties, hundreds and five-wicket hauls are per innings: from the raw rows.
  for (const b of central.batting) {
    const key = gradeSeasonOf(b.matchId);
    if (!key || !b.participantId) continue;
    const runs = b.runs ?? 0;
    if (runs >= 100) figuresFor(b.participantId, key).hundreds += 1;
    else if (runs >= 50) figuresFor(b.participantId, key).fifties += 1;
  }
  for (const b of central.bowling) {
    const key = gradeSeasonOf(b.matchId);
    if (!key || !b.participantId || (b.wickets ?? 0) < 5) continue;
    figuresFor(b.participantId, key).fiveWickets += 1;
  }
  /** The GUIDs each native player reads as after cut-over (crosswalk, decisions, merges). */
  const peelGuids = (state: TenantState): Map<number, string[]> => {
    const out = new Map<number, string[]>();
    const keeper = new Map<string, number>();
    const add = (playerId: number, guid: string) => {
      const arr = out.get(playerId) ?? [];
      if (!arr.includes(guid)) arr.push(guid);
      out.set(playerId, arr);
    };
    for (const r of state.map) {
      if (isSyntheticParticipantKey(r.participantId)) continue;
      add(r.playerId, r.participantId);
      keeper.set(r.participantId, r.playerId);
    }
    for (const [playerId, d] of decisions) {
      if (d.kind !== "map") continue;
      add(playerId, d.participantId);
      keeper.set(d.participantId, playerId);
    }
    for (const c of state.curation) {
      if (!c.mergedIntoParticipantId || c.mergeStatus !== "confirmed") continue;
      const owner = keeper.get(c.mergedIntoParticipantId);
      if (owner !== undefined) add(owner, c.participantId);
    }
    return out;
  };

  const buildInput = (state: TenantState): SeedPlanInput => {
    const persist = planPersistence({
      links: playerLinks,
      privateByGuid,
      centralMatchesByGuid,
      existingMap: state.map,
      existingCuration: state.curation,
    });
    return {
      coverage: [...coverageMap.values()],
      pgss: seedNative.pgss,
      seniorGrade,
      players: native.players,
      links: playerLinks,
      review: persist.review,
      pendingKeeperIds: persist.mapInserts.map((r) => r.nativePlayerId),
      privateByGuid,
      decisions,
      centralOnly: {
        guidsByPlayer: peelGuids(state),
        figures: centralFigures,
      },
      existing: {
        map: state.map,
        mergedAway: new Set(
          state.curation.filter((c) => c.mergedIntoParticipantId).map((c) => c.participantId),
        ),
        boundaries: state.boundaries,
        seedBatches: state.seedBatches,
        storeMissing: state.storeMissing,
      },
    };
  };

  const state = await readTenantState(db, tenantId, true);
  const plan = planSeed(buildInput(state));

  // ---- Review lists (read-only analysis) ---------------------------------
  const guidsByPlayer = new Map<number, string[]>();
  const keeperPlayer = new Map<string, number>();
  const addGuid = (playerId: number, guid: string) => {
    const arr = guidsByPlayer.get(playerId) ?? [];
    if (!arr.includes(guid)) arr.push(guid);
    guidsByPlayer.set(playerId, arr);
  };
  for (const r of [...state.map, ...plan.identity.decisionMapInserts]) {
    if (isSyntheticParticipantKey(r.participantId)) continue;
    addGuid(r.playerId, r.participantId);
    keeperPlayer.set(r.participantId, r.playerId);
  }
  for (const c of state.curation) {
    if (!c.mergedIntoParticipantId || c.mergeStatus !== "confirmed") continue;
    const owner = keeperPlayer.get(c.mergedIntoParticipantId);
    if (owner !== undefined) addGuid(owner, c.participantId);
  }
  const centralBuckets = new Map<string, Map<string, { runs: number; wickets: number }>>();
  const centralSeasons = new Map<string, Map<string, Set<number>>>();
  const appearances = new Map<
    number,
    Map<string, { batted: boolean; runs: number; bowled: boolean; wickets: number }>
  >();
  for (const [mid, apps] of appIndex.byMatch) {
    const m = matchById.get(mid);
    const grade = m?.grade ? seniorGrade(m.grade) : null;
    const season = parseSeasonStartYear(m?.season ?? null);
    if (!grade || season === null) continue;
    const perMatch = new Map<
      string,
      { batted: boolean; runs: number; bowled: boolean; wickets: number }
    >();
    for (const [pid, a] of apps) {
      perMatch.set(pid, { batted: a.batted, runs: a.runs, bowled: a.bowled, wickets: a.wickets });
      const buckets = centralBuckets.get(pid) ?? new Map();
      const b = buckets.get(`${grade}|${season}`) ?? { runs: 0, wickets: 0 };
      b.runs += a.runs;
      b.wickets += a.wickets;
      buckets.set(`${grade}|${season}`, b);
      centralBuckets.set(pid, buckets);
      if (a.countsAsGame) {
        const byGrade = centralSeasons.get(pid) ?? new Map<string, Set<number>>();
        const set = byGrade.get(grade) ?? new Set<number>();
        set.add(season);
        byGrade.set(grade, set);
        centralSeasons.set(pid, byGrade);
      }
    }
    appearances.set(mid, perMatch);
  }
  const boundaries = plan.boundaries.desired;
  const differences = planDifferenceReview({
    pgss: seedNative.pgss,
    boundaries,
    seniorGrade,
    guidsByPlayer,
    centralBuckets,
  });
  const matchDiffs = planMatchDifferences({
    lines: native.lines,
    nativeMatches: new Map(native.matches.map((m) => [m.id, m])),
    linkByNativeMatch,
    playhqByCentral: new Map(central.matches.map((m) => [m.matchId, m.playhqMatchId])),
    appearances,
    guidsByPlayer,
    boundaries,
    seniorGrade,
  });
  const overlaps = flagBaselineOverlaps({
    pgss: seedNative.pgss,
    boundaries,
    seniorGrade,
    guidsByPlayer,
    centralSeasons,
    adjustments: seedNative.adjustments,
  });

  // ---- Report (local files only) -----------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(args.out ?? os.tmpdir(), `seed-hh-club-layer-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const playerById = new Map(native.players.map((p) => [p.id, p]));
  const nameOf = (id: number): string => {
    const p = playerById.get(id);
    return p ? `${p.givenName} ${p.surname}`.trim() : "";
  };
  const write = (file: string, body: string) => writeFileSync(path.join(outDir, file), body);

  write(
    "boundaries.csv",
    toCsv(
      ["grade", "first_central_season", "first_season_batting_lines", "boundary", "source"],
      plan.boundaries.table.map((r) => [
        r.grade,
        r.firstCentralSeason === null ? "" : seasonLabel(r.firstCentralSeason),
        r.firstSeasonLines,
        seasonLabel(r.boundary),
        r.source,
      ]),
    ),
  );
  write(
    "history-counts.csv",
    toCsv(
      ["grade", "career_rows", "season_rows", "skipped_at_or_after_boundary"],
      plan.history.perGrade.map((g) => [
        g.grade,
        g.careerRows,
        g.seasonRows,
        g.skippedAtOrAfterBoundary,
      ]),
    ),
  );
  write(
    "history-warnings.csv",
    toCsv(
      ["player_id", "name", "grade", "season", "message"],
      plan.history.warnings.map((w) => [
        w.playerId,
        nameOf(w.playerId),
        w.grade,
        w.season === null ? "career" : seasonLabel(w.season),
        w.message,
      ]),
    ),
  );
  write(
    "decisions-needed.csv",
    decisionsCsv(plan.identity.decisionsNeeded, centralName, privateByGuid),
  );
  write(
    "pins.csv",
    toCsv(
      ["action", "player_id", "name", "reason"],
      [
        ...plan.identity.pins.map((p) => ["pin", p.playerId, p.displayName, p.reason]),
        ...plan.identity.pinsUnchanged.map((p) => [
          "unchanged",
          p.playerId,
          nameOf(p.playerId),
          p.participantId,
        ]),
      ],
    ),
  );
  write(
    "review-differences.csv",
    toCsv(
      [
        "player_id",
        "name",
        "grade",
        "season",
        "native_runs",
        "central_runs",
        "native_wickets",
        "central_wickets",
        "runs_differ",
        "wickets_differ",
      ],
      differences.rows.map((r) => [
        r.playerId,
        nameOf(r.playerId),
        r.grade,
        seasonLabel(r.season),
        r.nativeRuns,
        r.centralRuns,
        r.nativeWickets,
        r.centralWickets,
        r.runsDiffer ? 1 : 0,
        r.wicketsDiffer ? 1 : 0,
      ]),
    ),
  );
  write(
    "review-match-lines.csv",
    toCsv(
      [
        "player_id",
        "name",
        "grade",
        "season",
        "native_match_id",
        "playhq_match_id",
        "participant_id",
        "field",
        "native_value",
        "central_value",
      ],
      matchDiffs.map((r) => [
        r.playerId,
        nameOf(r.playerId),
        r.grade,
        seasonLabel(r.season),
        r.nativeMatchId,
        r.playhqMatchId ?? "",
        r.participantId,
        r.field,
        r.nativeValue,
        r.centralValue,
      ]),
    ),
  );
  write(
    "baseline-overlaps.csv",
    toCsv(
      ["player_id", "name", "grade", "flag", "seasons"],
      overlaps.map((o) => [o.playerId, nameOf(o.playerId), o.grade, o.flag, seasonList(o.seasons)]),
    ),
  );
  const peelCols = ["games", "innings", "runs", "wickets", "catches"] as const;
  write(
    "career-peels.csv",
    toCsv(
      [
        "player_id",
        "name",
        "grade",
        "central_only_seasons",
        ...peelCols.flatMap((k) => [`baseline_${k}`, `central_${k}`, `peeled_${k}`]),
        "dropped",
      ],
      plan.history.peels.map((p) => [
        p.playerId,
        nameOf(p.playerId),
        p.grade,
        seasonList(p.seasons),
        ...peelCols.flatMap((k) => [p.baseline[k], p.central[k], p.peeled[k]]),
        p.dropped ? "yes" : "",
      ]),
    ),
  );
  const pinReasons: Record<string, number> = {};
  for (const p of plan.identity.pins) pinReasons[p.reason] = (pinReasons[p.reason] ?? 0) + 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.commit ? "commit" : "preview",
    tenantId,
    centralClubId: HALLS_HEAD_CENTRAL_CLUB_ID,
    storeMissing: state.storeMissing,
    boundaries: {
      desired: plan.boundaries.desired,
      current: plan.boundaries.current,
      changed: plan.boundaries.changed,
    },
    history: {
      perGrade: plan.history.perGrade,
      totalRows: plan.history.rows.length,
      skipped: plan.history.skipped,
      warnings: plan.history.warnings.length,
      mergedDuplicates: plan.history.mergedDuplicates,
      careerPeels: plan.history.peels.length,
      existingSeedBatches: plan.batch.existing,
      willWriteBatch: plan.batch.write,
    },
    decisions: {
      needed: plan.identity.decisionsNeeded.length,
      undecided: plan.identity.undecided,
      mapInserts: plan.identity.decisionMapInserts.length,
      mapUnchanged: plan.identity.decisionMapUnchanged.length,
    },
    pins: {
      toWrite: plan.identity.pins.length,
      unchanged: plan.identity.pinsUnchanged.length,
      byReason: pinReasons,
    },
    review: {
      playersRunsDiffer: differences.playersRunsDiffer.length,
      playersWicketsDiffer: differences.playersWicketsDiffer.length,
      seasonRows: differences.rows.length,
      matchLines: matchDiffs.length,
      correctionsCreated: 0,
    },
    baselineOverlapsForU13: overlaps.length,
    blockers: plan.blockers,
    outputDir: outDir,
  };
  write("summary.json", JSON.stringify(summary, null, 2) + "\n");

  printPreview(plan, differences, overlaps.length, nameOf);
  console.log(`\nReport: ${outDir}`);

  if (!args.commit) {
    console.log("\nPREVIEW only — nothing written. Re-run with --commit after review.");
    return;
  }
  if (plan.blockers.length > 0) {
    console.error("\nNOT COMMITTED — resolve the blockers above first. Nothing was written.");
    process.exitCode = 1;
    return;
  }

  // ---- Commit: one transaction, re-planned against locked current rows -----
  let committed: SeedPlan;
  let batchId: number | null = null;
  try {
    committed = await withHistoryStore(() =>
      db.transaction(async (tx: Tx) => {
        await tx.execute(
          sql`LOCK TABLE ${playerIdMapTable}, ${playerCurationTable}, ${clubHistoryBoundariesTable}, ${clubHistoryBatchesTable} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const now = await readTenantState(tx, tenantId, false);
        const txPlan = planSeed(buildInput(now));
        if (txPlan.blockers.length > 0 || seedWriteSet(txPlan) !== seedWriteSet(plan)) {
          throw new Error("rows changed since the preview — aborting, nothing written. Re-run.");
        }
        batchId = (await writeSeedPlan(tx, tenantId, txPlan)).batchId;
        return txPlan;
      }),
    );
  } catch (err) {
    if (err instanceof HistoryStoreMissingError) storeMissingExit(err);
    throw err;
  }

  const reversal = {
    committedAt: new Date().toISOString(),
    tenantId,
    historyBatchId: batchId,
    previousBoundaries: committed.boundaries.changed ? committed.boundaries.current : null,
    boundariesWritten: committed.boundaries.changed ? committed.boundaries.desired : null,
    playerIdMapInserted: committed.identity.decisionMapInserts.map((r) => ({
      participantId: r.participantId,
      playerId: r.playerId,
    })),
    pinnedPlayers: committed.identity.pins,
    undo:
      `History: run this script with --tenant=1 --undo=${batchId ?? "<batchId>"} --commit ` +
      "(U11 batch undo; also removes pinned players nothing else references). Boundaries: " +
      "restore previousBoundaries via the platform admin history page. Decision crosswalk rows: " +
      "DELETE FROM player_id_map WHERE tenant_id = 1 AND participant_id IN (…playerIdMapInserted).",
  };
  write("reversal.json", JSON.stringify(reversal, null, 2) + "\n");
  console.log(
    `\nCOMMITTED: boundaries ${committed.boundaries.changed ? "replaced" : "unchanged"}, ` +
      `${committed.identity.decisionMapInserts.length} decision crosswalk row(s), ` +
      `${committed.identity.pins.length} pinned player(s), ` +
      `${committed.batch.write ? `batch #${batchId} with ${committed.history.rows.length} history row(s)` : "no history batch (already seeded)"}. ` +
      `Reversal record: ${path.join(outDir, "reversal.json")}`,
  );
}

function printPreview(
  plan: SeedPlan,
  differences: ReturnType<typeof planDifferenceReview>,
  overlapCount: number,
  nameOf: (id: number) => string,
): void {
  console.log("\n=== Halls Head club layer seed (U12) ===");
  console.log(`\nBoundary (${plan.boundaries.changed ? "WILL CHANGE" : "unchanged"}):`);
  console.table(
    plan.boundaries.table.map((r) => ({
      grade: r.grade,
      "first central season":
        r.firstCentralSeason === null ? "—" : seasonLabel(r.firstCentralSeason),
      "batting lines that season": r.firstSeasonLines,
      boundary: seasonLabel(r.boundary),
      source: r.source,
    })),
  );
  console.log("\nHistory rows per grade:");
  console.table(
    plan.history.perGrade.map((g) => ({
      grade: g.grade,
      "career rows": g.careerRows,
      "season rows": g.seasonRows,
      "skipped (central supplies)": g.skippedAtOrAfterBoundary,
    })),
  );
  const s = plan.history.skipped;
  console.log(
    `Total history rows: ${plan.history.rows.length}. Skipped: ${s.fillIn} fill-in row(s), ` +
      `${s.empty} empty, ${s.atOrAfterBoundary} at/after boundary, ` +
      `${s.peeledAway} emptied by the central-season peel, non-senior grades ` +
      `${JSON.stringify(s.nonSeniorGrade)}. Warnings: ${plan.history.warnings.length}. ` +
      `Summed duplicates: ${plan.history.mergedDuplicates}.`,
  );
  console.log(
    `Career baselines peeled of central-only seasons: ${plan.history.peels.length} ` +
      `(career-peels.csv).`,
  );
  if (plan.batch.existing.length > 0) {
    console.log(
      `Already seeded: batch ${plan.batch.existing.map((b) => `#${b.id}`).join(", ")} — no new batch.`,
    );
  }
  const pinCounts: Record<string, number> = {};
  for (const p of plan.identity.pins) pinCounts[p.reason] = (pinCounts[p.reason] ?? 0) + 1;
  console.log(
    `\nPinned synthetic players: ${plan.identity.pins.length} to write ${JSON.stringify(pinCounts)}, ` +
      `${plan.identity.pinsUnchanged.length} already in place.`,
  );
  console.log(
    `\nDecisions needed (U4 review players): ${plan.identity.decisionsNeeded.length}, ` +
      `open: ${plan.identity.undecided.length}. Map rows to write: ` +
      `${plan.identity.decisionMapInserts.length}. See decisions-needed.csv.`,
  );
  for (const d of plan.identity.decisionsNeeded) {
    console.log(
      `  ${d.nativePlayerId} ${d.name} [${d.reasons.join(",")}] → ` +
        `${d.decision ? `${d.decision.kind}${d.decision.kind === "map" ? ` ${d.decision.participantId}` : ""} (${d.decidedBy})` : "OPEN"}`,
    );
  }
  console.log(
    `\nReview list (no corrections created): ${differences.playersRunsDiffer.length} player(s) ` +
      `with runs differing, ${differences.playersWicketsDiffer.length} with wickets differing ` +
      `(${differences.rows.length} grade-season row(s)). See review-differences.csv and ` +
      "review-match-lines.csv.",
  );
  for (const id of [
    ...new Set([...differences.playersRunsDiffer, ...differences.playersWicketsDiffer]),
  ]) {
    const rows = differences.rows.filter((r) => r.playerId === id);
    const runs = rows.reduce((t, r) => t + r.nativeRuns - r.centralRuns, 0);
    const wkts = rows.reduce((t, r) => t + r.nativeWickets - r.centralWickets, 0);
    console.log(`  ${id} ${nameOf(id)}: native − central = ${runs} runs, ${wkts} wickets`);
  }
  console.log(`\nCareer baselines that may overlap central seasons (for U13): ${overlapCount}.`);
  if (plan.blockers.length > 0) {
    console.log("\nBLOCKERS (commit refused until resolved):");
    for (const b of plan.blockers) console.log(`  - ${b}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closeDb(), closeCentralDb()]);
  });
