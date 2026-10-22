# kiosk-photo-rotation — architecture

Status: design proposed 22 Oct 2026 (Principal Architect). Scope: `.10x/decisions/product-manager/kiosk-photo-rotation.md`.

## Landscape (verified 22 Oct 2026)

- Kiosk config = one row per tenant in `honour_display_settings` (`kiosk_sequence` jsonb string[],
  `kiosk_ads` jsonb, sponsor settings, `kiosk_token`). Public read `GET /honour-display/kiosk`
  (token), admin write `PATCH /honour-display-settings`. Page `pages/honours-kiosk.tsx` flattens
  sequence strings (board id | `"sponsor"` | `"ad:<id>"`) into frames; refetches on loop wrap if
  data is >10 min old.
- Senior library = `club_photos` (+ `club_photo_players`, senior-only). "Folders" are a view over
  `grade` + `photo_types`, not a table. Renditions: main ≤2048px, thumb 480px. Objects served
  unauthenticated by URL via `/storage/objects/*` (junior paths blocked for non-admins).
- Junior photos = separate `junior_photos` (one `participant_id` per photo) with consent via
  `juniorPhotoAllowed()` (`lib/junior-photos.ts`, `photo_withheld` + privacy) and gated serving
  `GET /juniors/photos/:id` (+`/thumb`), re-checked per request, `no-store` (ADR-007).

## Ash's decision (22 Oct 2026)

Juniors get a **junior library with the same setup as seniors** (folders, types, tags, season,
grade) — kept in junior tables, not merged into `club_photos`.

## Options considered

1. **Merge juniors into `club_photos` with a junior flag** — one library UI. Rejected: breaks the
   juniors isolation invariant, and senior objects are public-by-URL so a withheld child's
   photo would leak via a cached/known URL.
2. **Kiosk reads only the existing single-child `junior_photos`** — smallest, but not the
   library Ash asked for (no group shots, folders, types).
3. **Recommended: upgrade `junior_photos` into a junior library mirroring the senior model**,
   behind junior routes, and let kiosk sources point at either library.

## Design (option 3)

### A. Junior library (prerequisite, own PR series)

- `junior_photos` gains senior-parity columns: `grade`, `season`, `photo_types` text[] (same
  check set), `taken_at`, `match_format` (nullable; additive, idempotent migration).
- New `junior_photo_participants (tenant_id, photo_id, participant_id)` many-to-many; backfill one
  row per existing photo from `junior_photos.participant_id`, then treat that column as legacy
  (drop in a later migration once reads move over).
- **Consent rule (fail closed):** a junior photo is displayable iff it has ≥1 tagged participant
  AND every tagged participant passes `juniorPhotoAllowed()`. Untagged junior photos never leave
  admin. Single function `juniorLibraryPhotoAllowed(photoId)` reused by cards, kiosk and serving.
- Serving stays gated (`/juniors/photos/:id`, `no-store`, per-request recheck) and adds a
  kiosk-token path so the TV can load junior images without an admin session.
- Admin UI: Juniors → Photo library, reusing the senior library components (upload, folders,
  types, tag picker sourced from `junior_participants`). Existing junior card photo picker moves
  onto the new rule.

### B. Kiosk photo slideshow (P0)

- Settings: new jsonb `kiosk_photo_slideshows` on `honour_display_settings`, mirroring `kiosk_ads`:
  `{ id: "photos:<uuid>", name, library: "senior"|"junior"|"both", filter: { kind: "all"|"folders"|"types"|"picked", folders?, types?, photoIds?, juniorPhotoIds?, recentDays?, thisSeason? }, order: "random"|"newest"|"manual", perPass, secondsPerPhoto, crossfade, showCaption }`.
  Sequence entry `"photos:<uuid>"` — same pattern as `"ad:<id>"`, no schema change to sequence.
- Resolution is **server-side** in `GET /honour-display/kiosk`: the bundle gets
  `photoSlideshows[].photos[] = { url, width, height, caption? }` (cap e.g. 60 per slideshow),
  tenant-scoped, juniors filtered by `juniorLibraryPhotoAllowed`. Never send filters to the client
  to evaluate. Senior urls = main rendition; junior urls = gated kiosk-token route.
- Client: new `photos` frame kind in `honours-kiosk.tsx`; shuffles per loop when `random`; preloads
  next image; `onerror` → skip frame; empty list → skip item.
- OpenAPI first: `KioskPhotoSlideshow`, extend `HonourDisplaySettings`, `…SettingsUpdate`,
  `HonourDisplayBundle`; then codegen.

## Failure modes

- Consent withdrawn mid-loop: bundle may be ≤10 min stale, but junior images are fetched through
  the gated no-store route, which 403s → frame skipped. Effective removal = next image load.
- Empty source / all images fail: item skipped; if the whole sequence is empty, existing
  board fallback applies.
- Slow TV: thumbs not used (too small for 1080p); main 2048 rendition + single-image preload.
- Cross-tenant: resolution uses the token's tenant only; isolation tests required.

## Tests

- Tenant isolation on kiosk photo resolution; withheld child (any one of several tags) excludes
  photo; untagged junior photo excluded; gated route 403 after withhold; empty source skip;
  migration backfill keeps existing junior card photos working.

## One-way doors

`junior_photo_participants` and dropping `junior_photos.participant_id` (do the drop later).

## Sequencing (22 Oct 2026)

honours-kiosk-redesign (`honours-kiosk-redesign.md`) comes before the slideshow settings UI; the junior library can proceed in parallel.
