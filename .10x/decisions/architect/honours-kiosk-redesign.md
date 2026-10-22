# honours-kiosk-redesign

Status: raised by Ash 22 Oct 2026 during kiosk-photo-rotation design; needs UX/design pass
before build. Sequenced BEFORE kiosk-photo-rotation's settings UI so slideshow settings land in
the new design, not the old one.

## Ash's pain points (22 Oct 2026)

1. **Per-board control is inconsistent** — not every board lets the admin set columns/rows shown
   at a time, text sizes, formats, transition and animation options.
2. **Scroll bug:** on some boards the scrolling content passes OVER the header instead of
   disappearing behind it. Looks broken. (Bug — fix independently, first.)
3. **Settings are confusing** — hard to find and understand settings.
4. **No live preview** — changes are made blind and checked on the TV.
5. **Building the rotation is clumsy** — up/down arrows; mixing boards, sponsors, ads awkward.
6. **TV display looks dated** — layout, transitions, typography.

## Architectural direction (for the design pass)

- **One per-board display schema** applied to every board type (columns, rows/page, text scale,
  format, transition, animation, scroll vs paginate), with global defaults + per-board
  overrides, stored in existing `honour_display_settings.board_configs`. Every board renderer
  reads it — no board-specific exceptions (fixes #1).
- **Header/body layout contract** in `board-renderer.tsx`: header is a fixed layer; body is a
  clipped scroll viewport (`overflow:hidden`) beneath it, so scrolling content can never draw
  over the header (fixes #2 for all boards, not one).
- **Live preview** = the real kiosk renderer embedded at 16:9 in the settings page, fed by the
  unsaved form state (same component as the TV, no second renderer) (fixes #4).
- **Rotation builder**: drag-and-drop list of typed items (board | sponsor | ad | photo
  slideshow) with per-item settings in a side panel; photo slideshows plug in here (fixes #5).
- Settings IA regrouped: Rotation · Boards · Look (colours/fonts/transitions) · Sponsors & ads ·
  TV link (fixes #3). Visual refresh (#6) via a design spec, not ad hoc.

## Order

1. Header-overlap bug fix (small PR, now).
2. UX/visual design spec (mockups) for settings + TV look — Ash signs off.
3. Per-board display schema + layout contract.
4. Settings redesign with live preview + rotation builder.
5. kiosk-photo-rotation slideshows plug into the builder; junior library in parallel.

## Design direction (22 Oct 2026)

- Ash chose **classic honour board** for the TV: timber, gold-leaf Cinzel titles, engraved
  Cormorant Garamond names, gold rules. Mockup: `docs/design-handoffs/honours-kiosk-redesign/mockup.html`.
- TV: fixed title plate + column headings; rows scroll in a clipped, masked viewport and fade
  under the gold rule; board-level fade in, slow scroll; footer (est. year, sponsor line, board
  N of M); page dots for paginated boards.
- Settings: tabs Rotation · Look · Sponsors & ads · TV link. Rotation = drag list (board |
  sponsor wall | ad | photo slideshow) + live preview of unsaved state + per-item display panel
  (columns 1–4, scroll/turn pages, text size S–XL, rows per page, speed, transition, end hold,
  format), each inheriting a "club default" from Look.
- Status: awaiting Ash's sign-off on the mockup.

## Motion model (Ash, 22 Oct 2026)

Two separate settings per board, each inheriting a club default from Look:

1. **Movement** (how a long board shows all its rows): Credits roll (continuous scroll, speed +
   end hold) | Pages (slide-deck style, rows per page, seconds per page) | Fit (shrink to one
   screen, no movement).
2. **Transition** (how a board, or the next page, arrives): Fade · Slide up · Slide down ·
   Slide left · Slide right · Pop (scale-in) · Zoom out · Flip (card turn) · Wipe (gold-rule
   sweep) · Rows reveal (staggered, the only per-row effect) · Cut (none). Duration S/M/L.
   Optional "Random from selected" for variety.

Constraints: transform/opacity/clip-path only (cheap on TV browsers); header plate never moves
during a page transition; Flip/Wipe are classic-board flourishes; honour
prefers-reduced-motion → Fade/Cut.
