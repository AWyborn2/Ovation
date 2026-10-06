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
  // Curated keys are unique PER TENANT (migration 0020, hybrid stats plan U8,
  // R17): two clubs may each have a 2024 President or an "a-grade" board.
  // `replaces` drops the global uniques these superseded.
  {
    table: "club_roles",
    name: "club_roles_tenant_season_role_grade_unique",
    columns: ["tenant_id", "season", "role", "grade"],
    nullsNotDistinct: true,
    replaces: ["club_roles_season_role_grade_unique"],
  },
  {
    table: "honour_boards",
    name: "honour_boards_tenant_key_unique",
    columns: ["tenant_id", "key"],
    replaces: ["honour_boards_key_unique"],
  },
  {
    table: "awards",
    name: "awards_tenant_key_unique",
    columns: ["tenant_id", "key"],
    replaces: ["awards_key_unique"],
  },
  {
    table: "team_of_decade_boards",
    name: "team_of_decade_boards_tenant_key_unique",
    columns: ["tenant_id", "key"],
    replaces: ["team_of_decade_boards_key_unique"],
  },
  // Club history store (migration 0021, hybrid stats plan U9): one coverage row
  // per (batch, grade, season) — NULL season = career grain — and one boundary
  // per (tenant, grade) — NULL grade = the club default.
  {
    table: "club_history_batch_coverage",
    name: "club_history_batch_coverage_batch_grade_season_unique",
    columns: ["batch_id", "grade", "season"],
    nullsNotDistinct: true,
  },
  {
    table: "club_history_boundaries",
    name: "club_history_boundaries_tenant_grade_unique",
    columns: ["tenant_id", "grade"],
    nullsNotDistinct: true,
  },
  // History import curated-row tags (migration 0022, U11): a curated row is
  // tagged by at most one batch.
  {
    table: "club_history_curated_rows",
    name: "club_history_curated_rows_target_row_unique",
    columns: ["target", "row_id"],
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
    sql: `"status" IN ('awaiting_review', 'ready', 'dismissed', 'posted')`,
  },
  {
    table: "social_draft_revisions",
    name: "social_draft_revisions_reason_check",
    sql: `"reason" IN ('refresh', 'edit', 'revert')`,
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
  {
    table: "card_photo_rules",
    name: "card_photo_rules_mode_check",
    sql: `"mode" IN ('player', 'random', 'fixed')`,
  },
  // Photo type tags (migration 0016; premiership added in 0027).
  {
    table: "club_photos",
    name: "club_photos_photo_types_check",
    sql: `"photo_types" <@ ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'premiership', 'batting_milestone', 'bowling_milestone']::text[]`,
  },
  {
    table: "card_photo_rules",
    name: "card_photo_rules_photo_type_check",
    sql: `"photo_type" IS NULL OR "photo_type" = ANY (ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'premiership', 'batting_milestone', 'bowling_milestone']::text[])`,
  },
  // Photo match format tag (migration 0027).
  {
    table: "club_photos",
    name: "club_photos_match_format_check",
    sql: `"match_format" IS NULL OR "match_format" = ANY (ARRAY['one_day', 't20', 'two_day']::text[])`,
  },
  // Club history store and corrections journal (migration 0021, U9).
  {
    table: "club_history_rows",
    name: "club_history_rows_grain_check",
    sql: `"grain" IN ('career', 'season', 'match')`,
  },
  {
    table: "club_history_rows",
    name: "club_history_rows_grain_season_check",
    sql: `("grain" = 'career') = ("season" IS NULL)`,
  },
  {
    table: "club_history_rows",
    name: "club_history_rows_match_descriptor_check",
    sql: `"grain" = 'match' OR ("match_date" IS NULL AND "opponent" IS NULL AND "round" IS NULL)`,
  },
  {
    table: "club_history_rows",
    name: "club_history_rows_player_id_check",
    sql: `"player_id" > 0`,
  },
  {
    table: "club_history_curated_rows",
    name: "club_history_curated_rows_target_check",
    sql: `"target" IN ('award', 'award_winner', 'century', 'five_wicket_haul', 'club_record')`,
  },
  {
    table: "club_history_boundaries",
    name: "club_history_boundaries_start_season_check",
    sql: `"start_season" BETWEEN 1800 AND 2200`,
  },
  {
    table: "club_corrections",
    name: "club_corrections_field_check",
    sql: `"field" IN ('runs', 'balls_faced', 'fours', 'sixes', 'not_out', 'balls_bowled', 'maidens', 'runs_conceded', 'wickets', 'wides', 'no_balls', 'catches', 'stumpings', 'run_outs')`,
  },
  {
    table: "club_corrections",
    name: "club_corrections_values_check",
    sql: `"previous_value" >= 0 AND "new_value" >= 0 AND "previous_value" <> "new_value" AND ("field" <> 'not_out' OR ("previous_value" IN (0, 1) AND "new_value" IN (0, 1)))`,
  },
  {
    table: "club_corrections",
    name: "club_corrections_identity_check",
    sql: `btrim("playhq_match_id") <> '' AND btrim("participant_id") <> ''`,
  },
  // Season shirt numbers (migration 0031): digit-string numbers (KTD3) and the
  // source, policy and upload value sets.
  ...["shirt_numbers", "junior_shirt_numbers"].flatMap((table) => [
    {
      table,
      name: `${table}_number_check`,
      sql: `"number" IS NULL OR "number" ~ '^[0-9]{1,3}$'`,
    },
    {
      table,
      name: `${table}_source_check`,
      sql: `"source" IN ('upload', 'registration', 'lineup', 'admin', 'rollover')`,
    },
  ]),
  {
    table: "shirt_number_settings",
    name: "shirt_number_settings_duplicate_policy_check",
    sql: `"duplicate_policy" IN ('warn', 'block')`,
  },
  {
    table: "shirt_number_settings",
    name: "shirt_number_settings_rollover_policy_check",
    sql: `"rollover_policy" IN ('carry', 'blank')`,
  },
  {
    table: "shirt_number_uploads",
    name: "shirt_number_uploads_side_check",
    sql: `"side" IN ('senior', 'junior')`,
  },
  {
    table: "shirt_number_uploads",
    name: "shirt_number_uploads_kind_check",
    sql: `"kind" IN ('numbers', 'registration')`,
  },
  {
    table: "shirt_number_uploads",
    name: "shirt_number_uploads_status_check",
    sql: `"status" IN ('pending', 'committed', 'discarded')`,
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
  // PlayHQ linkage (migration 0003): one tenant per PlayHQ organisation, one
  // fixture per PlayHQ match per tenant (the fixtures-projection upsert key).
  {
    name: "tenants_playhq_org_id_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "tenants_playhq_org_id_uidx"
          ON "tenants" ("playhq_org_id")
          WHERE "playhq_org_id" IS NOT NULL`,
  },
  // Social Studio (migration 0005): one undismissed draft per engine event key.
  {
    name: "social_drafts_source_key_dedupe",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "social_drafts_source_key_dedupe"
          ON "social_drafts" ("tenant_id", "source_key")
          WHERE source_key IS NOT NULL AND status != 'dismissed'`,
  },
  {
    name: "fixtures_tenant_playhq_match_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "fixtures_tenant_playhq_match_uidx"
          ON "fixtures" ("tenant_id", "playhq_match_id")
          WHERE "playhq_match_id" IS NOT NULL`,
  },
  // PlayHQ sync watchdog (migration 0025): at most one open incident per organisation,
  // which is what makes alerts fire once per incident.
  {
    name: "playhq_sync_incidents_open_org_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "playhq_sync_incidents_open_org_uidx"
          ON "playhq_sync_incidents" ("org_id")
          WHERE "resolved_at" IS NULL`,
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
  // One override per (tenant, board, player) (migration 0020, U8): the global
  // (board_key, player_id) index let one club's upsert rewrite another's row.
  {
    name: "hbo_tenant_board_player_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "hbo_tenant_board_player_unique"
          ON "honour_board_overrides" ("tenant_id", "board_key", "player_id")`,
    dropIndexes: ["hbo_board_player_unique"],
  },
  // One ACTIVE club correction per (tenant, match, participant, field)
  // (migration 0021, U9); reversed rows (removed_at set) stay as history.
  {
    name: "club_corrections_active_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "club_corrections_active_uidx"
          ON "club_corrections" ("tenant_id", "playhq_match_id", "participant_id", "field")
          WHERE "removed_at" IS NULL`,
  },
  // Season shirt numbers (migration 0031, KTD4): a person appears at most once
  // per tenant and season. Uniqueness is per person, never per number.
  {
    name: "shirt_numbers_tenant_season_participant_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "shirt_numbers_tenant_season_participant_uidx"
          ON "shirt_numbers" ("tenant_id", "season", "participant_id")
          WHERE "participant_id" IS NOT NULL`,
  },
  {
    name: "shirt_numbers_tenant_season_player_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "shirt_numbers_tenant_season_player_uidx"
          ON "shirt_numbers" ("tenant_id", "season", "player_id")
          WHERE "player_id" IS NOT NULL`,
  },
  {
    name: "junior_shirt_numbers_tenant_season_participant_uidx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "junior_shirt_numbers_tenant_season_participant_uidx"
          ON "junior_shirt_numbers" ("tenant_id", "season", "participant_id")`,
  },
  {
    name: "shirt_number_settings_tenant_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "shirt_number_settings_tenant_unique"
          ON "shirt_number_settings" ("tenant_id")`,
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
  {
    name: "pgss_grade_season_idx",
    table: "player_grade_season_stats",
    columns: ["grade", "season"],
  },
  { name: "matches_grade_season_idx", table: "matches", columns: ["grade", "season"] },
  { name: "matches_match_date_idx", table: "matches", columns: ["match_date"] },
  { name: "cap_register_player_idx", table: "cap_register", columns: ["player_id"] },
  {
    name: "premiership_players_premiership_idx",
    table: "premiership_players",
    columns: ["premiership_id"],
  },
  { name: "junior_match_batting_match_idx", table: "junior_match_batting", columns: ["match_id"] },
  { name: "junior_match_bowling_match_idx", table: "junior_match_bowling", columns: ["match_id"] },
  { name: "junior_match_rosters_match_idx", table: "junior_match_rosters", columns: ["match_id"] },
  { name: "player_images_player_idx", table: "player_images", columns: ["player_id"] },
  { name: "shirt_numbers_player_idx", table: "shirt_numbers", columns: ["player_id"] },
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
    "club_history_batches",
    "club_history_batch_coverage",
    "club_history_rows",
    "club_corrections",
    "club_history_curated_rows",
    "shirt_numbers",
    "junior_shirt_numbers",
    "shirt_number_uploads",
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
    if (!(await constraintExists(c.table, c.name, "u")))
      missing.push(`unique ${c.table}.${c.name}`);
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
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "${ix.name}" ON "${ix.table}" (${cols})`));
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
