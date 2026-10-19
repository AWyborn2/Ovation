# ADR-008: Selection rounds and drafts created on demand; availability is an optional layer

**Status:** Proposed, 19 Oct 2026 (awaiting Ash). **Feature:** selection-hub-decoupling.

## Context

Selection Hub drafts exist only once the availability send runs, so clubs can't plan ahead, can't
review earlier weekends, and can't use the hub without the availability tool. Private players from
PlayHQ go unmatched because the matcher ignores the participant GUID.

## Decision

- The board creates the round and any missing drafts for the requested current or future weekend
  each time it loads, whatever the availability settings. Past weekends are read-only and are never
  created.
- A new draft starts from the previous round's selection for the same grade, falling back to the last
  team list. It keeps every player. Status is a read-time colour: yellow for no reply or Maybe, green
  for Yes, red for No.
- Admin-entered replies share `availability_responses`, with `source = 'admin'`. A later member reply
  overwrites them.
- A tenant-scoped `squad_member_participants` crosswalk is the first matching rule. It is filled by
  the hub's "Match to squad member" action and by a one-off backfill.
- `squad_members.show_name_publicly` (admin only, default off, never applied to juniors) controls the
  masking on public surfaces.

## Consequences

- Availability becomes a layer on top of the same rounds and selections, with no new subsystem.
  Option 2 (a separate planning entity) was rejected as churn.
- Rounds can exist with null schedule timestamps. The schedule must treat these as not yet started
  (it already does).
- Removing the Yes-only pruning changes draft behaviour for clubs that use availability. Ash accepted
  this deliberately.
- One additive migration (0046), applied by hand in production before republishing.
