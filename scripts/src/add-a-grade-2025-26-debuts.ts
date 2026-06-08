/**
 * Issue A Grade (male) caps to the 2025/26 season's debutants.
 *
 * Background: the per-match load now carries the full 2025/26 A Grade season, but
 * the players who played A Grade for the FIRST time that season were never issued
 * a cap number. This script appends those caps to the male sequence.
 *
 * A 2025/26 A Grade debutant is selected straight from the data (so this is
 * re-runnable against any database, including production) as a REAL player
 * (id < 90000) who:
 *   - appears in an A Grade 2025/26 match (matches.grade='A Grade', season=2025),
 *   - holds no male cap, and
 *   - has no prior A Grade history: no A Grade match before the 2025 season AND
 *     no recorded games in the season=NULL A Grade baseline snapshot.
 *
 * Ordering for cap numbering: by earliest 2025/26 A Grade match date — PARSED
 * from the free-text `match_date` column (e.g. "12:00 PM, Saturday, 04 Oct 2025")
 * into a real timestamp, never sorted as a string — then by surname. (The task's
 * enumerated expected output is alphabetical-by-surname within a debut date, which
 * is what is reproduced here.) New caps continue the male sequence from the
 * current max male cap number + 1.
 *
 * Each new cap is linked to the player record, flagged in_stats, and its cached
 * games_a_grade is taken from the per-grade stats aggregate (player_grade_stats).
 *
 * Idempotent: a player who already holds a male cap is skipped, so re-running
 * never creates duplicate caps or renumbers existing ones.
 *
 * Run with: pnpm --filter @workspace/scripts run add-a-grade-2025-26-debuts
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const GRADE = "A Grade";
const SEASON = 2025; // 2025/26 keyed by start year
const CATEGORY = "male";

type Debutant = {
  player_id: number;
  given_name: string | null;
  surname: string | null;
  debut_dt: string | null;
  games: number;
};

async function main() {
  // Select the 2025/26 A Grade debutants and their numbering order. match_date is
  // free text, so it is parsed to a timestamp ("DD Mon YYYY") for ordering.
  const res = await db.execute(sql`
    WITH a_lines AS (
      SELECT mpl.player_id, m.season,
             to_timestamp(
               substring(replace(m.match_date, '"', '') from '[0-9]{1,2} [A-Za-z]{3} [0-9]{4}'),
               'DD Mon YYYY'
             ) AS dt
      FROM match_player_lines mpl
      JOIN matches m ON m.id = mpl.match_id
      WHERE m.grade = ${GRADE}
    ),
    season_players AS (
      SELECT DISTINCT player_id FROM a_lines WHERE season = ${SEASON}
    ),
    debutants AS (
      SELECT sp.player_id
      FROM season_players sp
      WHERE sp.player_id < 90000
        -- no male cap yet
        AND NOT EXISTS (
          SELECT 1 FROM cap_register c
          WHERE c.category = ${CATEGORY} AND c.player_id = sp.player_id
        )
        -- no A Grade match before the 2025 season
        AND NOT EXISTS (
          SELECT 1 FROM a_lines al
          WHERE al.player_id = sp.player_id AND al.season < ${SEASON}
        )
        -- no recorded games in the season=NULL A Grade baseline snapshot
        AND NOT EXISTS (
          SELECT 1 FROM player_grade_season_stats s
          WHERE s.player_id = sp.player_id AND s.grade = ${GRADE}
            AND s.season IS NULL AND COALESCE(s.games, 0) > 0
        )
    )
    SELECT d.player_id,
           p.given_name,
           p.surname,
           (SELECT MIN(al.dt) FROM a_lines al
            WHERE al.player_id = d.player_id AND al.season = ${SEASON}) AS debut_dt,
           COALESCE(
             (SELECT g.games FROM player_grade_stats g
              WHERE g.grade = ${GRADE} AND g.player_id = d.player_id), 0
           ) AS games
    FROM debutants d
    JOIN players p ON p.id = d.player_id
    ORDER BY debut_dt ASC NULLS LAST, lower(p.surname) ASC, lower(p.given_name) ASC, d.player_id
  `);

  const debutants = res.rows as unknown as Debutant[];
  if (debutants.length === 0) {
    console.log("No uncapped 2025/26 A Grade debutants found. Nothing to do.");
    return;
  }

  console.log(`Found ${debutants.length} uncapped 2025/26 A Grade debutant(s):`);
  for (const d of debutants) {
    console.log(
      `  ${`${d.given_name ?? ""} ${d.surname ?? ""}`.trim().padEnd(22)} ` +
        `id=${String(d.player_id).padEnd(5)} debut=${d.debut_dt ?? "?"} games=${d.games}`,
    );
  }

  await db.transaction(async (tx) => {
    const maxRes = await tx.execute(sql`
      SELECT COALESCE(MAX(cap_number), 0) AS max_cap
      FROM cap_register WHERE category = ${CATEGORY}
    `);
    let nextCap = Number((maxRes.rows[0] as { max_cap: number }).max_cap) + 1;

    for (const d of debutants) {
      // Idempotency guard: skip if this player already holds a male cap (e.g. a
      // partial previous run). The selection already excludes capped players, but
      // re-check inside the transaction so concurrent/partial state is safe.
      const already = await tx.execute(sql`
        SELECT 1 FROM cap_register
        WHERE category = ${CATEGORY} AND player_id = ${d.player_id} LIMIT 1
      `);
      if (already.rows.length > 0) {
        console.log(`  skip (already capped): player #${d.player_id}`);
        continue;
      }

      const name =
        `${d.given_name ?? ""} ${d.surname ?? ""}`.trim() ||
        `Player #${d.player_id}`;
      await tx.execute(sql`
        INSERT INTO cap_register
          (cap_number, category, name, in_stats, games_a_grade, auto_created, player_id)
        VALUES (${nextCap}, ${CATEGORY}, ${name}, ${d.games > 0}, ${d.games}, true, ${d.player_id})
      `);
      console.log(`  + cap #${nextCap} ${name} (player #${d.player_id}, ${d.games} A Grade games)`);
      nextCap++;
    }
  });

  // Verify the tail of the male list.
  const tail = await db.execute(sql`
    SELECT cap_number, name, player_id, in_stats, games_a_grade
    FROM cap_register WHERE category = ${CATEGORY}
    ORDER BY cap_number DESC LIMIT 10
  `);
  console.log("\nMale cap list (tail):");
  for (const r of [...tail.rows].reverse() as Array<{
    cap_number: number;
    name: string;
    player_id: number | null;
    in_stats: boolean;
    games_a_grade: number;
  }>) {
    console.log(
      `  #${String(r.cap_number).padEnd(3)} ${r.name.padEnd(22)} player=${String(
        r.player_id ?? "—",
      ).padEnd(6)} games=${r.games_a_grade}`,
    );
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
