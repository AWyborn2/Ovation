# Pack A Social Templates — Follow-Ups

Captured 2026-07-23 during the Pack A "Broadcast Dark" implementation
(plan: [docs/plans/2026-07-23-001-feat-pack-a-social-templates-plan.md](../plans/2026-07-23-001-feat-pack-a-social-templates-plan.md)).
These are deliberately out of scope for the Pack A replacement itself. Grouped by
theme, roughly ordered by value within each group.

---

## Next scoped task (already agreed)

### PlayHQ fixtures & team-list ingest
- **What:** Auto-populate the new `fixtures` and `team_lists` tables (shipped in
  U6, admin-entered today) from PlayHQ via the existing scraper skill or the
  PlayHQ public API, behind the ingest adapter boundary.
- **Why:** Match Day, Countdown, and Team List cards currently need a few minutes
  of admin typing per round. The tables were shaped for this — `fixtures.source`
  already distinguishes `'manual'` from `'playhq'`, and every ingested value must
  stay admin-overridable.
- **Notes:** Team lists are published to PlayHQ Thu/Fri; pull-or-manual flexibility
  is the goal. Respect the data-governance constraint (non-commercial framing
  until partner/licence access is secured; review cricket.com.au Third-Party T&Cs).

---

## Card dynamic-content, image-upload & carousel review (2026-07-24)

Captured 2026-07-24 from PR #60 feedback. Three investigations (dynamic content
placeholders, image-placeholder intent + upload gap, template-pack/carousel
integration). **Prioritised backlog is at the end of this section.**

> **Delivery status** (2026-07-24).
> - **Easy wins — #72:** ✅ A1, ✅ A2, ✅ A3, ✅ A4, ✅ A5 *(wired; inert until match
>   cards carry a POTM headshot source — data-model follow-up)*, ✅ A6, ✅ C1.
> - **Wave 1:** ✅ **A8** (brand→tokens, #74), ✅ **B2** (team/squad photo upload, #75),
>   ✅ **C2** (carousel renders through pack, #76).
> - **Wave 2:** ✅ **A7** (presenting sponsor, #79), ✅ **A9** (tagline/competition, #80),
>   ✅ **B3** (full-bleed action-shot, #81). Infra: ✅ `@types/react` dedupe (#78).
> - **Wave 3:** ✅ **B1** (per-slot image upload, #83), ✅ **C3** (`/card-sets/generate`, #84),
>   ✅ **C4** (auto-seed from approved drafts, #86).
> - **Remaining: none — all shipped.** 🎉
> - **⚠️ Reopened 2026-07-27 — A1/A2/A3/A7/A8 shipped the renderer seam but missed
>   three call sites**, so tenants still saw Halls Head branding. `applyPackData`
>   only runs when `renderPackCard` is given its optional `data` argument, and the
>   Studio composer preview (`admin-social-create.tsx`) and card-type gallery
>   (`admin-social-studio.tsx`) passed none, while the carousel
>   (`admin-social-sets.tsx`) narrowed `brand` to `{name, logoUrl}` and so dropped
>   the tenant's accent colour. Fixed by
>   [docs/plans/2026-07-27-001-fix-social-studio-tenant-branding-plan.md](../plans/2026-07-27-001-fix-social-studio-tenant-branding-plan.md):
>   one shared `buildPackData` builder, all mounts wired, template samples
>   neutralised, plus a source-level guard (`pack-card-mounts.test.ts`) that fails
>   the build if any `<PackCard>` mount omits `data`.
> - Big-win plans: [docs/plans/2026-07-24-001-card-social-enhancements-plan.md](../plans/2026-07-24-001-card-social-enhancements-plan.md).
>
> **Deploy notes** (for the merged DB changes).
> - On Replit, `scripts/post-merge.sh` runs `pnpm --filter db push` on pull, which
>   applies ALL of these schema changes from the Drizzle schema in one shot:
>   `sponsors.is_presenting` (A7), `tenants.tagline` (A9), the `card_sets` grouping
>   columns + `card_sets_source_dedupe` index (C3), and `social_settings.autoseed_carousels`
>   (C4). The `scripts/sql/*.sql` files (`sponsor-presenting`, `add-tenant-tagline`,
>   `card-sets-generate`, `card-sets-autoseed`) are prod-parity backups for a manual
>   `psql -f` apply if `db push` ever balks at the partial index.
> - **Required manual step:** re-run `pnpm --filter @workspace/scripts run seed-tenants`
>   after deploy so Halls Head keeps its "CRICKET CLUB · EST 1991" tagline (its row is
>   `NULL` until re-seeded). `post-merge.sh` does not re-seed tenants.
> - `social_settings.autoseed_carousels` ships **off** (dormant); enable per-tenant when wanted.
> - **Known follow-ups:** A5 `potm.photo` is wired but inert until match cards carry a
>   POTM headshot source; A9's competition hashtag (`hashtagsExtra`) is intentionally
>   empty pending a central-match-derived source (`TODO(A9)`); C3 nits N1 (gradeLeader
>   subset regen clobbers the full set) / N2 (slide order asc-id native vs id-desc central).

### Root cause (spans the first two themes)

There are **two card renderers**, and only one is wired to tenant data:

- **Canvas renderer** — `share-card.ts` (`renderShareCard`). Threads tenant brand,
  logo, sponsors, hashtag, club URL, and the modal's uploaded photo. Used for BYO
  custom templates and the legacy built-in cards.
- **Pack renderer** — `pack-render.ts` `renderPackCard()`, mounted by `PackCard`
  (`components/pack-card.tsx`). This is the **Broadcast Dark pack — all 23 card
  kinds**. It receives only `{input, size, sponsorsOn, junior, theme}`
  (`share-card-modal.tsx:678-687`; server harness `card-render-harness.tsx:147-156`)
  and is **not wired to tenant brand, logo, sponsors, hashtag, or the uploaded
  photo at all**. `bindInput()` (`pack-render.ts:429-651`) reads images only off the
  input object, so unbound slots fall back to hard-coded "Halls Head" samples,
  initials chips, and grey boxes — even though the brand and active-sponsor data are
  already resolved next to the call site (`share-card-modal.tsx:403-432`) and simply
  never passed in.

**Implication:** most of the owner's feedback ("logo should come from the tenants
DB", "sponsors should be dynamic") is fixed by threading existing data into
`PackCard`/`renderPackCard` — not by new data plumbing.

### Theme A — Wire the pack renderer to tenant data

#### A1. Bind tenant logo into the top-left `clubLogo` slot ⭐ QUICK WIN
- **What:** Add a `brand` prop to `PackCard`/`renderPackCard`; set
  `images["clubLogo"] = brand.logoUrl` in `bindInput`; pass `bundle.brand` at the two
  call sites (`share-card-modal.tsx:681`, `card-render-harness.tsx:147`).
- **Why:** The `clubLogo` slot (`fragments.ts:28`, on nearly every card via
  `storyHeader`/`sharedHeader`) is **never bound** and renders an initials chip
  (`pack-render.ts:378-383`). This is the owner's exact top-left-logo complaint.
  Data already exists (`getTenantBrand().logoUrl`, `tenant-brand.ts:76`).
- **Effort:** Quick. Fixes all 23 kinds in one change.

#### A2. Bind club name + hashtags dynamically ⭐ QUICK WIN (same change as A1)
- **What:** Bind `clubName`, `clubTagline`, `clubHashtag`, `hashtags` from brand/settings.
- **Why:** Hard-coded "HALLS HEAD" / "#HALLSHEAD" / "#HALLSHEAD · #PEELPREMIERLEAGUE"
  literals across the pack (`fragments.ts:199`, `big-moment.ts:78-80`, `debut.ts:104-105`,
  `century.ts:70`, `premiership.ts:64`, many more). The hashtag is **already computed**
  in the modal (`share-card-modal.tsx:409-411`), just not passed.
- **Effort:** Quick. (Tagline has no field yet — see A8.)

#### A3. Bind active sponsors into `sponsor1/2/3` slots ⭐ QUICK WIN
- **What:** Thread the resolved `sponsors[]` (already loaded, `share-card-modal.tsx:403`)
  into the pack path; map first N `logoUrl`s → `images["sponsor1..3"]`, filtered by
  `cardKinds` (`sponsorAppliesToKind`, `share-card.ts:336-339`).
- **Why:** Pack sponsor slots (`fragments.ts:114-133`) are **never bound** and render
  empty grey boxes (`pack-render.ts:375-377`), despite sponsors being fully configured
  and uploaded (`admin-social.tsx:496`, `sponsorsTable.logoUrl`). The kiosk already
  renders these dynamically, proving the pattern.
- **Effort:** Quick.

#### A4. Feed the modal's uploaded photo into the pack `photo` slot ⭐ QUICK WIN
- **What:** Pass `effectivePhotoUrl` (and ideally `photoTransform`) from
  `use-photo-controls.ts` into `PackCard`/`renderPackStill`; prefer it over
  `input.photoUrl` in `bindInput`/`resolveSlots`.
- **Why:** The modal has a real working photo uploader/gallery/reposition
  (`use-photo-controls.ts:77,125-153`) whose output feeds **only the canvas path**
  (`share-card-modal.tsx:435`) — on pack cards it silently does nothing.
- **Effort:** Quick–medium (thread focal-point/transform for `cover` slots).

#### A5. Populate `potm.photo` on the match-result card — QUICK
- **What:** Fill `potm.photo` (`match-result.ts:52`) from the player-image lookup in the
  `matchSummary` bind (`pack-render.ts:435-459`), currently never set.
- **Effort:** Quick (reuses `player_images`).

#### A6. Fix the dead `bigMoment` photo binding — QUICK (correctness)
- **What:** `bindInput` sets `images["photo"]` for `bigMoment` (`pack-render.ts:612`) but
  `big-moment.ts` has **no `data-slot="photo"`** — the image never shows. Either add the
  slot (pairs with A12) or drop the dead assignment.
- **Effort:** Quick.

#### A7. Dynamic "presented by" primary sponsor — MEDIUM (needs data model)
- **What:** Replace hard-coded `{{sponsorPresentedBy}}` = "eSA Sport"/"PlayHQ"
  (`big-moment.ts:81`, `century.ts:72`, `premiership.ts:65`, others) with a designated
  presenting sponsor.
- **Why/Notes:** Needs a role flag (e.g. `isPresenting`) on the `sponsors` table.
- **Effort:** Medium.

#### A8. Bridge tenant brand colours into pack tokens — MEDIUM
- **What:** Map tenant primary/accent → `--gold`/`--panel`/`--ink` as the default token
  baseline.
- **Why:** `pack-card.tsx:22-28` hard-codes the Broadcast-Dark palette as
  `BRAND_DEFAULT_TOKENS`; a non-Halls-Head tenant only gets its colours if a
  `card_theme` happens to carry them — no brand→token bridge exists.
- **Effort:** Medium.

#### A9. `clubTagline` + competition hashtags — MEDIUM (no source yet)
- **What:** "CRICKET CLUB · EST 1991" and "#PEELPREMIERLEAGUE"/"LIVE UPDATES" have no
  tenant/central source. Needs a new tenant setting (tagline) and competition-name
  derivation (from central `matches`).
- **Effort:** Medium.

### Theme B — Image upload for card placeholders

Upload infra is **fully built and unused by the pack**: presigned uploads
(`POST /api/storage/uploads/request-url`, `routes/storage.ts:63-106`), `objectStorage.ts`,
`ObjectUploader`/`useUpload`, the `player_images` gallery, and working uploaders for
player photos, tenant logo, sponsor logos, template backgrounds. The gap is wiring, not
storage. The manual card-builder exposes image slots as **free-text URL fields**
(`descriptors.ts:85,236,252`).

#### B1. Per-slot image upload control in the card editor — LARGER (the real fix)
- **What:** Replace the free-text "…URL" inputs with an upload/pick control bound to each
  `data-slot` (photo/logo/sponsor) the template exposes via its `fields`
  (`fragments.ts:184-190` enumerates every slot with label + type). Thread an
  `imagesOverride` map through `renderPackCard`.
- **Why:** This is the direct answer to "all image placeholders have no way to upload an
  image." Covers `squadPhoto`, `teamPhoto`, action shots, and manual overrides uniformly.
- **Effort:** Larger (new UI + override threading). Depends on A1–A4 landing the plumbing first.

#### B2. Premiership team-photo & team-list squad-photo upload — MEDIUM
- **What:** Dedicated uploader for `teamPhoto` (`premiership.ts:24`, never bound) and
  `squadPhoto` (`team-list.ts:40`, text-field only). Store against the match/premiership
  record or a lightweight card-asset table.
- **Effort:** Medium.

#### B3. Action-shot / full-bleed background support — MEDIUM
- **What:** Extend the canvas "feature vs headshot" placement (`use-photo-controls.ts:67`,
  `share-card.ts` `PhotoPlacement`) to pack cards so an uploaded action shot can go
  full-bleed (templates already scrim the player photo, e.g. `player-spotlight.ts:30-32`).
- **Effort:** Medium (pack slot geometry is currently fixed).

### Theme C — Template-pack & carousel integration

Pack model: `broadcast-dark-v1` registered in `design-packs.ts:31`; materialised per
tenant as `card_templates` rows (`source="pack"`) by `ensurePackTemplates`
(`design-packs.ts:106`); selected per-kind via `card_templates.defaultForKinds`. Carousel
= `card_sets` (`social_cards.ts:270`); each slide = `{id, input, layout?, themeId?,
motionPreset?}`. **`POST /card-sets` already accepts a full multi-slide array in one call**
(`routes/social-cards.ts:614`) — it is inherently batch-capable; the gap is UI + grouping,
not the backend.

#### C1. Client-side "batch add" from existing sources ⭐ QUICK WIN
- **What:** Add "Add all matches in Round X" / "Add all grade leaderboards" buttons to
  `SlideSourcePicker` (`admin-social-sets.tsx:845`) that loop the existing hooks and append
  slides (respecting the 2–10 cap, `social-cards-helpers.ts:154-155`).
- **Why:** Directly satisfies the owner's example (batch all match-summaries into one set,
  all leaderboards into another). Today slides are added one at a time from 3 manual
  sources. No schema/endpoint change.
- **Effort:** Small.

#### C2. Carousel slides render through the selected pack — MEDIUM
- **What:** Set `opts.template` in `buildSlideOpts` (`admin-social-sets.tsx:351`) to the
  tenant's default pack template per slide kind, and route slide render/export through the
  pack path as the modal does.
- **Why:** Carousel slides currently **bypass the pack** — `buildSlideOpts` never sets
  `opts.template`, so they render via the legacy built-in canvas (`share-card.ts:4005`),
  inconsistent with single cards. (This also means A1–A3's logo/sponsor fixes won't reach
  carousels until this lands.)
- **Effort:** Medium.

#### C3. `POST /card-sets/generate` + grouping metadata — LARGER
- **What:** Add grouping columns to `card_sets` (`sourceKind`, `sourceRound`, `season`,
  `grade`, + partial unique index) and a generate endpoint that server-side gathers matching
  source rows, maps via existing input builders, and upserts one set. OpenAPI-first change.
- **Why:** Enables idempotent regeneration ("rebuild the Round 5 set") and dedupe; C1 is the
  cheap version without this.
- **Effort:** Larger.

#### C4. Auto-seed carousel sets from the `social_drafts` queue — LARGER
- **What:** "Make a carousel from this round's approved drafts" — match-summary drafts already
  carry `sourceKind`/`sourceMatchId` (`social_cards.ts:407-416`).
- **Why:** Closes detection → carousel loop. Depends on C3.
- **Effort:** Larger.

### Prioritised backlog (easy/quick wins first)

| # | Task | Theme | Effort | Depends on |
|---|------|-------|--------|-----------|
| 1 | **A1** Tenant logo → `clubLogo` top-left | Dynamic content | ⭐ Quick | — |
| 2 | **A2** Club name + hashtags dynamic | Dynamic content | ⭐ Quick | A1 (same change) |
| 3 | **A3** Active sponsors → sponsor slots | Dynamic content | ⭐ Quick | — |
| 4 | **A4** Uploaded photo → pack `photo` slot | Dynamic content | ⭐ Quick–med | — |
| 5 | **C1** Client-side "batch add" to carousel sets | Carousel | ⭐ Quick | — |
| 6 | **A5** Populate `potm.photo` | Dynamic content | Quick | A4 |
| 7 | **A6** Fix dead `bigMoment` photo binding | Correctness | Quick | — |
| 8 | **A8** Brand colours → pack tokens | Dynamic content | Medium | — |
| 9 | **C2** Carousel slides render through pack | Carousel | Medium | A1–A3 |
| 10 | **A7** Dynamic "presented by" sponsor | Dynamic content | Medium | sponsor role flag |
| 11 | **A9** Club tagline + competition hashtags | Dynamic content | Medium | new tenant field |
| 12 | **B2** Team/squad photo upload | Image upload | Medium | — |
| 13 | **B3** Action-shot / full-bleed background | Image upload | Medium | A4 |
| 14 | **B1** Per-slot image upload in editor | Image upload | Larger | A1–A4 |
| 15 | **C3** `/card-sets/generate` + grouping cols | Carousel | Larger | C1 |
| 16 | **C4** Auto-seed sets from `social_drafts` | Carousel | Larger | C3 |

**Recommended first sprint (all quick, high impact, reuse existing infra):** A1 → A2 → A3
→ A4 (one PR threading brand+sponsors+photo into the pack renderer answers most of the
feedback), then C1 (batch-add) as a self-contained carousel win. A6 is a trivial
correctness cleanup to fold in.

---

## Design packs roadmap

### Packs B–E (Gold Foil, Bold Type, Neon Night, Sunset)
- **What:** Ship the remaining four packs from the same Claude Design bundle using
  the HTML-template pipeline established for Pack A.
- **⚠️ Corrected 2026-07-27 — this is NOT cheap, and the renderer is NOT pack-agnostic.**
  The original estimate below was wrong on two counts, both verified against the code
  and the bundle:
  1. **The renderer is hard-wired to Pack A.** `pack-render.ts` imports
     `BROADCAST_DARK_PACK` directly and builds a module-level `DESIGN_BY_KIND` map
     from that single pack; `renderPackCard()` has no `packId` parameter. A second
     pack requires a real refactor: a pack registry keyed by `packId`, and `packId`
     threaded from the tenant's selected `card_templates` row (`source="pack"`,
     `packId`/`packVariant`, materialised by `ensurePackTemplates` in
     `artifacts/api-server/src/lib/design-packs.ts`) through `PackCard` →
     `renderPackCard` → `stillOptions` → carousel slides → the render harness.
  2. **The bundles are nearly story-only.** *(Corrected again 2026-07-27 — the first
     version of this note said "story format only", which was measured wrong: it
     counted literal `1350px`/`1920px` strings, but the non-story layouts are gated on
     `<sc-if value="{{ isNotStory }}">` and sized with `--ch`/`--k` variables.)* The
     accurate count, per card wrapper:

     | Pack | Cards | With a non-story branch |
     |---|---|---|
     | A (Broadcast Dark) | 20 | **20** |
     | B (Gold Foil) | 20 | **2** — Match Result, Club Leaderboard·Wickets |
     | C (Bold Type) | 20 | **2** — same two |
     | D (Neon Night) | 20 | **2** — same two |
     | E (Sunset) | 20 | **2** — same two |

     So each of B–E needs ~20 story transcriptions **plus ~18 authored portrait/square
     reflows** (not 20). Pack A had all 40 in the bundle, which is why its
     transcription was "mostly transcription" and B–E's will not be.
  All four bundles do contain exactly the same 20 designs and the same
  `data-card-kind` mapping as Pack A, so the per-card scope is at least predictable.
  (`Pack A - Broadcastlight.dc.html`, a light-mode Pack A variant, is also in the
  bundle and is not yet scoped.)
- **Effort:** Renderer refactor + ~40 layouts per pack. Recommended sequencing:
  refactor and prove with Pack B end-to-end, then C/D/E.
- **Note:** when transcribing, the pack-wide guards added in
  `broadcast-dark.test.ts` (R6) must be extended to the new pack — the bundles were
  authored with real Halls Head data, so their samples carry the same club-identity
  literals Pack A's did.

### Animated card variants
- **What:** Story-format reveal animations per card kind (score reveal, staggered
  stats), exported as MP4.
- **Why deferred:** Pack A imports as static compositions exactly as designed; the
  user asked for animation as a later update.
- **Notes:** Pack templates currently register `motionPreset: "none"` so
  `isAnimatedCard` stays false and MP4/GIF export hides. The animation pipeline
  (`share-card-animation.ts`, `prepareAnimation`, the headless `/__card-render`
  video path) is intact and untouched — reactivating means giving pack templates a
  motion preset and authoring the per-phase reveals. Revisit the MP4/story-video
  export UI (hidden for pack cards today) when this lands.

---

## Data gaps surfaced during implementation

### Season-scoped ladder (central data limitation)
- **What:** A genuine per-season ladder for the Ladder card.
- **The gap:** The central `ladder` table is **all-time cumulative** — columns are
  `id, grade, club_id, club, played, won, lost, tied, no_result` only. It has **no
  season, points, or position** dimension (e.g. Halls Head A-Grade = played 214 /
  won 143 across 24 seasons).
- **What shipped as a workaround (U7):** `centralLadder` returns the required card
  shape `{pos, team, played, won, lost, points, isClub}`, but `points` is **derived**
  (`won·6 + tie·3 + noResult·3`, documented `LADDER_POINTS` constant) and `pos` is
  **derived** by ordering. The `season` argument is accepted for contract symmetry
  but **does not filter**. Rows are deduped per club (keep most-played) because
  `appGradeFromCentral` folds several central grade labels into one app grade.
- **Real fix:** a new season-scoped central ladder table, or a matches-derived
  standings computation over `central.matches` filtered by season+grade. Also
  revisit the points formula against the actual competition rules.

### Fixture-driven card fields with no data source yet
- Match Day / Countdown promo lines ("BAR & KITCHEN OPEN", hype lines) are
  editorial and stay admin-entered by design — no follow-up needed unless a
  structured source appears.

---

## Deferred product features

### Per-element style overrides ("C later")
- **What:** An advanced editor letting admins override colour/font/size on any
  individual element of a pack card (on top of the curated token themes shipped in
  U9).
- **Why deferred:** The user chose "B now, C later" — curated token controls
  (accent, panel, display font, sponsor strip, hashtag) ship now; per-element
  editing is a possible later upgrade. Carries real risk (users can break the
  compositions) and rebuilds much of the retired layout-editor complexity, so it
  needs its own scoping.

### Auto-draft engines for the 8 new card kinds
- **What:** Extend the auto-draft engine (currently `matchSummary` only) to
  proactively queue any of the new kinds (e.g. auto-draft a Weekend Wrap after a
  round, a Ladder card after standings update).
- **Why deferred:** New kinds are on-demand creation only in this scope.
- **Notes:** Would reuse the existing `social_drafts` queue + sweep/hook pattern;
  each new engine needs a `social_settings` toggle and dedupe strategy.

---

## Migration / cleanup verification

### Carousel (`card_sets`) slides on Pack A rendering
- **What:** Confirm existing carousel slides that referenced the deleted built-in
  visuals render correctly on Pack A.
- **Context:** The U5 retirement migration deletes all `card_layouts` (including
  slide-level element-override layers). Carousel slides keep their stored
  `cardInput` and should render via Pack A, but this needs an explicit check on
  real tenant data during rollout.

---

## Pre-existing tech debt (not introduced here, worth a pass)

### Local typecheck noise
- Full-package `tsc -p` locally is polluted by `TS6305` ("Output file
  `lib/*/dist/index.d.ts` has not been built") because source-only workspace libs
  have no local `dist`, and by pre-existing `TS7006` implicit-any errors in files
  like `honour-display-builders.ts` and `admin-awards/*`. These resolve in CI
  (which builds dist) but make local verification noisy. A `tsc --build` of the
  libs before app typechecks, or committing built `dist`, would clean this up.

### Native-binary dev setup (Windows)
- `pnpm-workspace.yaml` deliberately strips all native platform binaries
  (`rollup`/`esbuild`/`lightningcss`/`tailwind-oxide` win32) via `overrides: '-'`,
  so `vitest` can't run locally without manually reinstating the `@rollup/*` and
  `@esbuild/*` win32 binaries into the pnpm store. Worth a documented dev-setup
  script or a `.npmrc` `supportedArchitectures` note so contributors aren't blocked.

### Residual issues from the prior design-packs work (#34–#43)
- Carried over from
  [docs/residual-review-findings/feat-design-packs-auto-draft.md](../residual-review-findings/feat-design-packs-auto-draft.md):
  N+1 in `match-summary-drafter` (#34), drafter tests don't call real fns (#35),
  `ensurePackTemplates` unique index (#36), junior isolation boundary (#37),
  `getPrivateIds` global load (#38), pack-variant renderer duplication (#39), sweep
  endpoint test coverage (#43), and the unresolved re-ingest-overwrite product
  decision (F3).
