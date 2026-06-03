---
name: Animated social tiles
description: How animated share-card tiles work — motion presets, video-bg templates, client-side video export.
---

# Animated social tiles

Adds motion to the existing share-card system (built-in cards + bring-your-own templates).

## Key design decisions (not obvious from code)

- **`countUp` degrades to `fadeIn` for built-in cards.** Built-in cards render to a flat bitmap, so numbers can't be re-counted; only template text slots with a numeric bound field actually tick up. The modal copy says as much.
- **Motion presets apply to built-in cards too** — you do NOT need a custom template to animate. `fadeIn`/`slideUp` work on any card; the share modal exposes a `motion` `<select>` that defaults to the selected template's `motionPreset` (or "none").
- **Video export is real-time** via `canvas.captureStream()` + `MediaRecorder` (no server-side rendering, out of scope). MP4 (H.264) is preferred when `MediaRecorder.isTypeSupported` allows, else WebM — `renderShareCardVideo` returns `{blob, ext}` and `videoFormatLabel()` / `canExportVideo()` gate the UI. Because recording is real-time, "Download all sizes (zip)" records each animated size **serially**, so it is slow for animated cards (acceptable for an admin export).
- **An animated card is anything where `isAnimatedCard()` is true** = template `backgroundKind` is video/gif OR effective motion preset != none.

## Where things live

- Engine: `artifacts/cricket-club/src/lib/share-card.ts` — `prepareAnimation`, `renderShareCardVideo`, `isAnimatedCard`, `MotionPreset`, `AnimationHandle`, `canExportVideo`, `videoFormatLabel`. `prepareAnimation` returns `{width,height,durationMs,loop,draw(ctx,t),cleanup}`; the live preview drives it with rAF.
- Preview + wiring: `share-card-modal.tsx` (`AnimatedCardPreview` canvas component). **Gotcha:** the `animated` useMemo depends on `activeSize`, so it must be declared AFTER the `activeSize` useState — otherwise "Cannot access 'activeSize' before initialization" at runtime (typecheck does NOT catch this).
- Template builder: `card-template-builder.tsx` — accepts mp4/webm/quicktime/gif; captures `backgroundKind` + `backgroundDurationMs` (from `<video>.duration`; GIFs default to 4000ms since browsers don't expose GIF duration).
- DB: `card_templates.backgroundKind` ("image" default), `backgroundDurationMs` (nullable int), `motionPreset` ("none" default).
- Storage: `artifacts/api-server/src/routes/storage.ts` splits image (10MB) vs video (50MB) MIME/size limits.

**Why:** keeps animation entirely client-side and additive — still PNG export is unchanged, and a card with motion "none" over a still bg behaves exactly like the old system.
