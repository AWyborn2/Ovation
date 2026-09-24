ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "central_sweep_watermark" integer;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "last_sweep_at" timestamp with time zone;
