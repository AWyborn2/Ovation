# Selection Hub runbook

The Selection Hub (`/admin/selection`) drafts, finalises and prints each weekend's sides. Since
ADR-008 (19 Oct 2026) it works with or without the availability tool. Design:
`.10x/decisions/architect/selection-hub-decoupling.md`.

## 1. Migration 0046: decoupling foundation

`lib/db/migrations/0046_selection_hub_decoupling.sql` is additive and idempotent. It adds:

- `availability_responses.source` (`member` | `admin`), `set_by_admin_id` and `set_by_name`
- `selection_events.round_id`; `selection_id` becomes nullable, and a check keeps at least one of
  the two set
- the table `squad_member_participants` (PlayHQ participant GUID → squad member, per club)
- `squad_members.show_name_publicly` with `_by` and `_at` (off by default)

**Deploy order (once):** run it statement by statement in the Production SQL runner.

1. **Before republishing:** paste the migration. Then run this read-only check. Expect 6 column
   rows and `squad_member_participants`:

   ```sql
   select table_name, column_name from information_schema.columns
   where (table_name = 'availability_responses' and column_name in ('source', 'set_by_admin_id', 'set_by_name'))
      or (table_name = 'selection_events' and column_name = 'round_id')
      or (table_name = 'squad_members' and column_name in ('show_name_publicly', 'show_name_publicly_at'));
   select to_regclass('squad_member_participants');
   ```

2. Republish. Nothing changes for any club yet: every existing answer reads as the member's own,
   nobody is named publicly, and the new Hub endpoints answer 501 until their slices ship.
