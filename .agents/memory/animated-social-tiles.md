---
name: Animated social tiles
description: How animated share-card tiles work — motion presets, video-bg templates, client-side video export.
---

# Animated social tiles

Adds motion to the existing share-card system (built-in cards + bring-your-own templates).

## Key design decisions (not obvious from code)

- **Built-in cards now animate per-element, not as one flat bitmap.** The built-in `prepareAnimation` bakes each `RenderLayer` to its own bitmap (`bakeLayer`/`BakedLayer`) and composites them with per-layer stagger + entrance. So `countUp` now genuinely ticks numbers up on built-in cards too (numeric layers carry `numeric`+`drawCount(ctx,frac)` and are redrawn live), instead of degrading to `fadeIn`. Background layer enters immediately; everything else staggers in.
- **Motion presets apply to built-in cards too** — you do NOT need a custom template. Full preset set: `none/fadeIn/slideUp/countUp/popIn/wipe/stagger`. `MotionPreset` (the modal-facing union) is WIDER than the persisted template enum — `card_templates.motionPreset` (OpenAPI `CardTemplate*MotionPreset`) only allows the original `none/fadeIn/slideUp/countUp`. The template builder dropdown only offers those 4 and casts when saving; popIn/wipe/stagger are modal-only runtime choices, never persisted. **Don't widen the OpenAPI template enum to "fix" a type error** — cast instead.
- **Admin-only authoring — gate EVERY export entry point, not just the buttons.** Motion/Length/Speed controls and the video + GIF buttons are gated by `isAdmin`, but the "Download all sizes (zip)" flow ALSO has to skip video+GIF for non-admins — it's a separate code path that's easy to miss (a code review caught it leaking video to the public). Public visitors only ever get the still PNG. **Why:** authoring/export is an admin-only capability; any new export surface must re-check `isAdmin`.
- **Clip length + speed are runtime RenderOptions** (`durationMs`, `speed`), NOT persisted. Engine clamps: duration 1500–10000ms (`clampDuration`), speed via `clampSpeed`; `effectiveDuration`/`effectiveSpeed` resolve them. They must be threaded into `buildOpts` AND added to `animSig` (preview key) or the preview won't re-prepare when changed.
- **Video export is real-time** via `canvas.captureStream()` + `MediaRecorder` (no server-side rendering, out of scope). MP4 (H.264) preferred when `MediaRecorder.isTypeSupported` allows, else WebM — `renderShareCardVideo` returns `{blob, ext}`; `videoFormatLabel()`/`canExportVideo()` gate the UI. "Download all sizes (zip)" records each animated size **serially**, so it is slow for animated cards (acceptable for admin).
- **GIF export** = `renderShareCardGif` (dynamic-imports `gifenc`, downscaled ~540px/12fps, looping), returns `{blob, ext:"gif"}`; gated by `canExportGif()`. GIF has no codec/seam review step so it downloads straight away (no hold-back preview like video). Admins also get a per-size GIF added to the download-all zip (heavier, so admin-only).
- **An animated card is anything where `isAnimatedCard()` is true** = template `backgroundKind` is video/gif OR effective motion preset != none.

## Where things live

- Engine: `artifacts/cricket-club/src/lib/share-card.ts` — `prepareAnimation`, `renderShareCardVideo`, `isAnimatedCard`, `MotionPreset`, `AnimationHandle`, `canExportVideo`, `videoFormatLabel`. `prepareAnimation` returns `{width,height,durationMs,loop,draw(ctx,t),cleanup}`; the live preview drives it with rAF.
- Preview + wiring: `share-card-modal.tsx` (`AnimatedCardPreview` canvas component). **Gotcha:** the `animated` useMemo depends on `activeSize`, so it must be declared AFTER the `activeSize` useState — otherwise "Cannot access 'activeSize' before initialization" at runtime (typecheck does NOT catch this).
- Template builder: `card-template-builder.tsx` — accepts mp4/webm/quicktime/gif; captures `backgroundKind` + `backgroundDurationMs` (from `<video>.duration`; GIFs default to 4000ms since browsers don't expose GIF duration).
- DB: `card_templates.backgroundKind` ("image" default), `backgroundDurationMs` (nullable int), `motionPreset` ("none" default).
- Storage: `artifacts/api-server/src/routes/storage.ts` splits image (10MB) vs video (50MB) MIME/size limits.

**Why:** keeps animation entirely client-side and additive — still PNG export is unchanged, and a card with motion "none" over a still bg behaves exactly like the old system.
