-- Cap confirmation step (Ash, 5 Oct 2026): caps issued automatically (debut-caps / cap-sync) start
-- "pending" until a club admin confirms, reorders or declines them. ONE new column; existing caps
-- stay "confirmed". Idempotent: IF NOT EXISTS.
ALTER TABLE "cap_register" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'confirmed' NOT NULL;
