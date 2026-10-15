# DevOps — social-auto-queue-criteria

## Release (2026-10-15)

- **Shipping unit:** one PR from `claude/social-auto-queue-criteria` to `main`; merged automatically once CI is green and the PR is `CLEAN` (CLAUDE.local rule). Replit republishes from `main`.
- **Deploy order** (runbook `docs/runbooks/meta-publishing.md` §3b, all SQL run by Ash):
  1. Before republishing: `scripts/sql/central-projector.sql` in the Production SQL runner (database of `CENTRAL_PROJECTOR_DATABASE_URL`); check `to_regclass('central.match_feats')`.
  2. Read-only: list junior teams on `auto` and tell those clubs.
  3. Republish.
  4. After republishing: `scripts/sql/auto-queue-release.sql`; both read-only checks return 0.
  5. Backfill feats for this season with `scripts/src/playhq-project-central.ts`.
  6. Confirm the next match-day sync fetched balls.
- **Why this order:** the new code reads `central.match_feats` (step 1 first); the release SQL dismisses drafts of kinds the new code no longer offers and resets a setting whose meaning changes with the new code (so it runs after).
- **Rollback:** revert the merge commit and republish. `central.match_feats` can stay (unread by the old code). Dismissed retired-kind drafts stay dismissed (an admin can re-run a season recap by hand if a champion card is wanted). Junior teams reset to `approval` stay there (safe for the old code too). A reverted build reads the version 2 `posting_plan` as its own version 2 (same shape), so no data step is needed.
- **CI:** no workflow changes. The API integration job runs the new DB tests (`auto-queue-release.db.test.ts`, projection feats, junior Big Moments).
