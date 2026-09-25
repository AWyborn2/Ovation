-- Design-pack colour mode per club and pack (packId -> "club" | "pack"; absent =
-- "club"). Idempotent: re-running is harmless.
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "pack_colour_modes" jsonb DEFAULT '{}'::jsonb NOT NULL;
