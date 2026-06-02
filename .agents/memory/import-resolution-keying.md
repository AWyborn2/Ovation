---
name: Import resolution keying
description: Why the admin-import frontend row key and server name key must normalize identically.
---

The CSV / per-match import preview lets an admin resolve each non-exact name
(link to an existing player vs create new). That decision is keyed by NAME, not by
a stable row id: the frontend indexes resolution state by `rowKey`, the payload
carries `{surname, givenName, action, playerId}`, and the server re-derives the
key with `nameKey(surname, givenName)` (in name-match.ts: NFKD, strip diacritics,
lowercase, strip non-letters) for both `buildResolutionMap` and the commit-time
row lookup.

**Rule:** the frontend `rowKey` normalization must match the server `nameKey`
normalization exactly. If they diverge, two preview rows whose names normalize to
the same server key (e.g. "O'Brien" vs "Obrien") hold separate UI state but
collapse to one server decision (last-one-wins), so an admin's explicit per-row
choice can be silently overwritten.

**Why:** resolutions are name-keyed, not row-id-keyed, so identity must be defined
the same on both sides. The proper long-term fix is a server-issued stable row id
in the preview, but until then keep the two normalizers in lockstep.

**How to apply:** if you ever touch `norm`/`nameKey` in name-match.ts, update the
mirrored `normName`/`rowKey` in artifacts/cricket-club/src/pages/admin-import.tsx
in the same change (and vice versa).
