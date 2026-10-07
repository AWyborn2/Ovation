# ADR-003: Ship dark behind a switch, create templates lazily, gate automation on warnings

**Status:** Accepted
**Date:** 2026-10-07
**Feature:** card-kind-templates
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

Production is republished from `main` by hand for unrelated work, and schema changes are applied by hand. All 21 kinds × 2 starters must exist before clubs switch over. Clubs currently have per-kind pack choices, four of which retire (R19). Text that doesn't fit must never post unattended (R14). Today drafts are only rendered at publish time, in one size, so warnings computed at render would arrive too late.

## Decision

1. **Switch.** A kind-templates switch, off by default (pattern: `shouldReadCentral` in `api-server/src/lib/tenant.ts`), gates draft creation, lazy creation, the API and the new Studio surfaces. Turning it on is a release step after the starter contract passes with no skips.
2. **Lazy creation.** A club's template for a kind is created the first time it is needed, by insert-or-ignore from the starter its current pack maps to (Club Kit, Bold Type, Sunset → Club Kit; Broadcast Dark, Gold Foil, Neon Night → Broadcast). A template replacing a retired pack records it and shows a notice until dismissed. No bulk data migration.
3. **Warnings gate.** Templated drafts are rendered at every enabled size when created, refreshed or applied, before they are eligible for promotion. Warnings are stored per size. Unrendered or warned drafts are ineligible for auto-promotion and auto-publish; the publish worker aborts a publication whose own render warns. Admins can still approve by hand.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Ship without a switch, merge only when starters complete | No flag code | A long-lived branch drifting from `main` for weeks; any partial merge goes live on republish | Too risky with hand-run deploys |
| Bulk SQL migration creating every club's templates | Explicit, one-off | Must be run by hand in production; needs final starters at migration time; harder to roll back | Lazy creation is idempotent and self-healing |
| Per-kind switch | Earlier value | Owner chose all kinds together | Declined by owner |
| Compute warnings only at publish time | No extra renders | Flagged cards are already scheduled; auto-promotion can't see them | Breaks R14's intent |

## Consequences

### Positive
- Merging and republishing are safe at every step; rollback is turning the switch off.
- No production data migration beyond additive columns and an index.
- No cut-off card reaches automation.

### Negative
- Extra headless renders per draft (every enabled size) during the hourly sweep.
- Two code paths (pack and template) coexist until the follow-up removes retired packs.

### Risks
- Sweep slows for clubs with many drafts → renders are serialised and only for pending drafts; measure after launch (SRE).
- Google Fonts unreachable from the harness → font-failure warning blocks automation for affected drafts rather than posting wrong fonts.

## Dependencies
- Depends on ADR-001 and ADR-002.
- Constrains release: the switch flip is a DevOps step with SRE monitoring of render time and warning rates.
