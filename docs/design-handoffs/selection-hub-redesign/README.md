# Handoff: Selection Hub redesign — pool in side panel, focus mode, tap-to-fill

## Overview

The Selection Hub (`/admin/selection`) is cramped: with 8 senior grades in a 4-column grid, the Player Pool sits in the 5th column and scrolls away, so dragging a player from the pool into a lower team means scrolling the whole page. This redesign:

1. **Moves the Player Pool into the admin side panel** (the 256px sidebar from `admin-layout.tsx`). A segmented toggle at the top of the sidebar swaps between the normal **Menu** and the **Player pool**. The sidebar is `position: sticky; height: 100vh`, so the pool is always on screen while teams scroll; its list scrolls independently.
2. **Adds a Focus mode** — a row of grade chips picks 1–3 grades (configurable max) to show side-by-side at full size; a **Board** toggle restores the all-grades grid.
3. **Adds tap-to-fill** — clicking an open slot opens a search popover with ranked candidates (keyboard-driven), so filling a side doesn't require dragging at all. Clicking a pool player opens an "Add to…" list of sides.

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behaviour, not production code. Recreate it inside the existing Ovation web app (`artifacts/cricket-club`, React + Vite + Tailwind v4) using its established components, tokens (`src/index.css`), and the existing selection components in `src/components/selection/*`. Do not ship the HTML.

The prototype uses HTML5 drag-and-drop for brevity; the real app already has `use-pointer-drag.ts` (pointer-based, touch-capable, `data-drop` zones) — **keep using that**.

## Fidelity

**High-fidelity** for the new layout pieces (sidebar toggle, grade chip bar, view toggle, compact round strip, popover). Team cards, player chips and pool groups are recreated from the existing components (`team-card.tsx`, `player-chip.tsx`, `player-pool.tsx`, `status-tier.tsx`) — reuse those components rather than re-implementing. Colours in the prototype are the HHCC tenant's resolved dark theme; in code use the theme tokens (`bg-card`, `border-border`, `bg-primary`, `text-primary-text`, `--win-fg`, etc.), which are derived per tenant.

`Selection Hub Wireframes.dc.html` is **low-fidelity** exploration (turn 1: six pool placements; turn 2: three combinations). Reference only.

## Screens / Views

### 1. Admin shell (unchanged except sidebar content)

- Sidebar: `w-64` in code (prototype uses 272px; either is fine — 256 fits the pool chips), sticky, full height, `bg-card`, right border.
- Top bar: unchanged (`h-[60px]`, glass background, panel collapse button, breadcrumb, bell, "Create a card"). The collapse button continues to hide the whole sidebar (`menuCollapsed`). When hidden, the pool is hidden too — fallback: users can still use tap-to-fill.
- `main` padding on the Selection Hub reduced from `p-8` to `px-6 pt-4 pb-8` (24/16/32px) to reclaim space.

### 2. Sidebar — Menu / Pool toggle (new)

- Directly under the brand row (logo + "HHCC" / "Club admin"), `px-4 pb-2.5`.
- Segmented control: container `grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-muted border border-border`.
- Buttons: `h-8 rounded-[7px] text-[13px] font-semibold`, icon 15px + label.
  - **Menu** (lucide `Menu`) — active: `bg-card text-foreground`; inactive: transparent, `text-muted-foreground`.
  - **Player pool** (lucide `Users`) + count of unpicked seniors in `font-mono text-[11px] opacity-80` — active: `bg-primary text-primary-foreground`.
- Only show the toggle on `/admin/selection`. Default to **Pool** on that route. Persist choice per user (localStorage `selection-sidebar-mode`).
- Menu mode = the current sidebar unchanged (Jump to…, nav groups, footer).
- Pool mode = Jump-to, nav and footer are hidden; the pool fills the remaining height.

### 3. Sidebar — Player pool (moved, mostly unchanged)

Reuse `PlayerPool` from `player-pool.tsx`, changing only its container:

- Remove `lg:absolute lg:inset-0`, `rounded-lg border` — it's now `flex-1 min-h-0 flex flex-col border-t border-border` inside the sidebar.
- Header (`px-3.5 py-3 gap-2 border-b`): "Player pool" `font-serif text-[22px] font-extrabold uppercase`; drop the long instruction paragraph (moved to the footer line). While a **side** player is being dragged, show right-aligned hint "Drop here to remove" `text-[11.5px] text-muted-foreground`.
- Search input: `h-9 rounded-md border bg-background`, focus border `primary`.
- Scroll area: `flex-1 min-h-0 overflow-auto overscroll-contain px-2.5 pb-3 pt-1.5`.
- Groups unchanged (Available not picked / Maybe / No reply + Remind N / Unavailable / Juniors / Already picked). **Change:** all groups are collapsible (chevron), defaults: Available, Maybe, No reply open; Unavailable, Juniors, Already picked closed. A non-empty search force-opens all groups (existing behaviour).
- Footer line: "Showing seniors. Tap a player to add them to a side."
- Whole pool area is a `data-drop="pool"` zone; drop-hover background `bg-blue-500/10`.

### 4. Round strip (compacted)

Replaces the tall round-header card with two rows:

- **Row 1** (`flex flex-wrap items-center gap-2.5`): existing `WeekendSwitcher` (Previous / "weekend of 24–25 Oct 2026" in `text-[15px] font-bold text-primary-text` / Next; buttons `h-[34px] rounded-[10px] border-primary text-[13px] font-semibold`), spacer, `StatusTierLegend` (12px).
- **Row 2** single-line card (`rounded-xl border bg-card px-3.5 py-2.5 text-[12.5px] text-muted-foreground flex flex-wrap gap-x-6 gap-y-2.5 items-center`): the four steps (numbered 18px circles; labels bold `text-primary-text`), spacer, "{n}% replied" (`font-serif text-[22px] font-extrabold text-primary-text`), and a 200×8px stacked bar (Available `--win-fg`, Maybe `amber-500`, Unavailable `--loss-fg`, No reply `violet-500`).
- Club-rule line is dropped from the strip (move to a tooltip/info icon if still required).

### 5. Grade chip bar + view toggle (new)

`flex flex-wrap items-center gap-2`:

- Label: `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` — "On screen (up to 3)" in Focus, "Jump to focus" in Board.
- One chip per side, **in the club's configured grade order** (existing requirement — never a separate order):
  - `h-[34px] rounded-full px-3 text-[13px] font-semibold border gap-[7px]`.
  - Content: lock icon (12px, `--win-fg`) if Final · grade label without " Grade" (A, B, C, D, F, Female A, Female B, Colts) · `font-mono text-[11.5px]` "filled/11" · 7px red dot (`--loss-fg`) if it needs attention (no captain, no keeper, overseas over cap, or any picked player said unavailable).
  - Off: `bg-card border-border text-foreground`, count `text-muted-foreground`. On: `bg-primary/15 border-primary text-primary-text`. Hover: `border-primary`.
- Spacer, then **view toggle**: `flex gap-0.5 p-[3px] rounded-[10px] border bg-card`; buttons `h-7 rounded-[7px] px-2.5 text-[12.5px] font-semibold` with lucide `Columns3` "Focus" / `LayoutGrid` "Board". Active = `bg-primary text-primary-foreground`.

### 6. Team grid

- Focus: `grid gap-3.5 items-start` with `grid-template-columns: repeat(N, minmax(0,1fr))` where N = focused count (1–3).
- Board: `repeat(auto-fill, minmax(300px, 1fr))`.
- Cards: existing `TeamCard` unchanged, plus:
  - Open slot shows a right-aligned "🔍 Find player" affordance (lucide `Search` 12px + `text-[11.5px] font-semibold text-primary-text`) when tap-to-fill is enabled and the side is editable. Hover: border `primary`, text `foreground`.
  - While a drag hovers any slot in a card, the card border turns `blue-500`.

### 7. Fill popover (new)

Opened by clicking an open slot **or** a filled slot in an editable side.

- `fixed z-50 w-80 rounded-xl border bg-[var(--pop)] shadow-[var(--shadow-pop)]`. Positioned to the right of the clicked slot (10px gap), flipped to the left if it would overflow; top clamped to the viewport. A transparent full-screen overlay behind it closes on click. Use the app's existing Popover (Radix) in code.
- Header (`p-3 pb-2`): title `font-serif text-lg font-extrabold uppercase` "B Grade · slot 12" (or "· 12th"); sub `text-xs text-muted-foreground` "Fill this open slot" / "Replace {name}"; close `X` button 28px.
- Search input autofocused: `h-9 rounded-[10px] border-[1.5px] border-primary bg-background`. Placeholder "Type a name…".
- List label `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`: "Best fits — available first" / "Matches".
- Up to 8 rows (`min-h-10 rounded-lg px-2 py-1 gap-2`): StatusMark · name (`text-sm font-medium`) + meta line (`text-[11.5px] text-muted-foreground`: "Available · last B · also in COL") · badges (OS, Jr) · `↵` kbd on the highlighted row. Highlight/hover `bg-muted`. Max height 300px, scrolls.
- **Ranking:** status (yes → maybe → none → no), then not-already-picked before already-picked, then last grade == this grade first, then name. Excludes players already in this side.
- Filled slot: footer button "Back to pool" (`h-[34px] border text-[--loss-fg] hover:bg-[--loss-bg]`).
- Footer hint `text-[11px] text-muted-foreground`: "↑↓ choose · ↵ add · esc close".
- Picking a row = the existing pool→slot move (replacing an occupant sends them back to the pool).

### 8. "Add to…" popover (new)

Opened by clicking a pool player (this replaces/augments the existing tap-to-move dialog on desktop).

- Same shell; title = player name, sub = "Available · last played B".
- List label "Add to"; one row per side — focused sides first, then the rest — meta "Into slot 12 · Sat, 24 Oct, 12:05pm". Disabled (`opacity-45`) with meta "Full" / "Finalised" / "Already in this side".
- Picking puts the player in the first open slot.

### 9. Toast

Bottom-centre, `rounded-xl border bg-muted px-4 py-2.5 text-[13.5px] shadow-[var(--shadow-pop)]` with a green check. Auto-dismiss 2.6s. Messages: "{name} added to {side}", "{name} in for {old} · {side}", "{name} moved to {side}", "{name} back to the pool", "Re-open {side} to change it", "{side} finalised — {n} players notified", "Reminder sent to {n} players". Use the app's existing toaster.

## Interactions & Behavior

- **Sidebar toggle:** Menu ↔ Pool; header collapse button hides the sidebar entirely.
- **Grade chips (Focus):** click toggles a grade on/off; never fewer than 1; adding past the max drops the oldest; chips stay in grade order. **(Board):** click switches to Focus with only that grade.
- **Drag & drop (existing apply-move semantics):** pool→slot (adds; occupant returns to pool); slot→slot same side (swap); slot→slot other side (move; occupant swaps back if not already there); slot→pool (remove). Captain/keeper cleared if that player leaves the XI. Drops on a Final side are refused (red outline + toast).
- **Drop feedback:** slot `bg-blue-500/10` + `inset 0 0 0 2px blue-500`; refused slot uses `--loss-bg` / `--loss-fg`. Dragged chip `opacity-35`.
- **Keyboard (fill popover):** ArrowUp/Down move highlight, Enter adds, Esc closes; typing resets highlight to the top.
- **Finalise:** existing confirm flow (heads-up list, "Finalise and notify" / "Keep editing"); Final card gets green border, Lock badge, published message, Print team sheet, Re-open.
- **Responsive:** below the `nav` breakpoint the sidebar is a sheet — keep the pool in its current inline position there (or a bottom sheet) and rely on tap-to-fill; Focus mode defaults to 1 grade on narrow screens.

## State Management

New UI state (client only, no API changes):

- `sidebarMode: 'menu' | 'pool'` (persist in localStorage; default `pool` on the hub).
- `view: 'focus' | 'board'` (persist; default `focus`).
- `focusedSideIds: number[]` (persist per section; default first 3 draft sides in grade order; max from a constant, 3).
- `popover: null | { mode: 'fill', sideId, index, query, highlight } | { mode: 'place', memberId }`.
- Existing: board data, drag state from `use-pointer-drag`, pool search/open groups (now default-open map described above), confirming side.
  No new endpoints — fill/place reuse the existing save-board mutation via `apply-move.ts`.

## Design Tokens (HHCC dark, as resolved in the prototype)

Use the CSS variables in code; hexes are for reference.

- Background `#0b1014` (`--background`) · Card `#131a20` (`--card`) · Muted `#1b242b` (`--muted`) · Border `#26313a` (`--border`)
- Foreground `#f2f5f8` · Muted foreground `#8e9ba7`
- Primary (tenant gold) `#f6b335` · Primary foreground `#14100a` · Primary/15 `rgba(246,179,53,.15)`
- Win `#4ade80` / bg `rgba(74,222,128,.14)` · Loss `#f87171` / bg `rgba(248,113,113,.14)`
- Amber (to confirm) border `#f59e0b`, bg `rgba(245,158,11,.10)`, text `#fbbf24`
- Drop OK `#3b82f6` / `rgba(59,130,246,.10)` · Junior badge `rgba(139,92,246,.15)` / `#c4b5fd` · No-reply bar `#8b5cf6`
- Fonts: Barlow Condensed 700/800 (headings, uppercase), IBM Plex Sans 400–700 (UI), IBM Plex Mono (counts)
- Radii: 12px cards/popover, 10px buttons/inputs/chips, 7px segmented items, 4px badges, full for pills
- Shadow: `--shadow-pop` = `0 24px 48px -16px rgb(0 0 0 / .6)`
- Spacing used: 2, 3, 4, 6, 8, 10, 12, 14, 16, 24px

## Assets

- Club logo: `artifacts/cricket-club/public/mockup/club-logo.png` (from the repo; real app uses `brand.logoUrl`).
- Icons: lucide (already a dependency) — Menu, Users, Search, ChevronLeft/Right/Down, Lock, Columns3, LayoutGrid, X, Printer, Check, PanelLeftClose/Open, Bell, Plus.
- Drag grip SVG: copied from `player-chip.tsx`.

## Files

- `Selection Hub Prototype.dc.html` — interactive hi-fi prototype (open in a browser). Tweaks: `startView`, `maxFocus`, `tapToFill`.
- `Selection Hub Wireframes.dc.html` — low-fi layout exploration.
- Source components to modify in the repo: `src/pages/selection-hub.tsx`, `src/components/admin-layout.tsx`, `src/components/selection/player-pool.tsx`, `team-card.tsx`, `round-header.tsx`, `weekend-switcher.tsx`; new: `grade-chip-bar.tsx`, `fill-popover.tsx`.
