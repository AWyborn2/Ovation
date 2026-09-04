---
title: "feat: Allow MP4 uploads for Ad creatives on the TV Kiosk"
date: 2026-07-31
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# feat: Allow MP4 uploads for Ad creatives on the TV Kiosk

## Summary

The Admin → Honours Display → "Ad creatives" editor only accepts image files
(`image/png,image/jpeg,image/webp`) and always renders ad creatives as `<img>`,
both in the admin preview and on the TV kiosk's full-screen rotation. This
plan adds MP4 video as a supported ad-creative media type end to end: an
explicit `mediaType` field on the stored ad, a widened admin upload/preview,
and video rendering (muted, looped, autoplaying) on the kiosk.

The underlying object-storage upload endpoint already allowlists
`video/mp4` (and webm/quicktime) server-side for card-template backgrounds —
no server/storage changes are needed. The gap is entirely in the kiosk-ad
data shape and the two client surfaces that render it.

## Problem Frame

Uploaded object paths (`/objects/uploads/<uuid>`) carry no file extension, so
the client cannot infer "is this a video?" from the URL alone. Today the ad
creative shape (`KioskAdJson` / `KioskAd`) only has `imageUrl`, and both
render sites (`AdEditor` in the admin page, `AdSlide` on the kiosk)
unconditionally render an `<img>`. Selecting an MP4 today either fails the
admin file-picker filter or uploads successfully but then renders as a
broken image everywhere it's shown.

## Requirements

- **R1** — An admin can upload an MP4 file as a kiosk ad creative from the
  Ad creatives editor (Admin → Honours Display).
- **R2** — The uploaded MP4's media type is persisted alongside the ad so the
  app can later distinguish video ads from image ads without guessing from
  the URL.
- **R3** — The admin ad-creative editor previews an uploaded video ad as a
  video element, not a broken image.
- **R4** — The TV kiosk rotation renders video ad creatives full-screen,
  autoplaying muted and looping, wherever it currently shows image ads.
- **R5** — Existing image ad creatives, including ones stored before this
  feature (no `mediaType` recorded), continue to render unchanged.

## Assumptions

Headless run — no chat-time scoping confirmation was collected. These are
the scoping calls made on the user's behalf; flag any of them for a follow-up
question if they turn out wrong:

- Scope is MP4 specifically, matching the literal request. The upload
  endpoint's server-side allowlist already includes `video/webm` and
  `video/quicktime` (added earlier for animated card-template backgrounds),
  but this plan does not expose those in the ad-creative UI — see Scope
  Boundaries.
- Kiosk video playback uses the same fixed per-frame dwell time as every
  other full-screen slide (sponsor/ad); it does not wait for the video to
  finish before advancing.
- The existing 50MB video / `video/mp4` size-and-type limit enforced by
  `artifacts/api-server/src/routes/storage.ts` is reused as-is.
- Manually pasting a video URL into the ad's raw URL text field (instead of
  using Upload) is out of scope for correct media-type detection — see U2.

---

## Key Technical Decisions

- **KTD1 — Explicit `mediaType` field, not URL sniffing.** Add
  `mediaType?: "image" | "video"` to the kiosk ad shape rather than inferring
  from the URL, because uploaded object paths have no file extension to
  sniff and the client must know which element (`<img>` vs `<video>`) to
  render before the request even goes out.
- **KTD2 — Derive `mediaType` from `File.type` at upload time.** The
  browser's `File.type` is already available in the existing `useUpload`
  flow and is authoritative for what the admin just picked; no new
  server round-trip is needed to learn it.
- **KTD3 — No server/storage changes.** `POST /storage/uploads/request-url`
  already allowlists `video/mp4` (`ALLOWED_VIDEO_MIME` in
  `artifacts/api-server/src/routes/storage.ts`) with a 50MB cap, added for
  animated card-template backgrounds. This plan only widens the _client's_
  `accept` filter and adds `mediaType` bookkeeping; the storage route is
  untouched.
- **KTD4 — Field is optional and defaults to `"image"`.** `mediaType` is not
  added to the OpenAPI `required` list, and every read site treats a
  missing/undefined value as `"image"`. This keeps existing stored kiosk ads
  (pre-feature, no `mediaType`) rendering correctly with no data migration.
- **KTD5 — Fixed dwell timing, not video-duration-based.** The kiosk's
  per-frame advance timer (`kioskDwellMs`) is unchanged; video ads play on
  the same clock as every other full-screen slide. Syncing dwell time to
  video length is a larger timer-logic change and isn't required by the
  request. Accepted tradeoff: under the default `kioskDwellMs` (3500ms),
  a longer ad clip will be cut off before it loops, so `loop` mostly
  protects against short clips finishing early rather than being visibly
  exercised — admins with longer clips can raise `kioskDwellMs` themselves;
  this plan does not add per-ad dwell overrides.

## Scope Boundaries

**In scope:** MP4 upload, storage, admin preview, and full-screen kiosk
playback for kiosk ad creatives specifically (the `kioskAds` list in
Honour Display settings).

### Deferred to Follow-Up Work

- Exposing `video/webm` / `video/quicktime` in the admin ad-creative
  uploader, even though the storage route already allows them server-side.
- Syncing kiosk dwell/advance timing to a video ad's actual duration.
- Correct `mediaType` detection when an admin pastes a video URL directly
  into the raw URL field instead of using Upload.
- Video support for the separate club **sponsor** logo library
  (`artifacts/cricket-club/src/pages/admin-social.tsx`'s `SponsorsCard` /
  `Sponsor.logoUrl`) — sponsors are a distinct data model from kiosk ad
  creatives and were not part of this request.
- Bulk/multi-file upload, client-side video trimming or compression.

---

## Implementation Units

### U1. Extend kiosk-ad data model & OpenAPI contract for video media

**Goal:** Add a backward-compatible `mediaType` field to the kiosk ad shape
so downstream clients can decide image vs. video rendering.

**Requirements:** R2, R5

**Dependencies:** none

**Files:**

- `lib/db/src/schema/honour_display_settings.ts` (`KioskAdJson` interface)
- `lib/api-spec/openapi.yaml` (`KioskAd` schema, ~line 10896)
- `lib/api-zod/src/generated/**` (regenerated via codegen — never hand-edit)
- `lib/api-client-react/src/generated/**` (regenerated via codegen — never hand-edit)

**Approach:** Add `mediaType?: "image" | "video"` to `KioskAdJson` in the
schema file (no `null` member — a missing/undefined value already carries
the "image" default per KTD4, so the DB-layer type and the OpenAPI-layer
type stay in lockstep with no separate null-handling path to reconcile).
Mirror it in the OpenAPI `KioskAd` schema as an optional string enum
(`image`, `video`) property, _not_ added to `required`, with a
description noting it defaults to `image` when absent. Regenerate with
`pnpm --filter @workspace/api-spec run codegen` per repo convention (never
hand-edit generated files) and confirm the regenerated `KioskAd` TypeScript
interface and Zod schema both expose the new optional field, with no other
schema's generated output changed.

**Patterns to follow:** sibling optional string-union fields already in this
file, e.g. `CustomGridDefJson.fillMode` and
`honourDisplaySettingsTable.kioskSponsorSlideStyle`.

**Execution note:** Schema/type plumbing only — no runtime behavior changes
until U2 and U3 consume the field. No database migration or
`pnpm --filter @workspace/db run push` is needed: `kiosk_ads` is an existing
`jsonb` column, and this only changes the TypeScript shape stored inside it.

**Test scenarios:** Test expectation: none -- purely additive type/schema
change with no new branching logic; the field's actual read/write behavior
is exercised by U2 and U3's tests.

**Verification:** `pnpm --filter @workspace/api-spec run codegen` completes
cleanly; `git diff` on the generated packages shows only `KioskAd`-related
additions.

---

### U2. Accept and preview MP4 uploads in the admin Ad creatives editor

**Goal:** Let an admin upload an MP4 as an ad creative from Admin → Honours
Display → Ad creatives and see it preview correctly as video.

**Requirements:** R1, R2, R3, R5

**Dependencies:** U1

**Files:**

- `artifacts/cricket-club/src/pages/admin-honours-display.tsx` (`AdEditor`
  component, ~lines 1861-1929)
- `artifacts/cricket-club/src/pages/admin-honours-display.test.tsx` (new)

**Approach:** In `AdEditor`, widen the file input's `accept` from
`"image/png,image/jpeg,image/webp"` to also include `"video/mp4"`. In
`handleFile`, after `upload.uploadFile(file)` resolves, derive `mediaType`
from the picked `File.type`
(`file.type === "video/mp4" ? "video" : file.type ? "image" : (file.name.toLowerCase().endsWith(".mp4") ? "video" : "image")`)
— `File.type` is usually reliable but can come back empty on some
browser/OS/file-association combinations (the shared `useUpload` hook
already codes around this by falling back to
`"application/octet-stream"`; see `lib/object-storage-web/src/use-upload.ts`),
so an empty type falls back to a filename-extension check instead of
silently defaulting to `"image"`, which would reproduce the broken-preview
failure (R3) this plan sets out to fix. Include the derived `mediaType` in
the `onPatch({ imageUrl, mediaType })` call. Replace the unconditional
`<img>` preview with a conditional: render a muted, looping, autoplaying
`<video>` (`autoPlay muted loop`) when `ad.mediaType === "video"` — autoplay
here matters so the admin gets visible confirmation the upload worked
rather than a static/blank frame that reads like a broken upload —
otherwise the existing `<img>`, treating a missing/undefined `mediaType` as
`"image"` for legacy rows (KTD4). Leave the manual raw-URL text input's
behavior as-is; it does not update `mediaType` (see Assumptions / Deferred).

**Patterns to follow:** the upload/preview swap in `SponsorsCard`
(`artifacts/cricket-club/src/pages/admin-social.tsx`) and the `renderAt` +
`installApiMock` component-test setup used in
`artifacts/cricket-club/src/pages/admin-social-studio.test.tsx`. Note:
`installApiMock`'s route table (`artifacts/cricket-club/src/test/mock-api.ts`)
has no built-in entry for the upload endpoints, so any unmatched request
falls through to its `[]` default — not a usable
`{ uploadURL, objectPath, metadata }` shape. The test must pass an explicit
override, e.g.
`installApiMock({ "uploads/request-url": { uploadURL: "https://fake-upload.test/put", objectPath: "/objects/uploads/test-ad", metadata: { name: "ad.mp4", size: 1024, contentType: "video/mp4" } } })`,
so `useUpload`'s `requestUploadUrl` call resolves with a real `objectPath`
and the mocked-global-`fetch` PUT to `uploadURL` (also served by the same
mock, matching on no override so it returns 200) completes successfully.

**Test scenarios:**

- Happy path: firing a file-input change with a `File` whose `type` is
  `"video/mp4"`, against an `installApiMock` override for
  `"uploads/request-url"` as described above, results in `onPatch` being
  called with `{ imageUrl: "/api/storage<objectPath>", mediaType: "video" }`.
- Regression: firing the same flow with a `File` whose `type` is
  `"image/png"` still calls `onPatch` with
  `{ imageUrl: ..., mediaType: "image" }` (existing behavior preserved).
- Fallback: firing the flow with a `File` whose `type` is `""` (empty, as
  some browsers report for unassociated MIME types) but whose `name` ends
  in `.mp4` still resolves `mediaType: "video"` via the filename fallback.
- Preview: once `ad.mediaType` is `"video"` and `ad.imageUrl` is set, the
  row renders a `<video>` element (not `<img>`) with `src` equal to that
  URL and `autoPlay`/`muted`/`loop` present.
- Back-compat: an ad with `imageUrl` set and `mediaType` left `undefined`
  (legacy shape, as returned by real pre-feature data) still renders an
  `<img>`.
- Input constraint: the ad row's file input `accept` attribute includes
  `video/mp4`.

**Verification:** `pnpm --filter @workspace/cricket-club test admin-honours-display`
passes; manually confirm in the running app that an existing image ad still
uploads and previews correctly (no regression).

---

### U3. Render MP4 ad creatives full-screen on the TV kiosk

**Goal:** The kiosk rotation plays uploaded video ad creatives full-screen,
muted and looping, wherever it currently shows image ad creatives.

**Requirements:** R4, R5

**Dependencies:** U1

**Files:**

- `artifacts/cricket-club/src/components/honours-display/SponsorAds.tsx`
  (`AdSlide` component)
- `artifacts/cricket-club/src/pages/honours-kiosk.tsx` (wire `AdSlide`'s new
  error callback to the existing frame-advance function; frame construction
  and dwell-timer duration logic are otherwise untouched)
- `artifacts/cricket-club/src/styles/honour-boards.css` (`.hb-ad-slide`
  rules, ~line 1217)
- `artifacts/cricket-club/src/components/honours-display/SponsorAds.test.tsx`
  (new)

**Approach:** In `AdSlide`, branch on `ad.mediaType`: `"video"` renders
`<video src={ad.imageUrl} autoPlay muted loop playsInline />` (no
`controls` — the kiosk is an unattended display); any other value,
including `undefined` (legacy ads), renders the existing `<img>`. Since
nobody is present to notice or recover from a stuck kiosk, a video that
fails to decode or 404s must not blank the display for the full dwell —
worse than the broken-image icon it replaces. Add an optional `onError`
callback prop to `AdSlide`, wired from `honours-kiosk.tsx` to its existing
frame-advance function, and attach it to the `<video>`'s `onError` so a
video that fails to decode or 404s triggers the same early-advance path the
kiosk already uses at the end of a slide's normal dwell, instead of leaving
a blank frame for the rest of the dwell period. This is the only change to
`honours-kiosk.tsx`: frame _construction_ (how the `ad` frame is built) and
the dwell-_timer duration_ itself (KTD5) are otherwise untouched — this
only adds an early-exit trigger to the advance path that already exists.
Add a `.hb-ad-slide video` CSS rule mirroring the existing `.hb-ad-slide
img` rule (`max-width/max-height: 100%; object-fit: contain`) so video and
image ads share identical full-screen framing inside the same
`.hb-ad-slide` black-letterboxed container.

**Patterns to follow:** the existing `AdSlide`/`SponsorSlide` structure in
the same file; muted-autoplay-loop is the standard browser-safe pattern for
unattended looping video (autoplay with sound is blocked by browsers without
a user gesture, so `muted` is required, not optional).

**Test scenarios:**

- Happy path: `AdSlide` given
  `{ id, name, imageUrl: "/api/storage/x.mp4", mediaType: "video" }` renders
  a `<video>` element whose `src` equals `imageUrl`, with `muted`, `loop`,
  and `autoPlay` present.
- Back-compat: `AdSlide` given an ad with `mediaType: "image"` or
  `mediaType` undefined renders `<img src={imageUrl}>` as before.
- Regression: `AdSlide` never renders both an `<img>` and a `<video>` for
  the same ad.
- Error path: firing the `<video>` element's `onError` event calls the
  `onError`/advance callback passed to `AdSlide`, so a broken video
  creative does not hold the kiosk on a blank frame for the full dwell.

**Verification:** `pnpm --filter @workspace/cricket-club test SponsorAds`
passes; manual check on `/honours-display/kiosk` confirms an uploaded MP4
ad plays full-screen, muted, and looping, and the rotation still advances
to the next frame after the configured dwell time, matching existing
sponsor/ad slide timing.

---

## Verification Contract

- `pnpm --filter @workspace/api-spec run codegen` regenerates cleanly with
  only `KioskAd`-scoped additions (U1).
- `pnpm --filter @workspace/cricket-club test admin-honours-display SponsorAds`
  passes (U2, U3).
- `pnpm --filter @workspace/cricket-club run build` (or the repo's
  equivalent typecheck) passes with the new optional `mediaType` field
  threaded through.
- Manual: upload an MP4 in Admin → Honours Display → Ad creatives; confirm
  the admin preview shows a playing/loopable video, not a broken image.
- Manual: open the kiosk view and confirm the MP4 ad plays full-screen,
  muted and looping, and a pre-existing image ad in the same rotation still
  renders correctly.

## Definition of Done

- U1, U2, and U3 implemented and merged together (U2/U3 both depend on U1's
  field existing in the generated types).
- All listed test scenarios pass; no existing admin-honours-display or
  kiosk behavior regresses.
- Generated OpenAPI client/zod packages are committed alongside the
  `openapi.yaml` change (never hand-edited).
- Manual verification steps above completed once against a running app.

## Sources & Research

Local-only research (no external research warranted — MP4 upload/playback
via a plain `<video>` tag is a well-established browser pattern already
proven elsewhere in this repo for card-template backgrounds; local patterns
were sufficient). Key files read during planning:

- `artifacts/api-server/src/routes/storage.ts` — confirms `video/mp4` is
  already allowlisted server-side (50MB cap) and that uploaded object paths
  carry no file extension (`getObjectEntityUploadURL` in
  `artifacts/api-server/src/lib/objectStorage.ts`).
- `lib/object-storage-web/src/use-upload.ts` — the shared `useUpload` hook;
  confirms `File.type` is sent as `contentType` and is available
  client-side before/at upload completion.
- `lib/db/src/schema/honour_display_settings.ts`,
  `lib/api-spec/openapi.yaml` (`KioskAd` schema, ~line 10896) — current
  `KioskAdJson`/`KioskAd` shape (`id`, `name`, `imageUrl` only).
- `artifacts/cricket-club/src/pages/admin-honours-display.tsx` (`AdEditor`,
  ~lines 1861-1929) — current image-only upload/preview.
- `artifacts/cricket-club/src/components/honours-display/SponsorAds.tsx`
  (`AdSlide`) and `artifacts/cricket-club/src/pages/honours-kiosk.tsx` —
  current image-only full-screen ad rendering and fixed-dwell frame timer.
- `artifacts/cricket-club/src/styles/honour-boards.css` (`.hb-ad-slide`,
  ~line 1217) — existing full-screen ad slide framing to mirror for video.
- `.agents/memory/honour-custom-grids-and-kiosk-ads.md` — institutional
  notes on the `kioskAds` data model and kiosk frame types.
- `artifacts/cricket-club/src/pages/admin-social-studio.test.tsx`,
  `artifacts/cricket-club/src/test/render.tsx`,
  `artifacts/cricket-club/src/test/mock-api.ts` — established `renderAt` +
  `installApiMock` component-test pattern. `installApiMock`'s route table
  has no built-in entry for the upload endpoints (unmatched requests fall
  through to its `[]` default), so U2's tests need an explicit per-test
  override for `"uploads/request-url"` — see U2's Patterns to follow.
