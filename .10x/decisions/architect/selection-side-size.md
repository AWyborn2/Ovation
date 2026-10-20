# Selection side size + overseas players — Architecture (19 Oct 2026)

Requirements: `.10x/decisions/product-manager/selection-side-size.md`. ADR: `.10x/adrs/009-variable-side-size-and-overseas-flag.md`.

## Landscape (verified 19 Oct 2026)

- **There is no grades table.** A grade is free text. Per-grade selection config already lives as
  jsonb maps on `availability_settings` (one row per tenant), e.g. `team_sheet_overs: Record<grade, string>`.
  It is edited on `admin-availability.tsx` through `routes/availability-settings.ts`.
- **`squad_members` is one row per person per tenant, not per season.** Season-scoped club data
  follows the `shirt_numbers.season` pattern (integer start year, 2026 = 2026/27).
- **`selections.slots` is jsonb `SelectionSlot[]`**, so its length can vary without a schema change.
- **The size is hard-coded in several places:**
  - Server: `SIDE_SIZE=12` / `XI_SIZE` / `TWELFTH_INDEX` / `normaliseSlots` in `api-server/src/lib/selection-drafts.ts:64-86`.
  - Client: the same constants again in `components/selection/apply-move.ts:64-75`.
  - OpenAPI: `minItems`/`maxItems` 12 and slot `maximum: 12` (~15007, 15218, 15265).
  - The team sheet always renders `SIDE_SIZE` rows (`team-sheet.ts:507`).
  - Pack designs use `maxRows: 12` (bold-type, broadcast-dark, gold-foil, club-kit, neon-night, sunset).
  - The Studio `ck.xi-list` element calls `parseRows(…, 12)`.
- **The PlayHQ team-list import has no size cap**, and `pack-render/bind.ts` `teamList` doesn't slice.

## Decision summary

1. **Keep config with config.** Add two jsonb maps to `availability_settings`, keyed by app grade,
   following the `team_sheet_overs` pattern:
   - `side_sizes: Record<grade, number>`: 12–14. A missing key means 12.
   - `overseas_caps: Record<grade, number>`: 0–14. A missing key means no cap.
   - No grades table: introducing one is out of proportion for two integers, and every per-grade
     setting today is keyed on the free-text grade.
2. **The overseas flag goes in a new table**,
   `squad_member_seasons(tenant_id, member_id, season int, overseas bool, set_by_admin_id, set_at)`,
   unique on `(member_id, season)`. Tenant-scoped like the
   other `squad_*` tables. It is a separate table, not a column, because the PM rule is
   per season, with no automatic carry-over.
3. **Size is a property of the side, not a global constant.** Each side carries `sideSize` (resolved
   from the grade at draft creation). The slot array length = `sideSize`.
   - `SIDE_SIZE` becomes `DEFAULT_SIDE_SIZE = 12` and `MAX_SIDE_SIZE = 14`. `XI_SIZE = 11` stays.
   - `normaliseSlots(slots, sideSize)` pads to `sideSize` and never truncates filled slots.
   - `TWELFTH_INDEX` is only meaningful when `sideSize === 12`. Replace it with
     `hasTwelfth(side) = side.sideSize === 12`.
4. **Role and label rules come from one shared helper**, `sideShape(sideSize)` →
   `{ xi: 11, extras: sideSize-11, twelfthLabel: sideSize === 12 }`, in a shared module used by both
   the client and the server. This ends the duplicated constants.
   - At 12, today's behaviour holds: the 12th has no role and is labelled "12th".
   - Above 12, any slot can hold captain or keeper, and slots are numbered 1–N with no label.
   - Completeness is unchanged: the side is complete when the XI (first 11 slots) is filled.
5. **Snapshot at finalise.** Finalising and publishing copy into each published `TeamListPlayer` the
   facts that must not change afterwards:
   - `overseas: boolean`, read from `squad_member_seasons` for the fixture's season.
   - The order 1–N, plus `twelfth: true` only when the side size is 12.

   The team sheet, cards and public pages read the snapshot, not live flags, so past sides never
   change. Unfinalised drafts read live flags.

## Components and changes

| Area              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB (`lib/db`)     | Migration **0049** (idempotent): `availability_settings.side_sizes jsonb default '{}'`, `overseas_caps jsonb default '{}'`; table `squad_member_seasons`. Optional `selections.side_size smallint` (null = 12) so the size is fixed per draft.                                                                                                                                                                                                                            |
| Shared view-model | New `selection-shape.ts` (in `lib/scorecard` or a small shared lib) exporting `DEFAULT_SIDE_SIZE`, `MAX_SIDE_SIZE`, `XI_SIZE`, `sideShape`, `normaliseSlots`. `selection-drafts.ts` and `apply-move.ts` import it.                                                                                                                                                                                                                                                        |
| API               | `availability-settings`: read/write `sideSizes`, `overseasCaps` (validate 12–14 / 0–14). Board side gains `sideSize`, `overseas: {count, cap, over: bool}` (`cap` null when none), and per-slot `overseas`. Save validation accepts `11 ≤ len ≤ sideSize` (legacy 11 still allowed). New `PUT /squad/{id}/seasons/{season}` `{ overseas }` (admin), and `overseas` on `GET /squad` for the current season. OpenAPI first: `maxItems` 14, slot `maximum` 14, then codegen. |
| Drafts            | `selection-drafts.ts` seeds up to `sideSize` from the PlayHQ team list. Captain/keeper seeding past slot 11 is allowed when `sideSize > 12`.                                                                                                                                                                                                                                                                                                                              |
| Finalise          | The "Heads up" list adds "Overseas 2 / cap 1" when over the cap. It warns and never blocks. The XI open-slot warning is unchanged.                                                                                                                                                                                                                                                                                                                                        |
| Lowering size     | Settings save is allowed. Existing unfinalised drafts keep their `side_size`. A new draft uses the new size. The hub shows "Grade is now N — move K players out" if a draft is over the size. Finalise is blocked only if a draft has more players than `MAX_SIDE_SIZE` (impossible by validation). No silent deletion.                                                                                                                                                   |
| Hub UI            | `team-card.tsx`: render `sideSize` slots, a header count `n/11 +k`, an OS badge per slot and an overseas counter chip. `apply-move.ts`: replace `TWELFTH_INDEX` checks with `sideShape`. `labels.ts`, `player-matches.tsx`: "12th" only when `twelfthLabel`.                                                                                                                                                                                                              |
| Squad admin       | An "Overseas (2026/27)" toggle on the squad list/detail. A "Copy last season's overseas players" action (P2).                                                                                                                                                                                                                                                                                                                                                             |
| Team sheet        | `team-sheet.ts`: render `sideSize` rows, a "12th" row only at 12, and "OS" after the name when `overseas`. CSS so 14 rows plus the junior columns fit one A4 page (row height scales above 12).                                                                                                                                                                                                                                                                           |
| Messaging         | `availability-messaging.ts` / `availability-respond.ts`: "as 12th player" only when the side size is 12.                                                                                                                                                                                                                                                                                                                                                                  |
| Cards             | `bind.ts` `teamList`: pass `overseas` and `rowCount`. Each pack `team-list.ts`: `maxRows: 14` with auto-compress (row height and font scale by `12 / max(12, n)`). Studio `ck.xi-list`: `parseRows(…, 14)` and the same scaling. The "OS" badge is a small suffix on the name. A hidden player (`publicName` → "Private Player") gets no badge.                                                                                                                           |
| Public            | `GET /fixtures/:id/team-list` returns `overseas` from the snapshot, masked the same way as the name. `juniors-fixtures.tsx` shows the badge. The senior public team-list surface is to be confirmed in implementation.                                                                                                                                                                                                                                                    |

## Data flow

The admin sets the grade size and cap (settings), and the overseas flag per season (squad).

1. Draft created → `side_size` resolved from the grade → slots padded to that size.
2. Board read → per-slot live `overseas` plus the counter against the cap.
3. Finalise → warns if over the cap → publish snapshots `order`, `overseas` and `twelfth` into `team_lists.players`.
4. The team sheet, cards and public pages render from the snapshot.

## Failure modes

- **Grade text changes** (e.g. "A Grade" renamed): the map key misses, so the size falls back to 12
  and there is no cap. This is safe: it degrades to today's behaviour. The settings page lists
  unmatched keys.
- **Old clients posting 12 slots to a 14-side:** they are padded to `side_size` server-side. A client
  never loses slots it didn't see, because the server keeps existing slots beyond the posted length
  only if the version check passes. Otherwise it returns 409, as today.
- **Card overflow on a pack not updated:** the bind passes all rows. A pack still on
  `maxRows: 12` would drop rows, so a unit test renders every pack with 14 rows and asserts 14
  names.
- **Juniors:** the side-size map is keyed by grade. Junior grades keep 12 unless set. Juniors
  isolation is unaffected (same tables, same section split).

## Testing

- Shape helper: sizes 12 and 14 (roles, labels, completeness).
- `apply-move.test.ts` and `selection-hub.test.tsx` at 12 must pass unchanged. Add cases for 14.
- Team sheet HTML snapshot at 12 (unchanged) and at 14 with OS.
- Pack render: 14 rows in each pack.
- Squad seasons: tenant isolation (`tenant-isolation.test.ts` pattern), and no carry-over across
  seasons.
- Finalise: over the cap warns but succeeds. The snapshot is immutable after the flag changes.

## Migration and rollout

- 0049 is additive and idempotent. Ash runs it in Production SQL before republishing.
- Defaults (`{}`) leave every tenant exactly as today. The feature turns on only when an admin sets
  a size or cap, or ticks a player.
- Sequence after selection-hub-decoupling PR1–PR3, which touch the same files.

## Suggested slices

1. **PR A (foundation):** migration 0049, OpenAPI with codegen, the shared `selection-shape` helper,
   and replacing the constants on the server and client (no behaviour change at 12).
2. **PR B (side size):** settings UI and API, board/save/finalise/team sheet/messaging at N, the hub UI.
3. **PR C (overseas):** `squad_member_seasons`, the squad toggle, the board counter and finalise warning, the snapshot, the team-sheet OS.
4. **PR D (cards and public):** auto-compress in the packs and the Studio element, the OS badge, the public team list.

PR B and PR C can run in parallel after A. PR D needs both.
