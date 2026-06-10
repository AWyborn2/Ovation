---
name: Honour kiosk flex-centering vs tall boards
description: Why the TV-kiosk ledger frames must use `justify-content: safe center`, not plain `center`.
---

The honour-display kiosk vertically centers ledger skins (P1–P3) in a `height:100vh; overflow:hidden` `.frame` so SHORT boards sit nicely mid-screen, then a rAF engine scrolls `.frame.scrollTop` from 0 through tall ones.

Rule: those frames use `justify-content: safe center`, never plain `center`.

**Why:** with plain `justify-content: center` a flex column whose content is TALLER than the container overflows at BOTH ends and the START (top) becomes unreachable by scrolling (known flexbox+overflow behavior). So a tall board (e.g. Premierships, 100+ rows) renders as an empty frame — header clipped above the viewport, `scrollTop=0` can't reach it, only a mid band shows. The original demo HTML used plain `center` and looked fine ONLY because its sample boards were a handful of rows (short → fit → centered). Real club data has tall boards, which broke it.

**How to apply:** `safe center` falls back to flex-start when content overflows (so `scrollTop=0` shows the header and the scroll engine reveals every row) while still centering short boards. If you ever port more kiosk skins or touch `.hb-kiosk .frame.*` centering, keep `safe`.
