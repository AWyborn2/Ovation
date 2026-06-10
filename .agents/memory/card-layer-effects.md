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
  closure — they never touch data binding. Feature/hero photo is the
  non-selectable `background` layer, so it's out of effects scope; the
  selectable headshot `photo` layer and stat tiles are in scope.
- Persistence: a new effect field must be threaded through five places or it
  won't round-trip — OpenAPI `CardLayerEffects` schema (then re-run codegen),
  `RenderLayer`/`EditorLayer` types, `applyLayout` + `buildCustomLayer` (saved →
  render), `computeCardLayers` (saved → editor), and `editorToSaved` BOTH
  branches AND its change-detection (compare via JSON.stringify of effects, else
  an effect-only edit on an unmoved built-in element saves nothing).
- Tone uses getImageData → wrap in try/catch: a tainted (non-CORS) photo throws
  and must degrade to ungraded, not crash.
- Animation/video export reuses `renderShareCard` → effects flow into video for
  free at all three sizes; no separate path.

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
