---
name: Award history name reconciliation
description: How historical award winners from the spreadsheet are matched to player records when loading.
---

# Loading historical award winners

When importing historical award winners from the club spreadsheet, each winner's
free-text name is reconciled against the players roster:

- **Exact matches** link directly to the player (`playerId` set).
- **Confident surname/initial matches** are linked via a hand-maintained
  CORRECTIONS map that also fixes typos and expands nicknames/spellings
  (e.g. `ash wyborn`→Ashley Wyborn, `cam burrage`→Cameron Burrage,
  `Chris Phleps`→Phelps, `Crag Ford`→Craig Ford, `Timothey`→Timothy Miles).
- **Uncertain / non-roster names stay free-text** (`playerId` NULL): families,
  couples, and people who never appear in match data — e.g. Kevin Burns,
  Mark Adams, Tarryn May, Nigel Britton, Ash Luke, Gordon Summers,
  Jeffrey Petire, Head/Jeffrey Family, Luke and Emma Barnes. Admins can link
  these later in the awards admin UI.

**Why:** the spreadsheet predates the player roster and contains award-only
people; auto-linking by fuzzy match would mis-attribute awards to the wrong
person. Display always uses the corrected proper-case name; the link is only
added when a player match is confident.

**How to apply:** the loader is `scripts/src/load-award-history.ts`. Add new
corrections/expansions to its CORRECTIONS map rather than loosening the matcher.
Inserted winner rows are `published = true`.
