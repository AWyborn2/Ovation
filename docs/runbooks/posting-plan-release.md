# Posting Plan release (migration 0040)

Release 1 of the Social Studio Posting Plan (`docs/plans/2026-10-07-001-feat-social-posting-plan-plan.md`) adds one nullable column. Production does not migrate on publish, so apply it by hand **before** republishing.

## 1. Apply the migration in the Replit Production SQL runner

```sql
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "posting_plan" jsonb;
```

It is idempotent: running it twice is harmless.

## 2. Verify the column exists

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'social_settings' and column_name = 'posting_plan';
```

Expect one row (`posting_plan`, `jsonb`). Check the actual schema, not the migration ledger.

## 3. Republish

Deploying changes nothing for any club until an admin saves a plan: with `posting_plan` null, drafting follows the club's existing settings exactly.

## After release

- The Posting Plan tab opens with "Choose how your club posts" for every club until it saves a plan once ("Keep my current settings" saves today's behaviour unchanged).
- Club leaderboard and ladder carousels only draft for clubs that switch those rows on. Ladders need the club's PlayHQ organisation set (`tenants.playhq_org_id`) and PlayHQ's published ladder for the grade.
- Rolling back to an earlier build is safe: saving a plan also writes the old family switches and round-schedule modes (widest-wins), which the earlier build reads.
