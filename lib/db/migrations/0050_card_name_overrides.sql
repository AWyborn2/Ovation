-- Club-set short names for social cards (ADR-010 P1; .10x/decisions/architect/match-day-carousel-content.md).
-- Additive only; with no rows every card uses the automatic short name, as the code does today:
--   team_name_overrides          a short name per central club, optionally for one app grade
--                                (grade_key NULL = every grade); UNIQUE NULLS NOT DISTINCT
--   competition_label_overrides  a card label per app grade ("Female A Grade" -> "Women's A")
-- Tenant-curated content: keyed on the central club id but never written to `central`.
-- Apply BEFORE republishing: the new code selects these tables.
--
-- Idempotent (production was push-built and baselined at 0000): CREATE TABLE / INDEX IF NOT
-- EXISTS, and each constraint is dropped if present and re-added.

CREATE TABLE IF NOT EXISTS "competition_label_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade_key" text NOT NULL,
	"label" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_name_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"central_club_id" integer NOT NULL,
	"grade_key" text,
	"short_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_label_overrides" DROP CONSTRAINT IF EXISTS "competition_label_overrides_tenant_grade_unique";--> statement-breakpoint
ALTER TABLE "competition_label_overrides" ADD CONSTRAINT "competition_label_overrides_tenant_grade_unique" UNIQUE("tenant_id","grade_key");--> statement-breakpoint
ALTER TABLE "team_name_overrides" DROP CONSTRAINT IF EXISTS "team_name_overrides_tenant_club_grade_unique";--> statement-breakpoint
ALTER TABLE "team_name_overrides" ADD CONSTRAINT "team_name_overrides_tenant_club_grade_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","central_club_id","grade_key");--> statement-breakpoint
ALTER TABLE "competition_label_overrides" DROP CONSTRAINT IF EXISTS "competition_label_overrides_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "competition_label_overrides" ADD CONSTRAINT "competition_label_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_name_overrides" DROP CONSTRAINT IF EXISTS "team_name_overrides_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "team_name_overrides" ADD CONSTRAINT "team_name_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_name_overrides_tenant_idx" ON "team_name_overrides" USING btree ("tenant_id");
