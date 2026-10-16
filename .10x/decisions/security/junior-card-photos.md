# security — junior-card-photos

See `.10x/reviews/2026-10-16-junior-card-photos-review.md` (QA and Security) and `decisions/sde/junior-card-photos.md`.

- Threat model: a withdrawn consent still visible (mitigated by request-time gating + no-store + in-request withdraw); raw object URL leaking (admin-only prefix); a senior photo on a junior card (marker only the junior engines write). No blocking findings.
