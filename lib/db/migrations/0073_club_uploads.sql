-- Studio editor Uploads (club_uploads): a club's logos, artwork and SVG shapes, kept apart
-- from the photo library, each with a name to search by. Deleting hides an upload and keeps
-- the file, so cards that use it still draw.
-- Additive only: one new table. Apply BEFORE republishing: the new Uploads panel reads it.
--
-- Idempotent (production was push-built and baselined at 0000): IF NOT EXISTS throughout,
-- and each constraint is dropped if present before it is added.

CREATE TABLE IF NOT EXISTS "club_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"object_path" text,
	"thumb_path" text,
	"content_type" text,
	"svg" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "club_uploads_kind_check" CHECK ("kind" IN ('image', 'svg')),
	CONSTRAINT "club_uploads_content_check" CHECK (("kind" = 'image' AND "object_path" IS NOT NULL) OR ("kind" = 'svg' AND "svg" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "club_uploads" DROP CONSTRAINT IF EXISTS "club_uploads_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "club_uploads" ADD CONSTRAINT "club_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_uploads_tenant_created_idx" ON "club_uploads" USING btree ("tenant_id","created_at");
