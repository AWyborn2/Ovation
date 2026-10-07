-- Card kind templates (docs/plans/2026-10-07-002-feat-card-kind-templates-plan.md, U5;
-- ADR-002, ADR-003). Additive: new nullable or defaulted columns, one partial unique
-- index, and one widened check constraint. No existing row changes meaning, so this can
-- apply before or after the code that reads it ships.
--   card_templates.version / updated_at / updated_by_admin_id   versioned saves (KTD7)
--   card_templates.replaced_pack_id / notice_dismissed_at        retired-pack notice (R19)
--   card_templates_kind_unique                                    one kind template per tenant and kind (KTD5)
--   social_drafts.template_version                                which template version a draft copied
--   social_drafts.layout_warnings / layout_check_pending          "needs a look" gate (KTD10)
--   social_drafts.design_edited_at                                hand design edits (editedAt stays the caption marker)
--   social_draft_revisions_reason_check                           allows "template" (snapshot before an apply, R16)
--
-- Idempotent (production was push-built and baselined at 0000): columns use
-- ADD COLUMN IF NOT EXISTS, the index IF NOT EXISTS, the FK is added in a DO block that
-- ignores an existing one, and the check constraint is dropped if present and re-added.

ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "updated_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "replaced_pack_id" text;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "notice_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "template_version" integer;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layout_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layout_check_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "design_edited_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_updated_by_admin_id_admins_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "card_templates_kind_unique" ON "card_templates" USING btree ("tenant_id","base_kind") WHERE source = 'kind';--> statement-breakpoint
ALTER TABLE "social_draft_revisions" DROP CONSTRAINT IF EXISTS "social_draft_revisions_reason_check";--> statement-breakpoint
ALTER TABLE "social_draft_revisions" ADD CONSTRAINT "social_draft_revisions_reason_check" CHECK ("reason" IN ('refresh', 'edit', 'revert', 'template'));
