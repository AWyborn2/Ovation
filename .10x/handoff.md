# Handoff

**From:** Principal Architect
**To:** Staff Engineer / Engineering Manager
**Feature:** selection-hub-decoupling

## Context

- Design: `.10x/decisions/architect/selection-hub-decoupling.md`; ADR-008 (proposed). Requirements: `.10x/decisions/product-manager/selection-hub-decoupling.md`.
- Components touched: `selection-board.ts` (on-demand `ensureRound` + `prepareRoundDrafts`, `weekend` param, read-only past rounds), `selection-drafts.ts` (seed from previous selection, no Yes-only pruning), `availability-grades.ts` `buildMemberMatcher` (participant crosswalk first), new `lib/availability-replies.ts` (shared `writeReply`), new route `PUT /selection/members/:id/status`, `selection-published-players.ts` `publicName()`.
- One migration, 0046 (additive): `availability_responses.source/set_by_*`, `selection_events.round_id`, `squad_member_participants`, `squad_members.show_name_publicly`. Prod is applied by hand before republish.
- Slice order: draft any time + carry-over, then private mapping, then admin status, then public toggle, then round nav UI. Status colours: yellow none/maybe, green yes, red no, plus a non-colour cue.

## Previous handoff

**From:** Product Manager
**To:** Principal Architect
**Feature:** selection-hub-decoupling

## Context

- Requirements, acceptance criteria and priorities: `.10x/decisions/product-manager/selection-hub-decoupling.md` (agreed with Ash 19 Oct 2026).
- Priority order: P0 draft-on-demand plus carry-over of last week's side; P0 private-slot mapping (crosswalk); P0 availability-off as a first-class mode; P0 admin-set (verbal) status; P1 round navigation (previous/next); P1 per-player public-name toggle.
- Root cause to confirm: PlayHQ team lists name withheld players "Private Player", the slot stays unmatched (`memberId` null) and the team sheet drops it.
- Open for the Architect: whether the public-name toggle applies to junior members (default: no); round creation on demand versus the availability schedule; where the crosswalk lives (`player_id_map`-style, tenant-scoped).

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
