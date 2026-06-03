---
name: Committee/captain role linking
description: Which seeded club_roles role-holders are confirmed plain-text (no player) vs. linkable, and the matcher gap that hid one.
---

# Reviewing unlinked club_roles role-holders

Seeded `club_roles` (337 rows) reconciles each role-holder name to a `players`
row via `scripts/src/seed-committee.ts`. After review, the genuinely-unlinkable
rows are settled — do NOT re-litigate these as "needs linking":

- **Office bearers with no player record (stay plain text):** Raquel Willey
  (Secretary/Treasurer 1999–2000), Felicity Tatterson (Sec/Treas 2014–2017),
  Paige Buglass (Secretary 2016–2017). These people never played for the club,
  so there is no `players` row to link — correct as plain text.
- **Joint captains (stay plain text by design):** any name containing `/`, `&`,
  or ` and ` (e.g. "D. Patterson / R. Smedley", "Zac Dreckow / Travis Caine").
  `resolveName` returns null for these on purpose; the model holds one player_id.

**Matcher gap fixed:** "Dave Sommers" (E Grade captain 2016) is the player
DAVE SOMERS (double-m vs single-m surname). Added `sommers↔somers` to
`SURNAME_VARIANTS` so it links. **Why:** surname-spelling typos in the history
xlsx silently leave a real player unlinked. **How to apply:** when a captain
(not an office bearer) is unlinked, check for a surname spelling variant of an
existing player before concluding plain-text; add the pair to SURNAME_VARIANTS.

Net after fix: 325/337 linked, 12 unlinked = 10 office-bearer rows + 2 joint
captains, all correctly plain text. Live edits/links happen in the admin UI at
`/admin/committee` (per-row PlayerTypeahead).
