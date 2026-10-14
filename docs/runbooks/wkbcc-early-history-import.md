# White Knights Baldivis (WKBCC): load the 2001/02 – 2004/05 history

Concierge club-history import, platform-admin console. Source: the club's own season totals
(`WKBCC FULL STATS.xlsm`, sheet `Data`, rounds 98/99 plus a few real match rows), already summed per
player, grade and season into a **season-totals** CSV.

File: `scripts/exports/wkbcc/WKBCC_early-seasons_history-import_season.csv`
(git-ignored: it holds player-level data; never commit it).
Contents: 202 rows, 97 players, A–D Grade, seasons 2001/02–2004/05.
Totals to see in the preview: **1,566 games, 19,140 runs, 1,238 wickets** (per player the preview
shows the delta, so check the sum of the Games / Runs / Wkts columns).

These seasons are totals, not scorecards. Use the **Season totals** template only. Do not use the
match template.

## 0. Before you start (production, read-only checks)

Run in Replit's Production SQL runner.

```sql
-- the club-history tables must exist (migrations 0021 + 0022); otherwise the console shows a 503
select to_regclass('public.club_history_boundaries')   as boundaries,
       to_regclass('public.club_history_rows')          as rows,
       to_regclass('public.club_history_curated_rows')  as curated;

-- the White Knights tenant id (the snapshot had 68; use whatever this returns)
select id, slug, name from tenants where slug = 'wkbcc';
```

If any `to_regclass` is null, run the idempotent SQL in `lib/db/migrations/0021_*.sql` and
`0022_*.sql` first (see CLAUDE.md, "Production schema changes are applied by hand").

Also check nothing is already loaded for the club (use the tenant id from above):

```sql
select (select count(*) from club_history_boundaries where tenant_id = :id) as boundaries,
       (select count(*) from club_history_batches    where tenant_id = :id) as batches;
```

If a boundary or batch exists, stop and look at it before continuing: the importer refuses any
(grade, season) another batch already covers.

## 1. Open the console

Sign in as a platform admin, then open `/platform-admin/tenants/<id>/history-import`
(Tenants → White Knights Baldivis → "Open history import").

## 2. Set the boundary (changes public numbers: confirm with Ash first)

In the **Boundary** card:

1. Click **Add row**.
2. Leave **Grade** blank (club default).
3. **First central season**: `2005/06`.
4. **Save boundary** and confirm the dialog.

Why 2005/06: it is the first season Ovation's central data has full scorecards for the club
(2005/06 onward). History must end strictly before the boundary, and central takes over from it.

Effect: central buckets before 2005/06 stop counting for this club. Today that is only 11 batting
rows (143 runs) in 2002/03; 2003/04 and 2004/05 have no scorecard rows. Undoing the batch later does
not undo the boundary; remove the row and save to revert.

## 3. Preview the file

In the **Import a file** card:

1. **Template**: Season totals.
2. **CSV file**: choose `WKBCC_early-seasons_history-import_season.csv`.
3. Click **Preview**. Nothing is written yet.

Expect: no errors, no warnings, "202 rows · covers A Grade 2003/04–2004/05, B Grade 2001/02–2002/03,
C Grade 2001/02–2003/04, D Grade 2004/05", 97 players. (Coverage is per grade: A started in
2003/04, B ran 2001/02–2002/03, C ran 2001/02–2003/04, D started 2004/05.)

If you get errors, they are listed with the spreadsheet row number. A "No boundary is set" error
means step 2 did not save.

## 4. Review the player links

The **Link to** column offers a "Same person as …" checkbox when a central player of this club has a
compatible name and first appears within three seasons after the boundary (2005/06–2007/08).

- Tick it only when it is the same person. Ticked: the early totals join that player's central
  career. Unticked: the player becomes a separate pre-digital player.
- Central names are stored given-name-first (production check: 752 players, none surname-first), so
  "Leigh McIntosh" will match "Leigh McIntosh". A nickname that is not a prefix of the central
  given name ("Mitch" / "Mitchell" does match) will not be offered.
- A player whose central career starts 2008/09 or later gets no suggestion even if they played
  2001–2004, so they stay separate. Check the long-serving names by hand and note any that should
  have joined. There is no link step after commit; undo the batch and re-import to change a link.
- Never tick a link you are unsure of: a wrong link merges two people's careers.

Names to eyeball first: Leigh McIntosh, Mark Haskell, Jason Youlden, Rod Graham, Peter Crowe.

## 5. Commit

Enter a **Batch label**, for example `WKBCC 2001/02–2004/05 season totals (club file)`, optionally
a note (`Source: WKBCC FULL STATS.xlsm, rounds 98/99 summed; no scorecards`), then **Commit import**.
The result line reads "Imported batch #N: 202 rows, 0 honours, X linked and Y new pre-digital
players", where X + Y = 97.

Importing history never drafts Social Studio cards or milestones.

## 6. Verify

- **Imported batches** card lists the batch with coverage.
- On the club's public site: a spot-check career, e.g. Leigh McIntosh's 2001/02 should show
  15 matches, 451 runs, 26 wickets for B Grade, and the career total should include it.
- Compare a few seasons against the workbook's `Validation` sheet (runs 4,627 / 4,222 / 5,713 /
  4,578 and wickets 327 / 314 / 284 / 313 for 2001/02–2004/05).
- Check no one appears twice in the player list (a missed link shows as two entries).

## Undo

**Imported batches → Undo** removes this batch's rows and any pre-digital player only it used.
It leaves the boundary alone.

## Not in this file

High scores, best bowling, fifties/hundreds and five-fors were not recorded for these seasons and
import empty. The 2005/06 onward data in the workbook already matches Ovation's central data
(17 of 21 seasons exact on runs); see the validation report for the handful of match-level
differences to take up with the club.
