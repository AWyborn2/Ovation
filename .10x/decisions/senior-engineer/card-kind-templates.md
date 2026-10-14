# Senior Engineer — card-kind-templates

## Phase 3 implementation approach (2026-10-07)

Per-unit detail lives in the plan (`docs/plans/2026-10-07-002-feat-card-kind-templates-plan.md`, U1–U10). Notes here cover the tricky parts and review checkpoints.

**Tricky parts**

- **Byte-identity (T1.4).** Snapshot-render a representative set of legacy pack drafts before touching `renderFreeLayers`; every new branch must be guarded by the presence of a new layer kind, `sizes`, or a `{{` token.
- **Shared types (T1.1).** `lib/scorecard` must not import web code. The web `FreeLayer` type becomes a re-export or extension of the shared type; avoid two sources of truth.
- **Rows layer (T1.6).** Cells are positioned by fraction inside each row; reuse `expandRepeats`' variant handling semantics rather than its HTML string approach.
- **Fit loop (T2.1–T2.2).** Pure function: `(elements, overflows, floor=0.6, step) → {sizes, warnings}`. DOM measuring lives in a thin adapter used by the harness and editor only.
- **Warnings render (T7.2).** Renders are serialised; render only drafts marked pending; store `{ [size]: Warning[] }`; never clear sizes not re-rendered. Use the injectable `setStillRenderer` in tests.
- **Gate placement (T7.4–T7.5).** Exclusion must be in the SQL candidate queries (auto-promotion and auto-publish), not post-filtered, so counts and logs stay correct.
- **Apply transaction (T5.5).** `SELECT … FOR UPDATE` on candidate drafts, revision snapshot first, re-check `status <> 'posted'`, update document + `designEditedAt = null` + warnings pending; never touch `editedAt` or caption.
- **Switch (T5.2).** One function `kindTemplatesEnabled(tenantId)`; every touched pipeline function branches once at the top; tests cover both branches.
- **Editor template mode (T8.1).** Wrap the existing editor shell with a different load/save adapter rather than forking the page; history resets on save.

**Review checkpoints**

- After Milestone A: legacy render snapshots unchanged; harness returns warnings for a known overflow.
- After Milestone B: migration applied twice locally; route tests include tenant isolation; switch-off returns "not enabled".
- After Milestone C: no unrendered or warned draft appears in promotion or auto-publish candidates.
- After Milestone D: editor works with pointer and touch; apply dialog flows covered.
