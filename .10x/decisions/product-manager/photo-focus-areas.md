# Photo focus areas

**Status:** Approved by Ash 27 Oct 2026 (recommended scope). **Priority:** P1.
**Next:** Principal Architect.

## Problem

Auto-made social drafts take a library photo and crop it from the centre for every photo frame.
Heads and faces get cut off, so the admin fixes the crop by hand on each draft, and does the same
fix again every time that photo is used. One photo can suit a tall frame and not a wide one, but
nothing records that, so the picker can choose a photo that can't work in the frame. Group photos
are tagged with several players, but a card about one player shows the whole group.

Ash's idea (27 Oct 2026): mark the area that matters on a photo once, in the photo library, and let
every frame crop to it automatically. A group photo can hold an area per person, which works like
a separate photo of that player.

## Target user

Club social media managers and club admins who let Social Studio make posts automatically and
check them before posting.

## Today (checked in code, 27 Oct 2026)

- A crop is set per draft only: the card's `photoTransform` (focal point 0 to 1, zoom) in the
  draft's adjustments, and a `photo` layer's focal point and zoom per size
  (`artifacts/cricket-club/src/lib/pack-render/adjustments.ts`, `photo-reposition.tsx`). A new
  draft starts centred.
- `club_photos` stores `width` and `height`, so each photo's shape is known.
- `club_photo_players` links a photo to a player with no area on the photo.
- The picker is `pickDraftPhoto` in `artifacts/api-server/src/lib/draft-enrich.ts` (tag-based since
  social-photo-tag-selection).
- Juniors use their own library (`junior_photos`, `junior_photo_participants`).

## Decisions (Ash, 27 Oct 2026)

1. The pain is all four: auto posts crop badly, the same fix is repeated, frames of different shapes
   need different crops, and there is no way to see the crop before a photo is used.
2. **Focus areas, set once per photo,** drive the crop in every frame.
3. **Flexibility by frame shape:** some photos suit tall frames, some wide, some both. The app works
   this out from the focus area, and the admin can override it.
4. **Group photos:** an area per person, linked to that player's tag, acting as a virtual photo of
   that player.
5. **Who finds the areas:** the app suggests a box for each face it finds, in the browser; the admin
   links each box to a player (or ignores it) and adjusts it. No face recognition and no photo
   leaves the app for this.
6. **Timing:** build in parallel with the remaining template library work.

## User stories

- As a social media manager, I want to draw a box around the subject of a photo once, so that
  every card using it keeps the subject in frame without me fixing it.
- As a social media manager, I want to see how a photo will crop in tall, square and wide frames
  when I set its focus, so that I know before it is used.
- As a social media manager, I want the app to suggest a box for each face in a team photo, so that
  I can link each one to a player in a couple of minutes.
- As a social media manager, I want a card about one player to crop a group photo to that player,
  so that a team photo works as that player's photo.
- As a social media manager, I want the automatic picker to skip photos that can't fit the frame's
  shape, so that a wide photo doesn't land in a tall frame cut badly.
- As a social media manager, I want to mark a photo as never for tall (or wide) frames, so that my
  judgement wins where the automatic one is wrong.
- As a social media manager, I can still move or zoom the photo on one draft, and that wins for
  that draft.

## Requirements

### P0 (must have)

- **Focus box per photo:** one optional box per library photo (fractions of the photo, so it
  survives resizing). Set and edited in the photo library.
- **Crop from the box:** every photo frame with no per-draft adjustment crops to keep the whole box
  in view, centred, with a little margin, as close as the frame's shape allows. One shared crop
  function for the editor preview, the rendered card and the server, so they match.
- **Preview strip:** while setting the box, show the photo in tall (4:5 and 9:16), square and wide
  (16:9) frames.
- **Player areas:** a box per tagged player on the photo (on the tag). When a card is about a player
  and uses a photo where that player has an area, crop to the area, not the whole-photo box.
- **Per-draft override still wins:** a moved or zoomed draft photo keeps its own crop. Existing
  drafts don't change.
- **No focus set:** behaves exactly as today (centred).

### P1 (should have)

- **Face suggestions:** in-browser face detection proposes a box per face; the admin links each to
  a tagged player, adds tags from it, or dismisses it. Detection runs on the admin's device only.
- **Shape suitability:** for each frame shape, a photo is a good fit, a tight fit or no fit, worked
  out from the box. The admin can switch a shape off for a photo.
- **Shape-aware picking:** `pickDraftPhoto` knows the template's photo frame shape, prefers photos
  (and player areas) that fit it and skips ones marked no fit for that shape. It never leaves a tile
  empty when the only candidates are tight fits.
- **Library filter "needs focus":** photos used on cards that have no focus box, most used first.
- **Juniors parity:** the same on the junior library, through the junior routes only (juniors
  isolation holds; the withheld flag still wins).

### P2 (nice to have)

- Suggest the whole-photo box on upload from the faces found.
- Show player areas as their own tiles in the player's photo list ("virtual versions").

### P3 (won't do now)

- Face recognition or automatic matching of faces to players (consent and privacy, especially for
  juniors).
- Separate stored crops for every frame of every template.

## Success criteria

Take the baseline before release: the share of auto-made drafts with a library photo whose crop was
moved or zoomed before posting (from draft adjustments).

- Four weeks after release, at least 80% of auto drafts using a photo with a focus box are posted
  without the crop being moved, and the overall share of moved crops at least halves.
- At least 70% of photos used on cards in those four weeks have a focus box.
- An admin can link areas for a 12-person team photo in under 2 minutes with face suggestions.
- No auto-picked photo lands in a frame shape it is marked no fit for.

## Out of scope

- Editing the image file itself (rotating, retouching). Crops are virtual; the original is kept.
- Changing how templates define photo frames.
- Video.

## Risks

- **Crop parity:** three places draw crops today (the editor, the HTML renderer, the canvas share
  card). If they disagree the preview lies. Mitigation: one shared function in `lib/scorecard`
  with tests, used everywhere.
- **Face detection weight:** a detection model adds download size to the admin library. Load it
  only when the admin opens the focus editor.
- **Adoption:** if admins don't set boxes, nothing changes. The "needs focus" filter and face
  suggestions make it fast; watch the coverage measure.
- **Parallel work:** the template library's remaining releases also touch the photo layer. Keep
  this feature's renderer change small and merge `main` often.

## Design questions settled (Ash, 27 Oct 2026)

1. **Storage: on existing rows.** `club_photos` gets a focus box (jsonb, fractions 0 to 1) and the
   frame shapes switched off; `club_photo_players` gets an area (jsonb). The same on `junior_photos`
   and `junior_photo_participants`. One migration, 0070 or later; no new table. Deleting a photo
   or tag removes its area through the existing cascade.
2. **Crop rules: the box sets the default.** With no hand adjustment, one shared function in
   `lib/scorecard` turns the box (or the player's area), the photo's shape and the frame's shape
   into the same focal point and zoom (`PhotoAdjust`) the renderers use today. A draft's moved or
   zoomed photo still wins. Renderers change only where the default comes from.
3. **Frame shape: read from the template.** The picker takes the width and height of the photo
   layer in the club's template for that card kind and size, and passes the aspect ratio into
   `pickDraftPhoto`. Nothing new is stored on templates.
4. **Face library: MediaPipe Face Detector** (`@mediapipe/tasks-vision`, Apache 2.0, short-range
   BlazeFace model), run in the browser and loaded only when the focus editor opens.
