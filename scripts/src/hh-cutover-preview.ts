/**
 * hh-cutover-preview.ts — STRICTLY READ-ONLY preview of every Halls Head number
 * that would change when tenant 1 cuts over from native to hybrid stats
 * (hybrid stats plan U13; R6, R19, R20, R21; AE6, AE7).
 *
 * Every Halls Head senior career is computed two ways:
 *   (a) NATIVE, as the site shows it today — the app's stored native careers
 *       (`player_grade_stats`, `player_grade_season_stats` incl. baselines);
 *   (b) HYBRID, as it would show after cut-over — by running the SAME overlay
 *       code path the API uses for a central tenant (`loadClubOverlay` +
 *       `buildClubStats` / `overlayMilestones` / `clubRecords` from
 *       artifacts/api-server/src/lib/club-overlay.ts) for tenant 1, as if it
 *       read central. The preview and the live read cannot diverge.
 *
 * It then diffs careers (per player and per grade), record holders, milestone
 * tier crossings and debut order against the cap register, gives every delta a
 * reason code, lists curated rows whose player link would not resolve to the
 * same player, and picks the ten catches samples Ash needs to choose the
 * catches rule (R6). The rules are in hh-cutover-preview-core.ts and the report
 * assembly in hh-cutover-preview-report.ts (both unit tested, no database).
 *
 * It never writes: no flag makes it write, and any flag implying a write is
 * refused. Native reads run in `BEGIN TRANSACTION READ ONLY` on a single client
 * that is ROLLED BACK (Postgres itself rejects a write inside it); central
 * reads go through the read-only `centralDb` proxy (write builders throw) on
 * the SELECT-only central role. Cap numbers are never changed — the debut
 * report only lists where the order would differ.
 *
 *   pnpm --filter @workspace/scripts run hh-cutover-preview
 *   pnpm --filter @workspace/scripts run hh-cutover-preview -- --out=/tmp/hh
 *
 * Needs DATABASE_URL (native app DB) and CENTRAL_DATABASE_URL (central).
 * Output: a timestamped folder under --out (default: the OS temp dir) with
 * summary.json, careers-diff.csv, records-diff.csv, milestones-diff.csv,
 * debut-order.csv, baseline-overlaps.csv, unlinked-identities.csv,
 * curated-resolution.csv and catches-samples.csv.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import {
  awardBallotsTable,
  awardVotingConfigTable,
  awardWinnersTable,
  awardsTable,
  baselineAdjustmentsTable,
  capRegisterTable,
  centuriesTable,
  closeDb,
  clubPhotoPlayersTable,
  clubRolesTable,
  fiveWicketHaulsTable,
  getPool,
  honourBoardOverridesTable,
  lifeMembersTable,
  matchesTable,
  milestoneBoardSettingsTable,
  playerGradeSeasonStatsTable as pgss,
  playerGradeStatsTable,
  playerImagesTable,
  playersTable,
  premiershipPlayersTable,
  teamOfDecadeMembersTable,
  tenantsTable,
} from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import { HALLS_HEAD_CENTRAL_CLUB_ID } from "@workspace/db/central-queries";
import {
  buildClubStats,
  loadClubOverlay,
  overlayMilestones,
  type ClubOverlay,
  type OverlayReader,
} from "../../artifacts/api-server/src/lib/club-overlay";
import { centralMilestoneTiers } from "../../artifacts/api-server/src/lib/milestone-crossings";
import type { NativeRecordSeasonRow } from "../../artifacts/api-server/src/lib/records-native";
import { FILL_IN_THRESHOLD, validateArgs } from "./hh-central-crosswalk-core";
import {
  HALLS_HEAD_TENANT_ID,
  readCentral,
  readNativeIn,
  type NativeReader,
} from "./hh-central-crosswalk-read";
import type { BaselineAdjustment, CuratedRef } from "./hh-cutover-preview-core";
import { buildReport } from "./hh-cutover-preview-report";

const TENANT = HALLS_HEAD_TENANT_ID;
const CLUB = HALLS_HEAD_CENTRAL_CLUB_ID;

const USAGE = `hh-cutover-preview — READ-ONLY preview of every Halls Head number that would change at cut-over.

  pnpm --filter @workspace/scripts run hh-cutover-preview [-- --out=<dir>]

  --out=<dir>  parent directory for the timestamped output folder (default: OS temp dir)
  --help       show this help

Requires DATABASE_URL (native) and CENTRAL_DATABASE_URL (central). Never writes to either.`;

type Ro = NativeReader;

/** Run `fn` inside one READ ONLY transaction that is always rolled back. */
async function readOnly<T>(fn: (ro: Ro) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '300s'");
    return await fn(drizzle(client));
  } finally {
    // Nothing was written (the transaction is READ ONLY) — roll back regardless.
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

// ── Native reads (one READ ONLY transaction) ─────────────────────────────────

/** Every curated row that links a player, for tenant 1. */
async function readCuratedRefs(ro: Ro): Promise<CuratedRef[]> {
  const refs: CuratedRef[] = [];
  const take = (
    table: string,
    column: string,
    rows: Array<{ rowId: number; playerId: number | null; label: string | null }>,
  ) => {
    for (const r of rows) {
      if (r.playerId === null) continue;
      refs.push({ table, rowId: r.rowId, column, playerId: r.playerId, label: r.label ?? "" });
    }
  };

  take(
    "award_winners",
    "player_id",
    await ro
      .select({
        rowId: awardWinnersTable.id,
        playerId: awardWinnersTable.playerId,
        label: sql<string>`${awardWinnersTable.name} || ' (' || ${awardWinnersTable.season} || ')'`,
      })
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.tenantId, TENANT)),
  );
  take(
    "cap_register",
    "player_id",
    await ro
      .select({
        rowId: capRegisterTable.id,
        playerId: capRegisterTable.playerId,
        label: sql<string>`${capRegisterTable.category} || ' cap #' || ${capRegisterTable.capNumber} || ' ' || ${capRegisterTable.name}`,
      })
      .from(capRegisterTable)
      .where(eq(capRegisterTable.tenantId, TENANT)),
  );
  // Ballots are tenant-scoped through their award.
  const ballots = await ro
    .select({
      rowId: awardBallotsTable.id,
      pick1: awardBallotsTable.pick1PlayerId,
      pick2: awardBallotsTable.pick2PlayerId,
      pick3: awardBallotsTable.pick3PlayerId,
      label: sql<string>`${awardsTable.title} || ' ' || ${awardVotingConfigTable.season} || ' ' || ${awardBallotsTable.grade} || ' round ' || ${awardBallotsTable.round}`,
    })
    .from(awardBallotsTable)
    .innerJoin(awardVotingConfigTable, eq(awardVotingConfigTable.id, awardBallotsTable.configId))
    .innerJoin(awardsTable, eq(awardsTable.id, awardVotingConfigTable.awardId))
    .where(eq(awardsTable.tenantId, TENANT));
  for (const b of ballots) {
    take("award_ballots", "pick1_player_id", [{ ...b, playerId: b.pick1 }]);
    take("award_ballots", "pick2_player_id", [{ ...b, playerId: b.pick2 }]);
    take("award_ballots", "pick3_player_id", [{ ...b, playerId: b.pick3 }]);
  }
  take(
    "club_photo_players",
    "player_id",
    await ro
      .select({
        rowId: clubPhotoPlayersTable.id,
        playerId: clubPhotoPlayersTable.playerId,
        label: sql<string>`'photo ' || ${clubPhotoPlayersTable.photoId}`,
      })
      .from(clubPhotoPlayersTable)
      .where(eq(clubPhotoPlayersTable.tenantId, TENANT)),
  );
  take(
    "player_images",
    "player_id",
    await ro
      .select({
        rowId: playerImagesTable.id,
        playerId: playerImagesTable.playerId,
        label: sql<string>`'gallery image'`,
      })
      .from(playerImagesTable)
      .where(eq(playerImagesTable.tenantId, TENANT)),
  );
  take(
    "honour_board_overrides",
    "player_id",
    await ro
      .select({
        rowId: honourBoardOverridesTable.id,
        playerId: honourBoardOverridesTable.playerId,
        label: honourBoardOverridesTable.boardKey,
      })
      .from(honourBoardOverridesTable)
      .where(eq(honourBoardOverridesTable.tenantId, TENANT)),
  );
  take(
    "life_members",
    "player_id",
    await ro
      .select({
        rowId: lifeMembersTable.id,
        playerId: lifeMembersTable.playerId,
        label: lifeMembersTable.name,
      })
      .from(lifeMembersTable)
      .where(eq(lifeMembersTable.tenantId, TENANT)),
  );
  take(
    "team_of_decade_members",
    "player_id",
    await ro
      .select({
        rowId: teamOfDecadeMembersTable.id,
        playerId: teamOfDecadeMembersTable.playerId,
        label: teamOfDecadeMembersTable.name,
      })
      .from(teamOfDecadeMembersTable)
      .where(eq(teamOfDecadeMembersTable.tenantId, TENANT)),
  );
  take(
    "premiership_players",
    "player_id",
    await ro
      .select({
        rowId: premiershipPlayersTable.id,
        playerId: premiershipPlayersTable.playerId,
        label: premiershipPlayersTable.name,
      })
      .from(premiershipPlayersTable)
      .where(eq(premiershipPlayersTable.tenantId, TENANT)),
  );
  take(
    "club_roles",
    "player_id",
    await ro
      .select({
        rowId: clubRolesTable.id,
        playerId: clubRolesTable.playerId,
        label: sql<string>`${clubRolesTable.role} || ' ' || ${clubRolesTable.season} || ' ' || ${clubRolesTable.name}`,
      })
      .from(clubRolesTable)
      .where(eq(clubRolesTable.tenantId, TENANT)),
  );
  take(
    "centuries",
    "player_id",
    await ro
      .select({
        rowId: centuriesTable.id,
        playerId: centuriesTable.playerId,
        label: centuriesTable.batsman,
      })
      .from(centuriesTable)
      .where(eq(centuriesTable.tenantId, TENANT)),
  );
  take(
    "five_wicket_hauls",
    "player_id",
    await ro
      .select({
        rowId: fiveWicketHaulsTable.id,
        playerId: fiveWicketHaulsTable.playerId,
        label: fiveWicketHaulsTable.bowler,
      })
      .from(fiveWicketHaulsTable)
      .where(eq(fiveWicketHaulsTable.tenantId, TENANT)),
  );
  return refs;
}

async function readTenantNative(ro: Ro) {
  const [tenant] = await ro
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, TENANT));
  const native = await readNativeIn(ro);
  const gradeStats = await ro
    .select({
      playerId: playerGradeStatsTable.playerId,
      grade: playerGradeStatsTable.grade,
      games: playerGradeStatsTable.games,
      innings: playerGradeStatsTable.innings,
      runs: playerGradeStatsTable.runs,
      wickets: playerGradeStatsTable.wickets,
      catches: playerGradeStatsTable.catches,
      fifties: playerGradeStatsTable.fifties,
      hundreds: playerGradeStatsTable.hundreds,
      highScore: playerGradeStatsTable.highScore,
      bestBowling: playerGradeStatsTable.bestBowling,
    })
    .from(playerGradeStatsTable);
  // The rows the native filtered records read uses (records-native.ts
  // loadSeasonRows): fill-ins excluded, ordered by season with the baseline last.
  const seasonRows: NativeRecordSeasonRow[] = await ro
    .select({
      id: pgss.id,
      playerId: pgss.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      grade: pgss.grade,
      season: pgss.season,
      games: pgss.games,
      innings: pgss.innings,
      notOuts: pgss.notOuts,
      runs: pgss.runs,
      highScore: pgss.highScore,
      fifties: pgss.fifties,
      hundreds: pgss.hundreds,
      wickets: pgss.wickets,
      runsConceded: pgss.runsConceded,
      bestBowling: pgss.bestBowling,
      fiveWickets: pgss.fiveWickets,
      catches: pgss.catches,
      stumpings: pgss.stumpings,
      runOuts: pgss.runOuts,
    })
    .from(pgss)
    .innerJoin(playersTable, eq(playersTable.id, pgss.playerId))
    .where(lt(pgss.playerId, FILL_IN_THRESHOLD))
    .orderBy(pgss.season, pgss.id);
  const adjustments: BaselineAdjustment[] = await ro
    .select({
      playerId: baselineAdjustmentsTable.playerId,
      grade: baselineAdjustmentsTable.grade,
      season: baselineAdjustmentsTable.season,
      games: baselineAdjustmentsTable.games,
      innings: baselineAdjustmentsTable.innings,
      runs: baselineAdjustmentsTable.runs,
      wickets: baselineAdjustmentsTable.wickets,
      catches: baselineAdjustmentsTable.catches,
    })
    .from(baselineAdjustmentsTable);
  const matchMeta = await ro
    .select({
      id: matchesTable.id,
      round: matchesTable.round,
      matchDate: matchesTable.matchDate,
    })
    .from(matchesTable);
  const playerTotals = await ro
    .select({
      id: playersTable.id,
      totalGames: playersTable.totalGames,
      totalRuns: playersTable.totalRuns,
      totalWickets: playersTable.totalWickets,
    })
    .from(playersTable);
  const caps = await ro
    .select({
      category: capRegisterTable.category,
      capNumber: capRegisterTable.capNumber,
      playerId: capRegisterTable.playerId,
      name: capRegisterTable.name,
    })
    .from(capRegisterTable)
    .where(and(eq(capRegisterTable.tenantId, TENANT), isNotNull(capRegisterTable.playerId)));
  // Read, never created: `getOrCreateSettings` would write a missing row.
  const [tierSettings] = await ro
    .select({
      gamesTiers: milestoneBoardSettingsTable.gamesTiers,
      runsTiers: milestoneBoardSettingsTable.runsTiers,
      wicketsTiers: milestoneBoardSettingsTable.wicketsTiers,
    })
    .from(milestoneBoardSettingsTable)
    .where(eq(milestoneBoardSettingsTable.tenantId, TENANT));
  const curated = await readCuratedRefs(ro);
  return {
    tenant,
    native,
    gradeStats,
    seasonRows,
    adjustments,
    matchMeta,
    playerTotals,
    caps,
    tierSettings: tierSettings ?? null,
    curated,
  };
}
// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const argError = validateArgs(argv);
  if (argError) {
    console.error(argError);
    console.error(USAGE);
    process.exit(2);
  }
  if (!process.env.DATABASE_URL || !process.env.CENTRAL_DATABASE_URL) {
    console.error("Both DATABASE_URL (native) and CENTRAL_DATABASE_URL (central) must be set.");
    process.exit(2);
  }
  const outParent = argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(outParent ?? os.tmpdir(), `hh-cutover-preview-${stamp}`);

  // ---- Read ----------------------------------------------------------------
  console.log("MODE: PREVIEW (read-only — nothing is written to either database)");
  console.log("Loading tenant 1's club overlay (READ ONLY transaction, the API's own loader)…");
  // Its own transaction: before migration 0021 the loader swallows an
  // undefined_table, which would otherwise abort the reads that follow.
  const overlay: ClubOverlay = await readOnly((ro) =>
    loadClubOverlay(TENANT, ro satisfies OverlayReader),
  );
  console.log("Reading native (READ ONLY transaction)…");
  const t = await readOnly(readTenantNative);
  if (!t.tenant) throw new Error(`tenant ${TENANT} not found`);
  if (t.tenant.centralClubId !== CLUB) {
    throw new Error(
      `tenant ${TENANT} (${t.tenant.slug}) has central club ${t.tenant.centralClubId}, expected ${CLUB} — refusing.`,
    );
  }
  const warnings: string[] = [];
  if (t.tenant.readsFromCentral) {
    warnings.push(
      "tenant 1 already has reads_from_central = true: the NATIVE side is no longer what the site shows.",
    );
  }
  if (!overlay.active) {
    warnings.push(
      "tenant 1 has no club layer (no boundary, history or correction): the live central read would not go through the overlay.",
    );
  }
  const { native } = t;
  console.log(
    `  players=${native.players.length} matches=${native.matches.length} lines=${native.lines.length} ` +
      `grade careers=${t.gradeStats.length} season rows=${t.seasonRows.length} curated links=${t.curated.length}`,
  );
  console.log(
    `  overlay: ${overlay.data.boundaries.length} boundaries, ${overlay.data.history.length} history rows, ` +
      `${overlay.data.corrections.length} corrections, ${overlay.identity.intByGuid.size} mapped GUIDs`,
  );

  console.log(`Reading central club_id=${CLUB} (read-only proxy)…`);
  const central = await readCentral();
  console.log(
    `  matches=${central.matches.length} batting=${central.batting.length} bowling=${central.bowling.length} ` +
      `rosters=${central.rosters.length} fielding=${central.fielding.length}`,
  );

  // ---- HYBRID: the API's overlay code path, for tenant 1 as if it read central
  console.log("Building the hybrid read (buildClubStats / overlayMilestones)…");
  const stats = await buildClubStats(overlay, TENANT, CLUB);
  const hybridMilestones = await overlayMilestones(
    overlay,
    TENANT,
    CLUB,
    centralMilestoneTiers(t.tierSettings),
  );

  const report = buildReport({
    tenantReadsFromCentral: t.tenant.readsFromCentral,
    warnings,
    native,
    gradeStats: t.gradeStats,
    seasonRows: t.seasonRows,
    adjustments: t.adjustments,
    matchMeta: t.matchMeta,
    playerTotals: t.playerTotals,
    caps: t.caps,
    tierSettings: t.tierSettings,
    curated: t.curated,
    central,
    overlay,
    stats,
    hybridMilestones,
    outDir,
  });

  // ---- Write outputs (local files only) -----------------------------------
  mkdirSync(outDir, { recursive: true });
  for (const [file, body] of Object.entries(report.files)) {
    writeFileSync(path.join(outDir, file), body);
  }
  for (const line of report.lines) console.log(line);
  console.log(`\nWrote ${outDir}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closeDb(), closeCentralDb()]);
  });
