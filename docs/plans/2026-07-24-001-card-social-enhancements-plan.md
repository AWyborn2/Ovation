# Card & Social Enhancements — Implementation Plans

Scoped 2026-07-24 from the PR #60 feedback review
([follow-ups doc](../follow-ups/2026-07-23-pack-a-social-templates-follow-ups.md)).
Covers the **big-win** items (A7–A9, B1–B3, C2–C4). The easy wins (A1–A6, C1) ship
as one consolidated PR and are not re-planned here.

Delivery model: each big win is built by an engineer on its own git worktree,
reviewed by an independent reviewer, and merged to `main` when green. The
follow-ups doc is updated to mark each item **completed** as it lands.

## Dependency order

```
easy wins (A1–A4)  ──►  C2 (carousel through pack)  ──►  (carousels inherit A1–A4)
easy wins (A1–A4)  ──►  B1 (per-slot upload UI)
A3 (sponsor slots) ──►  A7 (presenting sponsor)      [+ sponsors.role flag]
C3 (generate + grouping) ──►  C4 (auto-seed from drafts)
A8, A9, B2, B3     ──►  independent (can start after easy wins merge)
```

Wave 1 (after easy wins merge, parallel): **A8, C2, B2, B3**.
Wave 2 (parallel): **A7, A9, B1**.
Wave 3 (sequential): **C3 → C4**.

---

## A7 — Dynamic "presented by" primary sponsor  · Medium
- **Goal:** Replace hard-coded `{{sponsorPresentedBy}}` = "eSA Sport"/"PlayHQ"
  (`big-moment.ts:81`, `century.ts:72`, `premiership.ts:65`, `debut.ts:106`,
  `five-for.ts:75`, `new-signing.ts:81`, `club-leaderboard-runs.ts:76`,
  `grade-leader-runs.ts:72`) with a tenant-designated presenting sponsor.
- **Schema:** add `sponsors.role text` (or `is_presenting boolean`) —
  `lib/db/src/schema/social_cards.ts` sponsors table + Drizzle migration. Admin UI
  toggle in `admin-social.tsx` sponsor editor.
- **Render:** in `bindInput` set `values["sponsorPresentedBy"]` = presenting
  sponsor name (fallback: none → hide the line, don't show a literal).
- **API:** sponsors are exposed via existing endpoints; adding a field is
  OpenAPI-first — extend `openapi.yaml` sponsor schema, then codegen. No hand-edits.
- **Tests:** pack-render binding test; sponsor-role admin round-trip.
- **Depends:** A3 (sponsor threading) merged. **Branch:** `feat/pack-presenting-sponsor`.

## A8 — Bridge tenant brand colours into pack tokens  · Medium
- **Goal:** A non-Halls-Head tenant's brand colours should seed the pack palette by
  default, instead of everyone inheriting the hard-coded Broadcast-Dark tokens.
- **Where:** `pack-card.tsx:22-28` `BRAND_DEFAULT_TOKENS` (`--gold`/`--panel`/`--ink`).
  Token resolution priority is junior-force > per-card override > theme > brand
  (`resolvePackTokens`, `pack-render.ts:114-120`).
- **Approach:** add a `brand → token` mapping (primary→`--gold`/accent, panel/ink
  from brand background/ink) used as the baseline when no theme carries them. Keep
  Halls Head visually identical (its brand already ≈ the current defaults — verify).
- **Tests:** token-resolution unit test for a synthetic non-HH brand; snapshot HH
  unchanged.
- **Depends:** A1 (brand already threaded into pack). **Branch:** `feat/pack-brand-tokens`.

## A9 — Club tagline + competition hashtags  · Medium (new data source)
- **Goal:** Replace hard-coded "CRICKET CLUB · EST 1991" tagline and
  "#PEELPREMIERLEAGUE"/"LIVE UPDATES" secondary tags with real sources.
- **Schema:** add `tenants.tagline text` (nullable) + admin-branding field. Derive
  competition name from central `matches`/grade where a card has match context;
  otherwise omit.
- **Render:** bind `values["clubTagline"]`, `values["hashtagsExtra"]`.
- **API:** OpenAPI-first for the new tenant field.
- **Tests:** branding round-trip; render binding.
- **Depends:** A2. **Branch:** `feat/pack-tagline-competition`.

## B1 — Per-slot image upload in the card editor  · Larger (the "no upload" fix)
- **Goal:** Replace free-text "…URL" inputs (`descriptors.ts:85,236,252`) with an
  upload/pick control bound to each template `data-slot` (photo/logo/sponsor).
- **Approach:** template fields already enumerate every slot with label+type
  (`fragments.ts:184-190`). Add an `ObjectUploader`-based control per image field in
  the manual builder; thread an `imagesOverride: Record<slotKey,url>` map through
  `renderPackCard`/`PackCard`/server still so overrides win in `resolveSlots`.
- **Reuse:** `/api/storage/uploads/request-url` (`routes/storage.ts:63-106`),
  `useUpload`/`ObjectUploader` (`lib/object-storage-web`).
- **Tests:** override precedence in resolveSlots; upload widget wiring (component test).
- **Depends:** A1–A4 (pack image threading + override plumbing). **Branch:** `feat/pack-slot-image-upload`.

## B2 — Team / squad photo upload  · Medium
- **Goal:** Populate `teamPhoto` (`premiership.ts:24`, never bound) and `squadPhoto`
  (`team-list.ts:40`, URL text field only) via upload.
- **Approach:** store the image against the premiership/team-list source record (or a
  small `card_assets` table keyed by kind+ref); bind into the pack in the respective
  `bindInput` cases. Reuse object storage.
- **Decision to make:** attach to existing records vs new `card_assets` table — pick
  the lighter one; document in the PR.
- **Depends:** A4 plumbing. **Branch:** `feat/pack-team-photo-upload`.

## B3 — Action-shot / full-bleed background support  · Medium
- **Goal:** Let an uploaded action shot render full-bleed on player cards (templates
  already scrim the photo, e.g. `player-spotlight.ts:30-32`).
- **Approach:** extend the canvas "feature vs headshot" placement
  (`use-photo-controls.ts:67`, `share-card.ts` `PhotoPlacement`) to pack cards; add a
  placement variant to the pack slot geometry (currently fixed).
- **Depends:** A4. **Branch:** `feat/pack-action-shot`.

## C2 — Carousel slides render through the selected pack  · Medium
- **Goal:** Carousel slides currently bypass the pack (legacy canvas). Render them
  through the tenant's pack template so they match single cards and inherit A1–A4.
- **Where:** `buildSlideOpts` (`admin-social-sets.tsx:351`) never sets `opts.template`;
  set it to the tenant default pack template per slide kind and route slide
  preview/export (`:398`, `:512`) through the pack path (`PackCard`/`renderCardStill`)
  as the modal does (`share-card.ts:4005` is the only current pack hook).
- **Tests:** slide render uses pack for a supported kind; export parity with single card.
- **Depends:** A1–A4 merged. **Branch:** `feat/carousel-through-pack`.

## C3 — `POST /card-sets/generate` + grouping metadata  · Larger
- **Goal:** Server-side themed batching with dedupe/refresh (e.g. "rebuild the Round 5
  match-summary set").
- **Schema:** add `card_sets.sourceKind text`, `sourceRound int`, `season int`,
  `grade text` (nullable) + partial unique index (mirror `social_drafts_match_dedupe`,
  `social_cards.ts:424-426`).
- **API (OpenAPI-first):** `POST /card-sets/generate { kind, round?, season?, grades?,
  platformSize }` — gather matching source rows, map via existing input builders,
  assemble ≤10 slides, upsert one set keyed on grouping columns.
- **Tests:** generate idempotency; slide cap; dedupe on regenerate.
- **Depends:** C1 (client batch-add as the cheap precursor). **Branch:** `feat/card-sets-generate`.

## C4 — Auto-seed carousel sets from the `social_drafts` queue  · Larger
- **Goal:** "Make a carousel from this round's approved drafts" — match-summary drafts
  carry `sourceKind`/`sourceMatchId` (`social_cards.ts:407-416`).
- **Approach:** action that collects approved drafts for a round → feeds C3's generate
  path. Needs a `social_settings` toggle + dedupe.
- **Depends:** C3. **Branch:** `feat/card-sets-autoseed`.

---

## Process per big win
1. Engineer builds on the named worktree branch off latest `main`; OpenAPI-first for
   any spec change; `pnpm run typecheck` + relevant vitest green; commit + push.
2. Open draft PR; launch an **independent reviewer** agent (correctness, tenant
   isolation, no generated-file edits, test coverage, no behaviour regression on the
   canvas path).
3. Address review findings; when green + review-clean, mark PR ready and merge to `main`.
4. Update the [follow-ups doc](../follow-ups/2026-07-23-pack-a-social-templates-follow-ups.md)
   to strike the item as ✅ completed with the PR number.
