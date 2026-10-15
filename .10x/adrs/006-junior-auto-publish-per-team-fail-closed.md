# ADR-006: Junior auto-publishing is the per-team `auto` mode, failing closed, reset at release

**Status:** Accepted
**Date:** 2026-10-15
**Feature:** social-auto-queue-criteria
**Author:** 10x-Team (Architect + Staff Engineer + Security Engineer)

## Context

Today junior cards never auto-publish: `posting-slots.ts` and `auto-publish.ts` exclude any draft with `sourceMatchIsJunior` or `cardInput.junior`. Separately, `junior_sync_settings.team_publishing` stores a per-team `auto` / `approval` mode that only governs promotion to Ready. The owner wants junior cards (and combined junior+senior carousels) to be able to publish on their own as a club opt-in, off by default (R15), with junior privacy rules always applied (R16). Review found the existing helper `juniorDraftMayAutoPost` returns true for any junior draft it cannot classify, that new junior Big Moments and combined carousels would carry no junior marker, and that privacy is applied only at draft time.

## Decision

1. **One switch, per team.** The opt-in is the existing per-team `auto` mode; no new club-wide flag. `auto` now means "may publish to Facebook and Instagram at its slot".
2. **Fail closed.** `juniorDraftMayAutoPublish(draft)`: senior cards pass; any draft with a junior marker passes only when `cardInput.juniorTeams` is non-empty and every entry resolves to `auto`. Missing list, unresolvable team or any `approval` team → wait. The SQL twin `juniorAutoPostClear` is changed to match. Loader-era junior summaries and junior round sets (no team list) therefore never auto-publish.
3. **Markers are mandatory.** Every junior individual card and every carousel with a junior slide sets `cardInput.junior = true` and `juniorTeams: [{ ageGroup, teamName }]` from its slides.
4. **Privacy re-check at dispatch.** Before a junior card or combined carousel is scheduled for publishing, each junior player's private/override status is re-resolved; on change the card is re-rendered with current naming where possible, otherwise held and the club notified.
5. **Reset at release.** The release SQL sets every team to `approval`; the runbook lists teams that were `auto` so the club can be told the setting's meaning changed.

## Alternatives Considered

| Alternative                                         | Pros                           | Cons                                                                                      | Why Not                              |
| --------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| New club-wide "junior auto-publish" flag            | Matches the brainstorm wording | Second switch beside the per-team one; a club with mixed teams can't express it           | Per-team already exists and is finer |
| Keep the blanket exclusion (no junior auto-publish) | Safest                         | Owner chose to allow it                                                                   | Declined by owner                    |
| Carry existing `auto` settings forward              | No disruption                  | Teams set to `auto` for promotion would start publishing children's names without consent | Security P1                          |
| Trust draft-time privacy                            | No extra lookups               | A child marked private after drafting would be published by name                          | R16 "however it is published"        |

## Consequences

### Positive

- No junior content reaches Meta without an explicit per-team choice made after the meaning changed.
- Combined carousels are safe by construction: unmarked or unlisted means wait.

### Negative

- Clubs that had `auto` teams must re-enable them; one extra lookup per junior dispatch.
- Combined carousels publish only when _every_ junior team on them is `auto` — a single `approval` team holds the whole carousel (owner accepted via the brainstorm's "whole set waits" discussion).

### Risks

- A team renamed in PlayHQ between drafting and dispatch may not resolve → the card waits (safe). Noted in the runbook.

## Dependencies

- Junior naming/privacy helpers (`junior-names.ts`), `junior-publishing.ts`, the posting calendar dispatch (`posting-slots.ts`).
