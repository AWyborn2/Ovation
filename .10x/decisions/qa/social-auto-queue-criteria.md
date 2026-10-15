# QA — social-auto-queue-criteria

See `.10x/reviews/2026-10-15-social-auto-queue-criteria-review.md` for the acceptance-example matrix and suite counts.

- Strategy: every acceptance example (AE1–AE8) maps to a named test; DB-backed suites run on the local embedded Postgres (55433) and in CI's API integration job.
- Gaps accepted: no browser pass locally (editor and junior look verified by tests); harness ball fetch verified by cadence tests, first real run checked via runbook §3b step 6.
- Regression guard: `pack-own-look-parity.test.ts` digests regenerated once (junior = brand-only); any further drift fails the suite.
