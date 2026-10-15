# Handoff

**From:** DevOps + SRE (Phase 6)
**To:** Ash (release) / next feature
**Feature:** social-auto-queue-criteria

## Context

- Plan `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md` implemented end to end (U1–U10) on `claude/social-auto-queue-criteria`. Decisions per role under `decisions/*/social-auto-queue-criteria.md`; review in `reviews/2026-10-15-social-auto-queue-criteria-review.md`; ADRs 004–006.
- PR to `main` opened from this branch; auto-merge once CI is green and `CLEAN`.

## Release steps (Ash, by hand)

Runbook `docs/runbooks/meta-publishing.md` §3b: projector SQL before republishing → list `auto` junior teams → republish → `scripts/sql/auto-queue-release.sql` → feats backfill → check balls after the next match-day sync.

## Parked

- card-kind-templates: Delivery in progress (design track D1–D3, release R1–R4) — unchanged.
- Next spec: Record / Team of the week / Premiership engines — discovery in `decisions/architect/team-of-the-week-engines.md` (ToW with admin criteria, grade-weighted points, senior and junior versions). Starts with Phase 0 brainstorming.
- Follow-ups noted by the SDE: "pack's own look" panel slot still fed by `juniors_colour`; trading-card renderer kept for posted cards.
