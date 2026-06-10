---
name: Card layer visual effects
description: How per-layer effects (tone/mask/gradient/shadow/border) attach to the card-layout studio without breaking the pixel-identical invariant.
---

Per-layer visual effects in the admin card-layout studio live as an optional
`effects` object on a layer (tone bw|duotone, mask rounded|circle|feather,
gradient, drop shadow, border — all from the club palette, intensities 0-1).

**The pixel-identical invariant is the whole game.** `drawLayers` only takes the
offscreen-compositing path when `hasLayerEffects(fx)` is true; an un-effected
layer draws straight onto the main ctx exactly as before. Any new effect MUST
keep `hasLayerEffects` returning false for the "no effect requested" state, or
every un-touched card silently re-renders through the slow path and risks
drifting.

**Why offscreen compositing:** tone (pixel re-grade) and mask (destination-in
clip) must operate on ONE layer's pixels in isolation, but the renderer draws
all layers onto a single shared ctx. So an effected layer renders to a W×H
offscreen canvas using the same natural→rect transform, gets graded/masked
there, then composites back (with ctx.shadow* for the drop shadow), and finally
the gradient overlay + border paint on the main ctx over the layer `rect`.

**How to apply / extend:**
- The layer's on-canvas bounding box is always `rect` (true for both
  drawsAtNatural built-ins and custom layers) — use it for tone region, mask
  shape, gradient bounds, and border outline.
- Effects work for ALL layer kinds automatically because they wrap the draw
  closure — they never touch data binding. The full-bleed feature/hero photo is
  the `background` layer: it stays non-selectable (so it can't be dragged/resized
  on the canvas) but IS effectable — reachable via the LayerList (which never
  filters on `selectable`) + the Inspector's always-on EffectsSection, and
  relabelled "Feature photo" when a hero image is present.
- **Cross-size constraint for the background (and any non-resizable element):**
  NEVER persist its geometry. Its natural rect IS the render canvas, which
  differs per size (W=1080 always, H=1080/1350/1920). `savedRectToPx` scales by
  1080, so a square-authored h would shrink the bg on taller sizes. `editorToSaved`
  gates geometry on `!geometryLocked` (`geometryLocked = !l.resizable`) and emits
  only effects/z/hidden for the bg, leaving rect at the built-in full-bleed.
- Persistence: a new effect field must be threaded through five places or it
  won't round-trip — OpenAPI `CardLayerEffects` schema (then re-run codegen),
  `RenderLayer`/`EditorLayer` types, `applyLayout` + `buildCustomLayer` (saved →
  render), `computeCardLayers` (saved → editor), and `editorToSaved` BOTH
  branches AND its change-detection (compare via JSON.stringify of effects, else
  an effect-only edit on an unmoved built-in element saves nothing).
- Tone uses getImageData → wrap in try/catch: a tainted (non-CORS) photo throws
  and must degrade to ungraded, not crash.
- Animation/video export does NOT reuse `renderShareCard` — the built-in animated
  path bakes each layer to a bitmap via `bakeLayer`, which originally ran only the
  raw draw and so SILENTLY DROPPED all effects in video. Effect compositing is now
  factored into `drawEffectedLayer(ctx,l,W,H)` shared by BOTH `drawLayers` (still)
  and `bakeLayer` (video). Any future effect MUST flow through that one helper, or
  it'll render in PNG but vanish in MP4/WebM export.

**Reusable effect presets:** a named bundle of LayerEffects, applied to a layer
in one click. Built-in presets ship as client constants (`BUILTIN_EFFECT_PRESETS`
in share-card.ts, **negative ids** so they never collide with saved rows);
admin-saved presets persist in `card_effect_presets` (jsonb effects) via
`/api/card-effect-presets` (GET public, POST/DELETE admin). The editor's
`EffectPresets` (in card-layout-editor.tsx) merges built-ins + saved. Applying a
preset replaces the layer's effects with `{...DEFAULT_LAYER_EFFECTS, ...preset}`
so all intensity fields are present; an empty bundle clears effects (stays off
the offscreen path). Effects stored opaquely (no per-field codegen on the preset
table) — same opaque-jsonb trick as card_layouts.

## Per-layer opacity + Background image upload (Social Studio)
- `CardLayerEffects.opacity` (0-1) is the ONLY new persisted field; absent/1 = opaque fast path (no offscreen). `hasLayerEffects` returns true when `opacity < 1` so the layer routes through `drawEffectedLayer`.
- **Why bake-then-fade:** when `alpha < 1`, gradient+border are drawn into the offscreen FIRST, then the whole offscreen composites under one `globalAlpha`, so content+overlays fade uniformly. `alpha >= 1` keeps the original main-ctx draw order byte-identical (pixel-identical for old cards).
- Background image reuses existing image fields (url/fit/focalX/focalY/zoom) on the `id:"background"` element — NO new schema. `editorToSaved` persists ONLY those image fields for the background, never its locked full-bleed geometry (locked geometry at a square size would shrink on portrait/story).
- `loadCardAssets` pre-scans `opts.layout` for the background element's url → `customBg`; `buildLayers` hero priority = customBg > feature photo > theme texture (custom+feature use the hero scrim).
- countUp numeric layers redraw live (not baked bitmap) so `drawFg` must multiply in `effects.opacity` explicitly; baked paths already composite it.
