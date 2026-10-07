---
name: Publishing constraint checks
description: Why publishing's no-diff result does not prove production CHECK constraints match development.
---

Do not treat a publishing schema-diff result of “no changes” as proof that development and production CHECK constraints match.

**Why:** On 2026-10-07 the publishing diff reported no changes while read-only database introspection proved the live photo-category checks still rejected Premiership photos and the development checks allowed them. Conversion succeeded; the outdated check rejected the subsequent library insert.

**How to apply:** Compare `pg_get_constraintdef` in both environments when a live constraint rejects an app-supported value. Do not promise that republishing alone fixes a mismatch the publishing diff does not include. Follow the project's user-managed production update process, leave Agent production access read-only, and verify the live definitions after the user applies the update.
