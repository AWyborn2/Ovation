# Engineering Manager — selection-side-size

Inputs: `.10x/decisions/product-manager/selection-side-size.md` and
`.10x/decisions/architect/selection-side-size.md`. ADR-009 was accepted by Ash on 20 Oct 2026.
Side size is 12–14 and the overseas cap is 0–14.

## Current state (20 Oct 2026)

- selection-hub-decoupling PR0–PR3 have all merged (#376, #380, #381, #379), so the shared files
  (`selection-board.ts`, `selection-drafts.ts`, `apply-move.ts`, `team-card.tsx`) are stable.
- The team is Ash plus Claude sessions. The delivery shape is the same one Ash used for
  selection-hub-decoupling: a foundation PR in one session, then parallel sessions, each in its own
  worktree off `main`.

## Delivery shape

1. **PR A, the foundation.** One session, merged first. Every other slice touches the migration,
   `openapi.yaml` and the shape constants.
2. **PR B (side size) and PR C (overseas) in parallel sessions**, each a branch off `main` after
   PR A. Their shared files are `selection-board.ts` (board build and finalise warnings),
   `team-card.tsx` and `team-sheet.ts`. The sessions coordinate with `SendMessage`, and the second to
   merge rebases.
3. **PR D (cards and public) after both B and C have merged.** It needs `overseas` and the side size
   in the snapshot.
4. All PRs target `main`, none is stacked, and the auto-merge rule applies (green and CLEAN only).
   Ash runs migration 0049 in Production SQL before the first republish after PR A.

Estimates are in half-days (hd) and include tests.

### PR A — foundation, no behaviour change (about 3 hd)

| Task | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Est |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| TA.1 | Migration `0049_selection_side_size.sql`, idempotent: `availability_settings.side_sizes jsonb not null default '{}'` and `overseas_caps jsonb not null default '{}'`; `selections.side_size smallint null`; table `squad_member_seasons(id, tenant_id, member_id → squad_members, season int, overseas bool not null default false, set_by_admin_id, set_at)`, unique `(member_id, season)`. Drizzle schema to match, plus `db-drift-check`. Remember the central-defaults memory (not central here, but check that the push-built CI schema matches) | 1   |
| TA.2 | OpenAPI: `sideSizes` and `overseasCaps` on availability settings; on the board side, `sideSize`, `overseas {count, cap, over}` and a per-slot `overseas`; slot arrays `maxItems: 14` and move slot `maximum: 14`; `PUT /squad/{id}/seasons/{season}`; `overseas` on the squad member; `overseas` and `twelfth` on `TeamListPlayer`. Then codegen. New routes return 501 until their slice lands                                                                                                                                                       | 1   |
| TA.3 | A shared `selection-shape.ts` exporting `DEFAULT_SIDE_SIZE`, `MAX_SIDE_SIZE`, `XI_SIZE`, `sideShape`, `normaliseSlots(slots, size)`. Replace the constants in `selection-drafts.ts` and `apply-move.ts` and every `TWELFTH_INDEX` use (list in the architect doc). Size is fixed at 12 everywhere: all existing selection, team-sheet and availability-respond tests pass unchanged. Add unit tests for `sideShape` at 12 and 14                                                                                                                      | 1   |

### PR B — side size end to end (about 5 hd)

| Task | Description                                                                                                                                                                                                                                                                                   | Est |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| TB.1 | Settings API and validation (12–14), plus admin UI on `admin-availability.tsx` next to team-sheet overs: a per-grade size picker that lists unmatched grade keys                                                                                                                              | 1   |
| TB.2 | Drafts: resolve `side_size` when a draft is created; seed up to N from the team list or the previous round; captain/keeper allowed past slot 11 when N > 12. Save validation `11 ≤ len ≤ side_size`. Lowering the size: existing drafts keep theirs, and the board flags drafts over the size | 1.5 |
| TB.3 | Board and finalise: an `open`/`filled` count over the XI only, extras shown as `+k`, and publish order 1–N with `twelfth` only at 12. Messaging and `availability-respond`: "as 12th player" only at 12                                                                                       | 1   |
| TB.4 | Hub UI: `team-card.tsx`, `apply-move.ts` rules, `labels.ts`, `player-matches.tsx`; slots 1–N, no "12th" above 12                                                                                                                                                                              | 1   |
| TB.5 | Team sheet: N rows, the "12th" row only at 12, and 14 rows plus the junior columns on one A4 page. Snapshot tests at 12 (unchanged) and 14                                                                                                                                                    | 0.5 |

### PR C — overseas players (about 4 hd)

| Task | Description                                                                                                                                                                                                    | Est |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| TC.1 | `PUT /squad/{id}/seasons/{season}` (admin, tenant-scoped); `overseas` for the current season on `GET /squad`; a tenant-isolation test; no carry-over across seasons                                            | 1   |
| TC.2 | Squad admin UI: an "Overseas (2026/27)" toggle on the list and detail                                                                                                                                          | 0.5 |
| TC.3 | Caps: settings API and UI for `overseasCaps` (0–14, blank = none)                                                                                                                                              | 0.5 |
| TC.4 | Board: per-slot `overseas` (live for drafts) and an `overseas {count, cap, over}` counter; the finalise "Heads up" warns over the cap and never blocks; publish snapshots `overseas` into `team_lists.players` | 1   |
| TC.5 | Hub UI: OS badge and counter chip (with a text cue, not colour alone). Team sheet: "OS" after the name, from the snapshot once finalised                                                                       | 1   |

### PR D — cards and public (about 3 hd)

| Task | Description                                                                                                                                                                                                                                          | Est |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| TD.1 | `bind.ts` `teamList`: pass `overseas` and the row count. Each pack `team-list.ts` (bold-type, broadcast-dark, gold-foil, club-kit, neon-night, sunset): `maxRows: 14` with auto-compress. A render test for every pack with 14 rows asserts 14 names | 1.5 |
| TD.2 | Studio `ck.xi-list`: `parseRows(…, 14)`, scaling, OS suffix; the sample rows drop "12th" when N > 12                                                                                                                                                 | 0.5 |
| TD.3 | Public: `GET /fixtures/:id/team-list` returns `overseas`, masked with the name by `publicName`. Show the badge in `juniors-fixtures.tsx` and on any senior public team-list surface (confirm one exists)                                             | 1   |

**Total: about 15 hd.** On the critical path that is A (3) → the longer of B and C (5) → D (3), about 11 hd.

## Risks

- **Card legibility at 14 plus OS** may fail on the tightest pack. TD.1 should screenshot each pack early and raise it with Ash rather than redesign.
- **Grade key drift** (renamed grades fall back to 12). TB.1 surfaces unmatched keys.
- **B and C collide in `selection-board.ts` and `team-card.tsx`.** Keep edits additive, and the second PR rebases.
- **Local Windows test setup is flaky** (see memory). Rely on CI for the full suite, and use Prettier 3.9.6 before pushing.

## Definition of done (per PR)

CI green and CLEAN; grades at 12 show no visible change; the PR body lists any production SQL; the
status and handoff files are updated.
