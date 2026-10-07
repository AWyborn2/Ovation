# Handoff

**From:** SDE (Phase 4, Milestones A–C done)
**To:** SDE (Phase 4, Milestone D: U8 template editor, U9 Studio surfaces)
**Feature:** card-kind-templates

## Context

- Source of truth: `docs/plans/2026-10-07-002-feat-card-kind-templates-plan.md` (R1–R23, AE1–AE7, KTD1–KTD20, U1–U10). Built log and deviations: `decisions/sde/card-kind-templates.md`.
- Server side is complete behind `KIND_TEMPLATES` (off unless "all" or tenant ids): kind-template API, draft copy on create, templated rendering + slide split, layout checks in the hourly sweep, automation gate, publish-time check (auto posts only), revisions restore the design base.
- `SocialDraft` now carries `templateVersion`, `designEditedAt`, `layoutWarnings` (per size) and `layoutCheckPending` — U9's queue "Needs a look" filter reads these.
- Migration 0035 is the only schema change; Ash applies it by hand in production before the deploy that ships this (idempotent).
- Related, uncommitted, in another worktree (`.claude/worktrees/meta-platforms-scheduled-posts-e3d348`): the Posting Plan requirements and the Social Studio ideation doc.

## Next steps

1. U8: template editor mode at `/admin/social/templates/:kind` (desktop + tablet), apply dialog sending `expectedDrafts`, font picker over the catalogue, field tokens, rows panel, "Export as starter". Browser-verify here (local Vite needs a local config + win32 lightningcss / tailwind-oxide binaries).
2. T6.2 then U9: Studio Templates section, retired-pack banner, remove the canvas builder and Save as template, queue "Needs a look" + "Mark ready anyway". Colour modes and uploaded-background templates stay.
3. Then Phase 5 (QA + security) and Phase 6 (DevOps + SRE).

## Local test env

Postgres 16 on port 55433 (scratch data dir). API: `DATABASE_URL` and `CENTRAL_DATABASE_URL` = `postgresql://postgres@localhost:55433/ovation_test`, `SESSION_SECRET`, `CI_SKIP_DATA_TESTS=true`, `NODE_ENV=test`. Web: `NODE_ENV=test` (otherwise suites fail with "No such built-in module: node:").
