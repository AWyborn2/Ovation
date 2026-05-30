---
name: cap register data quality (seed name-match glitches)
description: The cap_register seed name-matcher mis-linked wrong-person caps by shared surname, and left ~10 A-grade players uncapped (several are duplicate player records). Fix mis-links by UNLINK, not delete.
---

# Cap register data quality

The cap_register was seeded from the club's curated honour roll and linked to
player records by name matching. That matcher made two classes of error:

## 1. Mis-linked caps (two different people collapsed onto one player)
A historical cap sharing only a surname got attached to a modern player. Pattern:
the wrong cap is the lower number, `in_stats = false`, `games_a_grade = 0`, and a
**different first name**. Examples found: #59 "Billy Miles"→Tim Miles, #105 "Josh
Lawson"→Rob Lawson, #51 "Colin Hunter"→Peter Hunter, #85 "C Mills"→Chris Mills
(this last one ambiguous — could be the same person).

**Fix = UNLINK (`player_id = NULL`), never DELETE.** Unlinking preserves the
historical cap number+name in the register and leaves each player with exactly one
(correct, in_stats) cap. Deleting would erase a real honour-roll entry.

## 2. Uncapped A-grade players / duplicate player records
~10 players have A-grade games but no cap. Several are the **same person split into
two player records** under name variants, e.g. "Mitch Felton"(capped #198) vs
"Mitchell Felton"(uncapped) — confirmed same person, merged; "Jeff Dillon"(A/B/C)
vs "Jeffery Dillon"(D/E, capped #3) — disjoint grades, almost certainly one person.
Others (Josh Peterson 128g, Mick O'Brien 68g) aren't in the register at all.

**Merging player records** (when confirmed same person): repoint
`player_grade_season_stats` + `premiership_players` (+ any of `life_members`,
`honour_board_overrides`, `milestone_events`) from the dup to the survivor, replay
recompute for the affected grades, delete the dup, then sync the cap's
`games_a_grade`. A-grade `grade_summaries.players` drops by 1 when both halves had
A-grade rows; game/run totals are unchanged.

**Do NOT auto-issue cap numbers** to uncapped players — cap numbers encode debut
chronology and require club knowledge. Surface for human/club review instead.
