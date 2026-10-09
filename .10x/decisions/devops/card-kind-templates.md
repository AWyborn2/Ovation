# DevOps — card-kind-templates

## Delivery setup found [CONFIRMED 2026-10-07]

- CI: `.github/workflows/ci.yml`; PlayHQ sync in `.github/workflows/playhq-sync.yml` (hourly via cron-job.org trigger) runs ingest and the scheduled draft sweep.
- Deploy: Replit publish from `main`; production schema changes are applied by hand in Replit's Production SQL runner before republishing.
- Do not pin `packageManager` in root `package.json` (breaks Replit publishing).
- Server renders use headless Chromium; it must reach Google Fonts for KTD12.

## Release plan (2026-10-08)

Order matters; each step is safe on its own.

1. **Schema first.** Ash runs `lib/db/migrations/0035_kind_templates.sql` in Replit's Production SQL runner (idempotent; additive only). Verify:
   `select column_name from information_schema.columns where table_name = 'social_drafts' and column_name in ('template_version','layout_warnings','layout_check_pending','design_edited_at');` → 4 rows;
   `select to_regclass('card_templates_kind_unique');` → not null.
   Code that reads the new columns must not ship before this (drafts list selects every column).
2. **Deploy with the switch off.** Merge to `main` and republish. `KIND_TEMPLATES` unset → Studio, queue, editor and pipeline behave exactly as today. The template editor route answers "not switched on".
3. **Starters (design track).** Platform admins design starters in the editor on a stock club, "Export as starter", commit into `lib/scorecard/src/kind-templates/starters/*`, until `starters.test.ts` has no skips. Ship each batch like any code change.
4. **Pilot.** Set `KIND_TEMPLATES=<tenant ids>` (comma-separated) in Replit secrets for one or two friendly clubs; republish. Confirm a render harness is configured in production (`RENDER_HARNESS_URL` or `RENDER_HARNESS_ORIGIN`) — without it layout checks never run and templated drafts stay out of automation (fail closed, by design).
5. **Wider.** Add tenants, then `KIND_TEMPLATES=all`.

## Rollback

- Code: unset `KIND_TEMPLATES` and republish → new drafts use packs again. Drafts already made from templates keep rendering their copied design (`packId = 'blank'` + their document) and still pass through the layout gate, so nothing unchecked auto-posts.
- Schema: no rollback needed (additive). Do not drop the columns while any draft has `template_version` set.

## CI

No pipeline changes. Lint (ESLint + Prettier 3.9.6), typecheck, web and API suites cover the feature; the API suite needs Postgres (CI already provides it).
