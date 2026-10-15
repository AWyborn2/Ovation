-- Junior sides in the Selection Hub: a selection belongs to either a senior fixture or a
-- junior fixture (from the junior PlayHQ sync), and a finalised junior side publishes into
-- junior_team_lists with source 'selection'. Additive; existing rows all keep fixture_id.
-- Idempotent (production was push-built and baselined at 0000).
ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "junior_fixture_id" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "selections" ADD CONSTRAINT "selections_junior_fixture_id_junior_fixtures_id_fk"
    FOREIGN KEY ("junior_fixture_id") REFERENCES "public"."junior_fixtures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "selections" ALTER COLUMN "fixture_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "selections_junior_fixture_uidx" ON "selections" USING btree ("junior_fixture_id") WHERE "junior_fixture_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "selections" DROP CONSTRAINT IF EXISTS "selections_one_fixture_check";--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_one_fixture_check" CHECK (("fixture_id" IS NULL) <> ("junior_fixture_id" IS NULL));--> statement-breakpoint
ALTER TABLE "junior_team_lists" DROP CONSTRAINT IF EXISTS "junior_team_lists_source_check";--> statement-breakpoint
ALTER TABLE "junior_team_lists" ADD CONSTRAINT "junior_team_lists_source_check" CHECK ("source" IN ('playhq', 'admin', 'selection'));
