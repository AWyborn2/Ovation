# SDE — card-kind-templates

## Built so far [CONFIRMED 2026-10-07]

Nothing for this feature yet. Relevant existing code: Studio editor (`components/studio-editor/*`, `pages/admin-studio-editor.tsx`), free-layer renderer (`lib/pack-render/adjustments.ts`), element registry, save-as-template (`routes/social-drafts.ts`), pack-per-kind selection (`lib/use-pack-selection.tsx`), legacy canvas template builder (`components/card-template-builder.tsx`).

## Built (2026-10-07)

- **U1 (T1.1–T1.6).** `lib/scorecard/src/kind-templates/document.ts` (sizes, per-size presence, proportional add-to-sizes keeping pixel aspect, rows capacity; exported as `@workspace/scorecard/kind-templates`). Renderer (`pack-render/adjustments.ts`, `render.ts`): `{{field}}` tokens, empty-element rule, letter spacing, per-size presence, `photo` and `rows` layers; blank base passes photo (null for juniors) and row variants. Layers drawer icons for the new kinds.
- **Deviation:** row variants travel as a parallel `rowVariants` map in the render context instead of changing the `rows` shape library elements already read.
- **Verified:** web typecheck 0 errors; web suite 135 files / 1,495 tests green; scorecard kind-templates 15 tests green.
- **Local env note:** this worktree needed `pnpm install --frozen-lockfile` plus win32 rollup 4.60.3 and esbuild 0.28.2 binaries in node_modules (not committed).
