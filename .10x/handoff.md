# Handoff

**From:** SDE (Phase 4 complete — Milestones A–D)
**To:** QA + Security (Phase 5), then DevOps + SRE (Phase 6)
**Feature:** card-kind-templates

## Context

- Scope: `docs/plans/2026-10-07-002-feat-card-kind-templates-plan.md`. Built log, deviations and browser checks: `decisions/sde/card-kind-templates.md`. Schema: `decisions/dba/card-kind-templates.md`.
- Everything is behind `KIND_TEMPLATES` (unset = off; "all" or tenant ids). Off means today's Studio, queue, editor and pipeline unchanged.
- Starter designs are not authored yet (design track D1–D3); kinds fall back to a labelled placeholder. The switch must stay off for real clubs until the starter contract test has no skips.
- Deviations to review: publish-time abort only for automatic posts; layout checks run in the hourly sweep; `TemplatesCard` kept (it is the uploaded-background feature).

## Next steps

1. Phase 5: QA (test coverage vs AE1–AE7 and the Verification Contract) and security (tenant isolation of kind templates and drafts, admin-only routes, switch gating, leak guards, stored-XSS surface of template text/fonts/URLs).
2. Phase 6: deploy notes (0035 SQL for Ash, `KIND_TEMPLATES`, render harness requirement for layout checks), monitoring (pending layout checks, aborted auto posts), rollback.
3. Open the PR.
