---
name: Canvas share-card web fonts & layout fitting
description: Why share-card canvas rendering must await document.fonts.ready, and how the shared tile/pill/section helpers keep cards from overflowing the footer.
---

Downloadable share cards are drawn on a `<canvas>` in `share-card.ts` (`renderShareCard`), reused for both still PNGs and the animated/video export (built-in animation re-renders via `renderShareCard` then applies a whole-card entrance — there is NO separate body-draw path, so any body restyle flows into both automatically).

**Rule: await `document.fonts.ready` before drawing text in a fresh render.**
**Why:** custom web fonts (Montserrat) aren't guaranteed loaded when canvas first paints; without the wait, captured frames/PNGs silently fall back to a system font. The guard sits near the top of `renderShareCard` after the ctx null-check.

**Rule: text/layout must self-fit; never trust fixed font sizes or a hard minimum tile height.**
**Why:** long player names, long grade pills, and long stat values overflow into the reserved footer/sponsor band otherwise (architect caught a player-grid that clamped tile height to a 110px floor and overran the footer).
**How to apply:** use `fitFontSize()` for any single-line heading/value/pill; `drawPill()` self-fits + caps width; the player stat grid drops the lowest-priority *pair* of stats until the remaining rows fit `maxGridH` at the min tile height, then sizes tiles to the space. Shared palette-driven helpers (`drawStatTile`, `drawPill`, `drawSectionTitle`, `CARD_FONT`) live after `drawFooter` and are reused by the player/milestone/per-match bodies, so junior-brown and custom themes still apply via the `Palette` arg.
