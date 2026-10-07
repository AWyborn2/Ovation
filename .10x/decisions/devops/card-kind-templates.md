# DevOps — card-kind-templates

## Delivery setup found [DISCOVERED]

- CI: `.github/workflows/ci.yml`; PlayHQ sync in `.github/workflows/playhq-sync.yml` (hourly via cron-job.org trigger) runs ingest and the scheduled draft sweep.
- Deploy: Replit publish from `main`; production schema changes are applied by hand in Replit's Production SQL runner before republishing.
- Do not pin `packageManager` in root `package.json` (breaks Replit publishing).
- Server renders use headless Chromium; it must reach Google Fonts for KTD12.
