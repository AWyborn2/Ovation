---
name: Animated share-card audio
description: How background music is added to admin animated video clips, plus the curated-track storage convention and a script-upload gotcha.
---

# Animated share-card audio (admin video clips)

Admins can attach background music to **animated** share-card video clips (web only, admin-only authoring; public users only download). No track = silent (unchanged default). GIF export stays silent. Junior/brand rules unaffected — junior cards still force brown chrome; audio is orthogonal.

## Audio muxing in the canvas video export
`renderShareCardVideo` decodes the track with WebAudio, runs it through a GainNode (volume) into a `MediaStreamDestination`, and adds that audio track to the canvas `captureStream()` **before** constructing the MediaRecorder; the loop trims to the clip window. `pickVideoMime(withAudio)` must prefer mimes with an audio codec (avc1+mp4a / vp9|vp8+opus) or the recorder silently drops audio. Any failure degrades gracefully to a silent clip.

**Why:** Instagram/TikTok need real muxed audio in the file; a separate `<audio>` element is preview-only and never reaches the export.

## Curated-track storage convention
Curated loops are generated instrumental mp3s stored in **public** object storage under `/public-objects/card-audio/...`, served at `/api/storage/public-objects/...`. The `card_audio_tracks.url` column stores the path WITHOUT the `/api/storage` prefix (e.g. `/public-objects/card-audio/x.mp3`); the client prepends `/api/storage` and collapses any accidental double-prefix. Curated rows have `is_curated=true`; admin uploads go through the normal request-url flow and store `/api/storage/objects/...`. The client double-prefix guard tolerates both shapes.

Re-seed curated rows idempotently with `pnpm --filter @workspace/scripts run seed-card-audio` (matches on url, inserts only if absent). The mp3 binaries live in the shared object-storage bucket, so the seed only inserts DB rows — it does not re-upload.

## Gotcha: uploading to public object storage from a one-off script
- `@google-cloud/storage` is NOT at the workspace root — it lives in api-server's deps. Resolve it via the `node_modules/.pnpm/@google-cloud+storage@<ver>/...` path (or run inside api-server).
- The `code_execution` sandbox has **no `process.env`** (env/secrets come back masked from `viewEnvVars`). To read `PUBLIC_OBJECT_SEARCH_PATHS` you must run the uploader from **bash** (where env is populated), not the JS sandbox.
- Build the Storage client with the Replit sidecar external_account creds (sidecar at `http://127.0.0.1:1106`), upload to `<publicSearchPath>/card-audio/<file>`, then store url `/public-objects/card-audio/<file>`.

## Unrelated build break found while verifying
`gifenc` was declared in `artifacts/cricket-club/package.json` (added by the prior animation/export task) but never installed, so Vite failed import-analysis on `share-card.ts` and the whole web app 500'd. Fix: `pnpm install`. If the animated/GIF export path ever 500s on load, check that declared dynamic-import deps are actually in `node_modules`.
