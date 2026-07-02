---
title: UI / Design Refresh (Phase 5) - Plan
type: fix
date: 2026-07-02
topic: ui-design-refresh
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan
execution: code
origin: docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md
---

# UI / Design Refresh (Phase 5) - Plan

Implements **Phase 5** of the origin contract (docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md), advancing origin R13–R14. Product Contract unchanged. Depends on nothing in Phases 1–4 — safe to build independently.

---

## Goal Capsule

- **Objective:** Light and dark mode both genuinely work (real distinct palettes, a working toggle, OS-preference detection), and the base site's default look is derived from each tenant's own brand colours rather than Halls Head's literal colours baked into the CSS.
- **Product authority:** Ash (reviews outcomes, approves phases). Because this phase changes what the app visually looks like — a judgment call, not just a correctness fix — this plan documents the concrete palette-derivation decisions made so they're reviewable in the PR (with before/after screenshots), rather than blocking mid-phase to ask.
- **Execution profile:** Deep. A research pass (`Explore` agent + direct file reads) found the actual R14 gap is bigger than "some pages show Halls Head's name": `artifacts/cricket-club/src/index.css`'s `:root` CSS custom properties are not a neutral fallback at all — they are Halls Head's own `primaryColour`/`secondaryColour`/`tertiaryColour` (`#333F48`/`#FBAC27`/`#42342B`) converted to HSL and hardcoded directly (verified by converting each literal back to hex and matching it against `HALLS_HEAD_BRAND` in `lib/scorecard/src/brand.ts`). `BrandProvider`'s `applyBrandTheme` only overrides 11 of the 24 tokens at runtime (the accent-family ones); the other 13 — `--background`, `--card`, `--popover`, `--secondary`, `--muted`, `--border`/`--input`, all the `*-foreground` pairs — are never touched, so every tenant's whole page chrome (not just accents) is permanently Halls Head's colours today. Separately, `.dark` in the same file duplicates `:root` token-for-token — dark mode has no distinct palette and nothing in the app ever adds the `.dark` class in the first place.
- **Stop conditions:** Halls Head (tenant #1)'s **dark-mode** rendering must reproduce today's only-existing look pixel-for-pixel (same derivation formula applied to Halls Head's own brand values must equal today's literals) — a visual regression there is a hard stop. Light mode and OS-preference detection are new, intended behaviour for every tenant including Halls Head (that is the point of R13), not something to suppress for tenant #1.

---

## Product Contract

### Summary

Replace the hardcoded, Halls-Head-literal CSS custom properties with a brand-derived token system that computes a full palette (structural surfaces + brand accents) from each tenant's `ClubBrand`, in two genuinely distinct light/dark variants, wired to a real toggle with OS-preference detection and no flash-of-wrong-theme. Fix three remaining literal Halls-Head leaks in the base site UI that the card-studio-focused Phase 2/4 sweeps didn't reach: hardcoded "HALLS HEAD CRICKET CLUB" banner text on the (senior and junior) Premierships pages, hardcoded "Est. 1991" text in the trading-card DOM components (a separate render path from the canvas renderer fixed in Phase 2/4), and a hardcoded gold literal on the grade-badge decorative frame.

### Problem Frame

`lib/scorecard/src/brand.ts`'s `DEFAULT_BRAND` (neutral slate: `#334155`/`#94A3B8`/`#475569`) and Phase 2/3's `applyBrandTheme` work correctly for the 11 tokens they touch — a brand-less tenant's buttons/links/rings genuinely go neutral slate, not Halls Head gold. The problem is everything `applyBrandTheme` *doesn't* touch: the page background, every card/popover surface, the secondary/muted surfaces, and all border/foreground pairs are literal, unconditional CSS values equal to Halls Head's own colours converted to HSL — confirmed by direct hex→HSL conversion (`#333F48` → `207 17% 24%`, matching `--background`'s literal exactly; `#FBAC27` → `46 96% 57%`, matching `--primary`/`--ring`/`--accent`'s literal; `#42342B` → `25 20% 21%`, matching `--secondary`'s literal). So today's "default" site chrome isn't neutral scaffolding that happens to look dark — it's Halls Head's brand, unconditionally, for every tenant, everywhere except the 11 already-fixed accent tokens.

R13 is a separate but related gap in the same file: `.dark`'s block is a byte-for-byte duplicate of `:root`, and nothing in the app source ever adds the `.dark` class to any element — so "dark mode" as a concept doesn't exist yet, just one fixed-dark-looking theme with no toggle and no distinct light variant.

### Key Decisions

- **One derivation function, two modes.** A single `deriveThemeTokens(brand, mode)` pure function (new module, `artifacts/cricket-club/src/lib/theme-tokens.ts`) computes all 24+ custom properties from `brand.primaryColour`/`secondaryColour`/`tertiaryColour` for `mode: "light" | "dark"`. Halls Head's own hardcoded literals are the reference this function's `mode: "dark"` output is checked against. **Correction found during implementation:** the 9 tokens Phase 2/3's `applyBrandTheme` already derives at runtime (`--primary`/`--ring`/`--accent`/`--card-border`/`--secondary-foreground`/`--primary-border`/`--accent-border`/`--primary-foreground`/`--accent-foreground`) reuse that exact existing hex→HSL conversion, so they match what's *actually rendering today* exactly (verified: `hexToHsl("#FBAC27")` = h38/s96/l57, matching the live override — the static CSS literal `46 96% 57%` was itself only ever a pre-JS placeholder, never what a working browser shows). The remaining structural tokens (background/card/popover/muted/border/etc.) were never overridden before this phase, so they render from the static CSS literal today — recomputing them mechanically from `HALLS_HEAD_BRAND`'s hex values lands within ~1° hue / exact saturation+lightness of those literals (e.g. computed `206 17% 24%` vs. the hand-authored literal `207 17% 24%`), not byte-identical, because the original literals were hand-authored approximations rather than themselves generated by this formula. The regression bar is therefore "matches within a small tolerance (imperceptible, ≤2 on any HSL component)," not exact string equality — documented here so the discrepancy isn't mistaken for a bug during review.
- **Dark-mode formula generalises Halls Head's own existing shape** (verified by reverse-engineering the literals): background = primary hue/sat at L24%, card/popover = same at L27%, border/input/muted-border = L35%, muted = L30%, muted-foreground = desaturated primary hue at L75%, secondary = tertiary colour's own HSL clamped to a sensible dark-surface lightness band (15–30%), foreground/card-foreground/popover-foreground = white (universal, not brand-derived — white text on a dark surface is correct regardless of hue), destructive stays the fixed universal red (an error colour shouldn't be tenant-branded). Accent family (`--primary`, `--ring`, `--accent`, `--card-border`, `--secondary-foreground` = brand secondary; `--primary-foreground`/`--accent-foreground` = brand primary) is unchanged from the existing Phase 2/3 `applyBrandTheme` logic — it already works correctly and is mode-independent (a button's own text/background contrast pair doesn't depend on the surrounding page's mode).
- **Light-mode formula mirrors the same shape at inverted lightness, capped saturation.** Structural surfaces (background/card/popover/muted/border) use the brand's primary hue but cap saturation low (≤8–10%) so an arbitrary saturated brand hue reads as a *subtle tint*, not a harsh coloured background — background L97%, card/popover pure white (L100%), border/input/muted-border L85%, muted L94%, muted-foreground mid-grey L40%, foreground/card-foreground/popover-foreground near-black. This is a judgment call (a fully brand-saturated light background was considered and rejected as likely to look harsh/unreadable for many arbitrary brand colours) — flagged in Outstanding Questions for Ash to react to via the PR screenshots rather than blocking implementation on it.
- **Accent-on-accent contrast pairs (`--primary-foreground`, `--accent-foreground`) get a light-mode-safe fallback.** Reusing the brand's primary colour directly as button text (today's dark-mode approach) can fail contrast if a brand's primary colour happens to be light; `deriveThemeTokens` clamps this pair to a definitely-dark value (max L20%) in light mode. Dark mode keeps the direct brand-primary reuse since Halls Head's own primary is already dark (matches today).
- **`:root` and `.dark` in `index.css` become the neutral (`DEFAULT_BRAND`) light/dark palettes**, not Halls Head's literals — this is what paints before the brand API response resolves and JS runs `applyBrandTheme`, and it must therefore already be tenant-neutral, not a Halls-Head-specific placeholder. Computed once via the same `deriveThemeTokens(DEFAULT_BRAND, mode)` function (a one-time script generates the literals to paste in, documented in the unit below) so there's exactly one formula in the codebase, not two that can drift.
- **Anti-flash inline script in `index.html`**, the standard pattern (same approach `next-themes` uses): before the app mounts, read `localStorage["ovation-theme"]` (`"light" | "dark" | "system"`), resolve `"system"` via `matchMedia("(prefers-color-scheme: dark)")`, and add/remove the `.dark` class on `<html>` synchronously — so there's no flash of the wrong mode on load, and no dependency on brand data having loaded yet (mode resolution and brand resolution are independent; brand tokens layer on top once the API responds).
- **New `ThemeProvider`/`useThemeMode()` hook**, separate from `BrandProvider` but composed with it: owns the `.dark` class + localStorage persistence + the resolved mode; `BrandProvider` reads the resolved mode and calls `applyBrandTheme(brand, mode)` whenever *either* brand or mode changes, so switching the toggle re-derives the full palette from the current brand rather than only toggling a static pre-baked class.
- **Toggle UI mirrors the existing `HelpButton` pattern** in `layout.tsx` (same pill-button styling, sun/moon icon from `lucide-react`, placed next to `HelpButton` in both the desktop and mobile header rows) — reuses an established in-repo pattern rather than inventing new chrome.
- **The three remaining literal-text/colour leaks (Premierships banner, trading-card "Est. 1991", grade-badge gold) are fixed alongside the token work** since they're the same class of defect this phase is about and were missed by the card-studio-scoped Phase 2/4 sweeps — not deferred to a future pass.

### Actors

- A1. Any site visitor (fan, admin) — sees the tenant's own brand-derived look, in their preferred light/dark mode, on first visit (OS preference) and after an explicit toggle (persisted).
- A4. Halls Head (tenant #1) specifically — dark mode must look exactly as it does today; light mode is new.

### Requirements

- R13. Light and dark mode are fully wired: a working toggle plus OS-preference detection, with a genuinely distinct dark palette.
- R14. The default design language reads as club-neutral — it works for any club's colours and logo rather than looking Halls-Head-specific.

### Acceptance Examples

- AE1. Covers R13. Given a first-time visitor whose OS is set to dark mode, when they load the site with no prior visit (no `localStorage` theme key), then the site renders in dark mode without a toggle click.
- AE2. Covers R13. Given a visitor toggles from dark to light, when they reload the page, then it stays light (persisted), overriding OS preference until they toggle again or clear the override.
- AE3. Covers R13. Given the same tenant brand, when comparing the site in light vs dark mode, then `--background`, `--card`, `--foreground` and at least the border/muted tokens have measurably different computed values (not the pre-existing bug where `.dark` duplicated `:root`).
- AE4. Covers R14. Given a tenant with no brand set (falls back to `DEFAULT_BRAND`), when the site renders, then no computed CSS custom property matches Halls Head's literal HSL values (`207 17% 24%`, `46 96% 57%`, `25 20% 21%`, etc.) in either light or dark mode.
- AE5. Covers R14. Given Halls Head (tenant #1)'s own brand, when the site renders in dark mode, then every structural token's computed value matches today's pre-change literals within an imperceptible tolerance (≤2 on any HSL component; exact for the 9 tokens already runtime-derived pre-this-phase) — the regression check for the stop condition.
- AE6. Covers R14. Given any tenant, when viewing the (senior or junior) Premierships page or a trading card, then no literal "Halls Head"/"HALLS HEAD CRICKET CLUB" or "Est. 1991" text renders regardless of brand.

---

## Implementation Units

### U1. `deriveThemeTokens`: brand → full palette, both modes

- **Goal:** One pure function computing every structural + accent CSS custom property from a `ClubBrand` for a given light/dark mode.
- **Requirements:** R13, R14
- **Dependencies:** none
- **Files:** new `artifacts/cricket-club/src/lib/theme-tokens.ts` — exports `type ThemeMode = "light" | "dark"`, `deriveThemeTokens(brand: ClubBrand, mode: ThemeMode): Record<string, string>` (returns the full `--token: "H S% L%"` map per the formula in Key Decisions), plus the `hexToHsl`/formatting helpers (moved/generalised from `brand-context.tsx`'s existing private `hexToHslTriplet`, which this unit supersedes).
- **Approach:** Pure, framework-free function — easy to unit test exhaustively (this is the one file where getting the exact numbers right matters most, so it gets the most direct test coverage).
- **Patterns to follow:** The existing `hexToHslTriplet`/`applyBrandTheme` derivation shapes in `brand-context.tsx` (Phase 2/3) for the accent-family tokens — kept, not redesigned; only extended to cover the structural tokens using the same "convert brand hex → HSL, adjust lightness by a fixed offset" technique already established there.
- **Test scenarios:**
  - Covers AE5. `deriveThemeTokens(HALLS_HEAD_BRAND, "dark")` matches the literal values currently hardcoded in `index.css`'s pre-change `:root`/`.dark` blocks — exactly for the 9 tokens already runtime-derived by Phase 2/3's `applyBrandTheme`, within ≤2 on any HSL component for the rest (a table-driven test asserting each token with the appropriate tolerance).
  - Covers AE4. `deriveThemeTokens(DEFAULT_BRAND, "light")` and `(DEFAULT_BRAND, "dark")` never produce any of Halls Head's literal values.
  - `deriveThemeTokens` is deterministic and total (never throws / never returns `undefined` for any token) across a handful of edge-case brands: all-black primary, all-white primary, missing `tertiaryColour` (falls back to `DEFAULT_BRAND.tertiaryColour`, matching existing fallback convention).
- **Verification:** New `theme-tokens.test.ts`, run under `pnpm --filter @workspace/cricket-club run test`.

### U2. `index.css` — neutral static fallback, genuinely distinct `.dark`

- **Goal:** The pre-JS/pre-brand-resolution paint state is tenant-neutral (not Halls Head's literals) and `.dark` is a real, different palette from `:root`.
- **Requirements:** R13, R14
- **Dependencies:** U1
- **Files:** `artifacts/cricket-club/src/index.css` — replace the `:root` block's colour tokens with `deriveThemeTokens(DEFAULT_BRAND, "light")`'s output as static literals, and `.dark`'s with `deriveThemeTokens(DEFAULT_BRAND, "dark")`'s output. Non-colour tokens (`--radius`, `--app-font-*`, `--juniors-accent`'s default) are unchanged — this unit touches only the HSL colour custom properties.
- **Approach:** Generate the literals by running U1's function once (a throwaway `node`/`tsx` one-liner against the built module, or a temporary console.log in a test) and paste the output in — documented inline as "generated from `deriveThemeTokens(DEFAULT_BRAND, mode)`, regenerate if that function changes" so the static CSS and the runtime function can't silently drift without a visible diff.
- **Test scenarios:** Covers AE4 (static-paint case, before any JS runs). A snapshot/string-match test confirms `index.css`'s literals equal `deriveThemeTokens(DEFAULT_BRAND, ...)`'s current output (fails loudly if someone edits one without the other).
- **Verification:** Visual — load the site with JS disabled or throttled/blocked network (brand request never resolves) and confirm a plausible neutral-slate look, not a blank/broken page, and not Halls Head's colours.

### U3. `applyBrandTheme` takes a mode; covers all structural tokens

- **Goal:** Runtime brand application sets the *full* token set (not just the 11 accent tokens) for the *current* mode, and re-runs when either brand or mode changes.
- **Requirements:** R13, R14
- **Dependencies:** U1
- **Files:** `artifacts/cricket-club/src/lib/brand-context.tsx` — `applyBrandTheme(brand: ClubBrand, mode: ThemeMode)` now calls `deriveThemeTokens(brand, mode)` and sets every returned property via `root.style.setProperty`, replacing the current 11-token hand-written block (the `--juniors-accent`/`--app-bg-image`/favicon/title logic below it is unchanged — those aren't part of the light/dark token system). `BrandProvider`'s effect dependency array gains the resolved mode (from U4's `useThemeMode()`) so a toggle click re-applies brand tokens for the new mode, not just flips the static CSS class.
- **Approach:** Mechanical — swap the hand-written property list for U1's derived map; the existing per-tenant title/favicon/background-image/juniors-accent logic is untouched.
- **Test scenarios:** Covers AE3, AE5. Rendering `BrandProvider` with a mocked brand + mode and reading `document.documentElement.style` confirms the full token set is present and mode-appropriate (extends the existing `tenant-brand.test.ts`-adjacent test style, or a new light-weight DOM test using the project's existing jsdom test setup).
- **Verification:** `pnpm --filter @workspace/cricket-club run test`.

### U4. `ThemeProvider` / `useThemeMode()` — toggle, OS-detection, persistence, anti-flash

- **Goal:** A working light/dark toggle with OS-preference detection as the default and no flash-of-wrong-theme on load.
- **Requirements:** R13
- **Dependencies:** U3 (so toggling actually re-derives brand tokens, not just the class)
- **Files:**
  - `artifacts/cricket-club/index.html` — a small synchronous inline `<script>` in `<head>`, before any other script, reading `localStorage["ovation-theme"]` (fallback: `matchMedia("(prefers-color-scheme: dark)")`) and setting `document.documentElement.classList` accordingly, so first paint is already correct.
  - New `artifacts/cricket-club/src/lib/theme-context.tsx` — `ThemeProvider`, `useThemeMode()` returning `{ mode: "light" | "dark", setMode, toggle }`; on mount, reconciles with what the inline script already set (avoids a double-flip); listens to `matchMedia`'s `change` event to live-update when the *stored* preference is `"system"` (an explicit override stops listening); persists explicit choices to the same `localStorage` key the inline script reads.
  - `artifacts/cricket-club/src/App.tsx` (or wherever `BrandProvider` is currently mounted) — wrap with `ThemeProvider` above `BrandProvider` so brand-theme application can read the resolved mode.
- **Approach:** Standard three-state model (`"light" | "dark" | "system"` stored; resolved to a concrete `"light" | "dark"` for rendering) — the well-established pattern (same shape as `next-themes`), reimplemented locally rather than adding a new dependency, since the app doesn't currently depend on `next-themes` and the surface needed here is small.
- **Test scenarios:**
  - Covers AE1. With no stored preference and `matchMedia` mocked to report dark, `useThemeMode()` resolves to `"dark"` on first render.
  - Covers AE2. After `setMode("light")`, a simulated reload (fresh provider mount) with the same `localStorage` still resolves to `"light"`, regardless of `matchMedia`.
- **Verification:** New `theme-context.test.tsx`; manual browser check (already part of this session's established Playwright QA pattern) confirming no visible flash when reloading in dark mode.

### U5. Theme toggle button in the header

- **Goal:** A visible, working control next to the existing `HelpButton`.
- **Requirements:** R13
- **Dependencies:** U4
- **Files:** `artifacts/cricket-club/src/components/layout.tsx` — new `ThemeToggleButton` component (mirrors `HelpButton`'s pill styling/pattern exactly), calling `useThemeMode().toggle`, with a `Sun`/`Moon` icon (`lucide-react`, already a project dependency) swapped based on resolved mode; rendered next to `HelpButton` at both existing call sites (desktop nav ~line 177, mobile ~line 183).
- **Approach:** Copy `HelpButton`'s exact className/structure so the new control looks native to the header, not bolted on.
- **Test scenarios:** Manual — click toggles the visible theme and the icon swaps; keyboard-accessible (button element, same as `HelpButton`).
- **Verification:** Browser QA screenshot (light + dark) attached to the PR.

### U6. Remaining literal-text/colour leaks outside card studio

- **Goal:** No literal "Halls Head" text or hardcoded non-brand colour remains in the base site UI.
- **Requirements:** R14
- **Dependencies:** none (independent of U1–U5, can land in the same commit)
- **Files:**
  - `artifacts/cricket-club/src/pages/premierships.tsx` (~line 180) and `artifacts/cricket-club/src/pages/juniors-premierships.tsx` (~line 201) — replace the literal `HALLS HEAD CRICKET CLUB` heading with `brand.name.toUpperCase()` (both pages already call `useBrand()` for the logo `alt` text right next to it, so `brand` is already in scope).
  - `artifacts/cricket-club/src/components/trading-card/card-pieces.tsx:265` and `artifacts/cricket-club/src/components/trading-card/card-faces.tsx:238` — remove the literal `Est. 1991` text (matches the Phase 2 decision for the canvas renderer: no `ClubBrand` field models a founding year, so this is dropped rather than fabricated; flagged as the same deferred-not-fabricated call already made once this session, now applied consistently to the DOM trading-card path that the canvas-only sweep missed).
  - `artifacts/cricket-club/src/components/grade-badge.tsx` — `const GOLD = "#F2B544"` (used for both the diamond-outline PNG's `drop-shadow` stroke-boost filter and the grade-label text colour) becomes brand-derived (`var(--accent)` via a CSS class approach, or read `getComputedStyle` — prefer the CSS-variable route since it's runtime-reactive to brand changes with no extra JS). The decorative diamond/ribbon outline artwork itself (`@assets/HHCC_Icon_Gold_...png`, visually confirmed to contain no club-specific text/crest — just a generic gold-outline shape) is kept as-is; recolouring it via a CSS filter rather than fixed hex is the in-scope fix, replacing the asset with new artwork is not (no new-art-generation capability available; noted in Scope Boundaries).
- **Approach:** Mechanical text/colour-source swaps, same pattern as every brand-leak fix in Phases 2 and 4.
- **Test scenarios:** Covers AE6. Extend `artifacts/cricket-club/src/__tests__/brand-leaks.test.tsx` (or a sibling test) asserting the Premierships pages and trading-card render with a non-Halls-Head brand contain no "Halls Head"/"HALLS HEAD CRICKET CLUB" text and no "Est. 1991"/"1991" text.
- **Verification:** `pnpm --filter @workspace/cricket-club run test`; manual page load of Premierships + a trading card for a non-Halls-Head tenant.

---

## Verification Contract

- Typecheck: `pnpm run typecheck` (full monorepo).
- Tests: `pnpm --filter @workspace/cricket-club run test` (all new + existing suites).
- Manual/browser QA (same local Postgres + api-server + cricket-club dev-server + Playwright pattern used in Phases 3–4): screenshot Halls Head in dark mode (must match today's look) and light mode (new), screenshot a second/neutral-brand tenant in both modes, screenshot the Premierships page and a trading card for a non-Halls-Head tenant, confirm the toggle works and persists across reload, confirm no visible flash-of-wrong-theme on a hard reload in dark mode.
- Screenshots attached to the PR description — this phase is visual, so the PR itself (not just green tests) is the review artifact for the palette judgment calls flagged in Outstanding Questions.

## Definition of Done

- Origin R13–R14 satisfied: real distinct light/dark palettes, a working persisted toggle, OS-preference detection with no flash, and a genuinely tenant-neutral default (no computed token matches Halls Head's literals for a brand-less tenant).
- Halls Head's dark-mode rendering is imperceptibly close to (exact for the already-runtime-derived tokens, ≤2 HSL-component tolerance for the rest) today's pre-change look (AE5, the hard stop condition).
- The three additional literal leaks (Premierships banner, trading-card "Est. 1991", grade-badge gold) are fixed.
- Full test suite green; typecheck clean; PR includes before/after screenshots for the palette decisions.

## Outstanding Questions

- **Light-mode saturation/tint level is a judgment call, not a settled spec.** This plan caps structural-surface saturation low (≤8–10%) so light mode reads as a subtle brand tint rather than a fully-saturated brand-coloured background. An alternative (stronger brand tint in light mode, closer to how dark mode uses the brand hue more fully) was considered and set aside as more likely to look harsh across arbitrary club colours — flagging this explicitly so Ash can react to the actual rendered screenshots in the PR rather than the description alone, and request a different tint strength if the shipped result doesn't read right.
- **Grade-badge artwork stays the existing generic gold-outline PNG, only recoloured.** Commissioning genuinely new per-tenant crest artwork is out of scope (no art-generation capability in this pass); flagged in case Ash wants that tracked as separate future work rather than considered "done" by this phase.

## Scope Boundaries

**Deferred to Follow-Up Work**

- Per-tenant OG/Twitter meta tag injection (R5/index.html templating) — already flagged as deferred in Phase 2 for topology reasons (static hosting, no SSR); unrelated to this phase's token/mode work and not revisited here.
- New per-tenant crest/badge artwork generation — see Outstanding Questions above.
- A "high-contrast" or third theme mode beyond light/dark — not requested by R13's wording ("light and dark mode"), not built.
