import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  writeParticipants,
  type JuniorProjectionSummary,
} from "../../../../lib/db/src/playhq-ingest/junior-write";

/** Exercise the actual historical replay SQL and live writer with temporary
 * shadow tables, never a wholesale reload of the development club's data. */
describe("confirmed junior names survive both import paths", () => {
  it("historical participant upsert retains a confirmed name and the existing GUID spelling", async () => {
    const etl = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../../../scripts/sql/juniors-etl.sql"),
      "utf8",
    );
    const start = etl.indexOf("INSERT INTO public.junior_participants AS jp");
    const upsert = etl
      .slice(start, etl.indexOf(";", start) + 1)
      .replaceAll("public.", "pg_temp.")
      .replace("juniors_staging.junior_participants", "pg_temp.incoming_participants");
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(`
        CREATE TEMP TABLE junior_participants (LIKE public.junior_participants INCLUDING DEFAULTS INCLUDING INDEXES) ON COMMIT DROP;
        CREATE TEMP TABLE incoming_participants (LIKE public.junior_participants INCLUDING DEFAULTS) ON COMMIT DROP;
        CREATE TEMP TABLE _jl_keep_name (participant_id text) ON COMMIT DROP;
        CREATE TEMP TABLE _jl_synced (participant_id text) ON COMMIT DROP;
      `),
      );
      await tx.execute(sql`INSERT INTO pg_temp.junior_participants (tenant_id,participant_id,display_name,is_private,photo_withheld,senior_player_id) VALUES
        (1,${id.toUpperCase()},'Alexandra Jean-Marie de la Cruz-Smith',true,true,123),
        (2,${id},'Other Club Name',false,false,NULL)`);
      await tx.execute(
        sql`INSERT INTO pg_temp.incoming_participants (tenant_id,participant_id,display_name,is_private) VALUES (1,${id},'A Smith',false)`,
      );
      await tx.execute(sql`INSERT INTO _jl_keep_name VALUES (${id})`);
      await tx.execute(sql.raw(upsert));
      await tx.execute(sql.raw(upsert));
      const result = await tx.execute(
        sql.raw(
          "SELECT participant_id,display_name,is_private,photo_withheld,senior_player_id FROM pg_temp.junior_participants ORDER BY tenant_id",
        ),
      );
      expect(result.rows).toEqual([
        {
          participant_id: id.toUpperCase(),
          display_name: "Alexandra Jean-Marie de la Cruz-Smith",
          is_private: true,
          photo_withheld: true,
          senior_player_id: 123,
        },
        {
          participant_id: id,
          display_name: "Other Club Name",
          is_private: false,
          photo_withheld: false,
          senior_player_id: null,
        },
      ]);
    });
  });
  it("historical replay restores the latest confirmed name by GUID, preserving tenant, opposition and facts", async () => {
    const etl = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../../../scripts/sql/juniors-etl.sql"),
      "utf8",
    );
    const aggregate = etl.slice(
      etl.indexOf("CREATE TEMP TABLE _jsc_upd"),
      etl.indexOf("UPDATE public.junior_matches", etl.indexOf("CREATE TEMP TABLE _jsc_upd")),
    );
    const replay = etl.slice(etl.indexOf("-- Participants re-key"), etl.indexOf("-- 6c."));
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(`
        CREATE TEMP TABLE junior_participants (tenant_id int, participant_id text, display_name text, is_private boolean) ON COMMIT DROP;
        CREATE TEMP TABLE junior_stat_corrections (id int, tenant_id int, target_table text, target_id text, op text, patch jsonb, playhq_match_id text) ON COMMIT DROP;
        CREATE TEMP TABLE junior_matches (id int, tenant_id int) ON COMMIT DROP;
        CREATE TEMP TABLE junior_match_batting (id int, match_id int, participant_id text, player_name text, is_halls_head boolean, runs int) ON COMMIT DROP;
        CREATE TEMP TABLE junior_match_bowling (LIKE pg_temp.junior_match_batting) ON COMMIT DROP;
        CREATE TEMP TABLE junior_match_rosters (LIKE pg_temp.junior_match_batting) ON COMMIT DROP;
      `),
      );
      await tx.execute(sql`INSERT INTO pg_temp.junior_participants VALUES
        (1, ${id}, 'A Smith', true), (2, ${id}, 'Other Club', false)`);
      await tx.execute(sql`INSERT INTO pg_temp.junior_stat_corrections VALUES
        (1,1,'junior_participants',${id.toUpperCase()},'update','{"display_name":"Alex Smith"}',NULL),
        (2,1,'junior_participants',${id},'update','{"display_name":"Alexander James Smith"}',NULL)`);
      await tx.execute(sql.raw(`INSERT INTO pg_temp.junior_matches VALUES (1,1),(2,2)`));
      for (const table of [
        "junior_match_batting",
        "junior_match_bowling",
        "junior_match_rosters",
      ]) {
        await tx.execute(sql`INSERT INTO ${sql.raw(`pg_temp.${table}`)} VALUES
          (1,1,${id.toUpperCase()},'A Smith',true,37),
          (2,1,${id},'Opponent Name',false,20),
          (3,2,${id},'Other Club',true,18)`);
      }
      await tx.execute(sql.raw((aggregate + replay).replaceAll("public.", "pg_temp.")));
      const ps = await tx.execute(
        sql.raw("SELECT * FROM pg_temp.junior_participants ORDER BY tenant_id"),
      );
      expect(ps.rows).toEqual([
        {
          tenant_id: 1,
          participant_id: id,
          display_name: "Alexander James Smith",
          is_private: true,
        },
        { tenant_id: 2, participant_id: id, display_name: "Other Club", is_private: false },
      ]);
      for (const table of [
        "junior_match_batting",
        "junior_match_bowling",
        "junior_match_rosters",
      ]) {
        const result = await tx.execute(sql.raw(`SELECT * FROM pg_temp.${table} ORDER BY id`));
        expect(result.rows.map((r) => r.player_name)).toEqual([
          "Alexander James Smith",
          "Opponent Name",
          "Other Club",
        ]);
        expect(result.rows.map((r) => r.runs)).toEqual([37, 20, 18]);
      }
      // Replay twice is idempotent.
      await tx.execute(sql.raw(replay.replaceAll("public.", "pg_temp.")));
    });
  });
  it("live sync does not overwrite a journalled manual name with initials or conflicting expanded evidence", async () => {
    const client = await db.$client.connect();
    const id = randomUUID();
    try {
      await client.query(`
        CREATE TEMP TABLE junior_participants (tenant_id int, participant_id text, display_name text, is_private boolean,
          privacy_override boolean DEFAULT false, privacy_override_by text, privacy_override_at timestamptz);
        CREATE TEMP TABLE junior_stat_corrections (tenant_id int, target_table text, target_id text, op text, patch jsonb);
      `);
      await client.query(
        "INSERT INTO junior_participants VALUES (1,$1,'Alexandra Jean-Marie de la Cruz-Smith',false)",
        [id.toUpperCase()],
      );
      await client.query(
        "INSERT INTO junior_stat_corrections VALUES (1,'junior_participants',$1,'update','{\"display_name\":\"Alexandra Jean-Marie de la Cruz-Smith\"}')",
        [id],
      );
      // The writer opens a transaction. Supply this already-owned connection so
      // all queries resolve to its temporary shadow tables.
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const isolated = drizzle(client) as unknown as typeof db;
      const summary = {
        participantsInserted: 0,
        participantsUpdated: 0,
      } as unknown as JuniorProjectionSummary;
      for (const name of ["A Smith", "Andrew Smith"]) {
        await writeParticipants(
          isolated,
          1,
          [{ participantId: id, name, isPrivate: false }],
          summary,
        );
        const result = await client.query("SELECT * FROM junior_participants");
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].display_name).toBe("Alexandra Jean-Marie de la Cruz-Smith");
        expect(result.rows[0].participant_id).toBe(id.toUpperCase());
      }
    } finally {
      await client.query("ROLLBACK");
      await client.query(
        "DROP TABLE IF EXISTS pg_temp.junior_stat_corrections, pg_temp.junior_participants",
      );
      client.release();
    }
  });
});
