---
name: Master DB load (authoritative source)
description: How the club master DB export replaced seeded test data; what it owns vs preserves; the historical-records read surfaces.
---

The club's full **master database export** is the authoritative source of truth, replacing the original seeded/spreadsheet test data.

**Rule:** master rows carry `player_id` everywhere, so links are exact — the ETL is pure SQL (no name-matching guesswork like the old seed). Loader picks the NEWEST dump in `attached_assets`, builds a `staging` schema, previews row diffs by default, `--commit` runs the ETL (backup → replace owned DATA tables → recompute → setval) and verifies vs master career views. Idempotent / re-runnable. Backup retained in schema `master_load_backup`.

**Why:** the old seed wrote derived tables directly and mis-linked some caps; the master export is internally consistent and verifiable, so recompute mismatches should be 0.

**Owns / replaces (DATA tables):** players (upsert + delete-not-in-master), player_grade_season_stats baseline (season=NULL), cap_register, premierships(+players), club_roles (co-holders aggregated `&`, playerId NULL if >1), award_winners (3-source DISTINCT ON precedence awards=1, honour_board=2, grade_honours=3), life_members, team_of_decade, clubs (opposition), partnership_records, partnerships_50plus, centuries, five_wicket_hauls, club_records, honour_board_records.

**Preserves (APP-CONFIG, never replaced):** awards definitions, honour_boards config, admins, captains.

**How to apply:** for any future re-load or data correction, edit `scripts/sql/master-etl.sql` and re-run the loader; do NOT hand-patch derived tables. The historical lists (partnerships / centuries / five-fors) have NO per-match link — they are records surfaces only, served read-only from `routes/historical.ts` and shown as tabs on `/records`. Female B Grade has no master career stats, so it correctly has no grade_summary row.

**life_members caveat:** the master export carries NO `role_label`/`blurb` and only coarse induction years, so the ETL's life-members step (step 8) snapshots existing club-authored content into a temp table before the full-replace and overlays `role_label`/`blurb`/`induction_year`(>0 guard)/`is_playing_member` back by `upper(btrim(name))` match. **Why:** before this, every master reload silently wiped the club's authored life-member bios. Fresh-DB content seed lives in `artifacts/api-server/src/data/life-members.json` (consumed by `seed-honours.ts` delete+insert) — keep that JSON in sync with any board-authored bios.
