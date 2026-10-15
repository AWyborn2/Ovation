# SRE — social-auto-queue-criteria

## Reliability notes (2026-10-15)

- **What to watch the first weekend:** the PlayHQ sync run time on match-day / day-after plans (balls add one request per played match); `select count(*) from playhq.balls` growing after each run; `central.match_feats` rows by kind after projection; the draft queue size per club (expected ~5–8 cards a round on the default table).
- **Failure modes and behaviour:**
  - Balls missing for a match → no hat-trick for that match; five catches still come from fielding rows; nothing errors. The catch-up plan refetches.
  - Projector cannot write `central.match_feats` (SQL not applied) → the projection run fails for that match and logs; apply the projector SQL and re-run (idempotent).
  - Junior team settings missing or a team unknown → junior cards never auto-publish (fail closed); admins see them in the queue as usual.
  - A club with a stored version 1 plan → the default table applies; the club re-saves its choices in the Posting Plan tab.
- **Runbooks:** `docs/runbooks/meta-publishing.md` §3b (release and checks). Backfill: `scripts/src/playhq-project-central.ts --since <date>` is safe to re-run.
- **Alerts:** none added; the existing sync watchdog (overdue plans) and publishing failure counters cover the new paths.
