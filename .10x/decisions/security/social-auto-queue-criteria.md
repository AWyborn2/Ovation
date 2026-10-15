# Security — social-auto-queue-criteria

See `.10x/reviews/2026-10-15-social-auto-queue-criteria-review.md` (Security section).

- Threat model: cross-tenant leakage through the new central table (mitigated by club-filtered reads through `central-queries` and the projector-only write role); junior privacy on auto-published cards (fail-closed per-team gate, withheld players withdrawn, no ids on cards); a stale `auto` meaning something new after release (every team reset to `approval` by the release SQL).
- No new endpoints; one endpoint and one generator kind removed.
- Verdict: no blocking findings.
