-- Portrait and Story sizes (plan 2026-11-19, Stage 6, D3): new clubs start
-- without the retired Square size. Changes the default for rows inserted
-- later; no stored row changes. Safe while live, and safe to run twice.

-- New clubs start without the retired Square size (plan 2026-11-19, D3).
ALTER TABLE "social_settings" ALTER COLUMN "size_square" SET DEFAULT false;
