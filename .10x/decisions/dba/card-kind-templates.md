# DBA — card-kind-templates

## Schema found [CONFIRMED 2026-10-07]

- `card_templates` (`lib/db/src/schema/social_cards.ts`): `source` (background | layers | pack | editor), `cardKinds`, `packId`, `packVariant`, `baseKind`, `adjustments` jsonb, `isDefault` (legacy), `defaultForKinds` (one kind per template, enforced by `clearDefaultKinds` across all sources); unique index on (tenant, source, packId, packVariant) where source = 'pack'.
- `card_layouts`: one row per tenant and kind (legacy per-kind overrides).
- `social_drafts`: `packId`, `adjustments` jsonb, `editedAt` (protects hand-written captions from refresh), `sourceMatchIsJunior`, `autoReadyAt`; `social_draft_revisions` snapshots adjustments.
- Latest migration: `0034_shirt_numbers.sql`; migrations are idempotent and run by hand in production.
