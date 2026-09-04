/**
 * Verify (default) or idempotently re-create (`--apply`) the database
 * constraints and indexes that the migrations in `lib/db/migrations` own.
 *
 *   pnpm --filter @workspace/scripts run ensure-constraints          # verify, exit 1 on any gap
 *   pnpm --filter @workspace/scripts run ensure-constraints --apply  # legacy: create what is missing
 *
 * History: drizzle-kit 0.31's `push` cannot detect existing multi-column /
 * NULLS NOT DISTINCT / partial uniques and re-proposes them on every run, so for
 * a long time these objects were kept OUT of the Drizzle schema and created here
 * after each push. Since plan.md §5.4 the schema declares them and
 * `lib/db/migrations` creates them (`0000_initial_schema.sql` on a fresh
 * database, `0001_reconcile_pushed_databases.sql` on one that was pushed), so
 * this script's job is now to PROVE the database matches: CI and post-merge run
 * it read-only right after `pnpm --filter @workspace/db run migrate`. `--apply`
 * keeps the old creation path for an emergency repair; it never drops anything
 * except the superseded constraint names listed in `replaces`.
 *
 * Add new constraints to the Drizzle schema + a generated migration first, then
 * list them here so the verifier covers them.
 */
import { db, closeDb } from "@workspace/db";
import { sql } from "drizzle-orm";

type ConstraintSpec = {
  table: string;
  name: string;
  /** Columns the UNIQUE constraint covers (also used for the dup pre-check). */
  columns: string[];
  /**
   * Treat NULLs as equal (Postgres 15+ `UNIQUE NULLS NOT DISTINCT`). Needed when
   * a nullable column participates in the identity and two NULL rows must still
   * collide (e.g. club_roles where grade is NULL for club-wide roles).
   */
  nullsNotDistinct?: boolean;
  /** Stale constraint names to DROP first (e.g. a previous narrower unique). */
  replaces?: string[];
};

const CONSTRAINTS: ConstraintSpec[] = [
  // Cap numbers are a PER-TENANT sequence: every club's A Grade list starts at
  // #1, so the identity must carry tenant_id. The original
  // `(category, cap_number)` unique made cap #1 global; `replaces` drops it.
  {
    table: "cap_register",
    name: "cap_register_tenant_category_cap_number_unique",
    columns: ["tenant_id", "category", "cap_number"],
    replaces: ["cap_register_category_cap_number_unique"],
  },
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

/** CHECK constraints for the comment-only value sets (plan.md §5.4). */
const CHECKS: { table: string; name: string; sql: string }[] = [
  {
    table: "tenants",
    name: "tenants_plan_check",
    sql: `"plan" IN ('free', 'club', 'pro', 'pilot')`,
  },
  {
    table: "imports",
    name: "imports_kind_check",
    sql: `"kind" IN ('csv', 'match', 'match-batch')`,
  },
  {
    table: "social_drafts",
    name: "social_drafts_status_check",
    sql: `"status" IN ('pending', 'approved', 'dismissed', 'posted')`,
  },
  {
    table: "awards",
    name: "awards_mechanism_check",
    sql: `"mechanism" IN ('voted', 'points', 'manual')`,
  },
  {
    table: "nav_items",
    name: "nav_items_surface_check",
    sql: `"surface" IN ('senior_menu', 'junior_menu', 'junior_quick_links', 'admin_tiles')`,
  },
];

/**
 * Partial unique indexes (a WHERE-clause unique is an INDEX, not a table
 * CONSTRAINT). `drops` removes any superseded constraint/index from an earlier
 * schema so the partial versions can take over.
 */
type PartialIndexSpec = {
  name: string;
  sql: string;
  /** Plain DROP CONSTRAINT and DROP INDEX names to clear first (IF EXISTS). */
  dropConstraints?: string[];
  dropIndexes?: string[];
};

const PARTIAL_INDEXES: PartialIndexSpec[] = [
  // Tenant identity (plan.md §2.7): one tenant per central club, one owner per
  // custom domain.
  {
    name: "tenants_central_club_id_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "tenants_central_club_id_uidx"
          ON "tenants" ("central_club_id")`,
  },
  {
    name: "tenants_custom_domain_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "tenants_custom_domain_uidx"
          ON "tenants" ("custom_domain")
          WHERE "custom_domain" IS NOT NULL`,
  },
  // Admin per-match uploads (source_key IS NULL): one match per identity. Lives
  // only in the reconcile migration + here: Drizzle's index builder cannot
  // express NULLS NOT DISTINCT together with a WHERE clause.
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

/** Non-unique indexes: stats-core performance, FK columns, tenant_id. */
const INDEXES: { name: string; table: string; columns: string[] }[] = [
  { name: "match_player_lines_match_idx", table: "match_player_lines", columns: ["match_id"] },
  { name: "match_player_lines_player_idx", table: "match_player_lines", columns: ["player_id"] },
  { name: "player_grade_stats_player_idx", table: "player_grade_stats", columns: ["player_id"] },
  { name: "player_grade_stats_grade_idx", table: "player_grade_stats", columns: ["grade"] },
  { name: "pgss_player_idx", table: "player_grade_season_stats", columns: ["player_id"] },
  { name: "pgss_grade_season_idx", table: "player_grade_season_stats", columns: ["grade", "season"] },
  { name: "matches_grade_season_idx", table: "matches", columns: ["grade", "season"] },
  { name: "matches_match_date_idx", table: "matches", columns: ["match_date"] },
  { name: "cap_register_player_idx", table: "cap_register", columns: ["player_id"] },
  { name: "premiership_players_premiership_idx", table: "premiership_players", columns: ["premiership_id"] },
  { name: "junior_match_batting_match_idx", table: "junior_match_batting", columns: ["match_id"] },
  { name: "junior_match_bowling_match_idx", table: "junior_match_bowling", columns: ["match_id"] },
  { name: "junior_match_rosters_match_idx", table: "junior_match_rosters", columns: ["match_id"] },
  { name: "player_images_player_idx", table: "player_images", columns: ["player_id"] },
  ...[
    "admin_password_resets",
    "admins",
    "awards",
    "award_winners",
    "cap_register",
    "captains",
    "club_roles",
    "fixtures",
    "centuries",
    "five_wicket_hauls",
    "club_records",
    "honour_board_records",
    "honour_boards",
    "honour_board_overrides",
    "junior_matches",
    "junior_participants",
    "junior_premierships",
    "junior_office_bearers",
    "life_members",
    "nav_items",
    "non_player_people",
    "partnership_records",
    "partnerships_50plus",
    "player_images",
    "premierships",
    "premiership_players",
    "card_themes",
    "card_audio_tracks",
    "card_effect_presets",
    "milestone_events",
    "team_of_decade_boards",
    "team_of_decade_members",
  ].map((table) => ({ name: `${table}_tenant_idx`, table, columns: ["tenant_id"] })),
];

async function constraintExists(table: string, name: string, type: "u" | "c"): Promise<boolean> {
  // Scoped to the exact table: constraint names are not unique across tables.
  const res = await db.execute(
    sql`SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE con.conname = ${name}
          AND con.contype = ${type}
          AND rel.relname = ${table}
          AND ns.nspname = 'public'
        LIMIT 1`,
  );
  return res.rows.length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const res = await db.execute(
    sql`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name} LIMIT 1`,
  );
  return res.rows.length > 0;
}

/** Read-only: list every expected object that is missing. */
async function verify(): Promise<string[]> {
  const missing: string[] = [];
  for (const c of CONSTRAINTS) {
    if (!(await constraintExists(c.table, c.name, "u"))) missing.push(`unique ${c.table}.${c.name}`);
  }
  for (const c of CHECKS) {
    if (!(await constraintExists(c.table, c.name, "c"))) missing.push(`check ${c.table}.${c.name}`);
  }
  for (const ix of PARTIAL_INDEXES) {
    if (!(await indexExists(ix.name))) missing.push(`unique index ${ix.name}`);
  }
  for (const ix of INDEXES) {
    if (!(await indexExists(ix.name))) missing.push(`index ${ix.name} on ${ix.table}`);
  }
  return missing;
}

/** Legacy path: create whatever is missing, idempotently. */
async function apply(): Promise<void> {
  for (const c of CONSTRAINTS) {
    for (const old of c.replaces ?? []) {
      await db.execute(sql.raw(`ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${old}"`));
    }
    if (await constraintExists(c.table, c.name, "u")) {
      console.log(`✓ ${c.name} already present`);
      continue;
    }
    // Fail fast with a clear message instead of an opaque ADD CONSTRAINT error.
    const cols = c.columns.map((col) => `"${col}"`).join(", ");
    const dups = await db.execute(
      sql.raw(
        `SELECT ${cols}, count(*) AS n FROM "${c.table}"
         GROUP BY ${cols} HAVING count(*) > 1 LIMIT 5`,
      ),
    );
    if (dups.rows.length > 0) {
      throw new Error(
        `Cannot add ${c.name}: "${c.table}" has duplicate ${c.columns.join(", ")} rows: ${JSON.stringify(dups.rows)}`,
      );
    }
    const nullsClause = c.nullsNotDistinct ? "NULLS NOT DISTINCT " : "";
    await db.execute(
      sql.raw(`ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" UNIQUE ${nullsClause}(${cols})`),
    );
    console.log(`+ added ${c.name} on ${c.table}`);
  }

  for (const c of CHECKS) {
    if (await constraintExists(c.table, c.name, "c")) {
      console.log(`✓ ${c.name} already present`);
      continue;
    }
    // NOT VALID: legacy rows are not re-checked; new writes are.
    await db.execute(
      sql.raw(`ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" CHECK (${c.sql}) NOT VALID`),
    );
    console.log(`+ added ${c.name} on ${c.table} (NOT VALID)`);
  }

  for (const ix of PARTIAL_INDEXES) {
    for (const con of ix.dropConstraints ?? []) {
      await db.execute(sql.raw(`ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "${con}"`));
    }
    for (const idx of ix.dropIndexes ?? []) {
      await db.execute(sql.raw(`DROP INDEX IF EXISTS "${idx}"`));
    }
    await db.execute(sql.raw(ix.sql));
    console.log(`✓ ${ix.name} ensured`);
  }

  for (const ix of INDEXES) {
    const cols = ix.columns.map((col) => `"${col}"`).join(", ");
    await db.execute(
      sql.raw(`CREATE INDEX IF NOT EXISTS "${ix.name}" ON "${ix.table}" (${cols})`),
    );
    console.log(`✓ ${ix.name} ensured`);
  }
}

async function main(): Promise<void> {
  const applyMode = process.argv.includes("--apply");
  if (applyMode) {
    await apply();
    console.log("ensure-constraints: applied");
  }
  const missing = await verify();
  if (missing.length > 0) {
    console.error(`ensure-constraints: ${missing.length} expected object(s) missing:`);
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      "Run `pnpm --filter @workspace/db run migrate` (or `ensure-constraints --apply` to repair in place).",
    );
    process.exitCode = 1;
    return;
  }
  const total = CONSTRAINTS.length + CHECKS.length + PARTIAL_INDEXES.length + INDEXES.length;
  console.log(`ensure-constraints: verified ${total} constraints/indexes present`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
