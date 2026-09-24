CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "auto_post_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "auto_post_window_hours" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "notification_email" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");
