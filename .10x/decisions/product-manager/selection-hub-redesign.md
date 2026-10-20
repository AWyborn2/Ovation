# Selection Hub layout redesign — PM decision (20 Oct 2026)

Design source: `docs/design/selection-hub-redesign/` (handoff README + hi-fi prototype + wireframes;
Ash chose wireframe 2a "pool rail + focus + tap-to-fill").

## Problem statement

Selectors can't fill sides comfortably in the Selection Hub. With up to 8 senior grades in a
4-column grid, the Player Pool sits in a fifth column and scrolls away. To drag a player into a lower
team they have to scroll the whole page while dragging, and the only alternative is a dialog.

## Target user

Club admins and captains (selectors) at every tenant, mostly on desktop on Thursday/Friday nights,
filling 4–8 sides of 11–14 players.

## Decisions with Ash (20 Oct 2026)

1. **Scope: the full handoff** in this release. That covers the sidebar Menu/Pool toggle, the pool in
   the sidebar, Focus/Board views with the grade chip bar, the fill popover, the Add-to popover, the
   compact round strip and toasts.
2. **Sequencing: the redesign ships before selection-hub-decoupling PR1–PR3.** Those PRs build their
   UI on the new layout (the round switcher sits in the compact strip; admin-set status reuses the
   pool rows). It is a client-only change: no API change, no migration.

## Approaches considered

| Scope             | Includes                              | Cut                      | Risk                                          |
| ----------------- | ------------------------------------- | ------------------------ | --------------------------------------------- |
| Tap-to-fill only  | Fill popover on the existing layout   | Pool still scrolls away  | Low, but doesn't fix the problem              |
| MVP               | Pool in the sidebar + Focus mode      | Popovers, strip, toasts  | Low                                           |
| **Full (chosen)** | Everything in the handoff README §1–9 | Mobile bottom-sheet pool | Medium: admin-layout change, drag regressions |

## User stories and priority

- **P0.** As a selector, I want the player pool always on screen beside the teams, so that I can drag
  into any side without scrolling the page.
- **P0.** As a selector, I want to pick 1–3 grades to show at full size (Focus), with a Board view for
  all grades, so that I can work on the sides I'm filling now.
- **P0.** As a selector, I want to click an open slot and search ranked candidates by keyboard, so
  that I can fill a side without dragging at all.
- **P1.** As a selector, I want to click a pool player and choose "Add to…" a side.
- **P1.** As a selector, I want the grade chips to flag problem grades (no captain/keeper, overseas
  over cap, an unavailable player picked) so that I can see what still needs fixing.
- **P1.** Compact round strip (switcher, steps, % replied, reply bar) to reclaim vertical space.
- **P2.** Toast confirmations for every move.
- **P3.** Mobile bottom-sheet pool (narrow screens keep the inline pool + tap-to-fill).

## Acceptance criteria

- On `/admin/selection` at desktop width, the sidebar defaults to **Pool**. The choice persists in
  localStorage (`selection-sidebar-mode`), and Menu mode is the existing sidebar, unchanged. The
  toggle appears on no other route.
- The pool stays visible while the team grid scrolls, and its list scrolls on its own. Dropping a
  side player on it removes them from the side.
- Focus shows 1–3 sides side by side and never fewer than 1. Adding one past the max drops the
  oldest. Chips follow the club's configured grade order. Clicking a chip in Board switches to Focus
  on that grade. View and focused sides persist per section.
- The fill popover ranks candidates by status (yes → maybe → none → no), then unpicked before picked,
  then last grade == this grade, then name. It excludes players already in the side, works with
  ↑/↓/Enter/Esc only, and replacing an occupant sends them back to the pool.
- Every move (drag, fill, Add-to) goes through `apply-move.ts` and the existing save-board mutation.
  Finalised sides refuse drops and fills. The existing `use-pointer-drag` stays (no HTML5 DnD).
- Theme tokens only, so it renders correctly for every tenant in light and dark. No HHCC hexes.
- Existing selection tests stay green. New tests cover chip-bar focus rules, fill ranking and keyboard
  handling, and the sidebar mode toggle.

## Success criteria

- A selector can fill a full side with no page scroll and no drag (keyboard only, through tap-to-fill).
- Ash and one other club's selector finish a round's selection on the new layout without falling back
  to Menu mode mid-task.
- No increase in board save errors or reported "player went to the wrong side" issues in the first two
  rounds after release.

## Out of scope

- Any API, schema or migration change. Round navigation, admin-set status and private-player mapping
  stay with selection-hub-decoupling.
- A mobile bottom-sheet pool (P3). Below the `nav` breakpoint the pool stays inline.
- Juniors hub changes (juniors isolation holds; the pool shows seniors only, as today).

## Risks

- **Admin layout change leaks to other pages.** Mitigation: the toggle is gated to the route, and a
  test asserts Menu is unchanged elsewhere.
- **Drag regressions** when the pool moves into the sidebar (drop-zone hit testing across the sticky
  sidebar). Watch for it in the browser check before merge.
- **Merge conflicts with decoupling.** Mitigation: the redesign lands first, then decoupling rebases.
