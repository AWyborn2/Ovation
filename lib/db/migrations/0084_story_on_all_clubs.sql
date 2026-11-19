-- Portrait and Story sizes (round 9, D17): Story on for every club. New designs
-- come in Portrait and Story, and Create offers only the sizes a club has on, so
-- a club with Story off couldn't make the Story card it was asked for, and a
-- Story card's post pack held only Portrait. Auto-post stays feed only (D6):
-- this never makes a club post Stories on its own.
--
-- Each statement runs on its own: paste them into the Production SQL runner
-- one at a time, in order (it runs only the first statement of a paste). Both
-- are safe to run again: the first changes nothing once every club has Story
-- on, the second only sets the default it already has.
--
-- Read-only check, before and after (expect story_off = 0 after):
--   select count(*) filter (where not size_story) as story_off from social_settings;

-- 1. Story on for every club that has it off.
UPDATE "social_settings" SET "size_story" = true WHERE "size_story" = false;--> statement-breakpoint
-- 2. New clubs start with Story on (the column's default already, made sure of here).
ALTER TABLE "social_settings" ALTER COLUMN "size_story" SET DEFAULT true;
