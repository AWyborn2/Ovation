# DBA — card-kind-templates

## Schema found [CONFIRMED 2026-10-07]

- `card_templates` (`lib/db/src/schema/social_cards.ts`): `source` (background | layers | pack | editor), `cardKinds`, `packId`, `packVariant`, `baseKind`, `adjustments` jsonb, `isDefault` (legacy), `defaultForKinds` (one kind per template, enforced by `clearDefaultKinds` across all sources); unique index on (tenant, source, packId, packVariant) where source = 'pack'.
- `card_layouts`: one row per tenant and kind (legacy per-kind overrides).
- `social_drafts`: `packId`, `adjustments` jsonb, `editedAt` (protects hand-written captions from refresh), `sourceMatchIsJunior`, `autoReadyAt`; `social_draft_revisions` snapshots adjustments.
- Latest migration: `0034_shirt_numbers.sql`; migrations are idempotent and run by hand in production.

## Built (2026-10-07/08) [CONFIRMED]

- Migration `lib/db/migrations/0035_kind_templates.sql` (idempotent; applied twice to local Postgres 16 without error):
  - `card_templates`: `version int not null default 1`, `updated_at`, `updated_by_admin_id` (FK admins, on delete set null), `replaced_pack_id`, `notice_dismissed_at`; partial unique index `card_templates_kind_unique (tenant_id, base_kind) where source = 'kind'`.
  - `social_drafts`: `template_version`, `layout_warnings jsonb`, `layout_check_pending bool not null default false`, `design_edited_at`.
  - `social_draft_revisions`: `pack_id`, `template_version`; `social_draft_revisions_reason_check` widened to allow `'template'`.
- All additive; no existing row changes meaning, so it can be applied before or after the deploy. `ensure-constraints` covers the new index and check (114 verified).
- Automation gate in SQL (`layoutClear`, `effective-draft-state.ts`): `template_version is null or (layout_check_pending = false and no non-empty array in layout_warnings)`. Only used with tenant + status filters already in the query; no new index needed at current draft volumes (hundreds per club).
- Production: Ash runs 0035 in the Production SQL runner before republishing (CLAUDE.md STATUS).
