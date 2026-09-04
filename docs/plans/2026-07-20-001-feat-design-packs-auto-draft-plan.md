---
title: "Design Packs, Auto-Draft Engine & Clubs Register Top-Up"
type: feat
date: 2026-07-20
topic: design-packs-auto-draft
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Design Packs, Auto-Draft Engine & Clubs Register Top-Up

Three interconnected features that together deliver zero-effort post-match social media content for every Ovation tenant:

1. **Design-pack system** — a formal contract for code-authored card designs that register as a third design source alongside built-in card-kind bodies and BYO templates. Pack #1 ships the Figma Match Summary designs (square, portrait, animated story).
2. **Per-match auto-draft engine** — when match results land via any ingest path, auto-draft a `matchSummary` card into the existing `social_drafts` queue per completed match. Per-grade admin controls; seniors default ON, juniors default OFF.
3. **PCA clubs register top-up** — backfill 17 PCA clubs with true colours and Cloudinary logos so opposition branding renders correctly on every card.

---

## Goal Capsule

- **Objective:** After a match result is committed, the admin's social queue contains a ready-to-post match summary card rendered with true opposition colours, requiring zero manual creation. The design-pack system provides a structured way to add new card design variants beyond the built-in renderer.
- **Product authority:** Ash.
- **Execution profile:** Deep. Touches schema (social_cards, clubs), API (post-commit hook, new sweep route, social settings), shared package (@workspace/scorecard), and renderer (share-card.ts, card-fonts.ts). Four ingest paths must be covered. Junior isolation invariant maintained. OpenAPI-first.
- **Stop conditions:** (1) Existing card-kind rendering and existing social drafts are behaviourally unchanged. (2) Existing template/layout system untouched — packs are additive. (3) Junior isolation invariant preserved. (4) Fill-in exclusion (playerId >= 90000) preserved. (5) No new external dependencies. (6) Entitlement gate respected even while dormant.
- **Convention break (deliberate):** `engineMatchSummary` defaults ON for senior grades, breaking the repo's engines-default-OFF convention (`engineMilestone`, `engineRoundUp`, `engineRecap` all default false). This is intentional: zero-effort coverage is the product goal; a default-OFF engine defeats the purpose since most clubs never toggle settings.

---

## Product Contract

### Summary

Three features delivered as one cohesive package: (1) a design-pack registration system that extends the card template infrastructure with code-authored designs, shipping pack #1 from the Figma Match Summary export; (2) a per-match auto-draft engine that detects completed matches across all four ingest paths and queues match summary cards with per-grade controls; (3) a clubs register top-up that backfills PCA opposition branding data.

### Problem Frame

Today, producing a match summary social card requires an admin to manually navigate to the Social Studio, select "From a match," pick the match, preview, and export. This is fine for one-off cards but doesn't scale — a club playing 5+ grades per week would need an admin to repeat this 5+ times every round, which means it simply doesn't happen.

The auto-draft engine eliminates this manual step: results arrive → cards appear in the queue → admin reviews and posts. The design-pack system provides the visual variety (square/portrait/animated story formats in a new design language), and the clubs top-up ensures every opposition team renders with their real colours rather than fallback greys.

### Key Decisions

1. **Packs extend card_templates, not a parallel registry.** A pack design registers as a `cardTemplatesTable` row with `source: "pack"` (new discriminator value). This means packs inherit the existing template picker, per-kind defaults, sponsor gating, and admin management UI with zero new plumbing. The `packId` and `packVariant` columns identify which pack and which variant within it.
2. **Auto-draft uses a hook + sweep hybrid.** The API import path has a post-commit hook (`runPostCommitSocial`); the two ETL scripts and central-DB reads do not. Rather than retrofitting hooks into every path, add a `generateMatchSummaryDrafts` sweep function that the hook calls inline AND that an admin/cron endpoint can trigger independently to catch ETL-ingested matches.
3. **Dedupe via partial unique index.** `social_drafts` gets `source_kind` (engine discriminator) and `source_match_id` (match PK) columns, with a partial unique index on `(tenant_id, source_kind, source_match_id) WHERE source_kind = 'matchSummary' AND status != 'dismissed'`. Re-ingest regenerates pending drafts (upsert) but never resurfaces dismissed ones.
4. **matchToSummaryInput moves to @workspace/scorecard.** The mapper currently lives in `artifacts/cricket-club/src/lib/match-summary.ts` — a client-side package the API server can't import. Moving it to the shared scorecard package lets both the server-side auto-draft engine and the client-side manual card builder use it. The junior variant (`junior-match-summary.ts`) follows.
5. **Thin-data crash fix is a prerequisite.** `matchToSummaryInput` crashes on `sc.innings[0]` when a match has zero innings (line 89–90). The fix: guard against empty innings, returning a minimal card with "Result pending" — this is the "draft anyway, best effort" behaviour.
6. **Per-grade controls stored as JSONB on social_settings.** A `matchSummaryGradeConfig` column (type `Record<string, { enabled: boolean }>`) lets admins toggle auto-draft per grade. Missing key = use default (ON for senior, OFF for junior). This avoids a separate table and scales to any number of grades.
7. **Story animation uses the existing prepareAnimation pipeline.** The Figma package's animated story card (score reveal, staggered stats) is expressed as a `motionPreset` value (e.g. `"matchReveal"`) in the pack's template row, consumed by the existing `prepareAnimation` function. No second renderer.
8. **Clubs top-up merged into master-DB ETL.** The 17-club dataset is added to the master DB source data so `load-master-db.ts`'s wholesale REPLACE doesn't wipe it on next reload. An idempotent upsert script keyed on `playhqOrgId` handles the initial backfill.
9. **Roboto Condensed added to card fonts.** The Figma designs use Roboto Condensed; added to `card-fonts.ts` alongside the existing Google Fonts families.

### Non-Goals

- Auto-publish to social platforms (Instagram, Facebook, etc.) — out of scope; the draft queue is the boundary.
- Server-side MP4 rendering per auto-drafted card — stays on-demand when an admin exports.
- New card kinds beyond `matchSummary` for this pack — pack #1 is matchSummary only.
- Mobile app social cards — the Expo app has no share-card code today; stays unchanged.
- RLS enforcement — deferred to the broader RLS rollout.
- Custom domain support — orthogonal.

---

## Architecture

### Data Flow

```
Match result lands (via any of 4 ingest paths)
  → generateMatchSummaryDrafts(tenantId, matchIds)
    → for each match:
      1. Check gradeConfig: is this grade enabled for auto-draft?
      2. Check dedupe: does a non-dismissed draft already exist for this match?
      3. Build scorecard via buildScorecard(matchDetail)
      4. Map to ShareCardInput via matchToSummaryInput (now in @workspace/scorecard)
      5. Resolve pack template (default matchSummary pack template for this tenant)
      6. Insert into social_drafts with engine="matchSummary", sourceKind, sourceMatchId
  → Admin reviews in /admin/social-queue → approve/dismiss → export PNG/MP4
```

### Ingest Path Coverage

| Path                                          | Trigger mechanism                         | Implementation                                                               |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Senior API import (`routes/imports.ts`)       | Post-commit hook in `runPostCommitSocial` | Add `generateMatchSummaryDrafts` call after existing milestone/roundup calls |
| Senior ETL (`scripts/src/load-matches.ts`)    | No hook; offline script                   | Call sweep function at end of ETL run, OR admin triggers via API             |
| Junior ETL (`scripts/src/load-juniors-db.ts`) | No hook; offline script                   | Same sweep approach; junior grades default OFF                               |
| Central DB reads                              | Read-only; no ingest event                | Admin-triggered sweep via API endpoint                                       |

### Pack Registration Model

```
cardTemplatesTable row (source = "pack"):
  - packId: "matchSummary-v1"           // identifies the pack
  - packVariant: "square" | "portrait" | "story"  // variant within pack
  - cardKinds: ["matchSummary"]         // which card kinds this applies to
  - bgWidth/bgHeight: native dimensions
  - motionPreset: "none" | "matchReveal" // animation preset
  - backgroundKind: "image" | "video"   // "video" for story variant
  - layers: []                          // pack designs are code-rendered, not layer-composed
  - source: "pack"                      // new discriminator value
```

### Changed Systems

- `lib/db/src/schema/social_cards.ts` — new columns on `socialDraftsTable` and `socialSettingsTable`
- `lib/db/src/schema/clubs.ts` — no schema changes (backfill only)
- `lib/scorecard/src/` — new `match-summary-input.ts` (moved from cricket-club)
- `artifacts/api-server/src/lib/` — new `match-summary-drafter.ts`, modified `post-commit-social.ts`
- `artifacts/api-server/src/routes/` — modified `social-drafts.ts` (sweep endpoint)
- `artifacts/cricket-club/src/lib/share-card.ts` — new `motionPreset` handler for pack animation
- `artifacts/cricket-club/src/lib/card-fonts.ts` — add Roboto Condensed
- `artifacts/cricket-club/src/lib/match-summary.ts` — becomes re-export from @workspace/scorecard
- `scripts/src/` — clubs top-up data, modified `load-master-db.ts`
- `lib/api-spec/openapi.yaml` — new sweep endpoint, updated social settings schema

---

## Implementation Units

### U0: Clubs Register Top-Up (prerequisite — sequenced first)

**Rationale:** cardInput is frozen at draft time, so opposition branding must be correct in the DB before any drafts are generated. This must land before U3.

**Files:**

- `scripts/src/data/pca-clubs.ts` — 17-club dataset from Figma package's `clubData.ts`, keyed on `playhqOrgId`
- `scripts/src/topup-clubs.ts` — idempotent upsert script: for each club in the dataset, upsert into `clubs` table matching on `playhqOrgId`, updating `primaryColour`, `secondaryColour`, `tertiaryColour`, `quaternaryColour`, `logoUrl`, `logoUrl128`, `shortName` where the existing value is null or differs
- `scripts/src/load-master-db.ts` — after the wholesale clubs REPLACE, run the top-up upsert so PCA colours survive reloads

**Test scenarios:**

- `scripts/src/topup-clubs.test.ts`:
  - Upsert inserts a new club when playhqOrgId doesn't exist
  - Upsert updates colours/logo when playhqOrgId exists with stale data
  - Upsert is idempotent — running twice produces same result
  - Existing clubs not in the PCA dataset are untouched
  - Clubs with no playhqOrgId in the dataset are skipped (defensive)

**Depends on:** nothing.

---

### U1: Move matchToSummaryInput to @workspace/scorecard

**Rationale:** The server-side auto-draft engine needs `matchToSummaryInput`, which currently lives in the web client package (`artifacts/cricket-club/src/lib/match-summary.ts`). Moving it to the shared scorecard package makes it importable from both client and server.

**Files:**

- `lib/scorecard/src/match-summary-input.ts` — move `matchToSummaryInput`, `seasonLabel`, `formatMatchDate`, `toTeam`, `topBatters`, `topBowlers`, `deriveWinner` from `artifacts/cricket-club/src/lib/match-summary.ts`; also move `juniorMatchToSummaryInput` and its helpers from `artifacts/cricket-club/src/lib/junior-match-summary.ts`
- `lib/scorecard/src/match-summary-types.ts` — move `MatchSummaryTeam`, `MatchSummaryInnings`, `MatchSummaryBatter`, `MatchSummaryBowler` type definitions (currently in `share-card.ts` lines 39–71); these are the types the mapper produces and the renderer consumes, shared between packages
- `lib/scorecard/src/index.ts` — re-export the new modules
- `artifacts/cricket-club/src/lib/match-summary.ts` — replace with re-exports from `@workspace/scorecard`
- `artifacts/cricket-club/src/lib/junior-match-summary.ts` — replace with re-export
- `artifacts/cricket-club/src/lib/share-card.ts` — import `MatchSummaryTeam`, `MatchSummaryInnings`, etc. from `@workspace/scorecard` instead of local definitions

**Critical constraint:** `share-card.ts` defines `ShareCardInput` as a discriminated union that references the match-summary types. The types must be importable from @workspace/scorecard but `ShareCardInput` itself stays in `share-card.ts` (it depends on all 10 card-kind shapes). The mapper function's return type annotation changes from `ShareCardInput` to the specific match-summary shape, and the client's existing call sites continue to work because the shape is structurally compatible.

**Fix thin-data crash:** In the moved `matchToSummaryInput`, guard `sc.innings[0]` access:

```
// Before (crashes on empty innings):
const first = sc.innings[0];
const clubTeam = first.battingTeam.isHallsHead ? ...

// After (best-effort with thin data):
if (sc.innings.length === 0) {
  // Return minimal card — match exists but no scorecard data yet
  return { kind: "matchSummary", matchTitle, matchType, date, venue,
           result: match.result ?? "Result pending",
           resultWinner: "draw", club: fallbackClubTeam, opposition: fallbackOppTeam,
           innings: [] };
}
const first = sc.innings[0];
```

The junior variant already handles this (line 89–94 of `junior-match-summary.ts`).

**Rename `isHallsHead` → `isClub`:** The `ScorecardTeam.isHallsHead` field is a Halls Head naming debt; rename it to `isClub` since it semantically means "is the tenant's own club." This touches `lib/scorecard/src/types.ts`, `lib/scorecard/src/mapping.ts`, and all consumers.

**Test scenarios:**

- `lib/scorecard/src/match-summary-input.test.ts`:
  - Standard two-innings match produces correct club/opposition split
  - Match with zero innings returns minimal card without crashing
  - Match with one completed innings and one pending returns partial data
  - Abandoned match returns "Match abandoned" result with "draw" winner
  - Top batters sorted by runs descending, capped at 3
  - Top bowlers sorted by wickets desc then runs asc, capped at 3
  - Fill-in players (id >= 90000) excluded by buildScorecard upstream — verify passthrough
  - Junior variant sets `junior: true`, uses brown palette, excludes "Private Player" names
  - `deriveWinner` correctly maps "won"/"lost"/other to club/opposition/draw

**Depends on:** nothing (can parallel with U0).

---

### U2: Schema Changes — social_drafts & social_settings

**Rationale:** The auto-draft engine needs dedupe columns on `social_drafts` and per-grade config on `social_settings`.

**Files:**

- `lib/db/src/schema/social_cards.ts`:
  - `socialDraftsTable`: add `sourceKind text` (nullable, for back-compat with existing milestone/roundup/recap drafts that don't set it), `sourceMatchId integer` (nullable), `sourceMatchIsJunior boolean default false`
  - `socialSettingsTable`: add `engineMatchSummary boolean default true` (senior default ON — deliberate convention break), `matchSummaryGradeConfig jsonb default '{}'` (type `Record<string, { enabled: boolean }>`)
  - Add `engine` value `"matchSummary"` to the engine column's documented values
- Migration SQL (via Drizzle generate): `ALTER TABLE social_drafts ADD COLUMN source_kind text, ADD COLUMN source_match_id integer, ADD COLUMN source_match_is_junior boolean NOT NULL DEFAULT false; CREATE UNIQUE INDEX social_drafts_match_dedupe ON social_drafts (tenant_id, source_kind, source_match_id) WHERE source_kind = 'matchSummary' AND status != 'dismissed'; ALTER TABLE social_settings ADD COLUMN engine_match_summary boolean NOT NULL DEFAULT true, ADD COLUMN match_summary_grade_config jsonb NOT NULL DEFAULT '{}';`
- `lib/api-spec/openapi.yaml` — update `SocialSettings` schema to include `engineMatchSummary` and `matchSummaryGradeConfig`; update `SocialDraft` to include `sourceKind`, `sourceMatchId`, `sourceMatchIsJunior`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`

**Test scenarios:**

- `lib/db/src/social-drafts-dedupe.test.ts`:
  - Inserting two drafts with same (tenantId, sourceKind="matchSummary", sourceMatchId) and status="pending" violates the unique index
  - Inserting a second draft after the first is "dismissed" succeeds (partial index excludes dismissed)
  - Drafts with sourceKind != "matchSummary" are not constrained by the index
  - Existing drafts (sourceKind=null) are unaffected

**Depends on:** nothing (can parallel with U0 and U1).

---

### U3: Auto-Draft Engine — generateMatchSummaryDrafts

**Rationale:** Core business logic: detect completed matches and queue draft cards.

**Files:**

- `artifacts/api-server/src/lib/match-summary-drafter.ts` — new module:
  - `generateMatchSummaryDrafts(tenantId: number, matchIds: number[], opts?: { junior?: boolean })`: for each match ID:
    1. Load match detail (reuse existing match-detail query)
    2. Check `socialSettings.engineMatchSummary` — if OFF, return early
    3. Check `matchSummaryGradeConfig[grade]` — if explicitly disabled, skip; if missing, use default (ON for senior, OFF for junior)
    4. Check dedupe: `SELECT 1 FROM social_drafts WHERE tenant_id = ? AND source_kind = 'matchSummary' AND source_match_id = ? AND status != 'dismissed'` — if exists, upsert `card_input` (regenerate on re-ingest); if not, insert
    5. Build `ShareCardInput` via `matchToSummaryInput` (from @workspace/scorecard)
    6. Insert/upsert into `socialDraftsTable` with `engine: "matchSummary"`, `sourceKind: "matchSummary"`, `sourceMatchId: matchId`, `sourceMatchIsJunior: !!opts?.junior`
  - `generateJuniorMatchSummaryDrafts(tenantId: number, matchIds: number[])`: same flow but uses `juniorMatchToSummaryInput`, sets `sourceMatchIsJunior: true`, checks junior grade config (default OFF)

- `artifacts/api-server/src/lib/post-commit-social.ts` — add `generateMatchSummaryDrafts` call:
  - In `runPostCommitSocial`: after milestone/roundup calls, call `generateMatchSummaryDrafts(DEFAULT_TENANT_ID, [matchId])` where `matchId` comes from the import context
  - In `runBatchPostCommitSocial`: call `generateMatchSummaryDrafts(DEFAULT_TENANT_ID, batchMatchIds)` once for the whole batch
  - Thread `tenantId` instead of hardcoded `DEFAULT_TENANT_ID` — use the tenant from the request context (this is existing tech debt being addressed opportunistically)

- `artifacts/api-server/src/routes/social-drafts.ts` — add sweep endpoint:
  - `POST /api/social-drafts/sweep` (requireAdmin): accepts `{ matchIds?: number[], junior?: boolean, season?: number, grade?: string }`. When `matchIds` provided, draft those specific matches. When `season`/`grade` provided, query all completed matches for that grade+season and draft them. Returns `{ drafted: number, skipped: number, errors: string[] }`.

- `lib/api-spec/openapi.yaml` — add `POST /social-drafts/sweep` endpoint spec

**Entitlement gate:** The sweep endpoint and the auto-draft engine both check `requireEntitlement("socialStudio")` before proceeding. While entitlements are dormant (`BILLING_ENABLED=false` → all entitlements ON), this is a no-op, but the gate must be present for when billing activates.

**Test scenarios:**

- `artifacts/api-server/src/lib/match-summary-drafter.test.ts`:
  - Completed match with full scorecard produces a valid draft with correct cardInput
  - Match with zero innings produces a minimal "Result pending" draft (thin-data best-effort)
  - Duplicate call for same match does NOT create a second draft (dedupe index)
  - Re-ingest of same match upserts cardInput on existing pending draft
  - Dismissed draft is not resurrected by re-ingest (partial index)
  - Grade explicitly disabled in config → no draft created
  - Grade not in config → uses default (ON for senior, OFF for junior)
  - engineMatchSummary=false → no drafts for any grade
  - Junior match with default config → no draft (junior defaults OFF)
  - Junior match with grade explicitly enabled → draft created with junior=true
  - Fill-in players (>= 90000) excluded from topBatters/topBowlers
  - Match with no result (in-progress) → no draft (only completed matches)

**Depends on:** U1 (matchToSummaryInput in @workspace/scorecard), U2 (schema columns).

---

### U4: Design-Pack Registration System

**Rationale:** Formalises code-authored designs as a third template source. Pack #1 provides the Figma-derived match summary designs.

**Files:**

- `lib/db/src/schema/social_cards.ts`:
  - `cardTemplatesTable`: add `packId text` (nullable — null for non-pack templates), `packVariant text` (nullable)
  - Document the `source` column's new `"pack"` value
  - Migration: `ALTER TABLE card_templates ADD COLUMN pack_id text, ADD COLUMN pack_variant text;`

- `artifacts/api-server/src/lib/design-packs.ts` — pack registry:
  - `type DesignPack = { id: string; name: string; description: string; cardKinds: CardKind[]; variants: DesignPackVariant[] }`
  - `type DesignPackVariant = { key: string; label: string; width: number; height: number; motionPreset: string; backgroundKind: "image" | "video" }`
  - `const PACKS: DesignPack[]` — pack #1 definition:
    ```
    { id: "matchSummary-v1", name: "Match Summary Pack", description: "...",
      cardKinds: ["matchSummary"],
      variants: [
        { key: "square", label: "Square (1080×1080)", width: 1080, height: 1080, motionPreset: "none", backgroundKind: "image" },
        { key: "portrait", label: "Portrait (1080×1350)", width: 1080, height: 1350, motionPreset: "none", backgroundKind: "image" },
        { key: "story", label: "Animated Story (1080×1920)", width: 1080, height: 1920, motionPreset: "matchReveal", backgroundKind: "video" },
      ] }
    ```
  - `ensurePackTemplates(tenantId: number)`: for each pack, for each variant, upsert a `cardTemplatesTable` row with `source: "pack"`, `packId`, `packVariant`, matching dimensions. Called during tenant onboarding and lazily on first social-studio access.

- `artifacts/api-server/src/routes/social-cards.ts` — in the template listing endpoint, include pack templates alongside BYO/layers templates (no filtering needed — they're all in the same table)

- `lib/api-spec/openapi.yaml` — update `CardTemplate` schema to include `packId`, `packVariant`, and `source` enum value `"pack"`

**Test scenarios:**

- `artifacts/api-server/src/lib/design-packs.test.ts`:
  - `ensurePackTemplates` creates 3 template rows for pack #1 on first call
  - Second call is idempotent — no duplicates
  - Pack templates have correct dimensions and motionPreset
  - Pack templates have source="pack" and correct packId/packVariant
  - Deleting a pack template and re-running ensurePackTemplates recreates it

**Depends on:** U2 (schema migration for pack columns must include card_templates columns).

---

### U5: Pack #1 Renderer — Match Summary Designs

**Rationale:** The actual visual rendering of the three Figma-derived designs. This is the largest unit — translating the Figma package's SquareCard, PortraitCard, and StoriesCard components into canvas-rendered equivalents within the existing `share-card.ts` renderer.

**Files:**

- `artifacts/cricket-club/src/lib/share-card.ts`:
  - New rendering functions: `renderPackSquareMatchSummary`, `renderPackPortraitMatchSummary`, `renderPackStoryMatchSummary` — canvas-drawing code adapted from the Figma package's React components, using the same layout geometry, colour logic, and typography but painted via CanvasRenderingContext2D instead of React DOM
  - In `buildLayers` / the renderer dispatch: when a `matchSummary` card has a pack template applied (`opts.template?.source === "pack"`), dispatch to the pack renderer based on `packVariant` instead of the built-in `renderMatchSummaryCard`
  - New motion preset `"matchReveal"` in `prepareAnimation`: staggered reveal of match header → team scores → innings details → result banner, 3.5s loop. Implemented as canvas draw calls with easing functions keyed on progress `t`

- `artifacts/cricket-club/src/lib/card-fonts.ts`:
  - Add Roboto Condensed to the Google Fonts stylesheet URL: `&family=Roboto+Condensed:wght@400;500;600;700`
  - Add `"roboto-condensed"` to `CardTemplateSlot.fontFamily` union (in `social_cards.ts`)

- Design reference: the Figma package's visual language:
  - **Square (1080×1080):** Dark gradient background with team colour accents. Match title top-center, team crests with score bars, innings breakdown with top 2 batters/bowlers per innings, result banner at bottom
  - **Portrait (1080×1350):** Same layout stretched vertically with more breathing room for innings stats, room for 3 batters/bowlers per innings
  - **Story (1080×1920):** Full-height animated card — phases: (1) match title + team crests slide in, (2) first innings scores count up + top performers fade in, (3) second innings same, (4) result banner slam. Total animation 3.5s, loops

**Test scenarios:**

- `artifacts/cricket-club/src/lib/share-card-pack.test.ts`:
  - Pack square renderer produces a canvas without throwing for a standard two-innings match
  - Pack portrait renderer produces a canvas without throwing
  - Pack story renderer produces an AnimationHandle with correct dimensions (1080×1920) and durationMs
  - All three renderers handle missing logos gracefully (initials chip fallback)
  - All three renderers handle single-innings matches
  - All three renderers handle matches with zero topBatters/topBowlers
  - Junior flag applies brown palette override to pack renderers
  - `"matchReveal"` motion preset recognised by `isAnimatedCard` and `prepareAnimation`

**Depends on:** U1 (shared types), U4 (pack template rows exist to dispatch against).

---

### U6: Social Settings UI — Per-Grade Controls

**Rationale:** Admins need to enable/disable auto-draft per grade and toggle the overall engine.

**Files:**

- `artifacts/cricket-club/src/pages/admin-social-studio.tsx` — in the Settings tab:
  - Add "Match Summary Auto-Draft" section below the existing engine toggles
  - Toggle for `engineMatchSummary` (master switch)
  - When master switch ON: show a grade list (derived from the tenant's known grades) with per-grade toggles, pre-populated from `matchSummaryGradeConfig`
  - Junior grades visually distinguished (brown indicator), default OFF with explanatory text
  - Senior grades default ON with explanatory text

- `artifacts/api-server/src/routes/social-cards.ts` — ensure the existing settings GET/PUT endpoints serialize the new `engineMatchSummary` and `matchSummaryGradeConfig` fields (should flow naturally from the schema addition + codegen)

- `lib/api-spec/openapi.yaml` — already updated in U2; ensure `SocialSettings` response includes the new fields

**Test scenarios:**

- Manual browser testing (golden path):
  - Settings page loads with engine toggles visible
  - Toggling engineMatchSummary ON/OFF persists
  - Per-grade config shows known grades
  - Toggling a grade's enabled state persists
  - Junior grades show brown indicator and default OFF

**Depends on:** U2 (schema), U3 (engine exists to configure). Can be built in parallel with U5 since it's UI-only.

---

### U7: Social Queue UI — Match Summary Draft Display

**Rationale:** Match summary drafts need to display correctly in the existing social queue with appropriate preview and metadata.

**Files:**

- `artifacts/cricket-club/src/pages/admin-social-queue.tsx`:
  - Add `engine: "matchSummary"` to the engine filter options
  - Render match summary drafts with a preview thumbnail showing the match title, teams, and result
  - Show the source match link (`appPath`) so admins can verify the match detail
  - Junior drafts show the brown "JUNIOR" indicator
  - Format selector on the draft card: admin picks square/portrait/story before approving (defaults to square)

- `artifacts/cricket-club/src/components/share-card-modal.tsx` — when previewing a matchSummary draft, allow switching between pack variants (square/portrait/story) if the pack is applied

**Test scenarios:**

- Manual browser testing:
  - Match summary drafts appear in the queue with correct preview
  - Engine filter includes "matchSummary"
  - Clicking the source link navigates to the match detail page
  - Junior drafts show brown indicator
  - Approve/dismiss flow works for matchSummary drafts

**Depends on:** U3 (drafts exist in the queue), U5 (pack renderer for preview).

---

## Sequencing & Dependencies

```
U0 (clubs top-up)  ──────────────────────────────────────────→ done
U1 (move mapper)   ──────────────────────────────────────────→ done
U2 (schema)        ──────────────────────────────────────────→ done
                         ↓           ↓
U3 (auto-draft engine) ─┤           U4 (pack registration) ──→ done
                         ↓                    ↓
                         │           U5 (pack renderer) ──────→ done
                         ↓                    ↓
U6 (settings UI)  ──────┤           U7 (queue UI) ───────────→ done
                         ↓
                       DONE
```

U0, U1, U2 can all run in parallel (no dependencies between them).
U3 depends on U1 + U2.
U4 depends on U2 (schema migration).
U5 depends on U1 + U4.
U6 depends on U2 + U3.
U7 depends on U3 + U5.

**Recommended implementation order:** U0 → U1 → U2 → U3 → U4 → U5 → U6 → U7, but with U0/U1/U2 parallelised as a batch.

---

## Risks

1. **Single-renderer complexity.** `share-card.ts` is already 4152 lines. Adding three more renderer functions adds ~600–900 lines. Mitigation: the pack renderers are in clearly separated functions; they don't touch existing rendering code paths.
2. **Four ingest paths.** Only the API import path has a hook; the other three rely on the sweep. If the sweep isn't run, those matches get no drafts. Mitigation: document clearly; add a note to the ETL scripts' output suggesting the sweep; consider a periodic cron job later.
3. **Roboto Condensed load time.** Adding another Google Font family increases the initial font load for card rendering. Mitigation: fonts are lazily loaded (only when the social studio is accessed), and the existing approach (single stylesheet link) batches all families efficiently.
4. **Pack template rows per tenant.** `ensurePackTemplates` creates 3 rows per tenant per pack. At 100 tenants × 1 pack × 3 variants = 300 rows — trivial.
5. **isHallsHead rename scope.** Renaming `ScorecardTeam.isHallsHead` to `isClub` touches multiple files in @workspace/scorecard and its consumers. Mitigation: TypeScript compiler catches all references; the rename is mechanical.

---

## Patterns to Follow

- **OpenAPI-first:** change `lib/api-spec/openapi.yaml` first, then codegen. Never hand-edit generated files.
- **Juniors isolation:** junior drafts use `sourceMatchIsJunior: true`, check junior-specific grade config, and render with `junior: true` in cardInput (forces brown palette). Junior data never blended with senior.
- **Fill-in exclusion:** `playerId >= 90000` already excluded by `buildScorecard` upstream — the mapper inherits this.
- **Tenant scoping:** all new DB rows include `tenantId`. All new API endpoints use `requireAdmin` (which enforces tenant context).
- **Entitlement gate:** `requireEntitlement("socialStudio")` on the sweep endpoint and in the engine's hot path.
- **Engine convention:** existing engines default OFF; `engineMatchSummary` deliberately defaults ON. Document this in the migration comment.
- **Idempotent scripts:** clubs top-up and pack template seeding are both idempotent upserts.
- **Brand sweep debt:** `isHallsHead` → `isClub` rename continues the brand-sweep inventory work.
