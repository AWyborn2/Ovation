---
name: Player photo gallery
description: Players can have many photos; how players.image_url relates to the player_images gallery and why.
---

# Player photo gallery

Players can have many photos (`player_images`), but `players.image_url` is KEPT as the default-photo pointer and **mirrors the gallery's default row**.

**Why keep image_url:** every single-photo reader (scorecards, directory thumbnails, social/trading-card fallback) already reads `players.image_url`. Mirroring the default into it means the gallery is purely additive — no existing reader had to change.

**The sync invariant (enforced in route handlers, NOT a DB constraint):** exactly one default per player, and `players.image_url` always equals that default's url (or NULL when no photos). There is deliberately NO one-default-per-player DB unique — it would hit the drizzle-kit TTY composite-unique bug; the rule lives only in the handlers.

**Legacy backfill is the easy thing to forget.** Players that pre-date the gallery have a photo in `players.image_url` but no `player_images` row, so they'd vanish from the gallery/pickers. Two safety nets, both idempotent and guarded by `NOT EXISTS`:
- an idempotent backfill script run from `post-merge.sh` (so prod gets it on deploy), and
- a self-healing read-path fallback in `GET /players/:id/images` that lazily inserts the default row from `image_url` when a player has none.
**Why both:** a one-off dev `executeSql` backfill is invisible to prod and to code review — a committed, deploy-time path is required; the read-path net covers any player the script missed.

Per-card pickers (share + trading card) list the gallery, pre-select the default, and override only for that one card.
