-- Club logo grade badges for every club (Ash, 25 Sep 2026). Clubs can still
-- pick another style in Settings > Branding afterwards. Re-running is harmless.
UPDATE "tenants" SET "badge_style" = 'logo' WHERE "badge_style" IS DISTINCT FROM 'logo';
