# SDE — card-kind-templates

## Built so far [CONFIRMED 2026-10-07]

Nothing for this feature yet. Relevant existing code: Studio editor (`components/studio-editor/*`, `pages/admin-studio-editor.tsx`), free-layer renderer (`lib/pack-render/adjustments.ts`), element registry, save-as-template (`routes/social-drafts.ts`), pack-per-kind selection (`lib/use-pack-selection.tsx`), legacy canvas template builder (`components/card-template-builder.tsx`).

## Built (2026-10-07)

- **U1 (T1.1–T1.6).** `lib/scorecard/src/kind-templates/document.ts` (sizes, per-size presence, proportional add-to-sizes keeping pixel aspect, rows capacity; exported as `@workspace/scorecard/kind-templates`). Renderer (`pack-render/adjustments.ts`, `render.ts`): `{{field}}` tokens, empty-element rule, letter spacing, per-size presence, `photo` and `rows` layers; blank base passes photo (null for juniors) and row variants. Layers drawer icons for the new kinds.
- **Deviation:** row variants travel as a parallel `rowVariants` map in the render context instead of changing the `rows` shape library elements already read.
- **Verified:** web typecheck 0 errors; web suite 135 files / 1,495 tests green; scorecard kind-templates 15 tests green.
- **Local env note:** this worktree needed `pnpm install --frozen-lockfile` plus win32 rollup 4.60.3 and esbuild 0.28.2 binaries in node_modules (not committed).

- **U2 (T2.1–T2.3).** `lib/scorecard/src/kind-templates/warnings.ts` (LayoutWarning, per-size DraftLayoutWarnings, merge/has/cover helpers, MIN_TEXT_FIT 0.6). `pack-render/layer-fit.ts`: pure step-down loop + DOM adapter; only token text and row cells carry `data-fit` (legacy bytes unchanged); records `data-fit-scale`. Harness returns `warnings` with each still; server `renderCardStill` passes them through. Real-browser smoke not run locally (no Chromium) — covered at Phase 5.
- **U3 (T3.1–T3.3).** Static `KIND_FIELDS` catalogue in `lib/scorecard` (21 kinds; Club Kit for the 3 Club-Kit-only kinds) + web parity test re-deriving it from the registry; `samples.ts` preview and stress samples; blank-base `packTextFields` reads the catalogue.
- **U4 (T4.1–T4.2).** `scripts/src/build-google-fonts-catalogue.ts` → committed `google-fonts-catalogue.json` (1,728 open-source, non-brand families; prettier-ignored); `lib/document-fonts.ts` loads exactly the faces a document uses, snaps weights, detects empty loads as failures; harness emits `font` warnings.
- **Deviation:** font loader lives in a new `lib/document-fonts.ts` rather than inside `card-fonts.ts`, so the curated loader is untouched.
