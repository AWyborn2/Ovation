# Engineering Manager — selection-hub-decoupling

Inputs: `.10x/decisions/product-manager/selection-hub-decoupling.md` and
`.10x/decisions/architect/selection-hub-decoupling.md`. ADR-008 was accepted by Ash on 19 Oct 2026.

## Delivery shape (agreed with Ash 19 Oct 2026)

Ash asked for parallel agents. Running the slices in parallel only works once the shared surface has
landed, because every slice touches `selection-board.ts`, `selection-hub.tsx`, `openapi.yaml` and the
migration. So the shape is:

1. **PR0, foundation**, done sequentially in one session and merged first.
2. **PR1, PR2 and PR3** in three parallel sessions. Each has its own worktree and its own branch cut
   from `main` after PR0. Each brief carries the other sessions' ids so they can coordinate edits to
   shared files with `SendMessage`.
3. **Merge order PR1, then PR2, then PR3.** A later PR rebases onto `main` after the earlier one
   merges. The auto-merge rule from CLAUDE.local.md applies (green and CLEAN only). PR2 and PR3 are
   not stacked on PR1; all three target `main` (see the memory note on stacked PRs and
   `--delete-branch`).

Estimates are in half-days (hd) and include tests.

### PR0 — foundation (about 3 hd)

| Task | Description                                                                                                                                                                                                                                                                                                    | Est |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T0.1 | Migration `0046_selection_hub_decoupling.sql` (idempotent): `availability_responses.source` (default `'member'`), `set_by_admin_id` and `set_by_name`; `selection_events.round_id`; table `squad_member_participants`; `squad_members.show_name_publicly`. Drizzle schema to match, plus a db-drift check      | 1   |
| T0.2 | OpenAPI: `weekend` query and `weekends {previous,current,next}` on the board; `gap.participantId`; reply `source` and `setByName`; `PUT /selection/members/{id}/status`; match and unmatch slot endpoints; `showNamePublicly` on the squad member. Then codegen. The routes return 501 until their slice lands | 1   |
| T0.3 | Extract `lib/availability-replies.ts` `writeReply()` from `upsertAnswers`, with no behaviour change (the availability-respond tests stay green). Add `publicName()` in `selection-published-players.ts` and replace the inline checks with it, also with no behaviour change while the flag is false           | 1   |

### PR1 — draft any time, carry-over, colours and round navigation (about 5 hd), slices §1 and §2

| Task | Description                                                                                                                                                                                     | Est |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T1.1 | Board load calls `ensureRound` and `prepareRoundDrafts` whatever the settings or send state; the per-side unique-violation race is handled; extend `selection-standalone` and `selection` tests | 1   |
| T1.2 | Seed from the previous round's selection (final first, then draft), falling back to the team list; remove Yes-only pruning; record `seededFrom` in the event detail; extend draft tests         | 2   |
| T1.3 | `weekend` param and `weekends` nav; past rounds read-only (409 `round_closed`) and never created; next weekend only when fixtures exist                                                         | 1   |
| T1.4 | Hub UI: round switcher; slot status colours (yellow none or maybe, green yes, red no) with icon or label; empty and read-only states                                                            | 1   |

### PR2 — private-player mapping (about 3 hd), slice §4

| Task | Description                                                                                                                                                           | Est |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T2.1 | `buildMemberMatcher`: participant crosswalk rule first; the draft gap carries `participantId`; extend `selection-playhq-sync` tests                                   | 1   |
| T2.2 | Match and unmatch endpoints (tenant- and section-scoped, audited); hub "Match to squad member" on gaps and "Unmatch"; team sheet test: a mapped private player prints | 1   |
| T2.3 | Backfill script (`scripts/`): seed the crosswalk from resolved `team_lists` rows, run per tenant, report to `scripts/exports/`                                        | 1   |

### PR3 — admin status and public-name toggle (about 3 hd), slices §3 and §5

| Task | Description                                                                                                                                                                                                               | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T3.1 | `PUT /selection/members/:id/status` uses `writeReply(source='admin')` for every date in the round, logs a `status_set` event with `round_id`, and is read-only for past rounds; a later member reply overwrites it (test) | 1   |
| T3.2 | Hub UI: a status control on a member or slot (Yes, Maybe or No plus a note) and "set by <name>"                                                                                                                           | 1   |
| T3.3 | `show_name_publicly`: admin-only edit, audited; ignored for juniors and under-18s; published list test with the toggle on and off; isolation and junior tests                                                             | 1   |

## Sequencing and dependencies

- PR0 blocks everything else. Run PR0 here, merge it, then start the three sessions.
- **Shared-file hot spots** to coordinate over `SendMessage`:
  - `selection-board.ts`: PR1 owns the load path, PR2 the gap shape and matcher hook, PR3 the
    status read.
  - `selection-hub.tsx`: PR1 the switcher and colours, PR2 the gap actions, PR3 the status control.
    Each puts its UI in a new component under `components/selection/` and touches the page only to
    mount it.
- Total: about 14 hd. Wall-clock with the three slices in parallel is roughly PR0 plus the longest
  slice (PR1).

## Risks

- **Rebase churn on `selection-board.ts`.** Mitigated by the component split and by merging in order.
- **Behaviour change** (no Yes-only pruning) for clubs using availability: called out in the PR1
  description and the release note.
- **Production migration 0046** must be applied by hand before republishing. That is Ash's step, once
  PR0 merges and before the first republish.
- **Windows local vitest** quirks (see memory). CI is the source of truth.

## Definition of done (per PR)

CI green and CLEAN, OpenAPI codegen clean, Prettier 3.9.6, the tests above added, and no change to the
juniors isolation or fill-in rules.
