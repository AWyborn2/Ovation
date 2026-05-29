---
name: Round-up & season-recap card generators
description: What data backs the social round-up/recap engines and which "ideal" cards are impossible.
---

# Round-up & season-recap share cards

The round-up (per-import) and season-recap (per grade+season) engines live in
`artifacts/api-server/src/lib/roundup.ts` and write `social_drafts` rows whose
`card_input` is opaque ShareCardInput JSON (jsonb) — adding new card kinds needs
NO OpenAPI codegen, only a frontend renderer branch in
`artifacts/cricket-club/src/lib/share-card.ts` (+ caption mapping + filename).

## Best-partnership is impossible — do not re-attempt
There is **no partnership data anywhere** — not in the schema and not in the
PlayCricket "Combined Batting/Bowling/Fielding" CSV. The round-up "best
partnership" card was substituted with a **best individual innings** (high score)
card, which is real data (`player_grade_season_stats.high_score`).
**Why:** the no-mocked-data constraint forbids fabricating partnerships.
**How to apply:** if asked for partnership cards, first confirm a new data source
(e.g. ball-by-ball/scorecard import) exists; otherwise it can't be done.

## Milestones have no grade/season — join through the import
`milestone_events` carries `source_import_id` but **no grade or season column**.
To scope milestones to a (grade, season) for the recap, join
`milestone_events → imports` on `source_import_id` and filter `imports.grade` /
`imports.season`.

## Season/year convention
Import `season` and `premierships.year` are both **start years** (2025 = "2025/26"),
so a recap premiership card matches on `premierships.grade = grade AND year = season`.

## Snapshot table note
`player_grade_season_stats` holds the season=NULL baseline plus per-season import
rows. Seed/baseline data has `season = NULL`, so round-up/recap produce nothing
until a real CSV import for that season exists.
