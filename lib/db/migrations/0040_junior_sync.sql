-- Junior PlayHQ sync (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md, U1 + U2;
-- KTD1, KTD2, KTD6, KTD8, KTD9, KTD12, KTD14).
--   U1 tenants: junior_sync_enabled (platform-admin switch, default off) and
--      playhq_junior_org_id (optional junior PlayHQ organisation, unique when set).
--   U2 juniors: junior_sync_id_seq (sync-made ids from 200,000,000), new tables
--      junior_fixtures + junior_team_lists, junior_participants keyed
--      (tenant_id, participant_id) with privacy_override columns, display-settings
--      name_style + team_publishing, and a partial unique (tenant_id, playhq_match_id)
--      on junior_matches.
-- No existing row changes value: new columns take defaults (junior sync stays OFF for every
-- tenant), and the participants key change only widens the key (the old key was stricter, so
-- no existing row can collide).
--
-- Participant id case: NOT rewritten. The ids are referenced, without foreign keys, from the
-- junior line tables, premiership players, office bearers, shirt numbers, merges and stat
-- corrections, and two ids differing only in case would collide under the new key. PlayHQ
-- emits lowercase GUIDs, so this migration only REPORTS (RAISE NOTICE) any non-lowercase id
-- for a follow-up rather than risk a half-consistent rewrite.
--
-- Idempotent (production was push-built and baselined at 0000): IF NOT EXISTS everywhere,
-- FKs and CHECKs in DO blocks that ignore an existing one, the key change and the
-- junior_matches index guarded so a re-run is a no-op and the migration never fails half-way.

CREATE SEQUENCE IF NOT EXISTS "public"."junior_sync_id_seq" INCREMENT BY 1 MINVALUE 200000000 MAXVALUE 9223372036854775807 START WITH 200000000 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_fixtures" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"playhq_match_id" text NOT NULL,
	"season_start_year" integer NOT NULL,
	"age_group" text,
	"grade" text,
	"team_name" text,
	"opponent_name" text,
	"venue" text,
	"start_at" timestamp with time zone,
	"is_home" boolean,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_team_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"junior_fixture_id" integer NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "junior_team_lists_source_check" CHECK ("source" IN ('playhq', 'admin'))
);
--> statement-breakpoint
-- Report (never rewrite) participant ids that are not lowercase; see the header.
DO $$
DECLARE
	n integer;
BEGIN
	SELECT count(*) INTO n FROM "junior_participants" WHERE "participant_id" <> lower("participant_id");
	IF n > 0 THEN
		RAISE NOTICE 'junior_participants: % participant id(s) are not lowercase and were left unchanged; lowercase them consistently across every junior table before the junior sync runs', n;
	END IF;
END $$;--> statement-breakpoint
-- Participants key: participant_id -> (tenant_id, participant_id), in one statement. Finds the
-- current primary key by catalogue lookup (the push-built name is not guaranteed) and is a
-- no-op once the new key exists.
DO $$
DECLARE
	pk_name text;
BEGIN
	SELECT conname INTO pk_name
	FROM pg_constraint
	WHERE conrelid = 'public.junior_participants'::regclass AND contype = 'p';
	IF pk_name = 'junior_participants_tenant_participant_pk' THEN
		RETURN;
	END IF;
	IF pk_name IS NOT NULL THEN
		EXECUTE format('ALTER TABLE "junior_participants" DROP CONSTRAINT %I', pk_name);
	END IF;
	ALTER TABLE "junior_participants" ADD CONSTRAINT "junior_participants_tenant_participant_pk" PRIMARY KEY ("tenant_id", "participant_id");
END $$;--> statement-breakpoint
ALTER TABLE "junior_match_display_settings" ADD COLUMN IF NOT EXISTS "name_style" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_match_display_settings" ADD COLUMN IF NOT EXISTS "team_publishing" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_participants" ADD COLUMN IF NOT EXISTS "privacy_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_participants" ADD COLUMN IF NOT EXISTS "privacy_override_by" text;--> statement-breakpoint
ALTER TABLE "junior_participants" ADD COLUMN IF NOT EXISTS "privacy_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "junior_sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playhq_junior_org_id" text;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "junior_fixtures" ADD CONSTRAINT "junior_fixtures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "junior_team_lists" ADD CONSTRAINT "junior_team_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "junior_team_lists" ADD CONSTRAINT "junior_team_lists_junior_fixture_id_junior_fixtures_id_fk" FOREIGN KEY ("junior_fixture_id") REFERENCES "public"."junior_fixtures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_fixtures_tenant_idx" ON "junior_fixtures" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_fixtures_tenant_start_idx" ON "junior_fixtures" USING btree ("tenant_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "junior_fixtures_tenant_playhq_match_uidx" ON "junior_fixtures" USING btree ("tenant_id","playhq_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "junior_team_lists_tenant_fixture_uidx" ON "junior_team_lists" USING btree ("tenant_id","junior_fixture_id");--> statement-breakpoint
-- One junior match per (tenant, PlayHQ match): built only when the existing rows allow it.
-- With duplicates it reports them and skips (ensure-constraints then flags the missing index)
-- instead of failing the migration half-way.
DO $$
DECLARE
	dupes integer;
BEGIN
	IF to_regclass('public.junior_matches_tenant_playhq_match_uidx') IS NOT NULL THEN
		RETURN;
	END IF;
	SELECT count(*) INTO dupes FROM (
		SELECT 1 FROM "junior_matches"
		WHERE "playhq_match_id" IS NOT NULL
		GROUP BY "tenant_id", "playhq_match_id"
		HAVING count(*) > 1
	) d;
	IF dupes > 0 THEN
		RAISE NOTICE 'junior_matches: % (tenant_id, playhq_match_id) value(s) are duplicated; junior_matches_tenant_playhq_match_uidx NOT created. Resolve the duplicates, then re-run this migration''s statement', dupes;
		RETURN;
	END IF;
	CREATE UNIQUE INDEX "junior_matches_tenant_playhq_match_uidx" ON "junior_matches" USING btree ("tenant_id","playhq_match_id") WHERE "playhq_match_id" IS NOT NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_playhq_junior_org_id_uidx" ON "tenants" USING btree ("playhq_junior_org_id") WHERE "playhq_junior_org_id" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "junior_match_display_settings" ADD CONSTRAINT "junior_match_display_settings_name_style_check" CHECK ("name_style" IN ('full', 'first_initial', 'first'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
