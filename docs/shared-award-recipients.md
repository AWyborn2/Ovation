# Shared award recipients

## Production prerequisite (not applied by this change)

Before deploying this code, run the additive migration
`lib/db/migrations/0035_shared_award_recipients.sql` in the production SQL runner:

```sql
ALTER TABLE award_winners ADD COLUMN IF NOT EXISTS player_ids integer[];
```

Do not backfill, split names, or relink existing history. Development has this
column; no production changes or publishing are part of this work. The normal
migration runner can subsequently apply this idempotent migration and record it.

## Compatibility

- `player_ids IS NULL` means use the existing nullable `player_id`. Automatic
  voting/points finalisation and history imports may continue writing that shape.
- A non-null array is authoritative and ordered. `[]` means no profile links.
  The first ID is mirrored into `player_id` for older clients.
- New clients PATCH `playerIds` to replace the complete list. Omission preserves
  links. An older client PATCHing `playerId` changes/removes only the first link,
  preserving other recipients; clearing all links requires `playerIds: []`.
- Names are independent curated text, never parsed to infer identities. Public
  web/mobile show that complete label plus independently navigable resolved
  recipient names. Honour displays retain the label.
- IDs belong to the winner's tenant, not necessarily the native players table.
  Public recipient names resolve through that tenant's identity space. Confirmed
  merges fold recipients, and private central identities do not get public links.
- Award profile credits deduplicate by award key and season; award record
  leaderboards count distinct seasons per resolved player, not the combined label.
  An entirely unlinked name remains a free-text record.
