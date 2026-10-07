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

- **U5 (T5.1–T5.7).** Schema + migration 0035 (idempotent; verified twice against local Postgres 16; also widens `social_draft_revisions_reason_check` to allow "template" — found by the apply test, would have been a production 500). `KIND_TEMPLATES` switch ("all" or tenant ids; empty entries ignored — bug found by test). Service `lib/kind-templates.ts` + routes `routes/kind-templates.ts` (list/get/save/start/dismiss/apply), OpenAPI + regenerated clients. Kind rows excluded from `/card-templates` list, PATCH and DELETE. `ensure-constraints` covers the new index.
- **Deviation:** GET does not lazily create; the editor starts a template from a starter (POST /start) and the pipeline creates lazily (ensureKindTemplate). Apply locks only unposted drafts; `skipped` = drafts the dialog showed that were posted meanwhile (client sends `expectedDrafts`).
- **T6.1.** Starters are TypeScript data modules (`starters/club-kit.ts`, `starters/broadcast.ts`), not JSON, to avoid tsconfig changes; contract test skips undesigned kinds (126 skips = design checklist); `placeholderDocument` keeps dev/test flows working.
- **Verified:** api suite 187 files / 1,906 tests green on local Postgres (port 55433, scratch data dir); web typecheck clean.

- **U10 (T10.1–T10.2).** `lib/kind-templates/template-lint.test.ts` renders every starter doc (or placeholder) for a non-Halls-Head club on every size with sample + stress data: no sample identity, no unresolved tokens, no junior photo (84 checks). Existing `pack-card-mounts.test.ts` already covers every `<PackCard>` mount, so it was not extended. **Deviation:** the proof contact sheet is an admin page (`/admin/kind-templates/proofs`) rendering every starter × kind × size × variant in the browser instead of a headless PNG script — no Chromium setup needed and the designer reviews it directly. Shared `useKindTemplateData` hook builds the club card data for previews.
- **Not yet browser-verified:** local full-stack preview needs a Vite local config plus win32 lightningcss/tailwind-oxide binaries and a built API; deferred to U8 where interaction must be checked.
