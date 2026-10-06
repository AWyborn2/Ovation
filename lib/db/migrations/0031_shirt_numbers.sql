-- Season shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, U1;
-- R1-R3, R16, R17, KTD1-KTD5, KTD8). Four NEW tenant-scoped tables and nothing else:
--   shirt_numbers          senior per-season register (player_id is a tenant-space id, no FK)
--   junior_shirt_numbers   juniors per-season register, keyed on the PlayHQ participant only
--   shirt_number_settings  one row per tenant: feature switch, duplicate and rollover policy
--   shirt_number_uploads   tenant-scoped upload previews awaiting review / commit
-- No existing table, column or row is touched, so this can apply before or after the code
-- that reads it ships.
--
-- Idempotent (production was push-built and baselined at 0000): tables and indexes use
-- IF NOT EXISTS, and every FK is added in a DO block that ignores an existing one.

CREATE TABLE IF NOT EXISTS "junior_shirt_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"season" integer NOT NULL,
	"participant_id" text NOT NULL,
	"name" text NOT NULL,
	"number" text,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "junior_shirt_numbers_number_check" CHECK ("number" IS NULL OR "number" ~ '^[0-9]{1,3}$'),
	CONSTRAINT "junior_shirt_numbers_source_check" CHECK ("source" IN ('upload', 'registration', 'lineup', 'admin', 'rollover'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shirt_number_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"duplicate_policy" text DEFAULT 'warn' NOT NULL,
	"rollover_policy" text DEFAULT 'carry' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shirt_number_settings_duplicate_policy_check" CHECK ("duplicate_policy" IN ('warn', 'block')),
	CONSTRAINT "shirt_number_settings_rollover_policy_check" CHECK ("rollover_policy" IN ('carry', 'blank'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shirt_number_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"side" text NOT NULL,
	"kind" text NOT NULL,
	"season" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shirt_number_uploads_side_check" CHECK ("side" IN ('senior', 'junior')),
	CONSTRAINT "shirt_number_uploads_kind_check" CHECK ("kind" IN ('numbers', 'registration')),
	CONSTRAINT "shirt_number_uploads_status_check" CHECK ("status" IN ('pending', 'committed', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shirt_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"season" integer NOT NULL,
	"name" text NOT NULL,
	"participant_id" text,
	"player_id" integer,
	"number" text,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shirt_numbers_number_check" CHECK ("number" IS NULL OR "number" ~ '^[0-9]{1,3}$'),
	CONSTRAINT "shirt_numbers_source_check" CHECK ("source" IN ('upload', 'registration', 'lineup', 'admin', 'rollover'))
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "junior_shirt_numbers" ADD CONSTRAINT "junior_shirt_numbers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "shirt_number_settings" ADD CONSTRAINT "shirt_number_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "shirt_number_uploads" ADD CONSTRAINT "shirt_number_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "shirt_numbers" ADD CONSTRAINT "shirt_numbers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_shirt_numbers_tenant_idx" ON "junior_shirt_numbers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "junior_shirt_numbers_tenant_season_participant_uidx" ON "junior_shirt_numbers" USING btree ("tenant_id","season","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shirt_number_settings_tenant_unique" ON "shirt_number_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shirt_number_uploads_tenant_idx" ON "shirt_number_uploads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shirt_numbers_tenant_idx" ON "shirt_numbers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shirt_numbers_player_idx" ON "shirt_numbers" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shirt_numbers_tenant_season_participant_uidx" ON "shirt_numbers" USING btree ("tenant_id","season","participant_id") WHERE "participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shirt_numbers_tenant_season_player_uidx" ON "shirt_numbers" USING btree ("tenant_id","season","player_id") WHERE "player_id" IS NOT NULL;