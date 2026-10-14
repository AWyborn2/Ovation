-- Printable team sheet (Selection Hub): PlayHQ's match details copied onto each
-- projected fixture (format, competition, the association that runs the grade, both
-- team names) and the overs per innings remembered per grade. All nullable or
-- defaulted; nothing existing is touched. Idempotent (production was push-built and
-- baselined at 0000).
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "match_format" text;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "competition_name" text;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "association_org_id" text;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "association_name" text;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "home_team_name" text;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "away_team_name" text;--> statement-breakpoint
ALTER TABLE "availability_settings" ADD COLUMN IF NOT EXISTS "team_sheet_overs" jsonb DEFAULT '{}'::jsonb NOT NULL;
