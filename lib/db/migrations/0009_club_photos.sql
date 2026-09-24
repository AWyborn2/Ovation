CREATE TABLE IF NOT EXISTS "club_photo_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"photo_id" integer NOT NULL,
	"player_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"object_path" text NOT NULL,
	"thumb_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"season" integer,
	"grade" text,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photo_players" ADD CONSTRAINT "club_photo_players_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photo_players" ADD CONSTRAINT "club_photo_players_photo_id_club_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."club_photos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_photos" ADD CONSTRAINT "club_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_photo_players_photo_player_unique" ON "club_photo_players" USING btree ("photo_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_photo_players_tenant_player_idx" ON "club_photo_players" USING btree ("tenant_id","player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_photos_tenant_created_idx" ON "club_photos" USING btree ("tenant_id","created_at");
