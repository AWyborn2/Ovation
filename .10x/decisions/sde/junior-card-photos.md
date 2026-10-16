# SDE — junior-card-photos

Plan: `docs/plans/2026-10-16-001-feat-junior-card-photos-plan.md`. ADR-007. Branch `claude/junior-card-photos`.

## Built (2026-10-16)

- **U1 schema + migration.** `junior_participants.photo_withheld / _by / _at`; new `junior_photos` (participant GUID key, `object_path`, `thumb_path`, `is_default`, audit). `0045_junior_card_photos.sql` hand-written idempotent (`IF NOT EXISTS`, FK dropped-and-re-added) with the drizzle-kit snapshot/journal; `drizzle-kit generate` reports no drift. Applied twice locally.
- **U2 API.** OpenAPI: `photoWithheld` on the participant PATCH and admin shape; `JuniorPhoto` + `AddJuniorPhotoBody`; `photoUrl` on `JuniorPlayerSummary`/`JuniorPlayerDetail` (+ withheld fields for admins); routes `GET/POST /juniors/participants/{id}/photos`, `DELETE …/{photoId}`, `POST …/{photoId}/default`, public gated `GET /juniors/photos/{photoId}[/thumb]`. `routes/juniors-photos.ts` (mounted in `routes/juniors.ts`): upload → `ingestImage` (EXIF stripped, thumb) → `PhotoStore.write(…, "library/juniors")`; the original upload is deleted. `routes/storage.ts` refuses the `library/juniors/` prefix without an admin session. The participant PATCH plans `photoWithheld` through `planJuniorParticipantPatch` (journalled, who/when) and calls `withdrawJuniorPhotos` when the patch takes a photo away (`patchWithdrawsPhoto`).
- **U3 helper + engines.** `lib/junior-photos.ts`: `loadJuniorPhotos` (allowed players' default photos; `includeDisallowed` for admin lists), `pickJuniorCardPhoto` (preferred first, then `seededPick` over candidates), `juniorPhotoFields` (card-input marker `juniorPhotoAllowed: true` + `featuredParticipantId`, draft `photo` with source `auto:junior-photo`), `withdrawJuniorPhotos` (open drafts stripped in-request, posted ones `staleSince`). Wired into `engines/junior-big-moments.ts` (the player), `engines/junior-team-list.ts` (seeded pick over the XI), `match-summary-drafter.ts` junior path (`juniorPhotoCandidates`: club lines, top scorer/wicket-taker preferred) and the junior-only weekend-wrap set in `engines/round-sets.ts`. `draft-upsert`/`draft-enrich` accept a pre-picked `photo` (counts as automatic, so an admin's manual photo still wins on refresh). The senior pipeline keeps `if (junior) return null`.
- **Renderers (KTD5).** Server `draft-render.ts` and web `pack-render/render.ts`, `adjustments.ts` (`FreeLayerContext.juniorPhotoAllowed`), `admin-studio-editor.tsx`, `use-photo-controls.ts`, `use-card-export.ts`: "junior ⇒ no photo" became "junior ⇒ photo only behind `juniorPhotoAllowed`".
- **U5 admin page.** `admin-junior-players.tsx`: `JuniorPhotoSection` (upload via `ImageCropDialog` + `useUpload`, list, make default, remove, withheld toggle with consent wording and who-set-it), status pills _Photo_ / _Photo withheld_.
- **U7 public profile.** `GET /juniors/players/:id` returns `photoUrl` for an allowed player; `juniors-player-detail.tsx` shows it beside the name.
- **Draft drawer.** A junior draft shows its photo (with the consent note) or explains why it has none; the senior library stays disabled for junior drafts.
- **Deviations.** Combined senior+junior round carousels keep the senior photo and their junior slides stay photo-less (per-slide photos aren't a thing in round sets today); only the junior-only weekend-wrap set gets a junior pick. A manual "choose a junior photo" picker in the drawer (KTD8) was not built — the admin changes the player's default photo instead; the manual photo PATCH on a junior draft still renders nothing without the marker, so it cannot leak a senior photo onto a junior card.

## Verified

- Pure tests `lib/junior-photos.test.ts` (allowed rule, pick, fields, withheld patch planning, `patchWithdrawsPhoto`); DB route test `routes/juniors-photos.test.ts` (add/list/default/delete, private prefix, public gating, storage guard, directory/profile `photoUrl`, in-request withdraw: open stripped, posted stale, re-allow). Existing junior suites unchanged and green (no photos uploaded ⇒ no photo).
- Typecheck api-server + cricket-club clean; codegen regenerated; lib/db 487 green.

## Tech debt

- `PhotoStore.write` prefix is a string; a typed enum would stop a typo landing junior photos under the public-servable `library/` prefix.
- The deleted-photo path leaves `photoUrl` on cards until their next refresh (404s meanwhile).
