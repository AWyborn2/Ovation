ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "created_by_admin_id" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
