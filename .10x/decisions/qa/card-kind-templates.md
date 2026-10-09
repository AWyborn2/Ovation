# QA — card-kind-templates (2026-10-08)

- Independent QA review mapped AE1–AE7 and U1–U10 scenarios to tests; findings and outcomes in `.10x/reviews/2026-10-08-card-kind-templates-review.md`.
- Final runs after fixes: web suite, API suite (local Postgres 16), scorecard suite, typecheck, ESLint, Prettier 3.9.6 — see the SDE log for counts.
- Browser checks on a local stack with the switch on (template editor, apply, Studio, queue, draft editor) recorded in the SDE log.
- Accepted gaps: real headless-Chromium render smoke; static-text fit; AE1/AE6 end-to-end tests (unit-covered).
