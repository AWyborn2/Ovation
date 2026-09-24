ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "venue_latitude" double precision;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "venue_longitude" double precision;--> statement-breakpoint
ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "source_photo_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photos" ADD CONSTRAINT "club_photos_source_photo_id_club_photos_id_fk" FOREIGN KEY ("source_photo_id") REFERENCES "public"."club_photos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
