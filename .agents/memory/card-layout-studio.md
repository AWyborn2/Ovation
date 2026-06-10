---
name: Card layout studio (layer-based card editor)
description: How the editable layered card canvas works — unified builder, normalized rects, pixel-identical defaults.
---

# Card layout studio

Admin-only editor that turns fixed code-defined social/trading card layouts into an editable layered canvas. Authoring is admin-gated; public is download-only.

## Core invariant: defaults must stay pixel-identical
`renderShareCard` builds `RenderLayer[]` (chrome + per-kind body), each layer's draw closure runs the ORIGINAL draw code at NATURAL coords. `drawLayers` applies a translate+scale that maps natural→saved-rect. When no layout is saved, `rect === natural` → identity transform → byte-identical output to the pre-studio renderer. **Any change to a built-in layer's draw code must keep working under the identity path or it silently breaks every un-customised card.**

## Coordinate model
- `W = 1080` across all 3 sizes (square/portrait/story); `scale` always 1.
- Layer rects normalized as fractions of **1080 for BOTH axes** (not H), so a layout authored on one size holds across all three.
- Bottom chrome uses `vAnchor:"bottom"` (H-independent offset): stored `y = (H - rect.y)/1080`; reconstruct `topEdge = H - y*1080`. Editor drag for a bottom-anchored layer: y DECREASES as you drag down.

## Out of scope (kept on separate paths)
`matchSummary` and template (BYO) cards do NOT go through the layer system — `computeCardLayers` returns `[]` for them. The "Customise layout" button is hidden when a template is selected or kind is matchSummary.

## Persistence
`card_layouts` table (cardKind unique, layers jsonb). `editorToSaved()` emits ONLY changed `element` layers plus full custom (image/sticker/text) layers — so an untouched card saves nothing and stays on the identity path. `card_input` style opaque jsonb so new layer kinds need no codegen.

**Why:** keeps stored layouts minimal and guarantees defaults can never drift from custom edits.

## Junior + sponsor rules persist
Junior brown chrome and brand/sponsor filtering still apply through the layer path (chrome layers read brand, not hardcoded hexes). Preview and PNG export share the same render path so they always match.

## Built-in headshot photo focal/zoom (FIX A)
The built-in round headshot is created by `addPhoto()` (not the generic `add`), which carries a mutable `photoTransform {focalX,focalY,zoom}` the draw closure reads on every render. `drawCircularImage` takes an optional transform and routes through `drawImageCoverFocal`; **default 0.5/0.5/1 is mathematically identical to a plain centred cover**, so un-customised headshots stay pixel-identical. `applyLayout` copies saved focal/zoom onto the layer's `photoTransform`; `computeCardLayers` exposes them on the EditorLayer; `editorToSaved` persists them (also detects focal/zoom in the change check). Editor: Inspector zoom+X/Y sliders gated on `layer.id === "photo"`, plus wheel-to-zoom via a **native non-passive** wheel listener on the canvas ref (React onWheel is passive → can't preventDefault).

## All selectable elements resizable (FIX B)
The `add` helper forces `resizable: l.selectable` (overrides whatever a call site passed). Every selectable built-in gets resize handles; only non-selectable chrome (background) stays fixed. One edit covers all ~37 layer sites.

## Two-axis snapping + align to other layers (FIX C)
`EditorCanvas.onPointerMove` snaps BOTH axes. Targets = card edges/midline AND every other visible selectable layer's left/centre/right (x) and top/centre/bottom (y). Vertical snap is computed in **top-origin units (fraction of 1080)** to neutralise per-layer `vAnchor`, then converted back. Picks the single closest target per axis (min distance, no accumulation). Renders both vertical (`vx`) and horizontal (`hy`) guides.
