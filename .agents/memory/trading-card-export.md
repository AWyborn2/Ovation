---
name: Player trading card export gotchas
description: Pitfalls when building/exporting the player trading card (cap-number race + image-load hang).
---

# Player trading card export gotchas

## Gate card render+export on ALL source queries, not just the player
The trading card's big "number" is the A Grade cap number from `cap_register` (USER RULE: shown ONLY if held, NEVER the player id/placeholder). The modal self-fetches player (`useGetPlayer`) and caps (`useListCaps`) in parallel.

**Rule:** build card data and allow export only when BOTH `player` AND `caps` have resolved (`player && caps`, and gate the loading state on `capsLoading` too).

**Why:** if you build from `player` alone while `caps` is still `undefined`, a capped player can momentarily render/export with no cap number — a direct breach of the cap-number rule. A user clicking "download" during that window gets a wrong card.

**How to apply:** any card/asset whose required field comes from a *secondary* query must wait on that query before render+export, not just the primary entity query.

## `waitForImages` must treat `img.complete` as terminal
Pre-export image readiness was checked as `img.complete && img.naturalWidth > 0`, else wait for load/error events.

**Why:** an image that already FAILED has `complete === true` but `naturalWidth === 0`, and no future load/error event will fire → the promise never resolves → PNG/video export hangs forever for players with a broken `imageUrl`.

**How to apply:** `img.complete` alone is the terminal signal (success or failure). Also add a timeout safety net (~5s) before resolving, so a stuck image never blocks export.
