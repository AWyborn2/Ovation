---
title: Social Studio Hardening (Phase 4) - Plan
type: fix
date: 2026-07-02
topic: social-studio-hardening
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan
execution: code
origin: docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md
---

# Social Studio Hardening (Phase 4) - Plan

Implements **Phase 4** of the origin contract (docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md), advancing origin R12. Product Contract unchanged. Depends on nothing in Phases 1–3 — safe to build independently.

---

## Goal Capsule

- **Objective:** The card studio (Social Media Studio + trading cards + junior cards) reliably produces correct, on-brand output across its current card kinds and export formats (PNG/GIF/MP4) for any tenant. Defect-and-polish only — no new capability.
- **Product authority:** Ash (reviews outcomes, approves phases).
- **Execution profile:** Deep. Live browser QA (login → every studio tab → every card-kind preview → manual/from-match card build → PNG download, verified end-to-end: a 675KB PNG downloaded cleanly with no console errors) plus four parallel code-review passes (renderer, export pipeline, layer-editor UI, junior card path) enumerated the defects below. Nine units, ordered by user-impact: brand leaks first (explicit R12 requirement — "on-brand... for any tenant"), then visible correctness bugs, then silent-failure/stuck-UI bugs, then export-pipeline resource hygiene.
- **Stop conditions:** Halls Head (tenant #1)'s existing saved layouts, caption templates, and exported card filenames must keep working after this phase — a behaviour change for tenant #1's *existing content* is a hard stop, surface it. (Halls Head *default* caption text and filename prefix are expected to change per U1 — that's the fix, not a regression.)

---

## Product Contract

### Summary

Nine defects found via live QA + four-agent code review, spanning: two remaining brand leaks that survived the Phase 2 sweep (default caption templates seeded per-tenant, a hardcoded honour-board header string, a hardcoded export-filename prefix), two visible rendering-correctness bugs (circular photo/badge layers can be stretched into ellipses by unconstrained resize; animated template exports can bake in the wrong font), one data-correctness bug in junior match cards (innings score can render "0/0" over real batting stats), and a cluster of silent-failure/stuck-spinner bugs across the export and preview UI where a thrown error leaves a button or thumbnail looking like nothing happened, forever, with no message to the admin.

### Problem Frame

The card studio works end-to-end for the golden path (confirmed live: login, all 10 card-kind previews, all studio tabs, manual card build, PNG download producing a valid 675KB file with zero console errors). The defects are all in edges: a non-1991 tenant, a non-default font, a non-diagonal resize drag, a mid-export failure, a junior match with an unparseable score string. None of them are exotic — they're the normal range of things that happen across "any tenant" once Halls Head stops being the only test case, which is exactly what R12 is scoped to catch.

Two of the nine are genuine brand leaks (R12's "on-brand... for any tenant" clause) that Phase 2's sweep missed because they're not template/theme code — they're a caption-string constant and a filename-generation function, not caught by that pass's focus on rendering/branding surfaces.

The rest split into two failure classes:
- **Visibly wrong output** (ellipse-stretched photos, wrong-font animated exports, "0/0" junior scores, "EST. 1991" on non-1991/non-honour-board cards) — the card renders, but incorrectly.
- **Silently broken interaction** (stuck spinners, buttons that reset with no error, approvals not recorded after a partial failure) — nothing renders and the admin gets no signal why.

### Key Decisions

- **Fix brand leaks unconditionally — they're not optional polish.** The "Hammers" caption strings, the "EST. 1991" header, and the `hhcc-` filename prefix all violate R12's explicit "on-brand... for any tenant" clause; there's no judgment call here, only the mechanical question of what the tenant-neutral replacement looks like (empty/generic default vs. tenant-derived value).
- **Existing saved Halls Head content is not touched.** U1 changes what a *new* tenant's default caption templates say and what *new* exports are named; it does not rewrite Halls Head's already-saved caption templates or rename already-downloaded files. This mirrors Phase 3's "Halls Head behaviourally unchanged" stop condition applied to content instead of settings rows.
- **Error-surfacing gets one shared idiom, not nine bespoke fixes.** Nearly every silent-failure finding (U4–U7) is the same shape: an async action has no catch, or an empty catch, leaving a loading flag stuck true or a spinner with no failure state. Rather than hand-roll nine different error displays, this phase introduces one minimal pattern — every export/save action's catch sets a visible inline error string near the triggering button, and every busy flag resets in a `finally` — and applies it at each site. `CardThumb`'s stuck-spinner (U7) gets a distinct fix (a retry affordance) since it's a passive render, not a user-triggered action.
- **Junior score bug (U8) is scoped to the card-rendering symptom, not a wider data-quality audit.** `junior-match-summary.ts`/`junior-mapping.ts`'s free-text score parsing is pre-existing behaviour outside card-studio's own code (it's shared with match-detail display elsewhere in the app); this phase makes the *card* stop showing a misleading "0/0" when the parse fails (fall back to omitting the total, or deriving it from the actual batting lines when available) without redesigning the underlying parser or touching non-card call sites.
- **Resource-hygiene findings (U9: unclosed `ImageBitmap`s, missing `MediaRecorder.onerror`) are included but scoped small.** They're real defects (leaked GPU/memory resources on repeated export) but lower user-visible impact than U1–U8; batched into one unit so they don't block the higher-priority fixes if time is constrained.
- **Not fixing:** the multi-innings-per-team junior score bug (review finding, medium confidence, depends on junior data rarely having >2 recorded innings per side — noted in Outstanding Questions, not blocking); the sponsor-strip/stagger-timing differences between template and built-in animated cards (judged intentional design differences by the reviewing agent, not defects); badge-embedded photos not supporting focal/zoom adjustment (feature gap, not a defect).

### Actors

- A1. Club admin — builds, previews, and exports social/trading/junior cards for their own tenant.
- A4. Platform operator — provisions new tenants; a new tenant's first-ever card studio use must never show another club's brand.

### Requirements

- R12. The existing card studio reliably produces correct, on-brand output across its current card kinds and export formats (PNG/GIF/MP4) for any tenant — a defect-and-polish pass on the builder, not new capability.

### Acceptance Examples

- AE1. Covers R12 (brand). Given a newly-provisioned tenant that has never edited its caption templates, when it views its default caption templates, then none of them mention "the Hammers" or any other Halls-Head-specific text.
- AE2. Covers R12 (brand). Given any tenant's honour-board-style card, when it renders, then the header shows that tenant's own founding-year value if one exists, or omits the "EST. ####" line entirely if it doesn't — never "EST. 1991" for a non-Halls-Head tenant.
- AE3. Covers R12 (brand). Given any non-Halls-Head tenant downloads any card (PNG/GIF/MP4/zip), when the file is named, then the filename is derived from that tenant's own short name/slug, never `hhcc-`.
- AE4. Covers R12 (correctness). Given an admin drag-resizes a circular photo or badge layer non-diagonally in the layout editor, when the card renders, then the photo/badge stays a circle (aspect-locked), never a stretched ellipse.
- AE5. Covers R12 (correctness). Given a tenant has a custom-fonted card template, when an admin previews or exports it as an animated GIF/MP4, then the rendered text uses the same font as the PNG export of the identical card — never a system-font fallback baked into the video/GIF only.
- AE6. Covers R12 (correctness). Given a junior match whose free-text score field is missing/unparseable but whose batting/bowling lines are recorded, when its match-summary card renders, then the innings score is never rendered as a misleading "0/0" — the total is derived from recorded batting when possible, or omitted, not defaulted to zero.
- AE7. Covers R12 (reliability). Given any export action (PNG/video/GIF/zip/approve-and-download) throws or rejects partway through, when the admin is looking at the triggering button, then a visible error message appears and the busy/loading state resets — never a silent reset with no explanation, and never a stuck spinner forever.
- AE8. Covers R12 (reliability). Given a card-kind thumbnail fails to render in the studio gallery, when the admin views that tile, then it shows a distinguishable error/retry state, not an indefinite loading spinner.

---

## Implementation Units

### U1. Brand-leak fixes (caption templates, honour-board header, export filenames)

- **Goal:** No tenant-neutral card-studio surface leaks Halls Head's identity.
- **Requirements:** R12 (AE1, AE2, AE3)
- **Dependencies:** none
- **Files:**
  - `artifacts/api-server/src/routes/social-cards.ts` — `DEFAULT_TEMPLATES` array (~lines 58-126): replace "Honour board form for the Hammers." and "Leading the way for the Hammers this season." with tenant-neutral phrasing (drop the nickname clause entirely — e.g. "Honour board form." / "Leading the way this season.").
  - `artifacts/cricket-club/src/lib/share-card.ts:1993` (`drawHeaderWith`) — drop the hardcoded `"EST. 1991  •  HONOUR BOARD"` string; if `ClubBrand` has no founding-year field, render just `"HONOUR BOARD"` (drop the "EST. ####" clause entirely rather than inventing a per-tenant founding-year field not currently modeled — matches how Phase 2 U3 deliberately deferred "EST. 1991" rather than fabricate data). Also delete the dead-code duplicate at line 541 (`drawHeader`, confirmed unreachable by the review agent) since it carries the same literal and would be a second place to fix if ever revived.
  - `artifacts/cricket-club/src/lib/share-card.ts:3669-3693` (`cardBaseFilename`) — replace the hardcoded `hhcc-` prefix with a slug derived from the brand passed into the render call (`brand?.shortName` or `brand?.name`, slugified, falling back to a generic `"card-"` prefix if brand is unavailable at export time — never `"hhcc-"`).
  - Same-class filenames found during implementation, outside the file initially scoped: `artifacts/cricket-club/src/components/trading-card.tsx` (`hhcc-card-${fileBase}-${side}.png` / `hhcc-card-${fileBase}` for the trading-card PNG/video export, via `useCardBrand()`) and `artifacts/cricket-club/src/lib/milestone-share.ts` (`downloadMilestoneCard`'s `hhcc-${slug}...` default filename, via the `MilestoneShareInput.brand` field already added in Phase 2) — fixed alongside `cardBaseFilename` since they're the identical hardcoded-prefix defect on a different export path.
- **Approach:** Mechanical string/derivation replacement at three call sites — no schema or type changes needed since `ClubBrand`/render options already carry brand context at these call sites (confirmed by the reviewing agent for `cardBaseFilename`'s callers).
- **Patterns to follow:** Phase 2 U3/U6's `defaultHashtag(brand)`/`clubShortLabel(brand)` helpers in `share-card.ts`/`constants.ts` — same "derive from brand, sensible tenant-neutral fallback" shape.
- **Test scenarios:**
  - Covers AE1. A fresh tenant's `ensureSettings()`-seeded caption templates contain no "Hammers" substring.
  - Covers AE2. `drawHeaderWith` output for a brand with no founding-year data never contains "1991".
  - Covers AE3. `cardBaseFilename` output for a non-Halls-Head brand never starts with `hhcc-`.
- **Verification:** Extend `artifacts/cricket-club/src/__tests__/brand-leaks.test.tsx` (the Phase 2 regression suite) with assertions for the header string and filename prefix; add a caption-template assertion (unit test on `DEFAULT_TEMPLATES` content, or extend `tenant-brand.test.ts`-style coverage in api-server). Manual: Halls Head's *already-saved* caption templates/exports are unaffected (this only changes new-tenant defaults and new export filenames going forward).

### U2. Circular layer resize aspect-lock

- **Goal:** Photo/badge layers (circular by design) can't be dragged into an ellipse.
- **Requirements:** R12 (AE4)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/components/card-layout-editor.tsx` (resize-handle pointer-move handler, ~lines 1039-1044 per the review agent's trace) — when the layer being resized is a circular kind (photo/badge), lock `h` to track `w` (or vice versa, whichever axis the drag is dominant on) instead of applying independent deltas.
- **Approach:** Add a shape-aware branch in the existing resize handler; circular layer kinds are already distinguishable at this call site (the same distinction `share-card.ts`'s `drawCircularImage`/`addPhoto` closures already make on the render side).
- **Patterns to follow:** none pre-existing in this codebase for aspect-lock; keep the fix minimal — a single conditional clamp in the existing delta calculation, not a new resize-mode abstraction.
- **Test scenarios:** Covers AE4. Dragging a photo/badge layer's corner handle non-diagonally produces `w === h` in the resulting layout state; a text layer's resize is unaffected (independent `w`/`h` still allowed).
- **Verification:** Component-level test if `card-layout-editor.tsx` has existing test coverage to extend; otherwise manual verification via the layout editor (drag a photo layer's handle horizontally-only, confirm it stays square) — flag if no automated coverage exists for this file, since this phase shouldn't be the first to add a test harness for a component with none today unless it's cheap to do so.

### U3. Animated template font loading

- **Goal:** Animated (GIF/MP4) exports of custom-template cards use the same font as the PNG export of the identical card.
- **Requirements:** R12 (AE5)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/lib/share-card.ts:3769-3807` (`prepareAnimation`, template branch) — add the same `await ensureCardFonts()` call that the built-in (non-template) animated branch already makes at line 3834, and that `renderShareCard`'s static-PNG template path already makes.
- **Approach:** One-line addition, mirroring the already-correct sibling branch — this is an omission, not a design gap.
- **Patterns to follow:** The built-in animated branch's own `ensureCardFonts()` call (line 3834) is the reference implementation.
- **Test scenarios:** Covers AE5. Rendering an animated preview of a custom-font template card triggers the same font-loading call as its PNG render.
- **Verification:** If `share-card.ts` has unit coverage for `prepareAnimation`, add an assertion that `ensureCardFonts` is invoked on the template branch; otherwise manual check (preview an animated template card with a non-default font selected, confirm the correct font renders instead of a system fallback).

### U4. Junior match card score correctness

- **Goal:** A junior match-summary card never shows a misleading "0/0" total over real recorded batting/bowling data.
- **Requirements:** R12 (AE6)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/lib/junior-match-summary.ts:127-128` — when `inn.totalRuns`/`inn.totalWickets` are null (i.e. `parseJuniorScore` couldn't parse the free-text score field), do not default to `0`; instead derive the total from the sum of recorded `topBatters`/full batting-line runs if that data is present and non-empty, or omit the score line from the card entirely if neither the parsed score nor batting data is available. Also fix the single-number case (`"120 all out"` → wickets currently defaults to `"0"` instead of being treated as unknown) the same way.
- **Approach:** Guard the existing `String(inn.totalRuns ?? 0)` / `String(inn.wickets ?? 0)` fallback with a check against whether batting data exists to derive from; keep `lib/scorecard/src/junior-mapping.ts`'s `parseJuniorScore`/`buildInnings` untouched (out of scope per Key Decisions — this is a card-rendering fix, not a parser rewrite).
- **Patterns to follow:** none directly reusable; this is a local guard at the one call site identified.
- **Test scenarios:** Covers AE6. A junior match with an unparseable score string but real batting lines renders a card showing the batting-derived total (or omits the score), never "0/0". A junior match with a genuinely completed 0/0 innings (a real scoreless result, if that's representable) is not accidentally suppressed by the new guard — the fix must distinguish "no data" from "genuinely zero," which the `null` vs `0` sentinel already returned by `parseJuniorScore` supports (`{runs: null, wickets: null}` for unparseable vs. an actual `{runs: 0, wickets: 0}` if the source string legitimately said so).
- **Verification:** Unit test on `junior-match-summary.ts`'s innings-building logic with an unparseable score + populated batting fixture; manual QA-driver check against a seeded junior match if one exists in the dev DB.

### U5. Export action error-surfacing (stuck spinners / silent resets)

- **Goal:** Every export/approve action in `share-card-modal.tsx` surfaces a visible error and resets its busy state on failure, instead of resetting silently or hanging.
- **Requirements:** R12 (AE7)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/components/share-card-modal.tsx`:
  - `handleDownload` (~361-365, button ~799-806) — wrap in try/catch, add a loading/disabled state on the button, surface a visible error on catch.
  - `handleApproveAndDownload` (~429-439) — add a `catch` before the existing `finally`, surface the error, do not silently proceed to `onOpenChange(false)` on failure.
  - `handleDownloadAll` (~367-427) — wrap the still-PNG loop (373-377) in the same per-item try/catch the video (390) and GIF (406) blocks already use, so one size's PNG failure doesn't abort the whole zip/approve flow; surface a visible warning (not just `console.error`) when any per-size video/GIF export is dropped from the zip (385-415).
- **Approach:** Introduce one small local pattern reused at all four sites — an `exportError` state string displayed inline near the action buttons, set in each new `catch`, cleared at the start of each action, combined with existing/added busy-flag `finally` blocks. Not a new global toast system — scoped to this modal, matching its existing local-state style.
- **Patterns to follow:** The video/GIF blocks' existing `.catch(e => { console.error(...); return null; })` shape (385-415) is the template for "don't abort the whole batch," extended to also surface a UI-visible message rather than console-only.
- **Test scenarios:** Covers AE7. Simulate `renderShareCard` throwing for `handleDownload` → button shows an error, is not left in a permanent loading state. Simulate `onApprove()` rejecting after a successful `handleDownloadAll()` → visible error, approval not silently treated as done. Simulate one size's PNG render throwing inside `handleDownloadAll` → the other sizes still export and zip; a warning notes the dropped size.
- **Verification:** Component test if `share-card-modal.tsx` has existing test infra to extend (check for a `.test.tsx` sibling); otherwise manual QA via the driver script pattern already used this session (trigger a failure by temporarily breaking a render input, confirm the UI shows an error instead of hanging).

### U6. Animated preview staleness after layout save

- **Goal:** The live animated card preview reflects a just-saved custom layout immediately, matching the static preview's existing correct behaviour.
- **Requirements:** R12 (AE7 — a stale-render is a "reliably produces correct output" defect even without a thrown error)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/components/share-card-modal.tsx:344-359` (`animSig` composition) and `artifacts/cricket-club/src/components/share-card-modal/animated-card-preview.tsx:51-104` (`AnimatedCardPreview`'s prepare-effect, keyed only on `[sig]`).
- **Approach:** Include `layoutSig`/`savedLayout` in `animSig`'s composition (mirroring how the static preview's `layoutSig` dependency at line 323 already triggers a refresh), so saving a new layout changes `animSig` and re-triggers `prepareAnimation` with the fresh `opts.layout`.
- **Patterns to follow:** The static/img preview's own `layoutSig` dependency (line 323) is the reference — this brings the animated path in line with it.
- **Test scenarios:** Covers AE7 (staleness variant). Save a new layout for a card kind with animation enabled → the animated preview re-renders with the new layout without requiring an unrelated field (size tab, motion toggle) to change first.
- **Verification:** Manual QA via the driver script (open a card-kind editor, change and save a layer position, confirm the animated preview reflects it immediately) since this is a timing/re-render behaviour hard to assert cheaply in a unit test without a canvas-capable test environment.

### U7. Card-kind thumbnail stuck-spinner fix

- **Goal:** A studio gallery tile that fails to render shows a distinguishable error state, not an indefinite spinner.
- **Requirements:** R12 (AE8)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/pages/admin-social-studio.tsx:58-80` (`CardThumb`) — replace the empty `catch { /* leave spinner */ }` with a caught-error state that swaps the spinner for a small error/retry affordance (icon + "Preview failed" text, click-to-retry re-triggering the render effect).
- **Approach:** Add a local `error` state alongside the existing loading state; minimal UI (text + retry button), consistent with the rest of the gallery's existing tile styling.
- **Patterns to follow:** none directly reusable in this file; keep it small and local, not a new shared error-tile component unless a second identical need appears elsewhere in this phase (it doesn't).
- **Test scenarios:** Covers AE8. A card kind whose built-in layout/template data throws during thumbnail render shows the error/retry state instead of a permanent spinner; clicking retry re-attempts the render.
- **Verification:** Manual QA via the driver script (temporarily break one card kind's built-in data to force a throw, confirm the tile shows the error state, confirm retry works) — or a component-level test if cheap to add.

### U8. `drawLayerContent` silent draw-failure (no logging, no fallback)

- **Goal:** A single layer failing to draw (bad saved coordinates, NaN stat value, font-fitting edge case) is at least logged, so a card missing an element is diagnosable instead of a silent mystery.
- **Requirements:** R12 (AE7 — extends the "no silent failure" principle to the render layer, not just the UI layer)
- **Dependencies:** none
- **Files:** `artifacts/cricket-club/src/lib/share-card.ts:3143-3151` (`drawLayerContent`) — change `catch {}` to `catch (err) { console.error("[share-card] layer draw failed", l.kind ?? l, err); }` at minimum; a visible fallback (e.g. a placeholder chip, matching how a failed logo image already falls back to an initials chip elsewhere in this file) is preferred if the layer kind can be identified cheaply at this call site, but logging alone satisfies the "diagnosable, not silent" bar if a generic fallback isn't cheap to add safely for every layer kind.
- **Approach:** Minimal — add logging first (mechanical, zero risk of changing rendered output for the non-error path); add a visible fallback only if it's a small, safe addition once the specific layer-kind context at this call site is confirmed during implementation.
- **Patterns to follow:** This file's own existing logo-load-failure fallback (initials chip) as the model for what a "visible fallback" looks like, if pursued.
- **Test scenarios:** Covers AE7 (render-layer variant). A layer whose `draw()` throws is logged with enough context (layer kind) to diagnose which element and why.
- **Verification:** Unit test asserting `console.error` (or equivalent) is called when a layer's `draw` throws, using a mocked layer; manual spot-check that this doesn't change output for any currently-working card kind (log-only change, so should be a no-op for the happy path).

### U9. Export-pipeline resource hygiene (bounded scope)

- **Goal:** Close the highest-confidence resource-leak and stuck-forever gaps in the video/GIF encoding paths without a broader export-pipeline rewrite.
- **Requirements:** R12 (supports AE7 — these are additional stuck-forever/leak paths beyond U5's UI-level fixes)
- **Dependencies:** none
- **Files:**
  - `artifacts/cricket-club/src/lib/trading-card-export.ts:177-215` (`encodeCardVideo`) — the `requestAnimationFrame`-driven frame loop's completion `Promise` has no `reject`; wrap `drawFrame`/`ctx.drawImage` in a try/catch inside `tick()` that calls `reject(err)` on failure, so the promise settles and the caller's `finally { setVideoBusy(false) }` (`trading-card.tsx:139-142`) actually runs instead of hanging forever.
  - `artifacts/cricket-club/src/lib/share-card.ts:4082-4093` (`renderShareCardVideo`'s rAF loop) — same fix: add `reject` to the completion promise and a try/catch around the per-frame draw call.
  - `artifacts/cricket-club/src/lib/share-card.ts:4118-4164` (`renderShareCardGif`) — wrap the per-frame `getImageData`/`quantize`/`applyPalette` loop and `gif.finish()` in try/finally so `anim.cleanup()` (currently only reached on the success path) always runs, preventing leaked baked `ImageBitmap`s on a mid-loop throw.
  - `artifacts/cricket-club/src/lib/trading-card-export.ts` — call `.close()` on each captured `ImageBitmap` in `frames` after `encodeCardVideo` finishes (success or failure), mirroring `share-card.ts`'s `AnimationHandle.cleanup()` pattern.
- **Approach:** Four targeted, independent fixes — no shared abstraction, since each site has a slightly different structure (rAF-driven promise vs. a straight for-loop vs. bitmap array cleanup). `MediaRecorder.onerror` handlers (review finding #3, medium confidence) and `renderShareCardVideo`'s whole-function try/catch (finding #5) are deferred — see Scope Boundaries — since the two `reject`-adding fixes above already close the primary "stuck forever" symptom they'd otherwise also guard against.
- **Patterns to follow:** `share-card.ts`'s `AnimationHandle.cleanup()` as the reference for what "properly released" looks like.
- **Test scenarios:** A forced throw inside the video-encode frame loop rejects the returned promise (observable in a unit test with a mocked canvas/draw call) instead of hanging; `renderShareCardGif` calls `anim.cleanup()` even when a forced per-frame error is injected; `encodeCardVideo`'s bitmap array has `.close()` called on every entry after completion (spy-able in a unit test).
- **Verification:** Unit tests where the render/encode functions are testable in isolation with mocked canvas primitives; otherwise manual QA (hard to force a mid-export throw live) — acceptable to rely on code-level verification (read the diff, confirm the try/catch/finally wraps the right scope) plus the existing PNG/download smoke test from this phase's QA pass for the non-error path, since forcing the error path live is impractical without adding test-only hooks this phase doesn't otherwise need.

---

## Verification Contract

- Typecheck: `pnpm run typecheck`.
- Tests: `pnpm --filter @workspace/cricket-club run test` and `pnpm --filter @workspace/api-server run test` (existing suites must stay green; new/extended tests per unit above).
- Manual/browser QA (repeat the pattern already used this session — Playwright driver against local Postgres + api-server + cricket-club dev servers): re-walk all card-studio tabs and card-kind previews for Halls Head (tenant #1) to confirm no regression in existing saved content; spot-check a second tenant's fresh caption templates/header/filename for the brand-leak fixes (U1); attempt the circular-resize (U2) and animated-template-font (U3) scenarios manually since they're not cheaply unit-testable.
- No use of the temporary Vite dev-proxy edit in any committed diff (confirmed reverted before this plan was written).

## Definition of Done

- Origin R12 satisfied: no known brand leak remains in the card studio (U1); the four visible-correctness defects found (U2–U4, plus U6's staleness) are fixed; the export/preview UI surfaces errors instead of failing silently (U5, U7); the render layer logs instead of silently dropping a failed layer (U8); the two highest-confidence stuck-forever/leak paths in the encode pipeline are closed (U9).
- Halls Head's existing saved caption templates, layouts, and previously-exported file naming behaviour for already-downloaded files are unaffected — only new-tenant defaults and new exports change.
- Typecheck clean; full web + api-server test suites green.

## Outstanding Questions

- The multi-innings-per-team junior score bug (`junior-mapping.ts:142-167`, medium confidence per the reviewing agent, depends on how often a junior match actually records >2 innings for one side) is **not** fixed in this phase — flagging for Ash's awareness rather than silently dropping it. If junior formats in the pilot data genuinely never exceed 2 recorded innings per side, this is moot; worth a one-line confirmation before considering it fully closed.
- U2 (aspect-lock) and parts of U7/U9 may have no existing automated test harness to extend (`card-layout-editor.tsx`, `admin-social-studio.tsx`'s `CardThumb`, the canvas-level encode functions) — verification for those leans on manual QA via the driver-script pattern rather than new unit tests, flagged per-unit above rather than silently downgrading the verification bar.

## Scope Boundaries

**Deferred to Follow-Up Work**

- A full rewrite/redesign of `lib/scorecard/src/junior-mapping.ts`'s free-text score parser — U4 only stops the card-rendering symptom, not the underlying parsing approach.
- `MediaRecorder.onerror` handlers and `renderShareCardVideo`'s whole-function try/catch/finally wrap (review findings #3 and #5) — the two `reject`-adding fixes in U9 already close the primary stuck-forever symptom; adding these too would be a broader export-pipeline hardening pass better scoped on its own if it proves necessary in practice.
- Sponsor-strip animation and stagger/timing differences between template-based and built-in animated cards, and lack of focal/zoom adjustment for badge-embedded photos — judged intentional design differences or feature gaps, not defects, by the reviewing agent; not part of a defect-and-polish phase.
- Phase 5 of the origin contract (UI/design refresh — light/dark mode, club-neutral default design language).
