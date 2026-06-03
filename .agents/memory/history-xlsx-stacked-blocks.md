---
name: HHCC history xlsx stacked blocks
description: The history spreadsheet's "Grade Records" sheet stacks two season tables; importing both double-counts.
---

The club history spreadsheet (`attached_assets/HHCC_history_*.xlsx`) "Grade Records"
sheet contains TWO vertically stacked tables with identical season/grade column
layouts:

1. `GRADE CAPTAINS` (header at row index 1–2, data rows ~3–37)
2. `GRADE CRICKETERS OF THE YEAR` (header row ~38–39, data below)

**Why this bites:** both blocks use the same `YYYY/YY` season format in column 0,
so a naive "iterate rows, skip non-season rows" loop sails straight through the
gap and ingests the cricketers-of-the-year block as if it were captains —
producing two role rows per (season, grade) and a unique-constraint violation on
`club_roles (season, role, grade)`.

**How to apply:** when parsing this sheet, stop at the second header — break the
loop when column 0 matches `/CRICKETERS OF THE YEAR/i`. The "Honour Board" sheet
(office bearers) is a single block and has no such trap. Cricketers-of-the-year
is out of scope for the committee/captains feature anyway.
