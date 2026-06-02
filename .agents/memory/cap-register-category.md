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

## drizzle-kit can't manage this composite unique (push hangs post-merge)
drizzle-kit 0.31's `push` cannot detect an *existing* multi-column unique
constraint, so it re-proposes ADDing it on **every** run, which renders an
interactive "truncate cap_register?" Select. `--force` does NOT skip that Select,
and post-merge has no TTY → every push (i.e. every schema migration) silently
fails. **Fix:** the constraint is intentionally NOT declared in the Drizzle
schema (`lib/db/src/schema/cap_register.ts`). push then drops/ignores it without
prompting, and `scripts/src/ensure-constraints.ts` (run from `scripts/post-merge.sh`
right after `pnpm --filter db push`) idempotently re-adds it via raw SQL.
**Why:** keeping it out of the schema is the only way push runs non-interactively
while the real constraint stays enforced in Postgres. **How to apply:** add any
future un-manageable constraint to the `CONSTRAINTS` list in
`ensure-constraints.ts` rather than to the Drizzle schema; never re-add this
`unique()` to the schema.

**Why:** the club wanted one public "A Grade Caps" tab with a Male/Female
drop-down, each list maintained independently.

**How to apply:** default `category` to `male` everywhere it's optional so legacy
data/callers keep behaving as the men's list. Only `A Grade` and `Female A Grade`
map to a cap category — see `GRADE_TO_CAP_CATEGORY` in
`artifacts/api-server/src/lib/cap-sync.ts`.

## Cap games/inStats are CACHED — every link path must refresh them
`cap_register.gamesAGrade` and `inStats` are cached columns, NOT a live join,
so they go stale the instant a cap's `playerId` changes outside an import (the
original bug: a hand-linked Female A Grade cap showed 0 games though stats
existed). **Rule:** ANY code path that links/unlinks a player to a cap must
recompute the cached values from `player_grade_stats` in the same transaction —
this includes create, edit, import sync, and rollback. The import-independent
helper is `recomputeCapsFromStats` in `cap-sync.ts`; there's also an admin
on-demand recompute endpoint and a `reconcile-caps` post-merge backfill for
already-stale rows. **Why:** there is no live join, so a missed refresh silently
ships wrong numbers to the public board. **Semantics:** `inStats` means the
linked player has **> 0** games in the cap's grade (male→A Grade,
female→Female A Grade) — a linked player with 0 grade games is NOT on record.

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
