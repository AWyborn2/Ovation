# kiosk-photo-rotation

Status: recommended 22 Oct 2026, awaiting Ash's alignment. P1.

## Problem
The honour boards TV kiosk only shows text boards (plus sponsor ads). The club's photo library
(`club_photos`, folders + type tags) goes unused on the clubroom TV, so the screen is text-heavy
and never shows recent moments. Target user: club admin setting up the clubroom TV; audience:
members and visitors in the clubroom.

## Ash's answers
- Wants all four uses configurable: interludes between boards, a slideshow segment, photo
  backgrounds behind boards, and recent-moments content.
- Wants all selection modes: folder, tags/filter, hand-picked, and random from the library.

## Shared model (build once, used by every mode)
A **photo source** = filter + order:
- filter: whole library | folders[] | types[] (+ optional "taken/added in last N days" or
  "this season") | hand-picked photo ids
- order: random (reshuffle each loop) | newest first | manual
- Fallback: if the source returns no photos, skip silently (never show a blank screen).

## Phases
- **P0 — Photo slideshow in the rotation sequence.** "Add photo slideshow" to the kiosk
  sequence alongside boards; each item has a source, photo count per pass, seconds per photo,
  crossfade. Full-bleed, cropped to 16:9, club crest corner badge, optional caption.
- **P1 — Photo interludes.** Global setting "show 1 photo every N boards" from a source
  (same mechanism as sponsor ads).
- **P1 — Recent moments preset.** One-click source: last 21 days / this season, random.
- **P2 — Board backgrounds.** Per-board optional photo background with darken/blur and
  contrast guard; readability risk, so last.

## User stories
- As a club admin, I want to add a photo slideshow to the TV rotation from a folder, tags,
  hand-picked photos or the whole library, so the TV shows our club, not only text.
- As an admin, I want random order, so the TV looks different each time without upkeep.
- As a member, I want to see recent match photos on the clubroom TV.

## Success criteria
- ≥50% of active-kiosk clubs add a photo item within 4 weeks of release.
- No kiosk loop ever renders a blank/broken frame (source empty or image 404 → skipped).
- Kiosk stays smooth on a cheap TV browser: images use preloaded display-size renditions
  (not originals); memory stable across a 12-hour run.

## Out of scope
Video, live social feeds, per-photo scheduling, uploads from the kiosk, photo editing.

## Risks / constraints
- **Juniors isolation:** sources must exclude junior-tagged/junior stock photos unless a
  future juniors kiosk is in scope. Default exclude.
- **Tenant isolation:** kiosk reads only the tenant's own library (public kiosk endpoint).
- Privacy: kiosk is public — only photos the club treats as publicly displayable; consider a
  per-photo "hide from kiosk" flag.
- Image weight on TV hardware (use thumb/display renditions, preload next).
- Backgrounds hurting legibility (P2, contrast guard).
