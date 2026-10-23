---
name: Publishing constraint checks
description: Why publishing's no-diff result does not prove production CHECK constraints match development.
---

Do not treat a publishing schema-diff result of “no changes” as proof that development and production CHECK constraints match.

**Why:** On 2026-10-07 the publishing diff reported no changes while read-only database introspection proved the live photo-category checks still rejected Premiership photos and the development checks allowed them. Conversion succeeded; the outdated check rejected the subsequent library insert.

**How to apply:** Compare `pg_get_constraintdef` in both environments when a live constraint rejects an app-supported value. Do not promise that republishing alone fixes a mismatch the publishing diff does not include. Follow the project's user-managed production update process, leave Agent production access read-only, and verify the live definitions after the user applies the update.

Publishing's generated SQL may also omit `NULLS NOT DISTINCT` from a unique constraint even when both the Drizzle source and development catalog have it.

**Why:** Read-only comparison showed the team-name override constraint correctly treats NULL grades as equal in development, while the publishing diff emitted ordinary UNIQUE. This is separate from validation-branch availability errors.

**How to apply:** Check nullable-key uniqueness explicitly in generated SQL and verify the production definition read-only after publishing. Do not weaken development constraints or add production DDL hooks to compensate for a publishing diff omission.
