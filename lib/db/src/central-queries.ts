/**
 * Canonical read queries against the central PCA database, shared by the API
 * server (the feature-flagged `GET /grades/:grade/leaderboard` route) and the
 * comparison tooling so both exercise the SAME logic — no divergence between the
 * endpoint and the proof script.
 *
 * Lives in `@workspace/db` (beside `centralDb`) rather than the API server so the
 * scripts package, which only depends on `@workspace/db`, can import it. Importing
 * this module loads `./central`, which requires `CENTRAL_DATABASE_URL`; callers
 * gated behind `CENTRAL_READS` must import it lazily so the tenant-only path never
 * touches it.
 *
 * This file is a pure barrel (plan.md §5.1). The reads live in `./central/`:
 *   - cache.ts         short-TTL single-flight cache (`withCentralCache`, `cacheKey`)
 *   - where.ts         `clubInvolvedWhere(clubId)`, `inList(col, ids)` predicates
 *   - grades.ts        grade / season / round label parsing (pure)
 *   - scoring.ts       innings + fielding classification (JS and SQL twins)
 *   - privacy.ts       the ONE privacy rule (`isPrivateRow`) and its policy doc
 *   - club-matches.ts  `getClubMatchRows`, match list, scorecard, weekend wrap
 *   - leaderboards.ts  grade leaderboard, season/all-time leaders, per-grade season leaders
 *   - players.ts       participants, careers, player detail / seasons / match log
 *   - match-innings.ts pure per-innings / batting-order / overs helpers for the match log
 *   - records.ts       club records, centuries, five-fors, milestones
 *   - summaries.ts     club totals, grade summaries, dashboard, ladder, grade/season lists
 *   - premiers.ts      premierships + decider scores + team lists (honour-board seed)
 *   - grade-distribution.ts  per-player raw aggregates for one grade + season span
 *   - vs-club.ts       per-player career record against one opponent club (+ club id lookups)
 *   - social-recap.ts  Social Studio round-up / season recap inputs for one grade + season
 *   - social-achievements.ts  Social Studio per-match centuries, five-fors, debuts, milestones
 * Every central read must stay behind this barrel (eslint `no-restricted-imports`
 * on `@workspace/db/central`) so it is club-filtered, cached and tested in one
 * place. The central DB is READ-ONLY from the app: `select` / `execute` only.
 */
export * from "./central/cache";
export * from "./central/where";
export * from "./central/grades";
export * from "./central/scoring";
export * from "./central/privacy";
export * from "./central/club-matches";
export * from "./central/leaderboards";
export * from "./central/players";
export * from "./central/match-innings";
export * from "./central/records";
export * from "./central/summaries";
export * from "./central/premiers";
export * from "./central/grade-distribution";
export * from "./central/vs-club";
export * from "./central/playhq-fixtures";
export * from "./central/social-recap";
export * from "./central/social-achievements";
