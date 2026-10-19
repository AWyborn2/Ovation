# Release: shirt-number categories (migration 0047)

Admin menu consolidation PR 2. The senior shirt-number register splits into **Men** and
**Female**, and People → Shirt numbers shows Men / Female / Juniors on one page.

## 1. Before republishing: apply migration 0047 (Ash)

The new code reads and writes `shirt_numbers.category`, so the column must exist in
production **before** the republish, or every shirt-number read and write fails.

In Replit's **Production SQL runner**, run the whole of
`lib/db/migrations/0047_shirt_number_category.sql`. It is idempotent (safe to run twice):

- adds `shirt_numbers.category text not null default 'men'` with a check (`men`, `female`);
  every existing row becomes `men`, so nothing that shows today changes;
- creates the per-category unique indexes
  (`shirt_numbers_tenant_season_category_participant_uidx`, `…_category_player_uidx`);
- drops the old per-season ones (`shirt_numbers_tenant_season_participant_uidx`,
  `…_player_uidx`).

Check it took:

```sql
select category, count(*) from shirt_numbers group by category;
select indexname from pg_indexes where tablename = 'shirt_numbers' order by indexname;
```

Expect one `men` row (the whole register) and the two `…_category_…_uidx` indexes, with no
`shirt_numbers_tenant_season_participant_uidx` / `…_player_uidx` left.

## 2. Republish

Then republish as usual.

## 3. After the release (club admins)

- Existing entries are all on the **Men** register. For each women's player, open People →
  Shirt numbers → Men, tick their rows and press **Move to Female**. A men's #7 and a female #7
  stop being flagged as duplicates as soon as the rows are moved.
- Someone who plays in more than one (a junior in the seniors, a woman in a men's side) can be on
  each register. Rows say **Also in: …**; **Also add to…** copies a person across with the number
  filled in.
- PlayHQ team lists from a women's grade now add players to the Female register; every other
  grade feeds Men.
- The old **Junior shirt numbers** tab and its links redirect to Shirt numbers → Juniors.
- Number spreadsheets can also be uploaded from **Imports → Shirt numbers** (pick the register).

## Rollback

The code needs the column, so roll back the code first. The column and new indexes can stay: the
old code never reads `category`, but with the per-category indexes it would allow one person
twice in a season (once per category). If any `female` rows were created, either delete the
duplicates or recreate the old indexes after moving everyone back to `men`.
