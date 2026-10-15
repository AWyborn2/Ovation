-- Junior shirt numbers held by PlayHQ Profile ID (junior shirt-number held rows).
-- One new column on the juniors register, nothing else:
--   junior_shirt_numbers.held  true while the entry waits for its player to arrive from PlayHQ
--                              under a name matching the club's sheet (or an admin to confirm).
--                              Held entries are never shown on public pages or cards.
-- Every existing row takes the default (false), so no number that shows today stops showing.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "junior_shirt_numbers" ADD COLUMN IF NOT EXISTS "held" boolean DEFAULT false NOT NULL;
