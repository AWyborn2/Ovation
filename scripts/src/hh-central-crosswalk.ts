/**
 * hh-central-crosswalk.ts — STRICTLY READ-ONLY diagnostic that
 *   (1) links every Halls Head native player (tenant 1, int `players.id`) to a
 *       central PlayHQ participant GUID from SCORECARD EVIDENCE, and
 *   (2) compares career totals native vs central for the cleanly linked ones.
 *
 * It never writes: no player_id_map rows, no DDL, nothing. Native reads run in
 * one `BEGIN TRANSACTION READ ONLY` on a single client that is ROLLED BACK at
 * the end (Postgres itself rejects any write inside it); central reads go
 * through the read-only `centralDb` proxy (write builders throw) on the
 * SELECT-only central role. Any flag implying a write is refused.
 *
 *   pnpm --filter @workspace/scripts run hh-crosswalk
 *   pnpm --filter @workspace/scripts run hh-crosswalk -- --out=/tmp/hh
 *
 * Needs DATABASE_URL (native app DB) and CENTRAL_DATABASE_URL (central).
 * Output: a timestamped directory under --out (default: the OS temp dir) with
 * crosswalk.csv, conflicts.csv, comparison.csv, season-coverage.csv,
 * central-unlinked.csv and summary.json.
 *
 * Matching rules and thresholds live in hh-central-crosswalk-core.ts (unit
 * tested). Names are only a tie-breaker inside one match's assignment.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import { HALLS_HEAD_CENTRAL_CLUB_ID, parseSeasonStartYear } from "@workspace/db/central-queries";
import {
  TOTAL_KEYS,
  comparePlayer,
  linkNativeToCentral,
  isFillIn,
  toCsv,
  validateArgs,
  zeroTotals,
  type CentralAppearance,
  type NativeLine,
  type NativePlayer,
  type PlayerComparison,
  type Totals,
} from "./hh-central-crosswalk-core";
import {
  HALLS_HEAD_TENANT_ID,
  isCentralPrivate,
  readCentral,
  readNative,
} from "./hh-central-crosswalk-read";

const CLUB = HALLS_HEAD_CENTRAL_CLUB_ID;

const USAGE = `hh-crosswalk — READ-ONLY Halls Head native ↔ central participant crosswalk + career comparison.

  pnpm --filter @workspace/scripts run hh-crosswalk [-- --out=<dir>]

  --out=<dir>  parent directory for the timestamped output folder (default: OS temp dir)
  --help       show this help

Requires DATABASE_URL (native) and CENTRAL_DATABASE_URL (central). Never writes to either.`;

function outArg(argv: string[]): string | undefined {
  return argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
}

// ---------------------------------------------------------------------------

const fmtName = (p: NativePlayer | undefined): string =>
  p ? `${p.givenName} ${p.surname}`.trim() : "";

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

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(outArg(argv) ?? os.tmpdir(), `hh-crosswalk-${stamp}`);

  console.log("Reading native (READ ONLY transaction)…");
  const native = await readNative();
  console.log(
    `  players=${native.players.length} matches=${native.matches.length} lines=${native.lines.length} pgss=${native.pgss.length}`,
  );
  console.log(`Reading central club_id=${CLUB} (read-only proxy)…`);
  const central = await readCentral();
  console.log(
    `  matches=${central.matches.length} batting=${central.batting.length} bowling=${central.bowling.length} rosters=${central.rosters.length} fielding=${central.fielding.length}`,
  );

  // ---- Matcher (shared with persist-hh-crosswalk) ------------------------
  const playerById = new Map(native.players.map((p) => [p.id, p]));
  const nativeMatchById = new Map(native.matches.map((m) => [m.id, m]));
  const {
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
  } = linkNativeToCentral({ native, central });
  const abandoned = new Set(native.matches.filter((m) => m.abandoned).map((m) => m.id));
  const centralName = new Map(central.players.map((p) => [p.participantId, p.displayName]));
  const centralPrivate = new Map(
    central.players.map((p) => [p.participantId, isCentralPrivate(p.isPrivate)]),
  );

  // ---- Comparison (CLEAN only) --------------------------------------------
  const pgssSeasonal = new Map<number, Totals>();
  const pgssBaseline = new Map<number, Totals>();
  for (const r of native.pgss) {
    if (isFillIn(r.playerId)) continue;
    const target = r.season == null ? pgssBaseline : pgssSeasonal;
    const t = target.get(r.playerId) ?? zeroTotals();
    t.matches += r.games ?? 0;
    t.innings += r.innings ?? 0;
    t.runs += r.runs ?? 0;
    t.wickets += r.wickets ?? 0;
    t.catches += r.catches ?? 0;
    target.set(r.playerId, t);
  }
  const linesByPlayer = new Map<number, NativeLine[]>();
  for (const l of seniorLines) {
    const arr = linesByPlayer.get(l.playerId) ?? [];
    arr.push(l);
    linesByPlayer.set(l.playerId, arr);
  }
  /** participant → senior central match id → appearance. */
  const seniorAppsByPid = new Map<string, Map<number, CentralAppearance>>();
  for (const [mid, m] of appIndex.byMatch) {
    if (!seniorCentral.has(mid)) continue;
    for (const [pid, a] of m) {
      const inner = seniorAppsByPid.get(pid) ?? new Map<number, CentralAppearance>();
      inner.set(mid, a);
      seniorAppsByPid.set(pid, inner);
    }
  }
  const comparisons = new Map<number, PlayerComparison>();
  for (const l of playerLinks) {
    if (l.status !== "CLEAN" || !l.participantId) continue;
    comparisons.set(
      l.nativePlayerId,
      comparePlayer({
        nativeLines: linesByPlayer.get(l.nativePlayerId) ?? [],
        abandoned,
        linkByNativeMatch,
        centralByMatch: seniorAppsByPid.get(l.participantId) ?? new Map(),
        nativeMatchByCentral,
        pgssSeasonal: pgssSeasonal.get(l.nativePlayerId) ?? zeroTotals(),
        baseline: pgssBaseline.get(l.nativePlayerId) ?? zeroTotals(),
      }),
    );
  }

  // ---- Per-season match coverage ------------------------------------------
  interface SeasonRow {
    season: number;
    both: number;
    nativeOnly: number;
    centralOnly: number;
    juniorExcluded: number;
    nativeLines: number;
    assignedLines: number;
  }
  const seasons = new Map<number, SeasonRow>();
  const seasonRow = (s: number): SeasonRow => {
    let r = seasons.get(s);
    if (!r) {
      r = {
        season: s,
        both: 0,
        nativeOnly: 0,
        centralOnly: 0,
        juniorExcluded: 0,
        nativeLines: 0,
        assignedLines: 0,
      };
      seasons.set(s, r);
    }
    return r;
  };
  for (const m of native.matches) {
    const r = seasonRow(m.season);
    if (juniorExcludedNative.has(m.id)) r.juniorExcluded += 1;
    else if (linkByNativeMatch.has(m.id)) r.both += 1;
    else r.nativeOnly += 1;
  }
  for (const m of central.matches) {
    if (!seniorCentral.has(m.matchId) || nativeMatchByCentral.has(m.matchId)) continue;
    const s = parseSeasonStartYear(m.season);
    if (s != null) seasonRow(s).centralOnly += 1;
  }
  for (const l of seniorLines) {
    const m = nativeMatchById.get(l.matchId);
    if (m) seasonRow(m.season).nativeLines += 1;
  }
  for (const a of assignments) {
    const m = nativeMatchById.get(a.nativeMatchId);
    if (m) seasonRow(m.season).assignedLines += 1;
  }

  // ---- Central participants never linked ----------------------------------
  const linkedPids = new Set(playerLinks.map((l) => l.participantId).filter(Boolean));
  const unlinkedCentral = [...seniorAppsByPid.entries()]
    .filter(([pid]) => !linkedPids.has(pid))
    .map(([pid, apps]) => {
      const games = [...apps.values()].filter((a) => a.countsAsGame).length;
      const inNative = [...apps.keys()].filter((mid) => nativeMatchByCentral.has(mid)).length;
      return { pid, games, inNative };
    })
    .sort((a, b) => b.games - a.games);

  // ---- Write outputs (local files only) -----------------------------------
  mkdirSync(outDir, { recursive: true });
  const statusCount = (s: string): number => playerLinks.filter((l) => l.status === s).length;

  writeFileSync(
    path.join(outDir, "crosswalk.csv"),
    toCsv(
      [
        "native_player_id",
        "native_name",
        "participant_id",
        "central_display_name",
        "central_is_private",
        "status",
        "matched_lines",
        "assigned_lines",
        "total_lines",
        "unlinked_match_lines",
        "share",
        "strong",
        "medium",
        "weak",
        "evidence_notes",
      ],
      playerLinks.map((l) => {
        const top = l.candidates[0];
        return [
          l.nativePlayerId,
          fmtName(playerById.get(l.nativePlayerId)),
          l.participantId ?? "",
          l.participantId ? (centralName.get(l.participantId) ?? "") : "",
          l.participantId ? (centralPrivate.get(l.participantId) ? 1 : 0) : "",
          l.status,
          l.matchedLines,
          l.assignedLines,
          l.totalLines,
          l.unlinkedMatchLines,
          l.share ? l.share.toFixed(3) : "",
          top?.strong ?? 0,
          top?.medium ?? 0,
          top?.weak ?? 0,
          [...l.notes, playerById.get(l.nativePlayerId)?.isCapOnly ? "cap-only player" : ""]
            .filter(Boolean)
            .join("; "),
        ];
      }),
    ),
  );

  writeFileSync(
    path.join(outDir, "conflicts.csv"),
    toCsv(
      [
        "type",
        "severe",
        "participant_id",
        "central_display_name",
        "native_player_id",
        "native_name",
        "detail",
      ],
      conflicts
        .sort((a, b) => Number(b.severe) - Number(a.severe))
        .map((c) => [
          c.type,
          c.severe ? 1 : 0,
          c.participantId ?? "",
          c.participantId ? (centralName.get(c.participantId) ?? "") : "",
          c.nativePlayerId ?? "",
          c.nativePlayerId != null ? fmtName(playerById.get(c.nativePlayerId)) : "",
          // Resolve the "id×n" list to names for readability.
          c.detail
            .split(", ")
            .map((part) => {
              const id = part.split("×")[0] ?? "";
              const nm =
                c.type === "PARTICIPANT_MULTI_NATIVE"
                  ? fmtName(playerById.get(Number(id)))
                  : (centralName.get(id) ?? "");
              return `${part} [${nm}]`;
            })
            .join(", "),
        ]),
    ),
  );

  const cmpHeader = [
    "native_player_id",
    "native_name",
    "participant_id",
    "central_display_name",
    "classification",
  ];
  for (const k of TOTAL_KEYS) {
    cmpHeader.push(
      `native_app_${k}`,
      `native_seasonal_${k}`,
      `native_baseline_${k}`,
      `native_scorecard_${k}`,
      `central_${k}`,
      `delta_app_minus_central_${k}`,
      `delta_scorecard_minus_central_${k}`,
    );
  }
  cmpHeader.push(
    "matches_both",
    "native_match_not_in_central",
    "native_only_participant_absent",
    "central_match_not_in_native",
    "central_only_player_absent",
    "central_only_native_abandoned",
    "figures_differ_matches",
  );
  writeFileSync(
    path.join(outDir, "comparison.csv"),
    toCsv(
      cmpHeader,
      [...comparisons.entries()].map(([pid, c]) => {
        const link = playerLinks.find((l) => l.nativePlayerId === pid);
        const row: unknown[] = [
          pid,
          fmtName(playerById.get(pid)),
          link?.participantId ?? "",
          link?.participantId ? (centralName.get(link.participantId) ?? "") : "",
          c.classes.join("+"),
        ];
        for (const k of TOTAL_KEYS) {
          row.push(
            c.appCareer[k],
            c.pgssSeasonal[k],
            c.baseline[k],
            c.nativeScorecard[k],
            c.central[k],
            c.appCareer[k] - c.central[k],
            c.nativeScorecard[k] - c.central[k],
          );
        }
        const v = c.coverage;
        row.push(
          v.both,
          v.nativeMatchNotInCentral,
          v.nativeOnlyParticipantAbsent,
          v.centralMatchNotInNative,
          v.centralOnlyPlayerAbsent,
          v.centralOnlyNativeAbandoned,
          v.figuresDifferMatches,
        );
        return row;
      }),
    ),
  );

  const seasonRows = [...seasons.values()].sort((a, b) => a.season - b.season);
  writeFileSync(
    path.join(outDir, "season-coverage.csv"),
    toCsv(
      [
        "season",
        "matches_both",
        "native_only",
        "central_only",
        "junior_excluded",
        "native_lines",
        "assigned_lines",
      ],
      seasonRows.map((r) => [
        r.season,
        r.both,
        r.nativeOnly,
        r.centralOnly,
        r.juniorExcluded,
        r.nativeLines,
        r.assignedLines,
      ]),
    ),
  );

  writeFileSync(
    path.join(outDir, "central-unlinked.csv"),
    toCsv(
      [
        "participant_id",
        "central_display_name",
        "central_is_private",
        "senior_games",
        "games_in_native_matches",
      ],
      unlinkedCentral.map((u) => [
        u.pid,
        centralName.get(u.pid) ?? "",
        centralPrivate.get(u.pid) ? 1 : 0,
        u.games,
        u.inNative,
      ]),
    ),
  );

  const classCounts: Record<string, number> = {};
  for (const c of comparisons.values())
    for (const k of c.classes) classCounts[k] = (classCounts[k] ?? 0) + 1;
  const fillInPlayers = [...new Set(fillInLines.map((l) => l.playerId))].sort((a, b) => a - b);
  const summary = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    tenantId: HALLS_HEAD_TENANT_ID,
    centralClubId: CLUB,
    native: {
      players: native.players.length,
      matches: native.matches.length,
      lines: native.lines.length,
      fillInLines: fillInLines.length,
      fillInPlayersWithLines: fillInPlayers.length,
      fillInPlayerIds: fillInPlayers,
      fillInPlayersTotal: native.players.filter((p) => isFillIn(p.id)).length,
      matchesLinkedToCentral: linkByNativeMatch.size,
      matchesNotInCentral:
        native.matches.length - linkByNativeMatch.size - juniorExcludedNative.size,
      matchesExcludedJuniorGrade: juniorExcludedNative.size,
      abandonedMatches: abandoned.size,
      seniorLinesConsidered: seniorLines.length,
    },
    central: {
      matches: central.matches.length,
      seniorMatches: seniorCentral.size,
      seniorMatchesNotInNative: [...seniorCentral].filter((m) => !nativeMatchByCentral.has(m))
        .length,
      nullParticipantRows: appIndex.nullParticipantRows,
      seniorParticipants: seniorAppsByPid.size,
      seniorParticipantsNotLinked: unlinkedCentral.length,
    },
    linking: {
      assignedLines: assignments.length,
      strongLines: assignments.filter((a) => a.strength === "strong").length,
      mediumLines: assignments.filter((a) => a.strength === "medium").length,
      weakLines: assignments.filter((a) => a.strength === "weak").length,
      status: {
        CLEAN: statusCount("CLEAN"),
        AMBIGUOUS: statusCount("AMBIGUOUS"),
        UNMATCHED: statusCount("UNMATCHED"),
        NO_LINES: statusCount("NO_LINES"),
        EXCLUDED_FILL_IN: statusCount("EXCLUDED_FILL_IN"),
      },
      conflicts: {
        participantMultiNative: conflicts.filter((c) => c.type === "PARTICIPANT_MULTI_NATIVE")
          .length,
        participantMultiNativeSevere: conflicts.filter(
          (c) => c.type === "PARTICIPANT_MULTI_NATIVE" && c.severe,
        ).length,
        nativeMultiParticipant: conflicts.filter((c) => c.type === "NATIVE_MULTI_PARTICIPANT")
          .length,
      },
    },
    comparison: { players: comparisons.size, classifications: classCounts },
    seasons: seasonRows,
    outputDir: outDir,
  };
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // ---- Console summary -----------------------------------------------------
  console.log("\n=== Halls Head native ↔ central crosswalk (READ-ONLY) ===");
  console.log(
    `Matches: native ${native.matches.length}, linked ${linkByNativeMatch.size}, not in central ${summary.native.matchesNotInCentral}, junior-excluded ${juniorExcludedNative.size}; central senior ${seniorCentral.size} (${summary.central.seniorMatchesNotInNative} not in native)`,
  );
  console.log(
    `Lines: ${seniorLines.length} senior non-fill-in, ${assignments.length} assigned (strong ${summary.linking.strongLines}, medium ${summary.linking.mediumLines}, weak ${summary.linking.weakLines}); fill-in lines ${fillInLines.length} (${fillInPlayers.length} players)`,
  );
  console.log("Players:", summary.linking.status);
  console.log("Conflicts:", summary.linking.conflicts);
  console.log(`Comparison (${comparisons.size} CLEAN players):`, classCounts);
  console.log(
    `Central senior participants not linked to any native player: ${unlinkedCentral.length}`,
  );
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
