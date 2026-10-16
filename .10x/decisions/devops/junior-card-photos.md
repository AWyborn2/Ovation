# devops — junior-card-photos

See `.10x/reviews/2026-10-16-junior-card-photos-review.md` (QA and Security) and `decisions/sde/junior-card-photos.md`.

- Release: one PR to `main`, merged when CI is green and `CLEAN`. Ash applies `lib/db/migrations/0045_junior_card_photos.sql` in the Production SQL runner (statement by statement) **before** republishing; runbook §3c has the checks. Rollback: revert and republish — the new columns/table are unread by the old code and can stay.
