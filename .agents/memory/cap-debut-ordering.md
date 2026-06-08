---
name: A Grade cap debut ordering
description: How to order newly-issued A Grade caps for season debutants (parsed date, then surname).
---

# A Grade cap debut ordering

When issuing new A Grade (male/female) cap numbers for a season's debutants, order
them by **earliest match date (PARSED), then surname** — NOT batting position.

**Why:** `matches.match_date` is free text (e.g. `"12:00 PM, Saturday, 04 Oct 2025"`,
sometimes wrapped in literal quotes); sorting it as a string is chronologically
wrong. Parse with `to_timestamp(substring(replace(match_date,'"',''), '[0-9]{1,2} [A-Za-z]{3} [0-9]{4}'), 'DD Mon YYYY')`.
For debutants who first played in the SAME match (same date), batting-position
tie-break does NOT reproduce the club's expected cap order — surname-alphabetical
does (verified against the 2025/26 #241–#247 enumeration: Caine batted 8, Higton 7,
yet Caine = #241). So tie-break on surname.

**How to apply:** A season debutant = real player (id < 90000) appearing in the
grade that season, with no cap in that category, no grade match before the season,
and no season=NULL baseline games for the grade. Append from `MAX(cap_number)+1`
for the category; set `games_a_grade` from `player_grade_stats`, `in_stats = games>0`,
`auto_created = true`, link `player_id`. Skip already-capped players for idempotency.
Reference: `scripts/src/add-a-grade-2025-26-debuts.ts`.
