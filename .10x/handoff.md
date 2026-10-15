# Handoff

**From:** Engineering Manager + Senior Engineer (Phase 3 complete)
**To:** SDE (Phase 4)
**Feature:** social-auto-queue-criteria

## Context

- Scope and units: `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md` (U1–U10). Review decisions: `.10x/specs/2026-10-15-social-auto-queue-criteria-design.md`. ADRs 004–006.
- Tasks and order: `decisions/engineering-manager/social-auto-queue-criteria.md`; approach notes: `decisions/senior-engineer/social-auto-queue-criteria.md`.
- Branch `claude/social-auto-queue-criteria` from current `main` (Posting Plan shipped; 0042 is the latest migration; no app migration in this feature).
- Local verification: embedded Postgres on 55433; api-server and cricket-club vitest; typecheck both; orval codegen; drizzle drift via temp relative config; Prettier 3.9.6.

## Goal

Implement to the plan's Definition of Done and open a PR that is fully mergeable to `main` (CI green, CLEAN). Production SQL steps are Ash's (runbook).

## Next steps

Milestone A first (T1.1 → T2.4), then B, C, D, E. Write `decisions/sde/social-auto-queue-criteria.md` as units land; update status.md task progress.

## Parked

- card-kind-templates: Delivery in progress (design track D1–D3, release R1–R4) — unchanged by this feature.
- Next spec: Record / Team of the week / Premiership engines (discovery in `decisions/architect/team-of-the-week-engines.md`).
