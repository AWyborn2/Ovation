-- Hat-tricks (honours kiosk redesign C2): a curated, tenant-scoped honour list.
-- Scorecards don't record the order wickets fell in, so hat-tricks can't be
-- derived; an admin enters them on Admin → Honours → Hat-tricks and the honours
-- display shows them as an achievement list.
-- Additive only: no existing table changes.
--
-- Apply in Production SQL before republishing the release that ships it (the new
-- code reads this table when it builds the honours display).
--
-- Idempotent (production was push-built and baselined at 0000): CREATE ... IF NOT
-- EXISTS, and the foreign key dropped if present and re-added.

CREATE TABLE IF NOT EXISTS "hat_tricks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"player_id" integer,
	"bowler" text NOT NULL,
	"grade" text NOT NULL,
	"season" text,
	"figures" text,
	"opponent" text
);
--> statement-breakpoint
ALTER TABLE "hat_tricks" DROP CONSTRAINT IF EXISTS "hat_tricks_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "hat_tricks" ADD CONSTRAINT "hat_tricks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hat_tricks_tenant_idx" ON "hat_tricks" USING btree ("tenant_id");
