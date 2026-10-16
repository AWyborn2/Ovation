---
title: Junior Card Photos - Plan
type: feat
date: 2026-10-16
topic: junior-card-photos
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Junior Card Photos - Plan

## Goal Capsule

- **Objective:** A junior social card can carry a photo of one of the club's junior players, taken from a photo library the club's admin keeps, and never of a player whose family has not consented.
- **Product authority:** Ash (owner, Halls Head media officer). Decisions made with him on 2026-10-16: consent is recorded per player by an admin and the default allows a photo, because the club's registration form already carries photo consent and the few non-consents are known; photos come only from an admin-uploaded junior library; every junior card kind may use one.
- **Execution profile:** Standard. One new table and three columns (one migration), one admin page section, one photo-pick helper used by the four junior engines, the renderer's junior photo block relaxed behind a positive marker, and a withdraw path when consent changes.
- **Stop conditions:** Stop and ask Ash if a change would put a photo on a card for a player who is withheld or private, serve a junior photo without an admin session, take a photo from PlayHQ or any source other than the club's own upload, or show junior photos on the public website (not in this plan).
- **Open blockers:** None.
- **Tail ownership:** Ash applies migration `0045_junior_card_photos.sql` in Replit's Production SQL runner (statement by statement) before republishing.

---

## Product Contract

### Summary

Junior cards today carry no photo at all (rule R21 of plan 2026-10-14-001). Clubs want their junior Big Moments, team lists, results and round carousels to look like the senior ones. The club's registration form already asks families for photo consent, so the admin only needs to mark the few who have said no, upload the photos the club has taken, and the cards pick a photo of an allowed player automatically — the same way senior team lists feature one player's library photo.

### Actors

- A1. **Club admin** — uploads junior photos, marks the players whose families have not consented, reviews cards.
- A2. **Junior player / family** — their consent (or not) decides whether a photo can appear. They never use the app.
- A3. **The engines** — draft junior cards and choose a photo.

### Requirements

- R1. Each junior player has a **photo withheld** flag an admin sets; off by default. The app records who set it and when.
- R2. A junior player can have one or more photos in a **junior photo library** the admin uploads (headshot crop, like senior player images). One is the default (the newest unless the admin picks another). Photos are never taken from PlayHQ or any other source.
- R3. A photo may appear on a junior card only for a player who is **not withheld, not private** (`is_private` without an override), and **named on that card**.
- R4. **Big Moment** cards show that player's default photo when allowed; otherwise no photo.
- R5. **Team list**, **result** and **round carousel** junior cards (and junior slides of a combined carousel) feature one allowed player with a photo, picked deterministically per card the way senior team lists do; if no listed player qualifies, the card has no photo.
- R6. Marking a player withheld (or private) **removes their photo from every card not yet posted**, immediately when the admin saves, and the card is re-drafted without it; a posted card is marked stale, as a privacy change does today.
- R7. An admin may set a junior card's photo by hand only to a junior-library photo of an allowed player named on that card. The senior photo library stays senior-only and is never offered for a junior card.
- R8. Junior library photos are stored privately. The raw storage path is never public (the open `GET /storage/objects/*` route must not serve them); the only public way to a junior photo is a gated endpoint that checks, at request time, that the player is still allowed (R3) — so withdrawing consent cuts the image off everywhere at once. Admins see every photo through their session.
- R9. The admin's junior players page shows each player's photo state (photo / no photo / withheld) and lets the admin upload, remove, set the default and toggle withheld, with a confirmation naming the family's consent.
- R10. Clubs without junior sync are unaffected. Nothing changes for senior cards.
- R11. The public Juniors website pages show an allowed player's default photo on their player profile (Ash, 2026-10-16); a withheld or private player shows none.

### Key Flows

- F1. Admin → Junior players → a player → **Photo**: upload (crop) → saved as default → the next sweep (or the admin's "re-pick") puts it on that player's cards.
- F2. Admin toggles **Photo withheld** → confirm → saved with admin + time → the player's photos are no longer eligible → unposted cards featuring them are re-drafted without the photo in the same request; posted ones are marked stale.
- F3. Sweep drafts a junior Big Moment → player allowed and has a photo → card carries `photoUrl` + `photoSource: "auto:junior-photo"` + `featuredParticipantId`.
- F4. Sweep drafts a junior team list → featured pick among listed allowed players with photos, seeded by the draft key → stable across re-renders.

### Acceptance Examples

- AE1. Riley (Year 9, not withheld, photo uploaded) makes 52 with the junior bar at 50 → the Big Moment card shows Riley's photo. Flag Riley withheld → the unposted card re-drafts with no photo; the admin sees the change without a sweep.
- AE2. A junior team list of 11 where two players have photos and one of them is private → the card features the other player's photo, stable across re-renders.
- AE3. A junior team list where no listed player has a photo → the card has no photo (today's look).
- AE4. An admin tries to set a senior library photo on a junior draft → 422; choosing a junior-library photo of a player not on that card → 422.
- AE5. An unauthenticated request for a junior photo's object URL → 401; an admin session → the image.
- AE6. A combined round carousel with senior and junior slides → senior slides pick photos as today; a junior slide follows R5; no slide shows a junior's photo who is withheld.
- AE7. Migration applied twice → no error; a club with no junior data sees no change anywhere.

### Scope Boundaries

- Out: public Juniors pages showing photos (R11); consent-form uploads; PlayHQ "Video Consent Setting" (deliberately not imported); AI background removal on junior photos (the third-party call stays blocked for juniors).

### Dependencies

- Plan 2026-10-14-001 (junior PlayHQ sync; R21, KTD13–KTD15) — this plan **supersedes R21** (ADR-007).
- Plan 2026-10-15-001 (junior markers `junior` / `juniorTeams` on every junior card) — the renderer's positive marker builds on these.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **A separate `junior_photos` table, keyed by participant GUID**, not rows in `club_photos` (senior-only by design, int player ids, KTD15 guard stays) nor `player_images` (int ids). Columns: `id`, `tenant_id`, `participant_id`, `object_path`, `thumb_path`, `width`, `height`, `is_default`, `created_by`, `created_at`. Index on `(tenant_id, participant_id)`.
- KTD2. **Three columns on `junior_participants`**: `photo_withheld boolean not null default false`, `photo_withheld_by text`, `photo_withheld_at timestamptz`. Written only by the admin PATCH, never by the sync (same rule as `privacy_override`).
- KTD3. **Allowed = not withheld and not `isJuniorWithheld` (private without override)**, computed in one helper `juniorPhotoFor(tenantId, participantIds) → Map<participantId, {url, photoId}>` in `api-server/src/lib/junior-photos.ts`, read once per batch like `loadJuniorNaming`.
- KTD4. **Photo pick per engine:** Big Moment → the player; team list → `seededPick` over listed allowed players with a photo (mirrors `teamListPhotoPlayer`, seeded by the draft's source key); result → the club's top performer with a photo, else any allowed listed player, else none; round carousels → per junior slide, same rule. Drafts store `photoUrl`, `photoSource = "auto:junior-photo"` and `cardInput.featuredParticipantId` (GUID; never an int id).
- KTD5. **Renderer fail-closed marker.** The web renderer's junior null-outs (`render.ts`, `adjustments.ts`, `admin-studio-editor.tsx`, `use-photo-controls.ts`, `use-card-export.ts`) and the server's (`draft-render.ts`) change from "junior ⇒ no photo" to "junior ⇒ photo only when `cardInput.juniorPhotoAllowed === true`", a marker only the server's helper writes. The `draft-enrich.ts` senior pipeline keeps `if (junior) return null` — junior photos never come from the senior library or rules.
- KTD6. **Consent change propagation in the request.** The participant PATCH (withheld or private) calls `withdrawJuniorPhoto(tenantId, participantId)`: unposted drafts whose `cardInput.featuredParticipantId` matches are re-drafted through their engine's refresh path (photo removed, `photoSource = "none"`); posted ones use `withdrawDraft` (stale). The hourly sweep remains the backstop (KTD15 of the junior plan).
- KTD7. **Private storage, gated serving.** Junior photos are written under `library/juniors/<uuid>`; `GET /storage/objects/*` refuses that prefix without an admin session. The image URL cards and the public profile use is `GET /api/juniors/photos/:photoId`, which streams the object only when the player is allowed right now (R3) or the caller is an admin; the server renderer reads through `PhotoStore` the same way. Rendered card images are what the club posts, as today.
- KTD8. **Manual photo PATCH guard.** `PATCH /social-drafts/:id` photo changes on a junior draft accept only a `junior_photos` id of an allowed player listed on the card (R7); senior library ids → 422. The draft drawer offers a "Junior photo" picker for those players instead of the senior library.
- KTD9. **OpenAPI first.** `UpdateJuniorParticipantBody` + `JuniorAdminParticipant` gain `photoWithheld`, `photoWithheldBy/At`, `photos`; new `GET/POST/DELETE /juniors/participants/{id}/photos`, `POST .../photos/{photoId}/default`; `SocialDraft.photoSource` enum gains `auto:junior-photo`. Codegen regenerated.
- KTD10. **Migration `0045_junior_card_photos.sql`**, idempotent (`IF NOT EXISTS`), applied by hand before republishing (STATUS rule).

### Implementation Units

- **U1. Schema + migration** — `lib/db/src/schema/juniors.ts` (columns, `juniorPhotosTable`), `lib/db/migrations/0045_junior_card_photos.sql`, snapshot; drizzle drift clean. Tests: migration applies twice locally.
- **U2. API: participants + photos** — OpenAPI (KTD9) + codegen; `routes/juniors-admin-participants.ts` PATCH accepts `photoWithheld` (journal + KTD6 withdraw); new `routes/juniors-photos.ts` (list/upload-complete/delete/default, admin-only, `PhotoStore` under `library/juniors/`); `routes/storage.ts` refuses the junior prefix without an admin (KTD7). Tests: route tests incl. AE5.
- **U3. Photo helper + engines** — `lib/junior-photos.ts` (`juniorPhotoFor`, `pickJuniorCardPhoto`), wired into `engines/junior-big-moments.ts`, `engines/junior-team-list.ts`, `match-summary-drafter.ts` (junior path), `engines/round-sets.ts` junior slides; `draft-upsert` refresh keeps auto junior photos re-pickable; `draft-render.ts` renders a junior photo only with the marker (KTD5). Tests: AE1–AE3, AE6 in `junior-social.db.test.ts` + engine unit tests; existing "no photo" assertions become "no photo unless allowed".
- **U4. Web renderer + Studio** — relax the five junior null-outs behind `juniorPhotoAllowed` (KTD5); draft drawer junior photo picker (KTD8); `isJuniorDraft` copy updated. Tests: `template-lint`, `kind-template-layers`, `use-photo-controls`, `weekend-carousel/model` updated for the marker.
- **U5. Admin junior players page** — photo state column, Photo section in `JuniorPlayerEditor` (upload with `ImageCropDialog` + `HEADSHOT_ASPECTS`, remove, default, withheld toggle with consent wording and audit line). Tests: page test for toggle + upload call shapes.
- **U7. Public Juniors profile** — `GET /juniors/players/:id` gains `photoUrl` (allowed players only); the public junior player page shows it. Tests: a withheld player's profile carries none.
- **U6. Release + docs** — runbook §3c (apply 0045 before republishing; checks), AGENTS/CLAUDE/CONCEPTS ("Junior photo", "Photo withheld"), ADR-007, plan 2026-10-14-001 R21 marked superseded.

### Verification Contract

- API suite (DB-backed) green incl. new route/engine tests; web suite green; both typechecks; codegen current; drizzle drift reports only 0045; Prettier 3.9.6 + eslint on changed files.
- Manual after republish: upload a photo for one Year 9 player, run a sweep, see it on their team list; flag withheld, see the card re-draft without it.

### Definition of Done

- U1–U6 merged to `main` via one PR with CI green; migration SQL handed to Ash; runbook updated.
