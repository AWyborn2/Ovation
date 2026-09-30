-- Club history, boundary and corrections store (hybrid stats plan U9; R12,
-- R13, R15, KTD3-KTD5, KTD7). Five NEW tenant-scoped tables and nothing else:
--   club_history_batches         one import of club stats history (undo = delete)
--   club_history_batch_coverage  the (grade, season) pairs a batch covers
--   club_history_rows            career / season / match stat lines (tenant player ids)
--   club_history_boundaries      first season central supplies, per club and per grade
--   club_corrections             journal of corrections to central figures
-- No existing table, column or row is touched, so this can apply before or
-- after the code that reads it ships. Nothing reads these tables yet (U10).
--
-- Idempotent (production was push-built and baselined at 0000): tables use
-- IF NOT EXISTS, every constraint is added in a DO block that ignores an
-- existing one, and indexes use IF NOT EXISTS. Re-running the file is a no-op.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "club_history_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_history_batch_coverage" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"batch_id" integer NOT NULL,
	"grade" text NOT NULL,
	"season" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_history_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"batch_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"grade" text NOT NULL,
	"season" integer,
	"grain" text NOT NULL,
	"match_date" date,
	"opponent" text,
	"round" text,
	"games" integer,
	"innings" integer,
	"not_outs" integer,
	"runs" integer,
	"high_score" integer,
	"high_score_not_out" boolean,
	"balls_faced" integer,
	"fours" integer,
	"sixes" integer,
	"fifties" integer,
	"hundreds" integer,
	"balls_bowled" integer,
	"maidens" integer,
	"runs_conceded" integer,
	"wickets" integer,
	"best_bowling_wickets" integer,
	"best_bowling_runs" integer,
	"five_wickets" integer,
	"catches" integer,
	"stumpings" integer,
	"run_outs" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_history_boundaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade" text,
	"start_season" integer NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"playhq_match_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" integer NOT NULL,
	"new_value" integer NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" text
);
--> statement-breakpoint

-- ── Unique and check constraints ────────────────────────────────────────────
-- A repeated ADD CONSTRAINT raises duplicate_object (CHECK) or duplicate_table
-- (UNIQUE, whose backing index already exists); both mean "already there".
DO $$ BEGIN
 ALTER TABLE "club_history_batch_coverage" ADD CONSTRAINT "club_history_batch_coverage_batch_grade_season_unique" UNIQUE NULLS NOT DISTINCT("batch_id","grade","season");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_rows" ADD CONSTRAINT "club_history_rows_grain_check" CHECK ("grain" IN ('career', 'season', 'match'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_rows" ADD CONSTRAINT "club_history_rows_grain_season_check" CHECK (("grain" = 'career') = ("season" IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_rows" ADD CONSTRAINT "club_history_rows_match_descriptor_check" CHECK ("grain" = 'match' OR ("match_date" IS NULL AND "opponent" IS NULL AND "round" IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_rows" ADD CONSTRAINT "club_history_rows_player_id_check" CHECK ("player_id" > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_boundaries" ADD CONSTRAINT "club_history_boundaries_tenant_grade_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","grade");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_boundaries" ADD CONSTRAINT "club_history_boundaries_start_season_check" CHECK ("start_season" BETWEEN 1800 AND 2200);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_corrections" ADD CONSTRAINT "club_corrections_field_check" CHECK ("field" IN ('runs', 'balls_faced', 'fours', 'sixes', 'not_out', 'balls_bowled', 'maidens', 'runs_conceded', 'wickets', 'wides', 'no_balls', 'catches', 'stumpings', 'run_outs'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_corrections" ADD CONSTRAINT "club_corrections_values_check" CHECK ("previous_value" >= 0 AND "new_value" >= 0 AND "previous_value" <> "new_value" AND ("field" <> 'not_out' OR ("previous_value" IN (0, 1) AND "new_value" IN (0, 1))));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_corrections" ADD CONSTRAINT "club_corrections_identity_check" CHECK (btrim("playhq_match_id") <> '' AND btrim("participant_id") <> '');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint

-- ── Foreign keys ────────────────────────────────────────────────────────────
-- Rows and coverage cascade from their batch, so deleting a batch undoes it.
-- player_id deliberately has NO FK: it is a tenant-space id (KTD3), not a
-- native players.id.
DO $$ BEGIN
 ALTER TABLE "club_history_batches" ADD CONSTRAINT "club_history_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_batch_coverage" ADD CONSTRAINT "club_history_batch_coverage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_batch_coverage" ADD CONSTRAINT "club_history_batch_coverage_batch_id_club_history_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."club_history_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_rows" ADD CONSTRAINT "club_history_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_rows" ADD CONSTRAINT "club_history_rows_batch_id_club_history_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."club_history_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_boundaries" ADD CONSTRAINT "club_history_boundaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_corrections" ADD CONSTRAINT "club_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "club_history_batches_tenant_idx" ON "club_history_batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_batch_coverage_tenant_idx" ON "club_history_batch_coverage" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_batch_coverage_batch_idx" ON "club_history_batch_coverage" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_rows_tenant_idx" ON "club_history_rows" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_rows_batch_idx" ON "club_history_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_rows_tenant_player_idx" ON "club_history_rows" USING btree ("tenant_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_rows_tenant_grade_season_idx" ON "club_history_rows" USING btree ("tenant_id","grade","season");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_corrections_tenant_idx" ON "club_corrections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_corrections_tenant_match_idx" ON "club_corrections" USING btree ("tenant_id","playhq_match_id");--> statement-breakpoint
-- At most one ACTIVE correction per (tenant, match, participant, field).
CREATE UNIQUE INDEX IF NOT EXISTS "club_corrections_active_uidx" ON "club_corrections" USING btree ("tenant_id","playhq_match_id","participant_id","field") WHERE "removed_at" IS NULL;
