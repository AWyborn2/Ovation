-- Selection sides of 12 where all 12 play (ADR-009 amendment, 20 Oct 2026). Additive only; the
-- defaults leave every club exactly as today (a side of 12 is the XI plus a 12th):
--   availability_settings.all_play_grades  grades whose side of 12 is numbered 1–12, no "12th"
--   selections.all_play                    fixed from the grade when a draft is created
-- Apply BEFORE republishing: the new code selects these columns. Idempotent.
ALTER TABLE "availability_settings" ADD COLUMN IF NOT EXISTS "all_play_grades" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "all_play" boolean DEFAULT false NOT NULL;
