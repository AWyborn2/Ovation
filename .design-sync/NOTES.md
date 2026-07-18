# Design-sync notes — Ovation (@workspace/cricket-club)

- App monorepo, not a library: no dist/.d.ts, converter runs in synth-entry mode from
  `src/components` (`srcDir` in config). The package never self-installs, so the build needs a
  self-symlink: `mkdir -p artifacts/cricket-club/node_modules/@workspace && ln -sfn ../..
  artifacts/cricket-club/node_modules/@workspace/cricket-club` (gitignored; recreate per clone).
- `vite.config.ts` hard-requires `PORT` and `BASE_PATH` env vars — `buildCmd` in config sets both.
  Compiled CSS is hash-named under `dist/public/assets/`; buildCmd concatenates index + honour-boards
  CSS to the stable `dist/ds-styles.css` that `cssEntry` points at. Re-run buildCmd before any re-sync.
- `src/index.css` is a Tailwind v4 SOURCE file (`@import "tailwindcss"`, `@plugin`) — never usable
  as cssEntry; only the vite-compiled output works.
- File/dir name collisions (`share-card-modal.tsx` + `share-card-modal/`, `trading-card.tsx` +
  `trading-card/`) break the converter's `@/*` alias plugin (bare-dir hit wins over `.tsx`).
  Fixed via `tsconfig.design-sync.json` with exact non-wildcard path keys; `cfg.tsconfig` points at it.
- 7 export names are defined by 2+ modules (CardHeader, CardFooter, CardFront, CardBack,
  CardPhaseFrame, Spinner, Toaster) — ambiguous star re-exports get dropped from the flat namespace.
  Fixed by the `source-kit.mjs` fork (see `cfg.libOverrides`): synth entry appends explicit named
  re-exports for `componentSrcMap` string pins (canonical: ui/card, ui/spinner, ui/toaster,
  trading-card/card-faces). The fork also merges pins with src-derived discovery so pins don't
  short-circuit the component list.
- Playwright: cached chromium build 1194 → playwright@1.56.0 (installed in .ds-sync); run validate
  with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` in this environment.
- Fonts are served from Google Fonts via remote @import (Bricolage Grotesque, IBM Plex Sans/Mono)
  — `[FONT_REMOTE]` is expected, nothing to ship.

## Known render warns (triaged)

- `[TOKENS_MISSING]` 8 vars: `--radix-navigation-menu-viewport-*` and `--tw` are runtime-set;
  `--badge-outline`/`--button-outline`/`--sidebar-*`/`--spacing-4` referenced by compiled CSS but
  set at runtime by the app's BrandProvider theme derivation — check a rendered preview before chasing.
- `[RENDER_ERRORS]` AwardForm: floor-attempt crashes on `undefined.key` (data-coupled admin form)
  — needs an authored preview or skip.

## Re-sync risks

- `dist/ds-styles.css` goes stale whenever app styles change — always re-run `buildCmd` first.
- The chromium/playwright pairing is environment-specific (build 1194 ↔ 1.56.0); other machines
  must re-derive it.
- Scope decisions (user, 18 Jul 2026): include everything possible (1C); author previews for
  everything sensible (2B) — subcomponents composed inside parent previews, not solo.
- Main CI was red independently of this branch (API test failures in brand-colour pipeline,
  pre-existing since ~15 Jul) — do not chase those from this branch.
