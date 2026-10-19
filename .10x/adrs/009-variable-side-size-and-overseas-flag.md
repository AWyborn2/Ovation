# ADR-009: Per-side size and per-season overseas flag

**Status:** Proposed (19 Oct 2026)
**Feature:** selection-side-size

## Context

Selection hard-codes the XI plus an optional 12th (`SIDE_SIZE=12`). This shows up on the client and
server, in OpenAPI, on the team sheet and in the card packs. Some competitions allow up to 14 players
with interchange, and cap the number of overseas players. There is no grades table: per-grade config
lives as jsonb maps on `availability_settings`.

## Decision

- Per-grade `side_sizes` and `overseas_caps` are jsonb maps on `availability_settings`. A missing
  key means 12 and no cap.
- Each draft fixes its own `side_size` when it is created. A shared `sideShape(size)` helper owns the
  role and label rules for the client and server. "12th" exists only when the size is 12.
- Overseas is a new `squad_member_seasons(member_id, season, overseas)` row. It is not carried over
  between seasons.
- Finalise snapshots `overseas`, the order and the twelfth flag into `team_lists.players`. Published
  surfaces render the snapshot.
- Over the cap, the hub warns and never blocks.

## Alternatives rejected

- **A `grades` table:** the right long-term model, but out of proportion here. Every existing
  per-grade setting is keyed on free text.
- **An `overseas` column on `squad_members`:** that is not per season, and would carry over silently.
- **Reading live flags on published sides:** history would change when flags change.

## Consequences

- Clubs at 12 see no change. The defaults are empty maps.
- Renaming a grade silently resets its size and cap to the defaults. Mitigation: the settings page
  shows unmatched keys.
- Each pack needs a 14-row auto-compress. This is guarded by a render test.
