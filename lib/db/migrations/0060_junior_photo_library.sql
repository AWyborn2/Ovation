-- Junior photo library (.10x/decisions/architect/kiosk-photo-rotation.md, section A).
-- Additive only:
--   junior_photos.season / grade / photo_types / match_format / taken_at
--                                  the senior library's folder fields (same photo type and
--                                  match format check sets as club_photos)
--   junior_photos.participant_id   becomes nullable: a library upload may tag several
--                                  children or none; the column is LEGACY (it keeps
--                                  is_default per player) and is dropped in a later migration
--   junior_photo_participants      who a photo shows, one row per tagged child; backfilled
--                                  with one row per existing photo from participant_id, so
--                                  every existing junior card photo keeps working
-- The consent rule reads junior_photo_participants: a photo is displayable only with at
-- least one tag and every tagged child allowed. Apply BEFORE republishing: the new code
-- reads the new table and columns (without the backfill, existing photos would stop
-- showing, which fails closed but is still a regression).
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN / CREATE TABLE /
-- INDEX IF NOT EXISTS, constraints dropped if present and re-added, the backfill skips rows
-- already there.

ALTER TABLE "junior_photos" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "season" integer;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "grade" text;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "photo_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "match_format" text;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "junior_photos" DROP CONSTRAINT IF EXISTS "junior_photos_photo_types_check";--> statement-breakpoint
ALTER TABLE "junior_photos" ADD CONSTRAINT "junior_photos_photo_types_check" CHECK ("photo_types" <@ ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'premiership', 'batting_milestone', 'bowling_milestone']::text[]);--> statement-breakpoint
ALTER TABLE "junior_photos" DROP CONSTRAINT IF EXISTS "junior_photos_match_format_check";--> statement-breakpoint
ALTER TABLE "junior_photos" ADD CONSTRAINT "junior_photos_match_format_check" CHECK ("match_format" IS NULL OR "match_format" = ANY (ARRAY['one_day', 't20', 'two_day']::text[]));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_photos_tenant_created_idx" ON "junior_photos" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_photo_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"photo_id" integer NOT NULL,
	"participant_id" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "junior_photo_participants" DROP CONSTRAINT IF EXISTS "junior_photo_participants_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "junior_photo_participants" ADD CONSTRAINT "junior_photo_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_photo_participants" DROP CONSTRAINT IF EXISTS "junior_photo_participants_photo_id_junior_photos_id_fk";--> statement-breakpoint
ALTER TABLE "junior_photo_participants" ADD CONSTRAINT "junior_photo_participants_photo_id_junior_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."junior_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "junior_photo_participants_photo_participant_unique" ON "junior_photo_participants" USING btree ("photo_id","participant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_photo_participants_tenant_participant_idx" ON "junior_photo_participants" USING btree ("tenant_id","participant_id");--> statement-breakpoint
INSERT INTO "junior_photo_participants" ("tenant_id", "photo_id", "participant_id")
SELECT "tenant_id", "id", "participant_id" FROM "junior_photos" WHERE "participant_id" IS NOT NULL
ON CONFLICT ("photo_id", "participant_id") DO NOTHING;
