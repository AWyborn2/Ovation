/**
 * One-off, idempotent data cleanup (Task: "Merge duplicate A Grade caps and
 * clear leftovers").
 *
 * Why: the (now-removed) 2025/26 A Grade import auto-created brand-new male caps
 * (numbers in the 240s/250s) for players who already held a cap under a slightly
 * different spelling of their name, so several people appear twice in the A Grade
 * Caps (Male) list. There are also a few source-data errors (a game credited to
 * the wrong brother; historic caps misspelled / linked to the wrong person), and
 * four players whose only A Grade appearance was the deleted 2025/26 season but
 * who still hold a leftover A Grade cap and carry stale career totals.
 *
 * What it does (single transaction):
 *  1. Merge four duplicate person/cap pairs: repoint the smaller record's
 *     per-grade snapshots (and any premiership appearances) onto the surviving
 *     record, keep the lower/original cap re-linked to the survivor, then delete
 *     the auto-created cap and the now-redundant duplicate player.
 *  2. Fix four mis-linked / misspelled caps WITHOUT a player merge (Jake
 *     Pattison, Trevor Allen, Alan Bermingham, Michael O'Brien): keep the
 *     original lower cap, correct its name, link it to the real player, and
 *     delete the auto-created duplicate.
 *  3. Fix the Evans error: move Samuel's single mis-recorded A Grade game to his
 *     brother Joel (repoint the A Grade snapshot), delete Samuel's auto A Grade
 *     cap; Samuel keeps his genuine B/C/PPL stats.
 *  4. Remove four leftover A Grade caps (players keep their other-grade stats).
 *  5. Recompute every derived table (player_grade_stats, players career totals,
 *     grade_summaries) from the snapshot source of truth, re-sync the kept caps'
 *     games_a_grade / in_stats, and delete the four redundant duplicate players.
 *  6. Record an `imports` audit row so the change is auditable and idempotent.
 *
 * Net effect: male cap count drops 253 -> 240, each person appears once on their
 * original cap number, the A Grade all-time total is unchanged (6431), and no
 * genuine stats are lost.
 *
 * Idempotent: re-running is a no-op once the audit row exists.
 *
 * Run with: pnpm --filter @workspace/scripts run fix-a-grade-cap-duplicates
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const AUDIT_FILENAME = "Task: merge duplicate A Grade caps + clear leftovers";
const A_GRADE_EXPECTED_TOTAL = 6431;

/** Player merges: keep `survivor`, fold `duplicate` into it, then delete it. */
const MERGES = [
  { name: "Naidoo", survivor: 28, duplicate: 292, keepCap: 207, deleteCap: 246 },
  { name: "Dillon", survivor: 91, duplicate: 154, keepCap: 3, deleteCap: 249 },
  { name: "Petersen", survivor: 46, duplicate: 454, keepCap: 134, deleteCap: 247 },
  { name: "Stanley", survivor: 312, duplicate: 334, keepCap: 56, deleteCap: 253 },
] as const;

/** Canonical name to stamp on premiership appearances repointed to a survivor. */
const PREMIERSHIP_REPOINT = [
  { duplicate: 292, survivor: 28, name: "WES NAIDOO" },
  { duplicate: 454, survivor: 46, name: "JOSH PETERSON" },
] as const;

/**
 * Mis-linked / misspelled caps fixed in place (no player merge): keep the lower
 * original cap, correct its name + player link, delete the auto duplicate.
 */
const CAP_FIXES = [
  { keepCap: 225, deleteCap: 250, playerId: 159, name: "Jake Pattison" },
  { keepCap: 86, deleteCap: 252, playerId: 285, name: "Trevor Allen" },
  { keepCap: 27, deleteCap: 254, playerId: 415, name: "Alan Bermingham" },
  { keepCap: 38, deleteCap: 248, playerId: 82, name: "Michael O'Brien" },
] as const;

/** Leftover A Grade caps to delete; the player records are kept. */
const LEFTOVER_CAPS = [241, 242, 243, 245] as const;

/** Cap players whose games_a_grade / in_stats are re-synced after recompute. */
const SYNC_CAP_PLAYER_IDS = [28, 91, 46, 312, 159, 285, 415, 82, 188];

type TxLike = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

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

  await db.transaction(async (tx) => {
    // 1) MERGES — repoint the duplicate's snapshots onto the survivor.
    for (const m of MERGES) {
      await tx.execute(sql`
        UPDATE player_grade_season_stats SET player_id = ${m.survivor}
        WHERE player_id = ${m.duplicate}
      `);
    }

    // 2) EVANS — move Samuel's single A Grade game onto Joel (188).
    await tx.execute(sql`
      UPDATE player_grade_season_stats SET player_id = 188
      WHERE player_id = 248 AND grade = 'A Grade'
    `);

    // 3) Repoint premiership appearances of the to-be-deleted duplicates.
    for (const p of PREMIERSHIP_REPOINT) {
      await tx.execute(sql`
        UPDATE premiership_players SET player_id = ${p.survivor}, name = ${p.name}
        WHERE player_id = ${p.duplicate}
      `);
    }

    // 4) Re-link the kept merge caps to their survivor (name unchanged — these
    //    lower/original caps already carry the correct canonical spelling).
    for (const m of MERGES) {
      await tx.execute(sql`
        UPDATE cap_register SET player_id = ${m.survivor}
        WHERE category = 'male' AND cap_number = ${m.keepCap}
      `);
    }

    // 5) Fix the mis-linked / misspelled caps in place.
    for (const f of CAP_FIXES) {
      await tx.execute(sql`
        UPDATE cap_register SET player_id = ${f.playerId}, name = ${f.name}
        WHERE category = 'male' AND cap_number = ${f.keepCap}
      `);
    }

    // 6) Delete the auto-created duplicate caps + the leftover caps.
    const capsToDelete = [
      ...MERGES.map((m) => m.deleteCap),
      ...CAP_FIXES.map((f) => f.deleteCap),
      251, // Samuel Evans' auto A Grade cap
      ...LEFTOVER_CAPS,
    ];
    await tx.execute(sql`
      DELETE FROM cap_register
      WHERE category = 'male'
        AND cap_number IN (${sql.join(capsToDelete.map((n) => sql`${n}`), sql`, `)})
    `);

    // 7) Recompute all derived tables from the snapshot source of truth.
    await recomputeAll(tx);

    // 8) Re-sync games_a_grade / in_stats for the kept caps from fresh stats.
    await tx.execute(sql`
      UPDATE cap_register c SET
        games_a_grade = COALESCE(
          (SELECT games FROM player_grade_stats g
           WHERE g.grade = 'A Grade' AND g.player_id = c.player_id), 0),
        in_stats = COALESCE(
          (SELECT games FROM player_grade_stats g
           WHERE g.grade = 'A Grade' AND g.player_id = c.player_id), 0) > 0
      WHERE c.category = 'male'
        AND c.player_id IN (${sql.join(SYNC_CAP_PLAYER_IDS.map((i) => sql`${i}`), sql`, `)})
    `);

    // 9) Delete the now-redundant duplicate player records. Safe: their
    //    snapshots, stats, premiership appearances and caps were all repointed
    //    or removed above.
    const dupPlayers = MERGES.map((m) => m.duplicate);
    await tx.execute(sql`
      DELETE FROM players
      WHERE id IN (${sql.join(dupPlayers.map((i) => sql`${i}`), sql`, `)})
    `);

    // 10) Audit row.
    const payload = {
      kind: "cap_cleanup",
      note:
        "Merged duplicate A Grade (male) caps created by the removed 2025/26 " +
        "import, fixed mis-linked/misspelled caps, moved Samuel Evans' single A " +
        "Grade game to Joel Evans, and removed four leftover A Grade caps. " +
        "A Grade all-time total unchanged; male cap count 253 -> 240.",
      merges: MERGES,
      capFixes: CAP_FIXES,
      premiershipRepoint: PREMIERSHIP_REPOINT,
      leftoverCapsRemoved: LEFTOVER_CAPS,
      evansMove: { from: 248, to: 188, grade: "A Grade", games: 1 },
      deletedPlayers: dupPlayers,
    };
    await tx.execute(sql`
      INSERT INTO imports (filename, grade, season, kind, row_count, status, payload)
      VALUES (${AUDIT_FILENAME}, 'A Grade', NULL, 'csv', 0, 'cap_cleanup',
              ${JSON.stringify(payload)}::jsonb)
    `);
  });

  await verify();
}

/** Re-derive ALL derived tables from player_grade_season_stats snapshots. */
async function recomputeAll(tx: TxLike) {
  await tx.execute(sql`DELETE FROM player_grade_stats`);
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
    GROUP BY s.player_id, p.surname, p.given_name, s.grade
  `);

  await tx.execute(sql`
    WITH agg AS (
      SELECT player_id,
        NULLIF(COALESCE(SUM(games), 0),   0) AS total_games,
        NULLIF(COALESCE(SUM(runs), 0),    0) AS total_runs,
        NULLIF(COALESCE(SUM(wickets), 0), 0) AS total_wickets,
        NULLIF(string_agg(DISTINCT grade, ', ' ORDER BY grade), '') AS grades_played
      FROM player_grade_stats
      GROUP BY player_id
    )
    UPDATE players p SET
      total_games = agg.total_games, total_runs = agg.total_runs,
      total_wickets = agg.total_wickets, grades_played = agg.grades_played
    FROM agg WHERE p.id = agg.player_id
  `);

  // Players with no remaining stats at all get their derived aggregates cleared.
  await tx.execute(sql`
    UPDATE players p SET
      total_games = NULL, total_runs = NULL, total_wickets = NULL, grades_played = NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM player_grade_stats g WHERE g.player_id = p.id
    )
  `);

  await tx.execute(sql`DELETE FROM grade_summaries`);
  await tx.execute(sql`
    INSERT INTO grade_summaries (grade, players, games, innings, runs, wickets,
                                 catches, stumpings, run_outs)
    SELECT grade, COUNT(DISTINCT player_id),
      NULLIF(COALESCE(SUM(games), 0), 0), NULLIF(COALESCE(SUM(innings), 0), 0),
      NULLIF(COALESCE(SUM(runs), 0), 0), NULLIF(COALESCE(SUM(wickets), 0), 0),
      NULLIF(COALESCE(SUM(catches), 0), 0), NULLIF(COALESCE(SUM(stumpings), 0), 0),
      NULLIF(COALESCE(SUM(run_outs), 0), 0)
    FROM player_grade_stats GROUP BY grade
  `);
}

async function verify() {
  console.log("\nVerification:");

  // 1) A Grade all-time total unchanged and reconciling across tables.
  const totals = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(games),0) FROM player_grade_season_stats WHERE grade='A Grade' AND season IS NULL) AS snap,
      (SELECT COALESCE(SUM(games),0) FROM player_grade_stats WHERE grade='A Grade') AS agg,
      (SELECT COALESCE(games,0) FROM grade_summaries WHERE grade='A Grade') AS summary
  `);
  const t = totals.rows[0] as { snap: number; agg: number; summary: number };
  console.log(`  A Grade games  snapshot=${t.snap} aggregate=${t.agg} summary=${t.summary}`);
  if (Number(t.snap) !== A_GRADE_EXPECTED_TOTAL) {
    throw new Error(`A Grade total drifted: ${t.snap} (expected ${A_GRADE_EXPECTED_TOTAL}).`);
  }
  if (Number(t.snap) !== Number(t.agg) || Number(t.agg) !== Number(t.summary)) {
    throw new Error("A Grade aggregates do not reconcile with the snapshot source of truth.");
  }

  // 2) Male cap count is 240 with no gaps or duplicate numbers.
  const caps = await db.execute(sql`
    SELECT COUNT(*) AS n, MIN(cap_number) AS lo, MAX(cap_number) AS hi,
           COUNT(*) - COUNT(DISTINCT cap_number) AS dups
    FROM cap_register WHERE category='male'
  `);
  const c = caps.rows[0] as { n: number; lo: number; hi: number; dups: number };
  console.log(`  Male caps count=${c.n} range=${c.lo}..${c.hi} duplicateNumbers=${c.dups}`);
  if (Number(c.n) !== 240) throw new Error(`Male cap count is ${c.n}, expected 240.`);
  if (Number(c.dups) !== 0) throw new Error("Duplicate male cap numbers present.");

  const gaps = await db.execute(sql`
    SELECT g AS missing FROM generate_series(
      (SELECT MIN(cap_number) FROM cap_register WHERE category='male'),
      (SELECT MAX(cap_number) FROM cap_register WHERE category='male')
    ) g
    WHERE NOT EXISTS (
      SELECT 1 FROM cap_register WHERE category='male' AND cap_number = g
    )
  `);
  if (gaps.rows.length > 0) {
    throw new Error(`Gaps in male cap numbers: ${gaps.rows.map((r) => (r as { missing: number }).missing).join(", ")}`);
  }
  console.log("  No gaps in male cap numbers: OK");

  // 3) The deleted caps are gone; the deleted players are gone.
  const goneCaps = await db.execute(sql`
    SELECT cap_number FROM cap_register WHERE category='male'
      AND cap_number IN (246,247,248,249,250,251,252,253,254,241,242,243,245)
  `);
  if (goneCaps.rows.length > 0) throw new Error("A removed cap still exists.");
  const gonePlayers = await db.execute(sql`SELECT id FROM players WHERE id IN (292,154,454,334)`);
  if (gonePlayers.rows.length > 0) throw new Error("A merged-away player record still exists.");
  console.log("  Removed caps + merged-away players absent: OK");

  // 4) Each consolidated person appears once with the right A Grade games.
  const expectAGames: Record<number, number> = {
    28: 10, 91: 51, 46: 128, 312: 18, 159: 10, 285: 23, 415: 12, 82: 68, 188: 22,
  };
  const capRows = await db.execute(sql`
    SELECT c.cap_number, c.player_id, c.name, c.in_stats, c.games_a_grade,
           COALESCE(g.games, 0) AS stat_games
    FROM cap_register c
    LEFT JOIN player_grade_stats g ON g.grade='A Grade' AND g.player_id = c.player_id
    WHERE c.category='male' AND c.player_id IN (${sql.join(
      Object.keys(expectAGames).map((i) => sql`${Number(i)}`),
      sql`, `,
    )})
    ORDER BY c.player_id
  `);
  for (const r of capRows.rows as Array<{
    cap_number: number; player_id: number; name: string;
    in_stats: boolean; games_a_grade: number; stat_games: number;
  }>) {
    const exp = expectAGames[r.player_id];
    const ok = Number(r.games_a_grade) === exp && Number(r.stat_games) === exp && r.in_stats;
    console.log(
      `  cap #${String(r.cap_number).padEnd(3)} player=${String(r.player_id).padEnd(4)} ` +
        `${r.name.padEnd(18)} A=${r.games_a_grade} stat=${r.stat_games} inStats=${r.in_stats} ${ok ? "OK" : "MISMATCH"}`,
    );
    if (!ok) throw new Error(`Cap/stat mismatch for player ${r.player_id} (expected A=${exp}).`);
  }
  const seen = new Set((capRows.rows as Array<{ player_id: number }>).map((r) => r.player_id));
  for (const id of Object.keys(expectAGames).map(Number)) {
    if (!seen.has(id)) throw new Error(`Expected a male cap for player ${id} but none found.`);
  }

  // 5) Dean Patterson (100) keeps no A Grade cap and his record is intact.
  const dean = await db.execute(sql`
    SELECT (SELECT COUNT(*) FROM cap_register WHERE category='male' AND player_id=100) AS caps,
           (SELECT total_games FROM players WHERE id=100) AS total_games
  `);
  const d = dean.rows[0] as { caps: number; total_games: number };
  console.log(`  Dean Patterson (100): male caps=${d.caps} total_games=${d.total_games}`);
  if (Number(d.caps) !== 0) throw new Error("Dean Patterson still holds an A Grade cap.");

  // 6) Samuel Evans (248) keeps his non-A-grade stats, has no A Grade row/cap.
  const sam = await db.execute(sql`
    SELECT (SELECT COUNT(*) FROM player_grade_stats WHERE player_id=248 AND grade='A Grade') AS a_rows,
           (SELECT COUNT(*) FROM cap_register WHERE category='male' AND player_id=248) AS caps,
           (SELECT total_games FROM players WHERE id=248) AS total_games
  `);
  const s = sam.rows[0] as { a_rows: number; caps: number; total_games: number };
  console.log(`  Samuel Evans (248): A rows=${s.a_rows} male caps=${s.caps} total_games=${s.total_games}`);
  if (Number(s.a_rows) !== 0 || Number(s.caps) !== 0) {
    throw new Error("Samuel Evans still has an A Grade stat row or cap.");
  }

  console.log("\nAll checks passed.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
