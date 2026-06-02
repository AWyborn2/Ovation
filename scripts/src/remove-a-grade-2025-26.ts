/**
 * One-off, idempotent baseline correction: subtract the 2025/26 A Grade season
 * out of the all-time A Grade totals.
 *
 * Why: the spreadsheet-seeded baseline (player_grade_season_stats rows with
 * season = NULL) already INCLUDES the 2025/26 season. Before 2025/26 can be
 * re-imported match-by-match, its contribution must be removed from the baseline
 * or every 2025/26 game would be double counted. The club supplied the full
 * 2025/26 A Grade season figures (the CSV below) so we know exactly what to take
 * out.
 *
 * What it does (single transaction):
 *  1. Parse the supplied 2025/26 A Grade season CSV.
 *  2. For each matched A Grade player, subtract the season counting stats from
 *     their season = NULL baseline snapshot. If the baseline drops to zero games
 *     the snapshot row is removed (their entire A Grade history was 2025/26).
 *     Felton's baseline is split across two rows after an earlier merge; the row
 *     that exactly equals the 2025/26 figures is deleted instead.
 *  3. Recompute A Grade aggregates (player_grade_stats, players career totals,
 *     grade_summaries) from the snapshot table.
 *  4. Remove the three club-confirmed debutant caps (Lucius Hysen, Oscar Smith,
 *     Hudson Malingre) so they can be re-earned during the per-match test, then
 *     re-sync games_a_grade / in_stats on the remaining affected caps. Lachlan
 *     Kinna is an explicit exception: his record and cap #175 always stay.
 *  5. Record the removed figures as an `imports` audit row (status
 *     'baseline_reversal', payload retained) so the change is auditable and
 *     reversible, and so the per-match imports can later be reconciled against it.
 *
 * Idempotent: re-running is a no-op once the audit row exists.
 *
 * Run with: pnpm --filter @workspace/scripts run remove-a-grade-2025-26
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Resolve from the workspace root regardless of the cwd pnpm runs us in.
const CSV_PATH = fileURLToPath(
  new URL(
    "../../attached_assets/A_Grade_2025.26_season_stats_1780356874929.csv",
    import.meta.url,
  ),
);
const GRADE = "A Grade";
const SEASON = 2025; // 2025/26 season, keyed by its start year
const AUDIT_FILENAME =
  "A_Grade_2025.26_season_stats_1780356874929.csv (baseline reversal)";

// Club-confirmed 2025/26 A Grade debutants: remove from A Grade AND drop their
// 2025/26 cap so it can be re-earned during the match-by-match test.
const DEBUTANT_PLAYER_IDS = new Set<number>([316, 267, 133]); // Hysen, Smith, Malingre
// Explicit keep: established player who also appears in the 2025/26 file. Only
// his counting figures are subtracted; his A Grade record and cap stay.
const KINNA_PLAYER_ID = 54;
// Felton was merged from two records ("Mitch"/"Mitchell"); the CSV name
// "Mitchell" no longer matches the surviving "Mitch" record by name.
const FELTON_KEY = "felton|mitchell";
const FELTON_PLAYER_ID = 123;

const COUNTING_FIELDS = [
  "games",
  "innings",
  "notOuts",
  "runs",
  "fifties",
  "hundreds",
  "wickets",
  "runsConceded",
  "fiveWickets",
  "catches",
  "stumpings",
  "runOuts",
] as const;
type CountingField = (typeof COUNTING_FIELDS)[number];
type Counting = Record<CountingField, number>;

type CsvPlayer = Counting & {
  surname: string;
  givenName: string;
  highScore: string | null;
  bestBowling: string | null;
};

function parseCsv(text: string): CsvPlayer[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cells = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = cells(lines[0]);
  const num = (s: string | undefined): number => {
    if (s == null) return 0;
    const t = s.trim();
    if (t === "" || t === "-") return 0;
    const v = Number(t);
    return Number.isFinite(v) ? v : 0;
  };
  const parseBest = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const m = raw.trim().match(/^(\d+)\s*-+\s*(\d+)$/);
    if (!m) return null;
    const w = parseInt(m[1], 10);
    if (w === 0) return null;
    return `${w}/${parseInt(m[2], 10)}`;
  };
  return lines.slice(1).map((line) => {
    const r = cells(line);
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = r[i]));
    const [surname, ...gn] = o["Player name"].split(",").map((x) => x.trim());
    const givenName = gn.join(", ");
    const hsRaw = (o["High Score"] ?? "").trim();
    const notOut = (o["High Score Dismissal Status"] ?? "").trim().toLowerCase() === "true";
    const highScore =
      hsRaw === "" || hsRaw === "-" ? null : notOut ? `${hsRaw}*` : hsRaw;
    return {
      surname,
      givenName,
      games: num(o["Matches played"]),
      innings: num(o["Innings"]),
      notOuts: num(o["Not outs"]),
      runs: num(o["Batting Aggregate"]),
      fifties: num(o["50s scored"]),
      hundreds: num(o["100s scored"]),
      wickets: num(o["Wickets"]),
      runsConceded: num(o["Runs scored"]),
      fiveWickets: num(o["5 Wickets"]),
      catches: num(o["Total Catches"]),
      stumpings: num(o["Stumpings"]),
      runOuts: num(o["Run Outs Unassisted"]) + num(o["Run Outs Assisted"]),
      highScore,
      bestBowling: parseBest(o["Bowling Best Innings"]),
    };
  });
}

type SnapRow = Counting & { id: number; playerId: number };

async function main() {
  // ---- Idempotency guard ---------------------------------------------------
  const existing = await db.execute(
    sql`SELECT id FROM imports WHERE filename = ${AUDIT_FILENAME} LIMIT 1`,
  );
  if (existing.rows.length > 0) {
    console.log(
      `Audit row already exists (import #${(existing.rows[0] as { id: number }).id}). Nothing to do.`,
    );
    return;
  }

  // ---- Parse + resolve players --------------------------------------------
  const csv = parseCsv(readFileSync(CSV_PATH, "utf8"));
  console.log(`Parsed ${csv.length} CSV rows.`);

  const players = await db.execute(
    sql`SELECT id, lower(surname) AS sl, lower(given_name) AS gl FROM players`,
  );
  const idByKey = new Map<string, number>();
  for (const p of players.rows as Array<{ id: number; sl: string; gl: string }>) {
    idByKey.set(`${p.sl}|${p.gl}`, p.id);
  }

  const resolved = csv.map((c) => {
    const key = `${c.surname.toLowerCase()}|${c.givenName.toLowerCase()}`;
    const playerId = key === FELTON_KEY ? FELTON_PLAYER_ID : idByKey.get(key);
    return { ...c, key, playerId };
  });
  const unresolved = resolved.filter((r) => !r.playerId);
  if (unresolved.length > 0) {
    throw new Error(
      `Unresolved players: ${unresolved.map((u) => `${u.surname}/${u.givenName}`).join(", ")}`,
    );
  }

  const playerIds = [...new Set(resolved.map((r) => r.playerId!))];

  // ---- Load current A Grade baseline snapshots -----------------------------
  const snapRes = await db.execute(sql`
    SELECT id, player_id, games, innings, not_outs, runs, fifties, hundreds,
           wickets, runs_conceded, five_wickets, catches, stumpings, run_outs
    FROM player_grade_season_stats
    WHERE grade = ${GRADE} AND season IS NULL
      AND player_id IN (${sql.join(playerIds.map((i) => sql`${i}`), sql`, `)})
  `);
  const snapsByPlayer = new Map<number, SnapRow[]>();
  for (const r of snapRes.rows as Array<Record<string, number>>) {
    const row: SnapRow = {
      id: r.id,
      playerId: r.player_id,
      games: r.games ?? 0,
      innings: r.innings ?? 0,
      notOuts: r.not_outs ?? 0,
      runs: r.runs ?? 0,
      fifties: r.fifties ?? 0,
      hundreds: r.hundreds ?? 0,
      wickets: r.wickets ?? 0,
      runsConceded: r.runs_conceded ?? 0,
      fiveWickets: r.five_wickets ?? 0,
      catches: r.catches ?? 0,
      stumpings: r.stumpings ?? 0,
      runOuts: r.run_outs ?? 0,
    };
    if (!snapsByPlayer.has(row.playerId)) snapsByPlayer.set(row.playerId, []);
    snapsByPlayer.get(row.playerId)!.push(row);
  }

  // ---- Plan each row -------------------------------------------------------
  type Action =
    | { type: "subtract"; snapId: number; newGames: number }
    | { type: "delete"; snapId: number };
  const plan: Array<{ row: (typeof resolved)[number]; action: Action }> = [];

  const exactMatch = (s: SnapRow, c: Counting) =>
    COUNTING_FIELDS.every((f) => s[f] === c[f]);

  for (const row of resolved) {
    const snaps = snapsByPlayer.get(row.playerId!) ?? [];
    if (snaps.length === 0) {
      throw new Error(`No A Grade baseline row for ${row.surname}/${row.givenName}`);
    }
    if (snaps.length === 1) {
      const s = snaps[0];
      const newGames = s.games - row.games;
      plan.push({
        row,
        action:
          newGames <= 0
            ? { type: "delete", snapId: s.id }
            : { type: "subtract", snapId: s.id, newGames },
      });
    } else {
      // Multiple baseline rows (Felton). The 2025/26 portion is the row that
      // exactly equals the season figures; remove it and keep the rest.
      const ex = snaps.find((s) => exactMatch(s, row));
      if (!ex) {
        throw new Error(
          `Ambiguous multi-row baseline with no exact match for ${row.surname}/${row.givenName}`,
        );
      }
      plan.push({ row, action: { type: "delete", snapId: ex.id } });
    }
  }

  console.log("\nAction plan:");
  for (const { row, action } of plan) {
    console.log(
      `  ${`${row.surname}/${row.givenName}`.padEnd(20)} id=${String(row.playerId).padEnd(4)} ` +
        `${action.type === "delete" ? "DELETE row " + action.snapId : "SUBTRACT -> " + action.newGames + "g (row " + action.snapId + ")"}`,
    );
  }

  // ---- Apply, recompute, reconcile caps, audit (one transaction) ----------
  await db.transaction(async (tx) => {
    for (const { row, action } of plan) {
      if (action.type === "delete") {
        await tx.execute(
          sql`DELETE FROM player_grade_season_stats WHERE id = ${action.snapId}`,
        );
      } else {
        await tx.execute(sql`
          UPDATE player_grade_season_stats SET
            games = games - ${row.games},
            innings = innings - ${row.innings},
            not_outs = not_outs - ${row.notOuts},
            runs = runs - ${row.runs},
            fifties = fifties - ${row.fifties},
            hundreds = hundreds - ${row.hundreds},
            wickets = wickets - ${row.wickets},
            runs_conceded = runs_conceded - ${row.runsConceded},
            five_wickets = five_wickets - ${row.fiveWickets},
            catches = catches - ${row.catches},
            stumpings = stumpings - ${row.stumpings},
            run_outs = run_outs - ${row.runOuts}
          WHERE id = ${action.snapId}
        `);
      }
    }

    await recomputeAGrade(tx);

    // Remove the three confirmed debutant caps (so they re-debut in the test).
    await tx.execute(sql`
      DELETE FROM cap_register
      WHERE category = 'male'
        AND player_id IN (${sql.join([...DEBUTANT_PLAYER_IDS].map((i) => sql`${i}`), sql`, `)})
    `);

    // Re-sync games_a_grade / in_stats for the remaining affected caps from the
    // freshly recomputed per-grade totals. Kinna (cap #175) is included and kept.
    await tx.execute(sql`
      UPDATE cap_register c SET
        games_a_grade = COALESCE(
          (SELECT games FROM player_grade_stats g
           WHERE g.grade = ${GRADE} AND g.player_id = c.player_id), 0),
        in_stats = COALESCE(
          (SELECT games FROM player_grade_stats g
           WHERE g.grade = ${GRADE} AND g.player_id = c.player_id), 0) > 0
      WHERE c.category = 'male'
        AND c.player_id IN (${sql.join(playerIds.map((i) => sql`${i}`), sql`, `)})
    `);

    // Player-record cleanup for debutants with no remaining stats in any grade,
    // consistent with how a deleted player is cleaned up (cascade + recompute).
    // (All three currently retain lower-grade history, so none are deleted.)
    for (const pid of DEBUTANT_PLAYER_IDS) {
      const left = await tx.execute(
        sql`SELECT 1 FROM player_grade_season_stats WHERE player_id = ${pid} LIMIT 1`,
      );
      if (left.rows.length === 0) {
        await tx.execute(sql`DELETE FROM players WHERE id = ${pid}`);
        console.log(`Deleted orphaned debutant player #${pid} (no remaining stats).`);
      }
    }

    // Audit / reversal record: keep the removed figures in the payload.
    const payload = {
      kind: "baseline_reversal",
      grade: GRADE,
      season: SEASON,
      note:
        "Removed the 2025/26 A Grade season from the season=NULL baseline so it " +
        "can be re-imported match-by-match without double counting. high_score / " +
        "best_bowling on subtracted rows are NOT restored to pre-2025/26 values.",
      removed: plan.map(({ row, action }) => ({
        playerId: row.playerId,
        surname: row.surname,
        givenName: row.givenName,
        action: action.type,
        snapId: action.snapId,
        figures: {
          games: row.games,
          innings: row.innings,
          notOuts: row.notOuts,
          runs: row.runs,
          fifties: row.fifties,
          hundreds: row.hundreds,
          wickets: row.wickets,
          runsConceded: row.runsConceded,
          fiveWickets: row.fiveWickets,
          catches: row.catches,
          stumpings: row.stumpings,
          runOuts: row.runOuts,
          highScore: row.highScore,
          bestBowling: row.bestBowling,
        },
      })),
    };
    await tx.execute(sql`
      INSERT INTO imports (filename, grade, season, row_count, status, payload)
      VALUES (${AUDIT_FILENAME}, ${GRADE}, ${SEASON}, ${plan.length},
              'baseline_reversal', ${JSON.stringify(payload)}::jsonb)
    `);
  });

  await verify(playerIds);
}

/**
 * Re-derive A Grade aggregates from the snapshot table. Mirrors
 * artifacts/api-server/src/lib/recompute.ts (scoped to A Grade); kept inline
 * because scripts cannot import an artifact package.
 */
async function recomputeAGrade(tx: {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
}) {
  await tx.execute(sql`DELETE FROM player_grade_stats WHERE grade = ${GRADE}`);
  await tx.execute(sql`
    INSERT INTO player_grade_stats
      (player_id, surname, given_name, grade, season, games, innings, not_outs,
       runs, bat_avg, high_score, fifties, hundreds, wickets, runs_conceded,
       bowl_avg, best_bowling, five_wickets, catches, stumpings, run_outs)
    SELECT
      s.player_id, p.surname, p.given_name, s.grade, NULL::int,
      NULLIF(COALESCE(SUM(s.games), 0), 0),
      NULLIF(COALESCE(SUM(s.innings), 0), 0),
      NULLIF(COALESCE(SUM(s.not_outs), 0), 0),
      NULLIF(COALESCE(SUM(s.runs), 0), 0),
      CASE WHEN COALESCE(SUM(s.innings),0) - COALESCE(SUM(s.not_outs),0) > 0
        THEN COALESCE(SUM(s.runs),0)::real / (COALESCE(SUM(s.innings),0) - COALESCE(SUM(s.not_outs),0))
        ELSE NULL END,
      (SELECT high_score FROM player_grade_season_stats x
       WHERE x.player_id = s.player_id AND x.grade = s.grade
         AND x.high_score IS NOT NULL AND x.high_score <> ''
       ORDER BY NULLIF(regexp_replace(x.high_score, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
                (x.high_score ~ '\\*') DESC
       LIMIT 1),
      NULLIF(COALESCE(SUM(s.fifties), 0), 0),
      NULLIF(COALESCE(SUM(s.hundreds), 0), 0),
      NULLIF(COALESCE(SUM(s.wickets), 0), 0),
      NULLIF(COALESCE(SUM(s.runs_conceded), 0), 0),
      CASE WHEN COALESCE(SUM(s.wickets),0) > 0
        THEN COALESCE(SUM(s.runs_conceded),0)::real / SUM(s.wickets)
        ELSE NULL END,
      (SELECT best_bowling FROM player_grade_season_stats x
       WHERE x.player_id = s.player_id AND x.grade = s.grade
         AND x.best_bowling IS NOT NULL AND x.best_bowling <> ''
         AND x.best_bowling ~ '^[0-9]+/[0-9]+$'
       ORDER BY split_part(x.best_bowling, '/', 1)::int DESC,
                split_part(x.best_bowling, '/', 2)::int ASC
       LIMIT 1),
      NULLIF(COALESCE(SUM(s.five_wickets), 0), 0),
      NULLIF(COALESCE(SUM(s.catches), 0), 0),
      NULLIF(COALESCE(SUM(s.stumpings), 0), 0),
      NULLIF(COALESCE(SUM(s.run_outs), 0), 0)
    FROM player_grade_season_stats s
    JOIN players p ON p.id = s.player_id
    WHERE s.grade = ${GRADE}
    GROUP BY s.player_id, p.surname, p.given_name, s.grade
  `);

  await tx.execute(sql`
    WITH affected AS (
      SELECT DISTINCT player_id FROM player_grade_season_stats WHERE grade = ${GRADE}
      UNION
      SELECT DISTINCT player_id FROM player_grade_stats        WHERE grade = ${GRADE}
    ),
    agg AS (
      SELECT a.player_id,
        NULLIF(COALESCE(SUM(s.games), 0),   0) AS total_games,
        NULLIF(COALESCE(SUM(s.runs), 0),    0) AS total_runs,
        NULLIF(COALESCE(SUM(s.wickets), 0), 0) AS total_wickets,
        NULLIF(string_agg(DISTINCT s.grade, ', ' ORDER BY s.grade), '') AS grades_played
      FROM affected a
      LEFT JOIN player_grade_stats s ON s.player_id = a.player_id
      GROUP BY a.player_id
    )
    UPDATE players p SET
      total_games = agg.total_games, total_runs = agg.total_runs,
      total_wickets = agg.total_wickets, grades_played = agg.grades_played
    FROM agg WHERE p.id = agg.player_id
  `);

  await tx.execute(sql`DELETE FROM grade_summaries WHERE grade = ${GRADE}`);
  await tx.execute(sql`
    INSERT INTO grade_summaries (grade, players, games, innings, runs, wickets,
                                 catches, stumpings, run_outs)
    SELECT grade, COUNT(DISTINCT player_id),
      NULLIF(COALESCE(SUM(games), 0), 0), NULLIF(COALESCE(SUM(innings), 0), 0),
      NULLIF(COALESCE(SUM(runs), 0), 0), NULLIF(COALESCE(SUM(wickets), 0), 0),
      NULLIF(COALESCE(SUM(catches), 0), 0), NULLIF(COALESCE(SUM(stumpings), 0), 0),
      NULLIF(COALESCE(SUM(run_outs), 0), 0)
    FROM player_grade_stats WHERE grade = ${GRADE} GROUP BY grade
  `);
}

async function verify(playerIds: number[]) {
  // 1) Derived A Grade totals match the snapshot source of truth.
  const check = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(games),0) FROM player_grade_season_stats WHERE grade=${GRADE} AND season IS NULL) AS snap_games,
      (SELECT COALESCE(SUM(games),0) FROM player_grade_stats WHERE grade=${GRADE}) AS agg_games,
      (SELECT COALESCE(games,0) FROM grade_summaries WHERE grade=${GRADE}) AS summary_games
  `);
  const c = check.rows[0] as { snap_games: number; agg_games: number; summary_games: number };
  console.log("\nVerification:");
  console.log(`  snapshot games=${c.snap_games} aggregate games=${c.agg_games} summary games=${c.summary_games}`);
  if (Number(c.snap_games) !== Number(c.agg_games) || Number(c.agg_games) !== Number(c.summary_games)) {
    throw new Error("Aggregates do not reconcile with the snapshot source of truth.");
  }

  // 2) The three debutants no longer appear in A Grade stats.
  const stillThere = await db.execute(sql`
    SELECT player_id FROM player_grade_stats
    WHERE grade=${GRADE} AND player_id IN (316, 267, 133)
  `);
  if (stillThere.rows.length > 0) {
    throw new Error("A confirmed debutant still has A Grade stats.");
  }
  console.log("  Debutants Hysen/Smith/Malingre absent from A Grade: OK");

  // 3) Kinna retained with his cap.
  const kinna = await db.execute(sql`
    SELECT g.games AS a_games, c.cap_number
    FROM player_grade_stats g
    LEFT JOIN cap_register c ON c.player_id = ${KINNA_PLAYER_ID} AND c.category='male'
    WHERE g.grade=${GRADE} AND g.player_id=${KINNA_PLAYER_ID}
  `);
  const k = kinna.rows[0] as { a_games: number; cap_number: number } | undefined;
  if (!k || k.cap_number !== 175) {
    throw new Error("Kinna missing from A Grade or lost cap #175.");
  }
  console.log(`  Kinna kept: ${k.a_games} A Grade games, cap #${k.cap_number}: OK`);

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
