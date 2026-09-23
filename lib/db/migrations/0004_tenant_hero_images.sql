-- Broadcast redesign imagery: per-tenant hero and explore-card photos (JSONB of
-- storage paths keyed by slot; null = gradient fallback). Idempotent (IF NOT
-- EXISTS) for the same reason as 0002/0003: production is baselined at 0000, so
-- every statement must be safe on both a fresh database and a pushed one.
-- Apply to production BEFORE publishing any build whose schema includes it.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "hero_images" jsonb;
