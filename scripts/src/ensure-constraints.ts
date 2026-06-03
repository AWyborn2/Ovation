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
  {
    table: "matches",
    name: "matches_grade_season_round_stage_unique",
    columns: ["grade", "season", "round", "stage"],
    nullsNotDistinct: true,
    replaces: ["matches_grade_season_round_unique"],
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
  console.log("ensure-constraints: done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
