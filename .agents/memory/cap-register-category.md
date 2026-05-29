---
name: A Grade cap register categories
description: How the cap_register is split into male/female lists and auto-synced from imports.
---

# A Grade cap register categories

The `cap_register` carries a `category` column (`male` | `female`), defaulting to
`male`. Uniqueness is a **composite** `(category, cap_number)` constraint
(`cap_register_category_cap_number_unique`), so each list numbers independently
(male #1 and female #1 coexist). The original global unique on `cap_number` was
dropped via raw SQL (drizzle-kit push can't do this non-interactively).

**Why:** the club wanted one public "A Grade Caps" tab with a Male/Female
drop-down, each list maintained independently.

**How to apply:** default `category` to `male` everywhere it's optional so legacy
data/callers keep behaving as the men's list. Only `A Grade` and `Female A Grade`
map to a cap category — see `GRADE_TO_CAP_CATEGORY` in
`artifacts/api-server/src/lib/cap-sync.ts`.

## Auto-sync on import
`syncCapsFromStats(tx, grade, orderedPlayerIds)` runs inside the import's DB
transaction, AFTER `recomputeAggregates`. For the grade's category it flips
`inStats` on and refreshes `gamesAGrade` for already-capped players, and issues
new caps (next available number) for uncapped players. It is **idempotent**:
matches existing caps on linked `playerId` first, so re-importing the same
grade+season never duplicates caps or bumps numbers. New caps are numbered by the
caller-supplied order (batting order, but the PlayCricket CSV has no batting
position, so it falls back to CSV row order = order of `resolved` rows). The
commit response (`CommitImportResult.capsSync`) surfaces an updated/created
summary per category for the admin.
