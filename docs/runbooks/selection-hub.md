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

## 2. Drafts any time, carry-over and weekend navigation (PR1)

No migration. It needs 0046 (§1) already applied, because draft events now record `round_id`.

**What changed for selectors**

- **Drafts open whenever the board loads.** Each time the Hub loads the current weekend, or a
  future weekend with fixtures, it creates the weekend's round (if missing) and a draft for every
  fixture that has none. This happens whatever the availability settings, and whether or not the
  send has gone out. "No drafts yet" is gone. Saved and finalised sides are never touched. If two
  selectors load at once, each side is still created only once.
- **A new draft starts from last week's side.** Its source is the same grade's side in the
  previous round that had one, final or draft, copied slot for slot with its captain and keeper
  (they keep their roles while in the XI). Without one, it starts from the grade's last team
  list, as before. If the grade has played since that side (a newer team list, from a weekend the
  Hub didn't draft), the team list wins. A grade with two fixtures in a weekend maps them in start
  order to last round's two sides. The draft event records `seededFrom: {kind: 'selection' |
'team_list', id}`.
- **Behaviour change: no more Yes-only pruning.** Before PR1, with availability on, a draft kept
  a listed player only if they had answered Yes. Everyone else became an open "was <name> · no
  reply" slot. Now every carried player keeps their slot whatever they replied, with availability
  on or off. The board flags their status instead. Ash accepted this deliberately (ADR-008).
- **Slot colours.** A picked player is yellow while still to confirm (no reply or Maybe), green
  when they said Yes, and red when they said No (away included). Each colour also has a glyph
  (? ✓ ✕) and screen-reader words. With availability off nobody has replied, so every slot is
  yellow until an admin records a status (PR3).
- **Weekend switcher.** Previous goes to the nearest earlier weekend with a round. Next goes to
  the next weekend with fixtures; from a past weekend it steps forward to the current one.
  `GET /api/selection/board?weekend=YYYY-MM-DD` takes the weekend's Saturday (anything else
  → 400) and returns `weekends {previous, current, next}` and `readOnly`.
- **Past weekends are view-only.** Opening one never creates a round or a draft. Saving,
  finalising, re-opening, syncing from PlayHQ or withdrawing on a past round → 409
  `{code: "round_closed"}`. The current weekend stays open until the week turns over (the send
  day), so a side can still be finalised after its match has started (PR #375).

**Availability schedule.** The send and cut-off still build any missing drafts. Once the board
has drafted a weekend, that step creates none, so the "Draft sides are ready" notice no longer
fires for those sides. A round the board created has no step times, and the schedule runs its
send, reminder and cut-off on time as usual.

**Checks after deploy**

- Open the Hub on Monday morning, before the send. Every fixture of the weekend has a draft, and
  last week's players are in it, coloured by their replies.
- Press Previous. Last weekend opens with the "Past weekend · view only" badge, and nothing can
  be dragged or finalised.

## 4. Answers given in person, and naming private players

### Recording a Yes, Maybe or No

Open a player from the pool or a side. "Answer given in person" records Yes, Maybe or No and an
optional note for the weekend shown in the Hub. It works with the availability tool off.

- It applies to every date that weekend that the player is asked about (their grade's fixtures),
  plus the date of any side they are in. It replaces any earlier answer and its note.
- The Hub shows "Set by <name>" under the control. The change log reads "<player> recorded as
  available by <name>". Each record is logged against every side the player is in, or against the
  round when they're in none. A record made after the cut-off is marked late.
- The player's own answer from their link replaces it later, and "set by" clears.
- Admins can record for anyone. Captains can record only when the club's selection rule lets them
  pick sides in that section (never at an "admins only" club). A junior's answer is recorded from
  the Juniors board.
- A past weekend is read-only (409). The weekend must have a fixture for the player (409 otherwise).

Where to look: `availability_responses` rows with `source = 'admin'` (`set_by_name`,
`set_by_admin_id`, null for a captain), and `selection_events` with `action = 'status_set'`.

### "Show name publicly"

A player who is private on PlayHQ is "Private Player" on the club's published team list, and so on
the site and on social cards, which read that list. In Admin → Availability → the squad member's
edit drawer, an admin can turn on **Show name publicly** to name them on this club's surfaces.

- It stays off unless an admin turns it on. Only admins can change it, never captains. Each change
  stamps `show_name_publicly_by` and `show_name_publicly_at` and is logged
  ("squad public name changed").
- It is never offered for, and the server ignores it on, a junior or under-18 member. Junior
  privacy stays with the junior rules.
- It changes nothing on PlayHQ. A PlayHQ-sourced team list keeps PlayHQ's masking.
- A side that was already published keeps the name it was published with. Re-open and re-finalise
  it to apply a change.
- The Hub and the printed team sheet always show real names.
