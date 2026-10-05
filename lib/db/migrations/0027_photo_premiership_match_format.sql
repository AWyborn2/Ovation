ALTER TABLE "club_photos" DROP CONSTRAINT IF EXISTS "club_photos_photo_types_check";--> statement-breakpoint
ALTER TABLE "card_photo_rules" DROP CONSTRAINT IF EXISTS "card_photo_rules_photo_type_check";--> statement-breakpoint
ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "match_format" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photos" ADD CONSTRAINT "club_photos_match_format_check" CHECK ("match_format" IS NULL OR "match_format" = ANY (ARRAY['one_day', 't20', 'two_day']::text[]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photos" ADD CONSTRAINT "club_photos_photo_types_check" CHECK ("photo_types" <@ ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'premiership', 'batting_milestone', 'bowling_milestone']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_photo_rules" ADD CONSTRAINT "card_photo_rules_photo_type_check" CHECK ("photo_type" IS NULL OR "photo_type" = ANY (ARRAY['batting', 'bowling', 'fielding', 'team', 'celebrating', 'premiership', 'batting_milestone', 'bowling_milestone']::text[]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
