/**
 * Idempotently (re)create database constraints that drizzle-kit cannot manage
 * reliably, so a fresh `drizzle-kit push` followed by this script lands on the
 * intended schema. Run from post-merge after `pnpm --filter db push`.
 *
 * Why this exists: drizzle-kit 0.31's push fails to detect existing multi-column
 * UNIQUE constraints and re-proposes them every run, which hangs the
 * non-interactive post-merge migration on a "truncate?" TTY prompt. Those
 * constraints are therefore left out of the Drizzle schema and enforced here
 * instead. See lib/db/src/schema/cap_register.ts for the full rationale.
 *
 * Run with: pnpm --filter @workspace/scripts run ensure-constraints
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

type ConstraintSpec = {
  table: string;
  name: string;
  /** Columns the UNIQUE constraint covers (also used for the dup pre-check). */
  columns: string[];
  /**
   * Treat NULLs as equal (Postgres 15+ `UNIQUE NULLS NOT DISTINCT`). Needed when
   * a nullable column participates in the identity and two NULL rows must still
   * collide (e.g. matches identity where round XOR stage is always NULL).
   */
  nullsNotDistinct?: boolean;
  /** Stale constraint names to DROP first (e.g. a previous narrower unique). */
  replaces?: string[];
};

const CONSTRAINTS: ConstraintSpec[] = [
  {
    table: "cap_register",
    name: "cap_register_category_cap_number_unique",
    columns: ["category", "cap_number"],
  },
  // admins_tenant_username_unique is managed here (not in Drizzle schema) because
  // drizzle-kit 0.31 cannot detect the existing constraint and re-proposes it every
  // push, causing an interactive truncate prompt that hangs post-merge. Same pattern
  // as cap_register above.
  {
    table: "admins",
    name: "admins_tenant_username_unique",
    columns: ["tenant_id", "username"],
  },
  {
    table: "captains",
    name: "captains_tenant_username_unique",
    columns: ["tenant_id", "username"],
  },
  {
    table: "baseline_adjustments",
    name: "baseline_adjustments_grade_season_player_id_unique",
    columns: ["grade", "season", "player_id"],
  },
  {
    table: "captain_grade_permissions",
    name: "captain_grade_permissions_captain_grade_unique",
    columns: ["captain_id", "grade"],
  },
  {
    table: "award_voting_config",
    name: "award_voting_config_award_season_unique",
    columns: ["award_id", "season"],
  },
  {
    table: "award_ballots",
    name: "award_ballots_config_captain_grade_round_unique",
    columns: ["config_id", "captain_id", "grade", "round"],
  },
  {
    table: "award_points_config",
    name: "award_points_config_award_season_unique",
    columns: ["award_id", "season"],
  },
  {
    table: "club_roles",
    name: "club_roles_season_role_grade_unique",
    columns: ["season", "role", "grade"],
    nullsNotDistinct: true,
  },
];

/**
 * Partial unique indexes that the ConstraintSpec machinery above can't express
 * (a partial / WHERE-clause unique is an INDEX, not a table CONSTRAINT). Created
 * with raw idempotent SQL. `drops` removes any superseded constraint/index from
 * an earlier schema so the partial versions can take over.
 */
type PartialIndexSpec = {
  name: string;
  sql: string;
  /** Plain DROP CONSTRAINT and DROP INDEX names to clear first (IF EXISTS). */
  dropConstraints?: string[];
  dropIndexes?: string[];
};

const PARTIAL_INDEXES: PartialIndexSpec[] = [
  // Admin per-match uploads (source_key IS NULL): one match per identity.
  {
    name: "matches_identity_manual_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "matches_identity_manual_uidx"
          ON "matches" ("grade", "season", "round", "stage") NULLS NOT DISTINCT
          WHERE "source_key" IS NULL`,
    dropConstraints: [
      "matches_grade_season_round_stage_unique",
      "matches_grade_season_round_unique",
    ],
  },
  // Bulk master-DB load: unique on the master source key.
  {
    name: "matches_source_key_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "matches_source_key_uidx"
          ON "matches" ("source_key")
          WHERE "source_key" IS NOT NULL`,
  },
];

/**
 * Non-unique performance indexes on the per-club stats core.
 *
 * These five tables carried only their serial `id` primary key, so every
 * scorecard render, player profile, grade leaderboard and stat recompute did a
 * sequential scan. Verified against the schema on 2026-07-22: zero secondary
 * indexes declared on any of them.
 *
 * Kept here rather than in the Drizzle schema for the same reason the partial
 * uniques are: this script runs immediately after `drizzle-kit push` in
 * post-merge, so anything push drops or fails to reconcile is restored on the
 * same run. `CREATE INDEX IF NOT EXISTS` is idempotent and never prompts, which
 * matters because post-merge is non-interactive with a 180s timeout.
 *
 * Deliberately NOT indexed: `players.surname` / `given_name`. Name lookup is
 * ILIKE, which a btree can't serve, and the tenant players table is small.
 */
const PERFORMANCE_INDEXES: { name: string; sql: string }[] = [
  {
    name: "match_player_lines_match_idx",
    sql: `CREATE INDEX IF NOT EXISTS "match_player_lines_match_idx"
          ON "match_player_lines" ("match_id")`,
  },
  {
    name: "match_player_lines_player_idx",
    sql: `CREATE INDEX IF NOT EXISTS "match_player_lines_player_idx"
          ON "match_player_lines" ("player_id")`,
  },
  {
    name: "player_grade_stats_player_idx",
    sql: `CREATE INDEX IF NOT EXISTS "player_grade_stats_player_idx"
          ON "player_grade_stats" ("player_id")`,
  },
  {
    name: "player_grade_stats_grade_idx",
    sql: `CREATE INDEX IF NOT EXISTS "player_grade_stats_grade_idx"
          ON "player_grade_stats" ("grade")`,
  },
  {
    name: "pgss_player_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pgss_player_idx"
          ON "player_grade_season_stats" ("player_id")`,
  },
  {
    // Grade and season are filtered together on season leaderboards; the
    // composite also serves grade alone via its leading column.
    name: "pgss_grade_season_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pgss_grade_season_idx"
          ON "player_grade_season_stats" ("grade", "season")`,
  },
  {
    name: "matches_grade_season_idx",
    sql: `CREATE INDEX IF NOT EXISTS "matches_grade_season_idx"
          ON "matches" ("grade", "season")`,
  },
  {
    // The milestones board derives its recency window from the latest date.
    name: "matches_match_date_idx",
    sql: `CREATE INDEX IF NOT EXISTS "matches_match_date_idx"
          ON "matches" ("match_date")`,
  },
];

async function main() {
  for (const c of CONSTRAINTS) {
    // Drop any superseded constraints first so the new identity can be applied.
    for (const old of c.replaces ?? []) {
      await db.execute(
        sql.raw(
          `ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${old}"`,
        ),
      );
    }
    // Existence check is scoped to the exact table + a unique constraint, since
    // constraint names are NOT globally unique across tables/schemas.
    const exists = await db.execute(
      sql`SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace ns ON ns.oid = rel.relnamespace
          WHERE con.conname = ${c.name}
            AND con.contype = 'u'
            AND rel.relname = ${c.table}
            AND ns.nspname = 'public'
          LIMIT 1`,
    );
    if (exists.rows.length > 0) {
      console.log(`✓ ${c.name} already present`);
      continue;
    }
    // Fail fast (with a clear message) instead of letting ADD CONSTRAINT throw
    // an opaque error if the data violates the invariant we're about to enforce.
    const cols = c.columns.map((col) => `"${col}"`).join(", ");
    const dups = await db.execute(
      sql.raw(
        `SELECT ${cols}, count(*) AS n FROM "${c.table}"
         GROUP BY ${cols} HAVING count(*) > 1 LIMIT 5`,
      ),
    );
    if (dups.rows.length > 0) {
      throw new Error(
        `Cannot add ${c.name}: "${c.table}" has duplicate ${c.columns.join(
          ", ",
        )} rows: ${JSON.stringify(dups.rows)}`,
      );
    }
    const nullsClause = c.nullsNotDistinct ? "NULLS NOT DISTINCT " : "";
    await db.execute(
      sql.raw(
        `ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" UNIQUE ${nullsClause}(${cols})`,
      ),
    );
    console.log(`+ added ${c.name} on ${c.table}`);
  }

  // Partial / WHERE-clause unique indexes (can't be table constraints).
  for (const ix of PARTIAL_INDEXES) {
    for (const con of ix.dropConstraints ?? []) {
      await db.execute(
        sql.raw(`ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "${con}"`),
      );
    }
    for (const idx of ix.dropIndexes ?? []) {
      await db.execute(sql.raw(`DROP INDEX IF EXISTS "${idx}"`));
    }
    await db.execute(sql.raw(ix.sql));
    console.log(`✓ ${ix.name} ensured`);
  }

  // Non-unique performance indexes on the stats core.
  for (const ix of PERFORMANCE_INDEXES) {
    await db.execute(sql.raw(ix.sql));
    console.log(`✓ ${ix.name} ensured`);
  }

  console.log("ensure-constraints: done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
