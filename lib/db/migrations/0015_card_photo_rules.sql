CREATE TABLE IF NOT EXISTS "card_photo_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade" text NOT NULL,
	"card_kind" text NOT NULL,
	"mode" text NOT NULL,
	"photo_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_photo_rules" ADD CONSTRAINT "card_photo_rules_mode_check" CHECK ("mode" IN ('player', 'random', 'fixed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_photo_rules" ADD CONSTRAINT "card_photo_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_photo_rules" ADD CONSTRAINT "card_photo_rules_photo_id_club_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."club_photos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "card_photo_rules_tenant_grade_kind_unique" ON "card_photo_rules" USING btree ("tenant_id","grade","card_kind");
