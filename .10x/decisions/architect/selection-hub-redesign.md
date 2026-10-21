# Selection Hub redesign: architecture (21 Oct 2026)

Inputs: `decisions/product-manager/selection-hub-redesign.md`, `docs/design/selection-hub-redesign/README.md`.
Level: component (client only). No API, schema or migration change.

## Findings in the code (verified 21 Oct 2026)

- `AdminLayout` (`components/admin-layout.tsx:54`) owns a sticky `h-screen w-64` `<aside>`. It renders
  `AdminSidebar` and already knows `isSelectionHub`. `menuCollapsed` hides the aside.
- The hub page (`pages/selection-hub.tsx`, 617 lines) owns all the board state: the query, `local`
  optimistic board, `act()` → `applyMove` → `save.mutate`, `usePointerDrag`, and `MoveDialog`. It renders
  `PlayerPool` in a `lg:grid-cols-[1fr_340px]` grid.
- `usePointerDrag` hit-tests with `document.elementFromPoint` + `closest("[data-drop]")`, so it does not
  depend on where in the DOM the pool sits.
- `SelectionMember.lastGrade`, `status`, `junior` and OS flags already feed the fill ranking. Grade
  order is the order of `view.selections` (the club's configured order).
- `components/ui/popover.tsx` (Radix) and `hooks/use-toast` exist.

## Options

| Option                                                  | How the pool gets into the sidebar                                                                                                                     | Trade-off                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Sidebar slot + portal (chosen)**                   | `AdminLayout` exposes a `SidebarSlot` context: a DOM node to render into and a `mode` (`menu`/`pool`). The hub `createPortal`s `<PlayerPool>` into it. | State stays in the hub page, which owns it today. React events and context still flow through the portal. Small, reversible.          |
| B. Lift board state into a context above `AdminLayout`  | A provider wraps the layout. The sidebar reads pool data from the context.                                                                             | Moves 600 lines of hub state out of the page and couples the layout to the selection domain. Large diff that clashes with decoupling. |
| C. Hub renders its own rail and hides the admin sidebar | Hub sets `menuCollapsed` and renders a sticky left rail in `main`.                                                                                     | Simplest, but duplicates the sidebar shell. The spec says the Menu/Pool toggle lives in the admin sidebar.                            |

**A is chosen** because the layout learns about a generic slot, not the selection domain, and the
decoupling PRs keep editing one page component.

## Components

- **`admin-layout.tsx`**: add `AdminSidebarSlotContext { node: HTMLElement | null; mode; setMode }`.
  On `/admin/selection` only, render the segmented Menu/Pool toggle under the brand row. In pool mode,
  hide Jump-to, nav and footer, and render an empty `flex-1 min-h-0` div whose ref becomes `node`.
  `mode` persists in localStorage `selection-sidebar-mode`, defaults to `pool`, and is read in a
  try/catch. Reduce `main` padding on the hub to `px-6 pt-4 pb-8`.
- **`selection-hub.tsx`**: if `slot.node && slot.mode === "pool"` and the viewport is at least `nav`,
  portal the pool into it. Otherwise render it inline as today (mobile, menu mode, collapsed sidebar).
  Exactly one `PlayerPool` is mounted at a time.
- **`player-pool.tsx`**: add a `variant: "inline" | "sidebar"` prop that only changes the container
  classes and header (spec §3). Collapsible groups use the default-open map (Available/Maybe/No reply
  open). The whole pool stays `data-drop="pool"`.
- **New `grade-chip-bar.tsx`**: the chips and Focus/Board toggle are pure presentational components.
  Attention is derived by a pure `sideNeedsAttention(side, pool)` helper in `labels.ts` or a new
  `side-health.ts`: no captain, no keeper, OS over cap, or a picked player with status `no`.
- **New `use-hub-view.ts`**: `{ view, focusedSideIds, toggle, focusOnly }`, persisted per section in
  localStorage. The focus rules (min 1, max `MAX_FOCUS = 3`, drop the oldest, keep grade order, prune
  ids not in the current board) live in pure functions so they can be unit-tested.
- **`team-card.tsx`**: an `onSlotClick(sideId, index, anchorEl)` prop, the "Find player" affordance on
  open slots when the side is editable, and the card border `blue-500` while a drag hovers inside it
  (CSS `:has([data-drop-state])`, so no new state).
- **New `fill-popover.tsx`**: Radix Popover anchored with a virtual ref to the slot element. It has two
  modes, `fill {sideId,index}` and `place {memberId}`. Ranking is the pure `rankCandidates(pool, sides,
sideId, query)` in its own module (unit-tested). The keyboard list uses roving `aria-activedescendant`.
- **`round-header.tsx`**: a compact two-row variant (spec §4). The club-rule line moves to an info
  tooltip.
- **`move-dialog.tsx`**: stays for touch and narrow screens. On desktop, a pool-chip tap opens the
  `place` popover.

## Data flow (unchanged core)

Every mutation path (drag drop, fill row, place row, Back to pool) builds an existing `MoveAction` and
calls the hub's `act()`. That runs `applyMove` → optimistic `local` → `save.mutate` with the side
version → toast. The popovers never call the API themselves. No new endpoints.

## Failure modes

- **Version conflict or save failure**: the existing `fail()` path rolls back `local` and toasts.
  Popovers close before `act()`, so a stale popover can't double-submit.
- **Finalised side**: `applyMove` already refuses, and the popover shows the row disabled.
- **The slot node unmounts** (switching to Menu mid-drag): the pool unmounts and the drag's pointerup
  finds no `pool` zone, so the move is a no-op, same as dropping outside. Accepted.
- **localStorage is blocked**: fall back to the defaults.
- **Board changes** (refetch, new section): `focusedSideIds` is pruned to existing ids, and if that
  leaves it empty the first three sides are used.

## Testing

Pure unit tests cover `rankCandidates`, the focus rules and `sideNeedsAttention`. RTL tests cover the
sidebar toggle rendering only on the hub, the pool portal and inline fallback, and fill popover
keyboard (↑↓↵esc) → `act` called with the right `MoveAction`. Existing `selection-hub.test.tsx` and
`apply-move.test.ts` must stay green. Browser check: drag from the sidebar pool into a focused card,
dark and light themes.

## Delivery split

- **PR 1 (layout):** sidebar slot + toggle, pool in the sidebar, chip bar + Focus/Board, compact round
  strip, padding.
- **PR 2 (interaction):** fill popover, place popover, Find-player affordance, attention dots, toast
  copy.

PR 2 stacks on PR 1. Retarget it to `main` before merging PR 1 (see memory: stacked PRs +
delete-branch).
