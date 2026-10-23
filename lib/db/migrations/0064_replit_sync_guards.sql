-- Two schema changes made in the Replit workspace before 23 Oct 2026, brought onto main:
--   email_sends.list_id keeps a send's history when its list is deleted (ON DELETE set null);
--   team_name_overrides gets one all-grades override per club (grade_key IS NULL).
-- Replit's databases already have both (as its 0061_team_name_all_grades_guard and
-- 0064_preserve_email_history), so every statement is safe to re-run.
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_list_id_email_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_name_overrides_all_grades_unique" ON "team_name_overrides" USING btree ("tenant_id","central_club_id") WHERE "team_name_overrides"."grade_key" IS NULL;