---
name: matches.match_date is free text
description: How to sort/compare match dates — the column is a formatted string, mostly blank, not a date type.
---

# matches.match_date is free text, not a date

`matches.match_date` is `text(...)`, storing a human-formatted string like
`"12:20 PM, Saturday, 14 Mar 2026"`. Sorting/comparing it as text is
lexicographic and chronologically wrong.

**To order chronologically**, parse to a timestamp:
`to_timestamp(match_date, 'HH12:MI AM, Day, DD Mon YYYY')`, guarded by a regex
CASE (`'^[0-9]{1,2}:[0-9]{2} (AM|PM), [A-Za-z]+, [0-9]{1,2} [A-Za-z]{3} [0-9]{4}$'`)
so a malformed/blank value becomes NULL instead of throwing. Use `NULLS LAST`
so dated rows outrank undated ones regardless of asc/desc.

**Coverage is sparse:** ~82% of `matches` rows have a blank `match_date`, and
**most finals have none** (only per-match xlsx imports and recent seasons carry
a date; the bulk historical master load did not populate it). So any
date-based ordering must keep a deterministic fallback (e.g. `id`) for the
undated majority.

**Why:** finals carry `round IS NULL` (round number lives in `stage`), so they
cluster in the matches list and need a secondary sort; date is the natural one
but only exists for recent matches.

**How to apply:** in `GET /matches` ordering, and any future feature that needs
to sort/filter matches by when they were played. Don't assume `match_date` is
sortable or present.
