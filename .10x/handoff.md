# Handoff

**From:** Principal Architect
**To:** Staff Engineer / SDE
**Feature:** admin-menu-consolidation

## Context

- Product decision agreed with Ash 2026-10-19 (scope B): `.10x/decisions/product-manager/admin-menu-consolidation.md`.
- Architecture + units: `.10x/decisions/architect/admin-menu-consolidation.md`. PR 1 = U1–U2 (menu moves, Imports hub, no migration). PR 2 = U3–U6 (shirt categories, migration 0046, applied by hand in prod before republish).
- Requirement change: a person may be in several registers per season (allowed, badged, 'Also add to…').
- Original PM priority order: (1) shirt-number category + unified People → Shirt numbers tab (needs migration; juniors stay in `junior_shirt_numbers`), (2) URL redirects, (3) Imports hub, (4) remaining menu moves + tour/test updates.
- Acceptance: see Requirements and Success criteria in the decision file.

## Previous handoff


**From:** DevOps + SRE (Phase 6)
**To:** Ash (release) / next feature
**Feature:** junior-card-photos

## Context

- Plan `docs/plans/2026-10-16-001-feat-junior-card-photos-plan.md` implemented (U1–U7) on `claude/junior-card-photos`; ADR-007 accepted; decisions per role under `decisions/*/junior-card-photos.md`; review `reviews/2026-10-16-junior-card-photos-review.md`.
- Release: apply `lib/db/migrations/0045_junior_card_photos.sql` in the Production SQL runner (statement by statement) BEFORE republishing; runbook §3c. Then upload a junior photo and check Admin → Junior players and one junior card.

## Previous feature

**From:** DevOps + SRE (Phase 6, delivered)
**To:** next feature
**Feature:** social-auto-queue-criteria

## Context

- Plan `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md` implemented end to end (U1–U10) on `claude/social-auto-queue-criteria`. Decisions per role under `decisions/*/social-auto-queue-criteria.md`; review in `reviews/2026-10-15-social-auto-queue-criteria-review.md`; ADRs 004–006.
- PR #361 merged to `main` (7b4d0aee) and released to production on 16 Oct 2026: projector SQL, republish, release SQL (171 retired-kind drafts dismissed) and the feats backfill all run. Watch the first match-day sync for `playhq.balls` rows and `central.match_feats` entries.

## Release

Done (runbook `docs/runbooks/meta-publishing.md` §3b). Lessons recorded there: the Production SQL runner executes one statement at a time, and the feats backfill script takes `--org` / `--season` / `--match` with `--yes`.

## Parked

- card-kind-templates: Delivery in progress (design track D1–D3, release R1–R4) — unchanged.
- Next spec: Record / Team of the week / Premiership engines — discovery in `decisions/architect/team-of-the-week-engines.md` (ToW with admin criteria, grade-weighted points, senior and junior versions). Starts with Phase 0 brainstorming.
- Follow-ups noted by the SDE: "pack's own look" panel slot still fed by `juniors_colour`; trading-card renderer kept for posted cards.
