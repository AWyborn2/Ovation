# Selection Hub decoupled from Availability — architecture (19 Oct 2026)

Requirements: `.10x/decisions/product-manager/selection-hub-decoupling.md`. ADR: `.10x/adrs/008-selection-rounds-on-demand.md`.

## Existing landscape (verified 19 Oct 2026)

- `availability_rounds` is unique on (tenant_id, weekend_date) and has no section column. `selections`
  is one row per fixture or junior fixture, holding 12 slots in jsonb, a `state` (draft or final) and a
  `version`. `selection_events` is the audit log. All of these live in `lib/db/src/schema/availability.ts`.
- Drafts are created only by `prepareRoundDrafts` (`availability-schedule.ts:843`), called from
  `runSend` and `runCutoff`. The schedule returns early unless `settings.enabled`. The board itself
  creates drafts only when availability is off (`selection-board.ts:344-353`).
- The senior seed is the most recent earlier `team_lists` entry for the grade
  (`selection-drafts.ts:237-320`). It keeps a player only on a Yes reply (`buildDraftSlots`, :97).
- `buildMemberMatcher` (`availability-grades.ts:97`) matches by `linkedPlayerId`, then by name. It
  never uses the PlayHQ participant GUID, even though PlayHQ team-list rows carry it, "Private Player"
  rows included (`playhq-ingest/team-lists.ts:114`). That is the root cause of private players going
  missing: the slot becomes a "not_on_register" gap.
- Replies are written only by the token-bound `upsertAnswers` (`availability-respond.ts:289`), with no
  source or actor and no event row.
- Public masking lives in `selection-published-players.ts` (:18, :123-129) and is driven only by
  `squad_members.is_private`.

## Options considered

1. **Extend in place (chosen).** Rounds and drafts are created on demand by the board for any weekend.
   The seed becomes the previous selection. Replies gain `source`. Members gain a participant-GUID
   crosswalk and a public-name flag. This reuses every existing table and test suite, adds no new
   subsystem, and keeps availability optional on top of the same rows.
2. **A separate "planning week" entity** decoupled from `availability_rounds`, with availability
   attaching to it. The model is cleaner, but every selection, finalise, PlayHQ-sync and team-sheet
   path would need re-keying, plus a data migration. That is too much churn for no user-visible gain.
3. **Client-side drafts** until a round exists. Rejected: drafts would not be shared between selectors,
   would have no audit trail and would be lost between devices.

## Design (option 1)

### 1. On-demand rounds and round navigation (P0/P1)

- `GET /selection/board?section=&weekend=YYYY-MM-DD`. Without `weekend`, the board shows the current
  weekend (`roundWeekendFor`). The response adds `weekends: {previous, current, next}`, worked out from
  fixture dates (the nearest weekend with fixtures on each side). The UI navigates with these.
- The board calls `ensureRound(tenant, weekend)` and then `prepareRoundDrafts` **on every load,
  whatever the availability settings or send state**. Both are idempotent (on-conflict-do-nothing,
  missing sides only). This removes the "No drafts yet" gate. `runSend` and `runCutoff` keep calling
  `prepareRoundDrafts`, which becomes a no-op once the board has run it.
- The schedule step timestamps stay owned by `runAvailabilitySchedule`. A round the board created has
  null step timestamps, and the schedule fills them in later, unchanged.
- **Read-only past rounds.** When the weekend is before the current one, `saveBoard`, finalise and
  admin status edits return 409 `round_closed`. Finalising a side after the match has started stays
  allowed for the current round (PR #375 behaviour). Editing past rounds is out of scope.
- The future-weekend limit is the next weekend that has fixtures. Nothing beyond the fixtures PlayHQ
  has published.

### 2. Carry-over seed (P0)

- New seed order for a side: (a) the same grade's selection in the **previous round that has one**,
  final first, then the latest draft; (b) failing that, the current rule, the most recent earlier
  `team_lists` entry. Store `seededFrom: {kind: 'selection' | 'team_list', id}` in the draft event
  `detail`, replacing the bare `seededFromFixtureId`.
- `buildDraftSlots` keeps **all** carried players, with no Yes-only pruning, in both modes. Captain
  and keeper carry over too.
- Slot status is derived at read time, never stored. The board already returns each member's
  `status`. The UI maps it to three tiers (Ash, 19 Oct 2026): **yellow** for no reply or Maybe
  (draft, still to confirm), **green** for Yes, **red** for No (including away or withdrawn). When the
  availability tool is off, a slot with no reply is yellow until an admin sets a status.
  Colour must not be the only cue: each tier also gets an icon or text label, for accessibility and
  so that it reads on the printed sheet if it is ever shown there. The team sheet itself prints no
  status.
- Multiple sides in the same grade: map each prior side to the current side in fixture order, as
  today. A side with no prior equivalent falls back to the team list.

### 3. Admin-set (verbal) status (P0)

- Migration: `availability_responses` gains `source text not null default 'member'` (values `member`
  or `admin`), `set_by_admin_id int null` and `set_by_name text null`.
- Extract the core of `upsertAnswers` into `lib/availability-replies.ts`:
  `writeReply({roundId, memberId, date, status, note, source, slot, actor})`. The token route calls it
  with `source = 'member'`, so the token route behaves exactly as before.
- New route `PUT /selection/members/:memberId/status`, taking `{weekend, status, note}`. Admins and
  captains can call it, scoped to the tenant and to the member's section (juniors through the juniors
  board only). It writes every fixture date of that round for the member, with `source = 'admin'`.
  `late` is computed as it is today. It logs a `selection_events` row
  (`action = 'status_set'`, `detail: {memberId, status, note}`) against each of the member's selected
  sides in the round, or against no side at all: add a nullable `round_id` column on
  `selection_events`, so that a status set for a pool player is still audited.
- A later reply from the member's link overwrites it, with `source` going back to `member`, because
  the unique key is unchanged. The board shows "set by <name>" whenever `source = 'admin'`.
- The OpenAPI spec comes first: `lib/api-spec/openapi.yaml`, then codegen.

### 4. Private-player mapping (P0)

- Migration: a new table `squad_member_participants (tenant_id, participant_id text, member_id → squad_members, created_by, created_at)`,
  unique on (tenant_id, participant_id). This crosswalk is tenant-scoped; the `player_id_map` pattern
  is reused deliberately and not changed. The import or link path seeds it whenever a member's
  participant GUID is known.
- `buildMemberMatcher` adds a **first** rule: `entry.participantId` matched through this crosswalk.
  The existing order (`linkedPlayerId`, then name) follows. This makes PlayHQ lists, drafts and
  `selection-playhq-sync` all resolve private players automatically.
- **Hub action for a gap** with reason `not_on_register`: "Match to squad member". This writes a
  crosswalk row when the gap carries a `participantId`, and fills the slot. The gap shape grows an
  optional `participantId`, so `SelectionSlot.gap` becomes `{name, reason, participantId?}`, an additive
  jsonb change. The hub shows the mapping, and "Unmatch" deletes the crosswalk row, which only affects
  future matching. Every match and unmatch is audited in `selection_events`.
- A row that carries no participant GUID falls back to a manual pick for that slot only, and nothing
  is remembered.

### 5. Public-name toggle (P1)

- Migration: `squad_members.show_name_publicly boolean not null default false`. Only admins can change
  it, through the squad member edit (not captains), and each change is audited.
- One function replaces the inline checks: `publicName(member) = !isPrivate || showNamePublicly ? realName : PRIVATE_PLAYER`
  in `selection-published-players.ts`, used by `selectionPublishedPlayers`,
  `loadSelectionParticipantIds` and the board dedupe (`selection-board.ts:1505`).
- **Juniors: the toggle is not offered** for `section = 'junior'` or under-18 members. The server
  ignores it for them. Junior surfaces stay governed by ADR-007 and `junior-privacy.ts`.
- Social cards and the site read the published team list, so they follow it automatically. Other
  `isPrivate` readers (`club-overlay*`, `match-detail`) are out of scope for this feature. They key on
  central privacy, not on squad members.
- The hub and the team sheet keep showing real names, unchanged.

## Failure modes

- **Board load races** (two selectors open the board at once): `ensureRound` and the selection unique
  keys absorb this. `prepareRoundDrafts` must catch the unique violation per side and re-read
  (verify that it does).
- **A PlayHQ list arrives after a selector's draft**: the existing rule holds. Drafts are never
  overwritten, and `selection-playhq-sync` only reconciles as it does today. The test suite must
  cover it.
- **Wrong mapping**: it is visible in the hub, undoable and audited. It never changes PlayHQ or
  central data.
- **The privacy toggle switched on by mistake**: it defaults off, is admin-only and audited, and never
  applies to juniors.
- **Opening a past round must not create rows**: for a weekend before the current one, the board
  reads only. No `ensureRound` and no drafts are created, which keeps history intact.

## Migration and rollout

- One idempotent migration, `0046_selection_hub_decoupling.sql`:
  `availability_responses.source/set_by_*`, `selection_events.round_id`,
  `squad_member_participants`, `squad_members.show_name_publicly`. All additive, with
  `IF NOT EXISTS`. Ash applies it in production before republishing, and the Drizzle schema must
  match it (see the memory note on production migration drift).
- **Backfill**: seed `squad_member_participants` from existing `team_lists` rows whose
  `participantId` already resolved to a single member, through `linkedPlayerId` or a unique name
  match. This is a script, run once per tenant and reported, never automatic.
- Delivery order: §1 + §2 (draft any time, carry over), then §4 (mapping), then §3 (status), then §5
  (toggle), then round navigation in the UI. Each slice is shippable on its own.

## Tests to add or extend

`selection-standalone`, `selection`, `selection-playhq-sync`, `selection-isolation` (crosswalk and
status are tenant-scoped), `selection-junior` (no toggle; juniors route only), `availability-respond`
(member reply overwrites admin), the team sheet (a mapped private player prints), and the published
list (toggle on or off).
