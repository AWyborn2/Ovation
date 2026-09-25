ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "photo_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_photo_rules" ADD COLUMN IF NOT EXISTS "photo_type" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photos" ADD CONSTRAINT "club_photos_photo_types_check" CHECK ("photo_types" <@ ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'batting_milestone', 'bowling_milestone']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_photo_rules" ADD CONSTRAINT "card_photo_rules_photo_type_check" CHECK ("photo_type" IS NULL OR "photo_type" = ANY (ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'batting_milestone', 'bowling_milestone']::text[]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
