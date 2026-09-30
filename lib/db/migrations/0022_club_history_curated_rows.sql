-- Club history import: curated-row tags (hybrid stats plan U11, KTD4). ONE new
-- tenant-scoped table and nothing else:
--   club_history_curated_rows  which curated rows (award, award winner, century,
--                              five-for, club record) a history batch created,
--                              so undo removes exactly those rows.
-- No existing table, column or row is touched. Requires 0021 (it references
-- club_history_batches). Tags cascade with their batch.
--
-- Idempotent (production was push-built and baselined at 0000): the table uses
-- IF NOT EXISTS, every constraint is added in a DO block that ignores an
-- existing one, and indexes use IF NOT EXISTS. Re-running the file is a no-op.

CREATE TABLE IF NOT EXISTS "club_history_curated_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"batch_id" integer NOT NULL,
	"target" text NOT NULL,
	"row_id" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_curated_rows" ADD CONSTRAINT "club_history_curated_rows_target_row_unique" UNIQUE("target","row_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_curated_rows" ADD CONSTRAINT "club_history_curated_rows_target_check" CHECK ("target" IN ('award', 'award_winner', 'century', 'five_wicket_haul', 'club_record'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_curated_rows" ADD CONSTRAINT "club_history_curated_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_history_curated_rows" ADD CONSTRAINT "club_history_curated_rows_batch_id_club_history_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."club_history_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_curated_rows_tenant_idx" ON "club_history_curated_rows" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_history_curated_rows_batch_idx" ON "club_history_curated_rows" USING btree ("batch_id");
