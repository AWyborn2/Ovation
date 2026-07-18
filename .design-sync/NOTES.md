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

## Preview-authoring techniques (folded from wave 1 — all 63 components graded good)

- Radix static-open tricks: DropdownMenu `open modal={false}`; Menubar controlled `value` matching a
  MenubarMenu value; ContextMenu has NO open prop — dispatch a real `MouseEvent("contextmenu")` from a
  mount `useEffect` (see previews/ContextMenu.tsx `useAutoContextMenu`); Tooltip needs TooltipProvider +
  controlled `open`; vaul Drawer renders open with `open shouldScaleBackground={false}`; cmdk Command
  uses controlled value + `shouldFilter={false}` (garbage value to show CommandEmpty); Select previews
  use closed trigger + defaultValue (open SelectContent would escape the cell).
- ScrollArea (and any Radix scroll component) needs `type="always"` or the scrollbar is invisible in
  static capture. Separator vertical needs explicit container height.
- Portaled/fixed overlay content stays inside its capture cell — no cardMode overrides were needed for
  any wave-1 component. Give modal previews a wrapper div with minHeight ~380-460px.
- Flex wrappers around trigger buttons must set `alignItems` explicitly (default stretch makes buttons
  hundreds of px tall — bit Popover once).
- `defaultChecked`/`defaultPressed`/`defaultValue`/`defaultOpen` all render on-states statically.
- AvatarImage: base64 SVG data-URI loads in headless; broken relative src reliably shows AvatarFallback.
- InputOTP needs `maxLength`, explicit InputOTPGroup/InputOTPSlot `index` children, and `defaultValue`
  to show digits. Label `peer-disabled:` styling needs the input BEFORE the label with className="peer".
- Leaf subcomponents are graded as full parent compositions (only true render); grade JSON keys must
  equal export names exactly.
- Preview content convention: neutral fictional clubs (Seacrest CC, Dunes CC, Mandurah) — never add
  Halls Head literals to the sync tree.
- Known component-level defect (app-side, not preview): ui/slider.tsx hardcodes ONE Thumb — range
  values render fill correctly but only the first thumb shows. Worth an app fix if range sliders needed.

## Wave-2 findings (folded)

- **react-query wall (structural)**: components calling generated API hooks (ShareButton →
  useGetSocialSettings, SearchResultCard → useGetPlayer, PlayerStatsModal, DigitalScorecard's
  always-mounted modal) resolve @tanstack/react-query INSIDE the DS bundle — a preview-side
  QueryClientProvider is a different module instance and can never satisfy them ("No QueryClient
  set"). These stay floor cards by construction: PromotionCard, DebutCard, SearchResultCard,
  PlayerStatsModal; DigitalScorecard previews only its abandoned-match state. Possible future fix:
  app-side `ds-query-provider` component exported from src/components, or harness vendoring of
  react-query like vendorReact.
- Capture server doesn't serve the app's public/ — DEFAULT_BRAND's /ovation-logo.svg 404s in
  previews (tiny broken img in trading-card headers; cosmetic, graded with nit).
- Trading-card full faces are 384x800 — previews wrap in ScaledCard scale={0.75} to fit capture.
- Tall honour boards budget ~560px of cell height; `.hb` + `hb-compact` fits a full XI.
- lucide-react and wouter Link render statically in previews without extra setup.
- SidebarMenuSkeleton uses Math.random() widths → its render hash churns by design; expect
  [SPOT_CHECK]/hash noise on that component across rebuilds.
- **App-side defects surfaced (not fixed by design-sync — for the app backlog):**
  - ui/slider.tsx hardcodes one Thumb (range sliders show a single thumb).
  - trading-card/constants.ts fmt() renders debut year as "2,014".
  - card-faces.tsx CardBack clips/overlaps its footer with a rich dataset.
  - public/ovation-logo.svg is invalid XML ("--" inside a comment) — fails as <img> in the real app.
  - src/index.css defines NO --sidebar-* tokens, so bg-sidebar* utilities don't exist in compiled
    CSS; sidebar renders on structure + standard tokens only.

## Wave-3 findings (folded)

- Floor-carded on the react-query wall (confirmed at source; unfixable preview-side): WinnerForm
  (PlayerTypeahead's useListPlayers runs before its early return), CardLayoutEditor, TemplatesCard,
  WelcomeGuide, AdminShell, CaptainShell, PlatformAdminShell, AdminLayout, Layout, EntitlementGate
  (its ALL_ON default applies only after useGetTenantPlan runs — trap). Triage rule: read CHILD
  component imports too — the wall can live one level down.
- PhotoReposition: component clamps maxHeight:220 which fights CSS aspect-ratio — keep preview
  wrappers ≤216px wide. SponsorStrip logo row is overflow:hidden (3 logos fit).

## Final state (18 Jul 2026 first sync)

- 366 components imported; 166 authored previews all graded good; 197 floor cards (mostly radix
  leaf/portal pieces covered by family cards, plus the react-query-walled app components above);
  render check 366/366 clean; _ds_sync.json anchor uploaded — future syncs skip unchanged work.
- Expected validate warns on re-sync: [TOKENS_MISSING] 8 runtime vars, [FONT_REMOTE] Google Fonts,
  floor-card notices. Anything else is new.
