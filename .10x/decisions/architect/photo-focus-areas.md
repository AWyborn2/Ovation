# Photo focus areas: design

**Status:** Accepted 27 Oct 2026 (Ash settled the four design questions; see the product decision's
last section). **Scope:** `.10x/decisions/product-manager/photo-focus-areas.md`.

## Data (migration 0070)

| Column                                                      | Meaning                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `club_photos.focus_box`, `junior_photos.focus_box`          | jsonb `{x, y, w, h}`, fractions 0–1; null = centred crop      |
| `club_photos.off_shapes`, `junior_photos.off_shapes`        | text[] of `tall` / `square` / `wide`, checked; default `{}`   |
| `club_photo_players.area`, `junior_photo_participants.area` | jsonb box: where that player is on the photo                  |
| `social_drafts.photo_focus`                                 | jsonb `{box, width, height}`: the snapshot taken at pick time |

The draft holds a snapshot, not a reference: an existing draft never changes when an admin later
edits a box (the product decision's "existing drafts don't change"), and every renderer gets the
box with the photo URL it already has, with no lookup. Deleting a photo or tag cascades as before.

## One crop calculation

`lib/scorecard/src/photo-focus.ts`:

- `focusTransform(focus, frameAspect)` → `{focalX, focalY, zoom}` (focal 0–1), the same
  `PhotoTransform` the sliders produce. Every renderer draws `object-fit: cover` at
  `object-position: focal` scaled by `zoom` about that point, which shows the window
  `[p(1 − w), p(1 − w) + w]` on each axis (`w` = visible share ÷ zoom). The function zooms in
  as far as the box allows (1 to 2.5) with a 12% margin and centres the box.
- `focusFit` / `shapeFit` / `photoShapeFit` → `good` / `tight` (loses up to 20% of the box) /
  `none`, for the picker and the library badges.

## Precedence when drawing

1. The draft's own photo sliders, once moved (as today).
2. A `photo` layer's own focal point and zoom. Only an edit sets one (no bundled design positions
   its photo), so this is a hand-made crop on the draft or the club's template copy.
3. The draft's `photoFocus`, through `focusTransform` with the frame's aspect.
4. Centred.

The older pack path (pre-template drafts) keeps its centred slots: its frames' sizes aren't known
when it renders.

The frame's aspect is the layer's box in pixels (template documents: the layer's geometry
percentage of its parent, down through groups; the canvas renderer: its rect).

## Picking

`pickDraftPhoto` takes the template's photo frame aspect (`photoBoxSize` for the club's template of
that kind and size, worked out on the server from the stored document), ranks candidates by
`photoShapeFit` (good, then tight; never `none` unless nothing else exists, so a tile is never left
empty) and returns the photo's `PhotoFocus`: the pictured player's area when the card is about a
player and the area exists, else the photo's focus box, else null.

## Faces

MediaPipe Face Detector (`@mediapipe/tasks-vision`, Apache 2.0, short-range BlazeFace model, about
1 MB), loaded with a dynamic import only when the focus editor opens. It runs on the admin's
device; no photo leaves the app for it. Suggestions are boxes only; linking a box to a player is
the admin's choice.

## Routes

`PUT /club-photos/{photoId}/focus` sets the focus box, switched-off shapes and player areas
(fields left out are kept; a new area tags the player, senior players only). `ClubPhoto` carries
`focusBox`, `offShapes` and `playerAreas`; `SocialDraft` carries `photoFocus`. The junior library
gets the same through the junior routes only, behind the same consent gate.

## Slices (each its own PR to `main`, safe alone)

| Slice | What                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Migration 0070, schema, OpenAPI, `PUT /club-photos/{id}/focus`, the shared calculation, tests                                           |
| 2a    | Drafts snapshot `photoFocus` at every pick and manual change; the template renderer, share dialog, editors and server render crop to it |
| 2b    | `pickDraftPhoto` is shape-aware (frame aspect from the club's template)                                                                 |
| 3     | The library's focus editor: box, preview strip, player areas, face suggestions, filter                                                  |
| 4     | Juniors parity on the junior library routes and editor                                                                                  |

Slice 1 changes nothing anyone sees: no box is set until slice 3 ships the editor.

## Delivery notes (27 Oct 2026)

- Slice 1 merged as #549, slice 2a as #550. 2b is #552.
- A switched-off shape leaves the photo out of the automatic pick for that shape; box fit only
  reorders.
- Juniors: the junior library gets the editor, the boxes and the participant areas, and junior
  cards crop to the featured child's area. Areas are only for children already tagged:
  tagging stays on the tag panel because it decides consent.
- Not built at the time: suggesting a box on upload (P2) and player areas as their own tiles (P2),
  both since built (follow-ups below), and ordering the "Needs focus" filter by use (still open).

## Follow-ups (28 Oct 2026)

- Junior shape-aware picking: junior engines load photos for the frame shape of the club's
  template for the card kind (`juniorPhotoLoader` in `junior-photos.ts`, using
  `draftFrameAspect`). A shape switched off for a photo leaves it out; the child's area (else
  the photo's box) ranks by fit before the player's default photo and the newest; a team list
  picks among the candidates with the best fit. The consent rule runs unchanged after shape
  filtering, so a pick is still only ever an allowed photo. The junior editor now shows the
  frame-shape switches.
- Suggest a focus box on upload (Ash, 28 Oct 2026: used, but flagged): after an upload or a
  Drive import, the library page finds faces on each new photo in the browser
  (`suggestUploadFocus` in `face-suggestions.ts`) and saves the box round everyone with
  `suggested: true`. Cards crop to it straight away; `focus_suggested` (migration 0075) keeps the
  photo in "Needs focus" until an admin saves the focus, which clears it. A suggestion never
  replaces a box an admin set. The junior library does the same through the junior routes.
- Player areas as their own tiles (Ash, 28 Oct 2026: in a draft's Swap photo): the draft drawer's
  library grid (`photo-swap-grid.tsx`) shows, after each photo, a tile per marked player,
  cropped to their area and named. Picking one sends `photoPlayerId` with `photoUrl`, and the
  draft snapshots that player's area (`draftPhotoFocus` with the player), so a team photo works
  as that player's photo. Senior drafts only, as the drawer's library is.
- Small faces (28 Oct 2026): the short-range model only finds a face that fills about 15–35% of
  what it scans, so a whole-photo scan of a team photo found no faces at all (checked in Chromium
  against the real model). `findFaces` now also scans overlapping squares a half and a quarter of
  the photo's short side (`faceScanTiles`), keeps faces from squares at a confidence of 0.7 or more
  (zoomed-in squares of a close-up mistake shirts for faces at 0.5–0.65), and merges the overlaps
  (`mergeFaces`). About 1.5 s a photo; the editor's face suggestions get the same scan.
- Suggest focus for the photos already in the library (Ash, 28 Oct 2026): both libraries show
  "Suggest focus from faces" while any photo has no box (`suggest-focus-all.tsx`). It runs the
  upload suggestion over those photos one at a time in the admin's browser (about 1.5 s each),
  shows progress, refreshes the grid as it goes and can be stopped; photos with a box, set or
  suggested, are never touched.
