-- Run this ENTIRE file in the PRODUCTION database's SQL runner.
-- Applies the schema changes from 0036_kind_templates.sql atomically.
-- No club records are deleted or updated. Existing templates receive version 1.
-- Earlier manually applied production changes are not all recorded in the
-- Drizzle ledger. Do NOT advance that ledger past unverified migration history;
-- this script deliberately changes only the card-template schema.
-- If anything fails, roll back the transaction before retrying.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regclass('public.card_templates') IS NULL
     OR to_regclass('public.social_drafts') IS NULL
     OR to_regclass('public.social_draft_revisions') IS NULL
     OR to_regclass('public.admins') IS NULL THEN
    RAISE EXCEPTION 'Required card-template tables are missing. No changes applied.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.card_templates
    WHERE source = 'kind' AND tenant_id IS NOT NULL AND base_kind IS NOT NULL
    GROUP BY tenant_id, base_kind HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate kind templates exist. Resolve them without deleting club content before retrying.';
  END IF;
END $preflight$;

ALTER TABLE public.card_templates ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL;
ALTER TABLE public.card_templates ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;
ALTER TABLE public.card_templates ADD COLUMN IF NOT EXISTS updated_by_admin_id integer;
ALTER TABLE public.card_templates ADD COLUMN IF NOT EXISTS replaced_pack_id text;
ALTER TABLE public.card_templates ADD COLUMN IF NOT EXISTS notice_dismissed_at timestamp with time zone;
ALTER TABLE public.social_draft_revisions ADD COLUMN IF NOT EXISTS pack_id text;
ALTER TABLE public.social_draft_revisions ADD COLUMN IF NOT EXISTS template_version integer;
ALTER TABLE public.social_drafts ADD COLUMN IF NOT EXISTS template_version integer;
ALTER TABLE public.social_drafts ADD COLUMN IF NOT EXISTS layout_warnings jsonb;
ALTER TABLE public.social_drafts ADD COLUMN IF NOT EXISTS layout_check_pending boolean DEFAULT false NOT NULL;
ALTER TABLE public.social_drafts ADD COLUMN IF NOT EXISTS design_edited_at timestamp with time zone;

DO $foreign_key$
BEGIN
  ALTER TABLE public.card_templates
    ADD CONSTRAINT card_templates_updated_by_admin_id_admins_id_fk
    FOREIGN KEY (updated_by_admin_id) REFERENCES public.admins(id)
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $foreign_key$;

CREATE UNIQUE INDEX IF NOT EXISTS card_templates_kind_unique
  ON public.card_templates USING btree (tenant_id, base_kind)
  WHERE source = 'kind';

ALTER TABLE public.social_draft_revisions
  DROP CONSTRAINT IF EXISTS social_draft_revisions_reason_check;
ALTER TABLE public.social_draft_revisions
  ADD CONSTRAINT social_draft_revisions_reason_check
  CHECK (reason IN ('refresh', 'edit', 'revert', 'template'));

-- Confirm the complete set of new columns before committing.
DO $verify$
BEGIN
  IF EXISTS (
    SELECT * FROM (VALUES
      ('card_templates', 'version'),
      ('card_templates', 'updated_at'),
      ('card_templates', 'updated_by_admin_id'),
      ('card_templates', 'replaced_pack_id'),
      ('card_templates', 'notice_dismissed_at'),
      ('social_drafts', 'template_version'),
      ('social_drafts', 'layout_warnings'),
      ('social_drafts', 'layout_check_pending'),
      ('social_drafts', 'design_edited_at'),
      ('social_draft_revisions', 'pack_id'),
      ('social_draft_revisions', 'template_version')
    ) AS expected(table_name, column_name)
    EXCEPT
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'Card-template column verification failed. No changes committed.';
  END IF;
END $verify$;

COMMIT;

SELECT 'Card-template schema update committed.' AS result;
