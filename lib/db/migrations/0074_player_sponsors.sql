-- Player sponsors: the senior players a sponsor backs (sponsor_players), and the one player a
-- player-centred draft is about (social_drafts.subject_player_id). On that player's cards their
-- sponsors replace the club strip; sponsors are looked up when the card is drawn.
-- Additive only: one new table and one nullable column. Apply BEFORE republishing: every
-- sponsor read and the drafts queue read them.
--
-- Idempotent (production was push-built and baselined at 0000): IF NOT EXISTS throughout,
-- and each constraint is dropped if present before it is added.

CREATE TABLE IF NOT EXISTS "sponsor_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"sponsor_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "subject_player_id" integer;--> statement-breakpoint
ALTER TABLE "sponsor_players" DROP CONSTRAINT IF EXISTS "sponsor_players_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "sponsor_players" ADD CONSTRAINT "sponsor_players_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_players" DROP CONSTRAINT IF EXISTS "sponsor_players_sponsor_id_sponsors_id_fk";--> statement-breakpoint
ALTER TABLE "sponsor_players" ADD CONSTRAINT "sponsor_players_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_players_sponsor_player_unique" ON "sponsor_players" USING btree ("sponsor_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsor_players_tenant_player_idx" ON "sponsor_players" USING btree ("tenant_id","player_id");
