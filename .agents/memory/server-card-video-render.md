---
name: Server-side card video render
description: How admin MP4 share-card rendering works (Puppeteer drives the real frontend renderer) and its parity/payload constraints.
---

# Server-side card video render (admin MP4)

Admins can render an animated share-card to a guaranteed-compatible H.264/yuv420p MP4 server-side, as an alternative to the browser MediaRecorder path (which is real-time-slow and sometimes emits WebM that IG/TikTok reject).

## Architecture (chosen for preview parity)
Puppeteer (puppeteer-core + system chromium) loads a **hidden frontend harness route** (`/__card-render`) that installs `window.__cardRenderHarness` and runs the EXACT same `prepareAnimation` renderer the live preview uses. The server drives it frame-by-frame (`drawFrame(t)`, t is 0..1 progress, NOT ms), pipes PNGs into ffmpeg `image2pipe` → libx264/yuv420p/+faststart. There is deliberately **no second node-canvas renderer** — single source of truth, so server clips are pixel-identical to the preview and brand/sponsor/junior rules come for free.

**Why this matters:** if you ever "optimise" by porting the renderer to the server, you reintroduce drift. Keep the harness path.

## Payload contract (easy to get wrong)
The job body is `{ input, options, fps }` — the SAME opaque `ShareCardInput` + `RenderOptions` JSON the preview builds via `buildOpts(size, transform)`. `options.size` is REQUIRED and must be a valid `SIZES` key — `square` | `portrait` | `story` (NOT the friendly sizeCode `1x1`/`4x5`/`9x16`). Missing/invalid size → `Cannot destructure property 'w' of 'SIZES[opts.size]'`. The server only uses size to derive the download filename; it does not inject it into options.

## Job model & auth
In-memory job Map (queued/rendering/encoding/done/error + progress 0..1), TTL prune, serialized render chain. All 3 routes (`POST /api/card-video/jobs`, `GET .../{id}`, `GET .../{id}/download`) are admin-only via `requireAdmin` (session cookie; no OpenAPI security by design). Client polls then `downloadCardVideoJob(id)` returns a Blob fed into the same review dialog the browser path uses; browser MediaRecorder button stays as fallback.

## Env requirements
Needs system `chromium` (resolved via PUPPETEER_EXECUTABLE_PATH/CHROMIUM_PATH/`which chromium`) and `ffmpeg` (both present in this Nix env). Harness reached through the shared proxy at `http://localhost:80/__card-render` (override RENDER_HARNESS_URL/RENDER_HARNESS_ORIGIN).
