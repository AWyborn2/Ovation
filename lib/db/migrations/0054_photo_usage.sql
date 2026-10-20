-- When each library photo went out on a post (ADR-010 P4; .10x/decisions/architect/match-day-carousel-content.md).
-- Additive only; with no rows every photo counts as never used, so the first automatic picks are
-- simply the newest photos of each pool:
--   photo_usage  one row per library photo per posted draft (tenant_id, photo_id, used_at, draft_id);
--                written when a draft is posted, read by pickPhoto (least recently used first)
-- Tenant-curated. A photo deleted from the library takes its rows; a deleted draft leaves them
-- (draft_id NULL). UNIQUE (tenant_id, photo_id, draft_id): posting a draft twice records it once.
-- Numbered 0054: 0053 is reserved for the sponsors page (P6).
-- Apply BEFORE republishing: the new code reads and writes this table.
--
-- Idempotent (production was push-built and baselined at 0000): CREATE TABLE / INDEX IF NOT
-- EXISTS, and each constraint is dropped if present and re-added.

CREATE TABLE IF NOT EXISTS "photo_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"photo_id" integer NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draft_id" integer
);
--> statement-breakpoint
ALTER TABLE "photo_usage" DROP CONSTRAINT IF EXISTS "photo_usage_tenant_photo_draft_unique";--> statement-breakpoint
ALTER TABLE "photo_usage" ADD CONSTRAINT "photo_usage_tenant_photo_draft_unique" UNIQUE("tenant_id","photo_id","draft_id");--> statement-breakpoint
ALTER TABLE "photo_usage" DROP CONSTRAINT IF EXISTS "photo_usage_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "photo_usage" ADD CONSTRAINT "photo_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_usage" DROP CONSTRAINT IF EXISTS "photo_usage_photo_id_club_photos_id_fk";--> statement-breakpoint
ALTER TABLE "photo_usage" ADD CONSTRAINT "photo_usage_photo_id_club_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."club_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_usage" DROP CONSTRAINT IF EXISTS "photo_usage_draft_id_social_drafts_id_fk";--> statement-breakpoint
ALTER TABLE "photo_usage" ADD CONSTRAINT "photo_usage_draft_id_social_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."social_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_usage_tenant_photo_used_idx" ON "photo_usage" USING btree ("tenant_id","photo_id","used_at");
