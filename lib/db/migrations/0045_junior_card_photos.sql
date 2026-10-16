-- Junior card photos (docs/plans/2026-10-16-001-feat-junior-card-photos-plan.md, U1; ADR-007).
-- Additive only:
--   junior_participants.photo_withheld / _by / _at  an admin's record that a family has NOT
--                                                    consented to photos; off by default because
--                                                    the club's registration form carries consent
--   junior_photos                                     the club's uploaded photos of a junior player,
--                                                    keyed by PlayHQ participant id; one default
-- No existing row changes meaning: no junior has a photo until an admin uploads one, and
-- every card keeps rendering without a photo until then. Apply BEFORE republishing: the
-- new code selects these columns and this table.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS,
-- CREATE TABLE / INDEX IF NOT EXISTS, and the foreign key is dropped if present and re-added.

ALTER TABLE "junior_participants" ADD COLUMN IF NOT EXISTS "photo_withheld" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_participants" ADD COLUMN IF NOT EXISTS "photo_withheld_by" text;--> statement-breakpoint
ALTER TABLE "junior_participants" ADD COLUMN IF NOT EXISTS "photo_withheld_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"participant_id" text NOT NULL,
	"object_path" text NOT NULL,
	"thumb_path" text,
	"width" integer,
	"height" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "junior_photos" DROP CONSTRAINT IF EXISTS "junior_photos_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "junior_photos" ADD CONSTRAINT "junior_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_photos_tenant_participant_idx" ON "junior_photos" USING btree ("tenant_id","participant_id");
