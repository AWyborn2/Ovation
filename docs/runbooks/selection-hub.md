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

## 3. Private-player matching: the crosswalk backfill

PlayHQ lists a player who keeps their profile private as "Private Player". The Hub can't match that
by name, so it used to leave the slot as a gap "not on register" and the player dropped off the team
sheet. Since PR2 the gap keeps the row's PlayHQ participant ID, and the Hub's **PlayHQ players to
match** panel matches it to a squad member. The club remembers the match in
`squad_member_participants`, and every later draft, junior draft and "Use PlayHQ team" resolves
that player first. **Remembered matches → Unmatch** forgets one; sides already picked keep their
slots. Every match and unmatch is logged in `selection_events` (`match`, `unmatch`).

A junior side only ever takes junior members: a remembered match that points at a senior record is
ignored there. A senior side may take a junior playing up, as its pool does.

**One-off backfill (per club, after migration 0046 is in production).** Most private players
already appear on older team lists under a name or a linked player that resolves to one member. The
backfill remembers those, so admins only match the rest by hand. It never overwrites a match an
admin made, never writes a participant whose rows point at different members, and inserts nothing
new when re-run. It previews by default; `--apply` writes.

Assistant sessions can't reach production, so Ash runs it from the Replit Shell, with `DATABASE_URL`
set to the **production** database's connection string for that one command (copy it from the
Production database pane; don't save it to a file or paste it anywhere else):

1. Find the club's tenant id (read-only, Production SQL runner):

   ```sql
   select id, slug, name from tenants order by id;
   ```

2. Preview. It writes nothing and prints a summary (`insert`, `already`, `conflict`,
   `conflict_existing`, `unresolvedRows`). The full plan goes to
   `scripts/exports/selection-crosswalk-backfill-<tenant>-<time>/plan.csv`, which holds player
   names. That folder is git-ignored: never commit it.

   ```bash
   DATABASE_URL='<production connection string>' pnpm --filter @workspace/scripts run selection-crosswalk-backfill -- --tenant=<id>
   ```

3. If the plan looks right, write it. `--yes` confirms writing to a non-local database:

   ```bash
   DATABASE_URL='<production connection string>' pnpm --filter @workspace/scripts run selection-crosswalk-backfill -- --tenant=<id> --apply --yes
   ```

4. Check (read-only). Backfilled rows have `created_by = 'backfill'`, and Hub matches carry the
   name of the admin or captain who made them:

   ```sql
   select tenant_id, created_by, count(*) from squad_member_participants group by 1, 2 order by 1, 2;
   ```

Repeat steps 2 to 4 for each club. A `conflict` row in the plan is a participant ID on lists naming
different members (often a family PlayHQ account): leave it for an admin to match in the Hub.

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

## 5. PlayHQ's sides at any time, and "Fetch latest from PlayHQ"

**Why.** A fixture holds one team list. Finalising a side in the Hub writes its list there
(`source = 'selection'`), and re-opening the side keeps that list published. The PlayHQ sync never
overwrites a Hub or admin list before the match, so before migration 0059 a finalised-then-reopened
side could never "Sync from PlayHQ" again: the button stayed greyed out.

**What changed.**

- The sync now keeps the side the club named in PlayHQ on every team-list row
  (`team_lists.playhq_players` / `junior_team_lists.playhq_players`, with `playhq_seen_at`),
  whatever the row's `source`. The published list itself is unchanged.
- "Sync from PlayHQ" and "Sync all from PlayHQ" read that copy, so any draft can take PlayHQ's
  side at any time. A row the sync hasn't refreshed since 0059 falls back to a PlayHQ-sourced
  list's own players.
- **Fetch latest from PlayHQ** (admins only) asks the sync to collect the club's matches and named
  sides now, juniors too when junior sync is on. It is stored on the club
  (`tenants.playhq_fetch_requested_at`) and served as the `ondemand` plan by
  `GET /api/internal/playhq/plans` until a run of it lands; the ingest stamps
  `playhq_fetch_completed_at`. One request per club per 10 minutes; a request older than 6 hours
  is dropped. A fetch changes no draft: selectors apply PlayHQ's side with Sync from PlayHQ once it
  lands (the Hub refreshes every 15 seconds).
- With `PLAYHQ_DISPATCH_TOKEN` set, the API also starts the **PlayHQ sync** workflow at once
  (GitHub `workflow_dispatch` on `PLAYHQ_DISPATCH_REF`, default `main`). Without it, the request
  waits for the next hourly run. The workflow runs one at a time and GitHub drops a waiting run
  when another queues; that costs nothing, because the next run still collects the request.

**Deploy order (once).**

1. **Before republishing**, in the Production SQL runner, statement by statement:

   ```sql
   ALTER TABLE "team_lists"
     ADD COLUMN IF NOT EXISTS "playhq_players" jsonb,
     ADD COLUMN IF NOT EXISTS "playhq_seen_at" timestamp with time zone;
   ```

   ```sql
   ALTER TABLE "junior_team_lists"
     ADD COLUMN IF NOT EXISTS "playhq_players" jsonb,
     ADD COLUMN IF NOT EXISTS "playhq_seen_at" timestamp with time zone;
   ```

   ```sql
   ALTER TABLE "tenants"
     ADD COLUMN IF NOT EXISTS "playhq_fetch_requested_at" timestamp with time zone,
     ADD COLUMN IF NOT EXISTS "playhq_fetch_requested_by" text,
     ADD COLUMN IF NOT EXISTS "playhq_fetch_completed_at" timestamp with time zone;
   ```

   Check (read-only), expect 7 rows:

   ```sql
   select table_name, column_name from information_schema.columns
   where column_name in ('playhq_players', 'playhq_seen_at', 'playhq_fetch_requested_at',
                         'playhq_fetch_requested_by', 'playhq_fetch_completed_at');
   ```

2. **Optional, for the instant start:** create a GitHub fine-grained token for this repository only,
   with **Actions: read and write**, and save it in Replit Secrets as `PLAYHQ_DISPATCH_TOKEN`. Note
   its expiry date and renew it before then, like the cron-job.org trigger's token.
3. Republish. The next sync run fills the PlayHQ copies, and then a re-opened side can sync again.
   To fill them straight away, press **Fetch latest from PlayHQ** in the Hub.
