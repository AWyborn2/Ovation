# Selection Hub redesign: delivery plan (21 Oct 2026)

Inputs: `decisions/product-manager/selection-hub-redesign.md`,
`decisions/architect/selection-hub-redesign.md`, `docs/design-handoffs/selection-hub-redesign/README.md`.
Client only, no migration, no production SQL for Ash.

## Sequencing

Two PRs in sequence. PR 2 stacks on PR 1 because both edit `selection-hub.tsx` and `team-card.tsx`,
so running them in parallel would only produce conflicts. One SDE session at a time (WIP = 1).
selection-hub-decoupling PR1–PR3 wait until PR 2 merges.

## PR 1: layout (branch `wyborn21/ovation-selection-hub-redesign-9ab7a5`). Estimate M (1–2 days)

| Task | Work                                                                                                                                                                                                                      | Files                                               | Size |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---- |
| T1.1 | `AdminSidebarSlotContext` (node, mode, setMode); Menu/Pool toggle on `/admin/selection` only; pool mode hides Jump-to/nav/footer; localStorage `selection-sidebar-mode` in try/catch; hub `main` padding `px-6 pt-4 pb-8` | `components/admin-layout.tsx`                       | S    |
| T1.2 | `PlayerPool` `variant: "inline" \| "sidebar"` (container + header, footer hint, drop hint); all groups collapsible with the default-open map                                                                              | `components/selection/player-pool.tsx`              | S    |
| T1.3 | Hub portals the pool into the slot at the `nav` breakpoint or wider in pool mode, otherwise inline; exactly one mounted                                                                                                   | `pages/selection-hub.tsx`                           | S    |
| T1.4 | `use-hub-view.ts` with pure focus rules (min 1, max 3, drop oldest, grade order, prune unknown ids, default first 3, 1 on narrow) + unit tests                                                                            | new `components/selection/use-hub-view.ts` + test   | S    |
| T1.5 | `grade-chip-bar.tsx` (chips, lock, filled/size count, Focus/Board toggle); team grid N columns in Focus, auto-fill 300px in Board                                                                                         | new `grade-chip-bar.tsx`, `pages/selection-hub.tsx` | M    |
| T1.6 | Compact two-row round strip (switcher + legend; steps, % replied, stacked bar); club rule moves to an info tooltip                                                                                                        | `round-header.tsx`, `weekend-switcher.tsx`          | S    |
| T1.7 | Tests: toggle only on the hub; portal and inline fallback; existing selection tests green                                                                                                                                 | `selection-hub.test.tsx`, new admin-layout test     | S    |

## PR 2: interaction (branch stacked on PR 1). Estimate M–L (2–3 days)

| Task | Work                                                                                                                                          | Files                                                | Size |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---- |
| T2.1 | Pure `rankCandidates(pool, sides, sideId, query)` + unit tests (status → unpicked → lastGrade match → name; excludes members of this side)    | new `components/selection/rank-candidates.ts` + test | S    |
| T2.2 | Pure `sideNeedsAttention(side, pool)` (no captain/keeper, OS over cap, picked player said no) + tests; red dot on the chip                    | new `side-health.ts` + test, `grade-chip-bar.tsx`    | S    |
| T2.3 | `fill-popover.tsx`: Radix Popover with a virtual anchor; fill mode (search, ranked list, ↑↓↵esc, Back to pool); builds `MoveAction` → `act()` | new `fill-popover.tsx`                               | M    |
| T2.4 | Place mode ("Add to…" sides list, focused first, disabled reasons); pool-chip tap opens it on desktop, `MoveDialog` kept for touch/narrow     | `fill-popover.tsx`, `player-pool.tsx`, hub           | S    |
| T2.5 | `TeamCard` `onSlotClick` + "Find player" affordance on editable open slots; card border on drag hover via `:has([data-drop-state])`           | `team-card.tsx`                                      | S    |
| T2.6 | Toast copy from spec §9 on every move                                                                                                         | `pages/selection-hub.tsx`                            | S    |
| T2.7 | RTL tests: popover keyboard → `act` called with the right action; Finalised side disabled                                                     | new `fill-popover.test.tsx`                          | S    |

## Definition of done (each PR)

- `pnpm typecheck` and the cricket-club tests pass (see memory: local vitest needs the win32 binaries).
  Prettier 3.9.6 has been run.
- Browser check in the preview: drag from the sidebar pool into a focused card and back, Focus/Board
  switching, light and dark theme, and a narrow width (inline pool). Screenshot in the PR.
- CI green + `mergeStateStatus: CLEAN` → auto-merge per CLAUDE.local.md. Before PR 1 merges with
  `--delete-branch`, retarget PR 2 to `main`.

## Risks

- **Drag across the sticky sidebar.** `elementFromPoint` should work, but verify it in the browser early
  (T1.3), before building more.
- **`selection-hub.tsx` growth** (617 lines). Keep new logic in the new modules; the page only wires them.
- **Concurrent hub work.** Check `main` for selection-side-size PR D and decoupling commits before each
  PR and sync with base first.
