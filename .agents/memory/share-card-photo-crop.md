---
name: Share-card photo crop coupling
description: How the feature-photo drag/zoom crop control stays in sync with the canvas renderer.
---

Feature share-card photos support a drag-to-reposition + zoom focal point.

The rule: the focal point (`focalX`/`focalY`, 0-1, 0.5 = centred) and `zoom` (>= 1)
are **size-independent** — one `PhotoTransform` drives every card size (square/
portrait/story) and all downloads, because each size computes its own
object-fit:cover window centred on the same focal point.

**Why:** action photos have off-centre subjects; a single focal point must crop
correctly across the three aspect ratios without per-size tweaking.

**How to apply:** the renderer's `drawImageCoverFocal` (canvas, in
`lib/share-card.ts`) and the control's `coverGeom` (CSS, in
`components/photo-reposition.tsx`) implement the *same* cover-window math. If you
change one, mirror it in the other or the live reposition preview will diverge
from the rendered/downloaded card. Defaults (0.5, 0.5, zoom 1) are byte-identical
to the old centred cover, so headshots and theme backgrounds are unaffected.
The modal debounces a `renderTransform` for the heavy full-card preview while the
control gives instant feedback off the authoritative `photoTransform`.

For DOM design packs, use the actual rendered card as the crop reference, not
the canvas crop widget. Pack photos use CSS object-position and scale, while
the canvas renderer uses a source-window focal centre; these are different
crop calculations even though both accept the same transform fields.

**Why:** An approximate separate photo frame can disagree with the exported
Club Kit card, particularly where the tall-format photo panel is fluid.

**How to apply:** Keep pack photo controls beside the live card and pass the
same transform to preview and export. Do not assume a canvas-style crop widget
is an exact preview for a DOM pack.
