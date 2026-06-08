---
name: Junior opponent → club matching
description: How junior match opponents are linked to the shared clubs register for crests, and why the matcher is deliberately conservative.
---

# Junior opponent → club crest matching

Junior matches show the opposition club's crest/colours by linking
`junior_matches.opponent_club_id` to the shared `public.clubs` register (the same
neutral, area-wide table master-etl populates for senior opponents). Reading
`clubs` here does NOT blend junior+senior STAT data — `clubs` is reference data,
not stats.

**The match is deliberately CONSERVATIVE to avoid false crests.** Both the club
name and the messy free-text `opponent_name` are normalised by `pg_temp.jr_norm_club`
(lowercase; strip parentheticals, punctuation, age tokens like U14/Year 8,
colours, gender words, and club-suffix words like cricket/club/cc). A link
requires the normalised opponent to EQUAL the normalised club OR start with it
followed by a space. Team **nicknames** (Hornets, Swans, Rams) are intentionally
NOT stripped, so "Rockingham Rams" never collapses onto "Rockingham Hornets".
When several clubs match, the longest club token wins (so "South Mandurah …"
links to South Mandurah, not Mandurah).

**Why:** an earlier looser version mis-linked Rockingham Rams → Hornets and
over-matched bare colour-suffixed names. Most metro junior opponents simply are
NOT in the Peel-focused register, so the right behaviour is to leave
`opponent_club_id` NULL (~600 of 1828 dev matches) and let renderers fall back
gracefully — a wrong crest is worse than no crest.

**How to apply:** the matcher lives BOTH in `scripts/sql/juniors-etl.sql` (step 5,
runs on every `load-juniors-db --commit`) and was applied once to the dev DB via
the identical UPDATE. master-etl MUST run before juniors-etl (the join needs
`public.clubs` populated). If you change normalisation, change it in the ETL —
not ad-hoc on the DB — or the next juniors reload reverts it.
