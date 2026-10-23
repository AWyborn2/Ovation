ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_list_id_email_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE set null ON UPDATE no action;