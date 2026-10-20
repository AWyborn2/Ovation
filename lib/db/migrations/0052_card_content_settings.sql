-- What content-built social cards show (ADR-010 P2; .10x/decisions/architect/match-day-carousel-content.md).
-- Additive only; the defaults leave every club exactly as today:
--   social_settings.card_content    per card kind: { preset, fields, juniorConsolidateByDay };
--                                   default Standard (the cards as they were), junior consolidation on
--   social_settings.livestream_url  the club's livestream link (match day title pages, from P5)
-- Apply BEFORE republishing: the new code selects these columns. Idempotent.
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "card_content" jsonb DEFAULT '{"matchDay":{"preset":"standard","fields":{},"juniorConsolidateByDay":true}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "livestream_url" text;
