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

## Design packs roadmap

### Packs B–E (Gold Foil, Bold Type, Neon Night, Sunset)
- **What:** Ship the remaining four packs from the same Claude Design bundle using
  the HTML-template pipeline established for Pack A.
- **Why cheap now:** The infrastructure is pack-agnostic — a new pack is template
  assets under `artifacts/cricket-club/src/lib/pack-templates/<pack>/` plus a
  `design-packs.ts` registration entry. No renderer or plumbing changes.
- **Effort:** Mostly transcription (~20 cards × 3 formats each), the same shape as
  U1. The bundle sibling files (`Pack B - Gold Foil.dc.html`, etc.) are the source.

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
