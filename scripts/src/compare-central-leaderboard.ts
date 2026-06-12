/**
 * compare-central-leaderboard.ts — end-to-end proof of the central-read model.
 *
 *   pnpm --filter @workspace/scripts run compare-central-leaderboard -- --grade="A Grade"
 *   pnpm --filter @workspace/scripts run compare-central-leaderboard -- --grade="A Grade" --season=2024
 *   pnpm --filter @workspace/scripts run compare-central-leaderboard -- --grade="B Grade" --club=1
 *
 * Fetches the grade batting leaderboard BOTH ways and prints a row-by-row diff:
 *   - TENANT  = the existing read (what the endpoint returns with CENTRAL_READS off):
 *       `player_grade_stats` for the grade (career), or `player_grade_season_stats`
 *       when --season is given.
 *   - CENTRAL = `centralGradeLeaderboard()` — the exact function the endpoint runs
 *       with CENTRAL_READS=1 (central.match_batting joined to central.matches,
 *       filtered to the club).
 *
 * Mismatches are EXPECTED and the point of the exercise: the tenant numbers fold
 * in hand-kept pre-2002 history and curated corrections; the central DB is
 * scorecard-era only (2002/03+). The job here is to make the differences
 * explainable, not zero — so pick a recent --season for the closest alignment.
 *
 * Requires BOTH DATABASE_URL (tenant) and CENTRAL_DATABASE_URL (central) in the
 * environment.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  pool,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
  playersTable,
} from "@workspace/db";
import {
  centralGradeLeaderboard,
  listCentralGradesForClub,
  HALLS_HEAD_CENTRAL_CLUB_ID,
} from "@workspace/db/central-queries";

interface CompRow {
  key: string;
  name: string;
  runs: number;
  innings: number;
  average: number | null;
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/** Match tenant ↔ central rows on surname + first initial (central names are
 *  often abbreviated, e.g. "J Rudge" vs "Josh Rudge"). */
function nameKey(givenName: string, surname: string): string {
  const s = surname.trim().toLowerCase();
  const i = givenName.trim().toLowerCase().charAt(0);
  return `${s}|${i}`;
}

function derivedAverage(
  runs: number | null,
  innings: number | null,
  notOuts: number | null,
): number | null {
  const dismissals = (innings ?? 0) - (notOuts ?? 0);
  if (dismissals <= 0) return null;
  return Math.round(((runs ?? 0) / dismissals) * 100) / 100;
}

function fmtAvg(a: number | null): string {
  return a === null ? "—" : a.toFixed(2);
}

async function tenantRows(
  grade: string,
  seasonStartYear: number | undefined,
): Promise<CompRow[]> {
  if (seasonStartYear === undefined) {
    // Exactly the endpoint's flag-off query.
    const rows = await db
      .select()
      .from(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.grade, grade))
      .orderBy(desc(playerGradeStatsTable.games));
    return rows.map((r) => ({
      key: nameKey(r.givenName, r.surname),
      name: `${r.givenName} ${r.surname}`.trim(),
      runs: r.runs ?? 0,
      innings: r.innings ?? 0,
      average: r.batAvg ?? derivedAverage(r.runs, r.innings, r.notOuts),
    }));
  }
  // Season-scoped: the per-season snapshot (also scorecard-era for recent years),
  // for an apples-to-apples comparison against the central season filter.
  const rows = await db
    .select({
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      runs: playerGradeSeasonStatsTable.runs,
      innings: playerGradeSeasonStatsTable.innings,
      notOuts: playerGradeSeasonStatsTable.notOuts,
    })
    .from(playerGradeSeasonStatsTable)
    .innerJoin(
      playersTable,
      eq(playersTable.id, playerGradeSeasonStatsTable.playerId),
    )
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        eq(playerGradeSeasonStatsTable.season, seasonStartYear),
      ),
    );
  return rows.map((r) => ({
    key: nameKey(r.givenName, r.surname),
    name: `${r.givenName} ${r.surname}`.trim(),
    runs: r.runs ?? 0,
    innings: r.innings ?? 0,
    average: derivedAverage(r.runs, r.innings, r.notOuts),
  }));
}

async function main(): Promise<void> {
  const grade = arg("grade");
  if (!grade) {
    console.error('Missing --grade. e.g. --grade="A Grade"');
    process.exit(2);
  }
  const seasonRaw = arg("season");
  const seasonStartYear = seasonRaw ? Number(seasonRaw) : undefined;
  if (seasonRaw && Number.isNaN(seasonStartYear)) {
    console.error(`Invalid --season=${seasonRaw} (expected a start year, e.g. 2024)`);
    process.exit(2);
  }
  const clubId = arg("club") ? Number(arg("club")) : HALLS_HEAD_CENTRAL_CLUB_ID;

  console.log("═".repeat(78));
  console.log(
    `Central-read proof — grade="${grade}"` +
      (seasonStartYear !== undefined ? `, season=${seasonStartYear}` : " (career)") +
      `, club_id=${clubId}`,
  );
  console.log("═".repeat(78));

  // Show the central grade labels for this club and how they map — makes any
  // grade-mapping gap visible (a central label that should map here but doesn't).
  const grades = await listCentralGradesForClub(clubId);
  console.log("\nCentral grade labels for this club → app grade:");
  for (const g of grades) {
    const mark = g.appGrade === grade ? "  «included" : "";
    console.log(`  ${g.centralGrade.padEnd(40)} → ${g.appGrade ?? "(unmapped)"}${mark}`);
  }
  const included = grades.filter((g) => g.appGrade === grade);
  if (included.length === 0) {
    console.log(
      `\n⚠️  No central grade label maps to "${grade}". Either the grade name is ` +
        "wrong or appGradeFromCentral() needs a rule for one of the labels above.",
    );
  }

  const [tenant, central] = await Promise.all([
    tenantRows(grade, seasonStartYear),
    centralGradeLeaderboard(grade, { clubId, seasonStartYear }),
  ]);

  const centralComp: CompRow[] = central.map((r) => ({
    key: nameKey(r.givenName, r.surname),
    name: `${r.givenName} ${r.surname}`.trim(),
    runs: r.runs ?? 0,
    innings: r.innings ?? 0,
    average: r.batAvg,
  }));

  const tByKey = new Map(tenant.map((r) => [r.key, r]));
  const cByKey = new Map(centralComp.map((r) => [r.key, r]));
  const allKeys = [...new Set([...tByKey.keys(), ...cByKey.keys()])];

  // Sort by the larger of the two run tallies, descending.
  allKeys.sort(
    (a, b) =>
      Math.max(cByKey.get(b)?.runs ?? 0, tByKey.get(b)?.runs ?? 0) -
      Math.max(cByKey.get(a)?.runs ?? 0, tByKey.get(a)?.runs ?? 0),
  );

  console.log(
    `\nTENANT rows: ${tenant.length}   CENTRAL rows: ${central.length}\n`,
  );
  const head =
    "Player".padEnd(26) +
    "│ tenant runs/inn/avg".padEnd(26) +
    "│ central runs/inn/avg".padEnd(27) +
    "│ status";
  console.log(head);
  console.log("─".repeat(head.length + 4));

  let matched = 0;
  let differing = 0;
  let tenantOnly = 0;
  let centralOnly = 0;

  for (const key of allKeys) {
    const t = tByKey.get(key);
    const c = cByKey.get(key);
    const name = (t?.name ?? c?.name ?? key).slice(0, 25);
    const tCell = t
      ? `${t.runs}/${t.innings}/${fmtAvg(t.average)}`
      : "—";
    const cCell = c
      ? `${c.runs}/${c.innings}/${fmtAvg(c.average)}`
      : "—";

    let status: string;
    if (t && !c) {
      status = "TENANT-ONLY";
      tenantOnly++;
    } else if (c && !t) {
      status = "CENTRAL-ONLY";
      centralOnly++;
    } else if (t && c) {
      const sameRuns = t.runs === c.runs;
      const sameInns = t.innings === c.innings;
      if (sameRuns && sameInns) {
        status = "match";
        matched++;
      } else {
        status =
          `DIFF Δruns=${c.runs - t.runs} Δinn=${c.innings - t.innings}`;
        differing++;
      }
    } else {
      continue;
    }

    console.log(
      name.padEnd(26) +
        `│ ${tCell}`.padEnd(26) +
        `│ ${cCell}`.padEnd(27) +
        `│ ${status}`,
    );
  }

  console.log("─".repeat(head.length + 4));
  console.log(
    `\nSummary: ${matched} match · ${differing} differ · ` +
      `${tenantOnly} tenant-only · ${centralOnly} central-only`,
  );
  console.log(
    "\nWhy differences are expected (and explainable):\n" +
      "  • Pre-2002 history: tenant career totals include hand-kept seasons the\n" +
      "    central scorecard DB (2002/03+) has no rows for → tenant runs/innings\n" +
      "    higher, players present only in tenant. Use --season for a recent year\n" +
      "    to remove this gap.\n" +
      "  • Curated corrections: tenant figures carry manual fixes; central is the\n" +
      "    raw scorecard aggregate.\n" +
      "  • Name matching: keyed on surname+first-initial because central names are\n" +
      "    often abbreviated (\"J Rudge\"); genuine name-format gaps show as *-ONLY.\n" +
      "  • Grade mapping: only the central labels marked «included above feed the\n" +
      "    central side — an unmapped label that belongs here would understate it.\n" +
      "  • Not-out/DNB handling is heuristic on dismissal text; odd innings counts\n" +
      "    point at dismissal labels classifyInnings() doesn't yet recognise.",
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
