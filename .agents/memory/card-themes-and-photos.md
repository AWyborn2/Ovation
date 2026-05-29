---
name: Card themes & player photos
description: How selectable card themes and player profile photos flow into social share-card rendering.
---

# Card themes & player photos

Share cards can be branded with admin-managed **themes** (colors + optional background image + optional logo override) and **player profile photos**.

## Themes
- `card_themes` table is the source of truth; seeded with a default "Club Classic" (bgDark #322F3D, bgPanel #3F3C4C, accent #FBD039, textLight #F5F2E8).
- Exactly one row has `isDefault = true`; the server enforces single-default inside a transaction. Deleting the default promotes the first remaining theme.
- The share-card renderer (`share-card.ts`) resolves a `Palette` from the chosen theme; the default palette is the Club Classic colors. Background image is drawn with a dark overlay; logo override falls back to the bundled club logo.
- The share-card modal shows a theme dropdown only when more than one theme exists; preview cache must invalidate on theme change.

## Player photos
- `players.image_url` stores an object-storage path (`/api/storage{objectPath}` from `useUpload`). Persist via `useUpdatePlayer`, then invalidate the player query.
- Photo placement is decided **per card kind**: prominent circular headshot for milestone/player cards, smaller avatar for record/gradeLeader, none for premiership.
- `milestone-share.ts` (the quick honour-board card) draws the photo as a circular headshot filling the tier medallion, with the tier icon shown as a small overlay badge bottom-right; falls back to the centered tier icon when there is no photo.

**Why:** users wanted on-brand, personalised social cards. Theme + photo are optional everywhere — every renderer must degrade gracefully when they are absent (image load failure is caught and ignored).
