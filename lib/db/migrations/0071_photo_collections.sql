-- Photo collections and photo layer sources (template editor: a photo layer
-- chooses where its photo comes from). Additive only:
--   club_photo_collections         named sets of library photos an admin makes
--                                  in the photo library
--   club_photo_collection_photos   the photos in each collection (a photo can be
--                                  in many); cascades from the collection and
--                                  the photo
--   social_drafts.layer_photos     the photos of a draft's sourced photo layers,
--                                  keyed by layer; null = none, so every
--                                  existing draft renders exactly as before
-- Apply BEFORE republishing: the new code reads these tables and this column.
--
-- Idempotent (production was push-built and baselined at 0000): CREATE ... IF NOT
-- EXISTS, ADD COLUMN IF NOT EXISTS, and foreign keys dropped if present and
-- re-added.

CREATE TABLE IF NOT EXISTS "club_photo_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_photo_collection_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"collection_id" integer NOT NULL,
	"photo_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_photo_collections" DROP CONSTRAINT IF EXISTS "club_photo_collections_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "club_photo_collections" ADD CONSTRAINT "club_photo_collections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_photo_collection_photos" DROP CONSTRAINT IF EXISTS "club_photo_collection_photos_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "club_photo_collection_photos" ADD CONSTRAINT "club_photo_collection_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_photo_collection_photos" DROP CONSTRAINT IF EXISTS "club_photo_collection_photos_collection_id_club_photo_collections_id_fk";--> statement-breakpoint
ALTER TABLE "club_photo_collection_photos" ADD CONSTRAINT "club_photo_collection_photos_collection_id_club_photo_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."club_photo_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_photo_collection_photos" DROP CONSTRAINT IF EXISTS "club_photo_collection_photos_photo_id_club_photos_id_fk";--> statement-breakpoint
ALTER TABLE "club_photo_collection_photos" ADD CONSTRAINT "club_photo_collection_photos_photo_id_club_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."club_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_photo_collections_tenant_idx" ON "club_photo_collections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_photo_collection_photos_unique" ON "club_photo_collection_photos" USING btree ("collection_id","photo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_photo_collection_photos_tenant_photo_idx" ON "club_photo_collection_photos" USING btree ("tenant_id","photo_id");--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layer_photos" jsonb;
