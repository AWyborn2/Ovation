-- Selection side size + overseas players (ADR-009; .10x/decisions/architect/selection-side-size.md).
-- Additive only; the defaults leave every club exactly as today (every side 12, no overseas):
--   availability_settings.side_sizes     players per side by app grade, 12–14 ('{}' = all 12)
--   availability_settings.overseas_caps  most overseas players per side by app grade, 0–14
--                                        ('{}' = no caps)
--   selections.side_size                 the size a draft was created at; NULL reads as 12
--   squad_member_seasons                 per-season facts about a squad member: `overseas` for
--                                        one season, unique per (member, season), no carry-over
-- Apply BEFORE republishing: the new code selects these columns and this table.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS,
-- CREATE TABLE / INDEX IF NOT EXISTS, and each constraint is dropped if present and re-added.

ALTER TABLE "availability_settings" ADD COLUMN IF NOT EXISTS "side_sizes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_settings" ADD COLUMN IF NOT EXISTS "overseas_caps" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "side_size" smallint;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "squad_member_seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"member_id" integer NOT NULL,
	"season" integer NOT NULL,
	"overseas" boolean DEFAULT false NOT NULL,
	"set_by_admin_id" integer,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "squad_member_seasons" DROP CONSTRAINT IF EXISTS "squad_member_seasons_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "squad_member_seasons" ADD CONSTRAINT "squad_member_seasons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_member_seasons" DROP CONSTRAINT IF EXISTS "squad_member_seasons_member_id_squad_members_id_fk";--> statement-breakpoint
ALTER TABLE "squad_member_seasons" ADD CONSTRAINT "squad_member_seasons_member_id_squad_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."squad_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "squad_member_seasons_member_season_uidx" ON "squad_member_seasons" USING btree ("member_id","season");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "squad_member_seasons_tenant_season_idx" ON "squad_member_seasons" USING btree ("tenant_id","season");
