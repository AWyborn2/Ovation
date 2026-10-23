import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

describe("full historical junior ETL", () => {
  it("retains mixed-case synced identities, all match statistics, privacy, links and correction/merge journals", async () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../../../scripts/sql/juniors-etl.sql"),
      "utf8",
    );
    // Execute the ENTIRE loader, including its scope guards, replacement,
    // synced detection, name/stat replay, recomputation and merge replay.
    // Only schema references are redirected to transaction-local shadow tables.
    const replay = source
      .replaceAll("public.", "pg_temp.")
      .replace(/juniors_staging\.(\w+)/g, "pg_temp.stage_$1");
    const tables = [...new Set([...source.matchAll(/public\.(\w+)/g)].map((m) => m[1]))];
    const id = randomUUID();
    const duplicate = randomUUID();
    const name = "Alexandra Jean-Marie de la Cruz-Smith";
    await db.transaction(async (tx) => {
      for (const table of tables) {
        await tx.execute(
          sql.raw(
            table === "tenants"
              ? "CREATE TEMP TABLE tenants (id int PRIMARY KEY) ON COMMIT DROP"
              : `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING INDEXES) ON COMMIT DROP`,
          ),
        );
      }
      await tx.execute(sql.raw("INSERT INTO pg_temp.tenants VALUES (1),(2)"));
      const stageTables: Record<string, string> = {
        matches: "junior_matches",
        match_batting: "junior_match_batting",
        match_bowling: "junior_match_bowling",
        match_rosters: "junior_match_rosters",
        junior_participants: "junior_participants",
        junior_premierships: "junior_premierships",
        junior_premiership_players: "junior_premiership_players",
      };
      for (const [stage, target] of Object.entries(stageTables)) {
        await tx.execute(
          sql.raw(
            `CREATE TEMP TABLE stage_${stage} (LIKE pg_temp.${target} INCLUDING DEFAULTS) ON COMMIT DROP`,
          ),
        );
      }
      await tx.execute(
        sql.raw(`
        ALTER TABLE stage_matches RENAME COLUMN id TO match_id;
        ALTER TABLE stage_matches ADD COLUMN age_band text;
        ALTER TABLE stage_junior_premierships ADD COLUMN age_band text;
      `),
      );
      await tx.execute(sql`INSERT INTO pg_temp.junior_participants
        (tenant_id,participant_id,display_name,is_private,privacy_override,privacy_override_by,privacy_override_at,photo_withheld,senior_player_id,scorecard_lines,roster_appearances,first_season,last_season,teams)
        VALUES (1,${id.toUpperCase()},${name},true,true,'Fixture admin','2026-10-01T00:00:00Z',true,123,4,2,'2025/26','2026/27','Blue, Gold'),
        (2,${id},'Other Club Name',false,false,NULL,NULL,false,NULL,99,99,'2000/01','2026/27','Other')`);
      await tx.execute(sql`INSERT INTO pg_temp.stage_junior_participants
        (tenant_id,participant_id,display_name,is_private,scorecard_lines,roster_appearances,first_season,last_season,teams)
        VALUES (1,${id},'A Smith',false,2,1,'2025/26','2025/26','Blue'),
        (1,${duplicate},'A Smith',false,2,1,'2025/26','2025/26','Blue')`);
      await tx.execute(
        sql.raw(`INSERT INTO pg_temp.junior_matches
        (id,tenant_id,playhq_match_id,season,season_start_year,team_name,team1,team2,team1_score,team2_score)
        VALUES (1001,1,'historical-replay','2025/26',2025,'Blue','Blue','Rivals','107/4','108/3'),
        (200000011,1,'synced-replay','2026/27',2026,'Gold','Gold','Rivals','200/6','201/5'),
        (200000012,2,'other-replay','2026/27',2026,'Other','Other','Rivals','999/9','1/0');
        INSERT INTO pg_temp.stage_matches SELECT *,NULL FROM pg_temp.junior_matches WHERE id=1001;`),
      );
      await tx.execute(sql`INSERT INTO pg_temp.junior_match_batting
        (id,match_id,participant_id,player_name,is_halls_head,runs)
        VALUES (1001,1001,${id.toUpperCase()},${name},true,7),
        (200000011,200000011,${id},'A Smith',true,100),
        (200000012,200000012,${id},'Other Club Name',true,999),
        (200000013,200000011,${id},'Opponent Name',false,7777)`);
      await tx.execute(sql`INSERT INTO pg_temp.junior_match_bowling
        (id,match_id,participant_id,player_name,is_halls_head,wickets,runs)
        VALUES (1001,1001,${id.toUpperCase()},${name},true,1,20),
        (200000011,200000011,${id},'A Smith',true,3,30),
        (200000012,200000012,${id},'Other Club Name',true,9,999)`);
      await tx.execute(sql`INSERT INTO pg_temp.junior_match_rosters
        (id,match_id,participant_id,player_name,is_halls_head,team_name)
        VALUES (1001,1001,${id.toUpperCase()},${name},true,'Blue'),
        (200000011,200000011,${id},'A Smith',true,'Gold'),
        (200000012,200000012,${id},'Other Club Name',true,'Other')`);
      for (const table of ["batting", "bowling", "rosters"]) {
        await tx.execute(
          sql.raw(`INSERT INTO stage_match_${table} SELECT * FROM pg_temp.junior_match_${table} WHERE id=1001;
          UPDATE stage_match_${table} SET participant_id='${duplicate}',player_name='A Smith'`),
        );
      }
      // The historical dump resurrects an already absorbed GUID in lowercase.
      // A duplicate roster and premiership link also need deduplication.
      await tx.execute(sql`INSERT INTO pg_temp.stage_match_rosters
        (id,match_id,participant_id,player_name,is_halls_head,team_name)
        VALUES (1002,1001,${id.toLowerCase()},'A Smith',true,'Blue')`);
      await tx.execute(
        sql.raw(`INSERT INTO stage_junior_premierships
        (id,tenant_id,season,team_name) VALUES (1001,1,'2025/26','Blue')`),
      );
      await tx.execute(sql`INSERT INTO pg_temp.stage_junior_premiership_players
        (id,premiership_id,participant_id,player_name) VALUES
        (1001,1001,${duplicate},'A Smith'), (1002,1001,${id},'A Smith')`);
      await tx.execute(sql`INSERT INTO pg_temp.junior_stat_corrections
        (id,tenant_id,target_table,target_id,op,patch,prev_values,created_by,note)
        VALUES (1,1,'junior_participants',${id},'update',${JSON.stringify({ display_name: name })}::jsonb,
          '{"display_name":"A Smith"}','Fixture admin','confirmed full name')`);
      // Both sides of an active merge differ in casing from their stored/source
      // participant rows. Reapply it, without rewriting the map.
      await tx.execute(sql`INSERT INTO pg_temp.junior_participant_merges
        (id,tenant_id,duplicate_participant_id,keeper_participant_id,created_by)
        VALUES (1,1,${duplicate.toUpperCase()},${id.toLowerCase()},'Fixture admin')`);
      async function rows(query: string) {
        return (await tx.execute(sql.raw(query))).rows;
      }
      const participants = await rows(
        "SELECT * FROM pg_temp.junior_participants ORDER BY tenant_id",
      );
      const journal = await rows("SELECT * FROM pg_temp.junior_stat_corrections");
      const merges = await rows("SELECT * FROM pg_temp.junior_participant_merges");
      const synced: Record<string, unknown> = {};
      for (const table of [
        "junior_matches",
        "junior_match_batting",
        "junior_match_bowling",
        "junior_match_rosters",
      ]) {
        synced[table] = await rows(
          `SELECT * FROM pg_temp.${table} WHERE id>=200000000 ORDER BY id`,
        );
      }
      for (let pass = 0; pass < 2; pass++) {
        await tx.execute(sql.raw(replay));
        expect(await rows("SELECT * FROM pg_temp.junior_participants ORDER BY tenant_id")).toEqual(
          participants,
        );
        expect(await rows("SELECT * FROM pg_temp.junior_stat_corrections")).toEqual(journal);
        expect(await rows("SELECT * FROM pg_temp.junior_participant_merges")).toEqual(merges);
        expect(await rows(`SELECT participant_id FROM pg_temp.junior_premiership_players`)).toEqual(
          [{ participant_id: id.toUpperCase() }],
        );
        expect(
          await rows(
            `SELECT participant_id,player_name FROM pg_temp.junior_match_batting WHERE id=1001`,
          ),
        ).toEqual([{ participant_id: id.toUpperCase(), player_name: name }]);
        for (const [table, before] of Object.entries(synced)) {
          expect(
            await rows(`SELECT * FROM pg_temp.${table} WHERE id>=200000000 ORDER BY id`),
          ).toEqual(before);
        }
        expect(
          await rows(`SELECT sum(b.runs)::int AS runs FROM pg_temp.junior_match_batting b
          JOIN pg_temp.junior_matches m ON m.id=b.match_id
          WHERE m.tenant_id=1 AND b.is_halls_head`),
        ).toEqual([{ runs: 107 }]);
        expect(
          await rows(`SELECT sum(b.wickets)::int AS wickets FROM pg_temp.junior_match_bowling b
          JOIN pg_temp.junior_matches m ON m.id=b.match_id
          WHERE m.tenant_id=1 AND b.is_halls_head`),
        ).toEqual([{ wickets: 4 }]);
        await tx.execute(
          sql.raw(`DROP TABLE _js_matches,_js_premierships,_jl_matches,_jl_premierships,
          _jl_synced,_jl_keep_name,_jp_mom,_jp_captains,_jsc_upd,_jpm`),
        );
      }
    });
  });
});
