---
name: Notable honour board records derivation
description: How the auto-derived committee/award records leaderboards are computed and why tallies differ from the hand-kept sheet
---

# Notable honour board records

Public "Notable Records" tab on the Honour Boards page, backed by `GET /api/records-leaderboards` (route `artifacts/api-server/src/routes/records.ts`, hook `useGetRecordsLeaderboards`).

## Rules

- **Role records**: most DISTINCT seasons per office-bearer role. Only `club_roles` rows with `grade IS NULL` (office bearers, not grade captains) and `published = true`.
- **Award records**: most wins per award. Only PUBLISHED winners of PUBLISHED awards. Only awards with at least one repeat winner (top count >= 2) are shown.
- Both group by **normalized name** (trim / collapse whitespace / lowercase) because the historical source is name-based. A `playerId` is attached to a group ONLY when every record in the group agrees on a single non-null id; otherwise the entry stays plain text.
- Ranks are sequential, ties broken by name ascending; cap 10 entries.

## Why tallies can differ from the spreadsheet "Records & Stats" sheet

The spreadsheet's Records & Stats sheet is hand-maintained and can lag the full role/winner data. The auto-derived numbers are the source of truth and will occasionally exceed the sheet (e.g. an extra Secretary/Treasurer season). Also alphabetical tie-breaks can surface a different name than the sheet picked among equal counts (e.g. Jack Manuel vs Jake Wyllie both on 2). This divergence is expected and is the point of the feature — do not "fix" the derivation to match the stale sheet.

**How to apply:** when verifying, confirm the leaders and counts are internally consistent with the published `club_roles` / award winners, not byte-identical to the sheet.
