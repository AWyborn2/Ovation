import { db, playersTable, playerGradeStatsTable, gradeSummariesTable } from "@workspace/db";
import { readFileSync } from "fs";
import { sql } from "drizzle-orm";

const perGrade = JSON.parse(readFileSync("/tmp/per_grade.json", "utf8"));
const clubTotals = JSON.parse(readFileSync("/tmp/club_totals.json", "utf8"));
const gradeSummaries = JSON.parse(readFileSync("/tmp/grade_summaries.json", "utf8"));

async function seed() {
  // Clear tables
  await db.execute(sql`TRUNCATE player_grade_stats, grade_summaries, players RESTART IDENTITY CASCADE`);

  // Insert players from club totals and build id map
  const playerIdMap: Record<string, number> = {};

  for (const row of clubTotals) {
    const key = `${row["Surname"]}|${row["Given Name"]}`;
    const [player] = await db
      .insert(playersTable)
      .values({
        surname: row["Surname"] || "",
        givenName: row["Given Name"] || "",
        gradesPlayed: row["Grades Played"] || null,
        totalGames: row["Games"] || null,
        totalRuns: row["Runs"] || null,
        totalWickets: row["Wickets"] || null,
      })
      .returning();
    playerIdMap[key] = player.id;
  }

  console.log(`Inserted ${clubTotals.length} players`);

  // Insert grade summaries
  for (const row of gradeSummaries) {
    await db.insert(gradeSummariesTable).values({
      grade: row["Grade"],
      players: row["Players"] || null,
      games: row["Games"] || null,
      innings: row["Innings"] || null,
      runs: row["Runs"] || null,
      wickets: row["Wickets"] || null,
      catches: row["Catches"] || null,
      stumpings: row["Stumpings"] || null,
      runOuts: row["Run Outs"] || null,
    });
  }

  console.log(`Inserted ${gradeSummaries.length} grade summaries`);

  // Insert per-grade stats
  let statsInserted = 0;
  const BATCH = 50;

  for (let i = 0; i < perGrade.length; i += BATCH) {
    const batch = perGrade.slice(i, i + BATCH);
    const values = [];

    for (const row of batch) {
      const key = `${row["Surname"]}|${row["Given Name"]}`;
      let playerId = playerIdMap[key];

      if (!playerId) {
        const [player] = await db
          .insert(playersTable)
          .values({
            surname: row["Surname"] || "",
            givenName: row["Given Name"] || "",
          })
          .returning();
        playerIdMap[key] = player.id;
        playerId = player.id;
      }

      const batAvg = typeof row["Bat Avg"] === "number" ? row["Bat Avg"] : null;
      const bowlAvg = typeof row["Bowl Avg"] === "number" ? row["Bowl Avg"] : null;

      values.push({
        playerId,
        surname: row["Surname"] || "",
        givenName: row["Given Name"] || "",
        grade: row["Grade"] || "",
        games: row["Games"] || null,
        innings: row["Innings"] || null,
        notOuts: row["Not Outs"] || null,
        runs: row["Runs"] || null,
        batAvg,
        highScore: row["High Score"] != null ? String(row["High Score"]) : null,
        fifties: row["50s"] || null,
        hundreds: row["100s"] || null,
        wickets: row["Wickets"] || null,
        runsConceded: row["Runs Conceded"] || null,
        bowlAvg,
        bestBowling: row["Best Bowling"] != null ? String(row["Best Bowling"]) : null,
        fiveWickets: row["5 Wkts"] || null,
        catches: row["Catches"] || null,
        stumpings: row["Stumpings"] || null,
        runOuts: row["Run Outs"] || null,
      });
    }

    if (values.length > 0) {
      await db.insert(playerGradeStatsTable).values(values);
      statsInserted += values.length;
    }

    if (statsInserted % 200 === 0) {
      process.stdout.write(`  ${statsInserted}/${perGrade.length} stats...\n`);
    }
  }

  console.log(`Inserted ${statsInserted} stat records`);
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
