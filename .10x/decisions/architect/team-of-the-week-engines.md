# Architect — team-of-the-week-engines [DISCOVERED 2026-10-15]

Research gathered for the follow-on spec (Record, Team of the week and Premiership engines). Not yet decided; brainstorm first.

**Team of the week**

- A ranker exists: `lib/db/src/central/round-results.ts` — `performanceScore` (runs + 5 for a 20+ not-out + 25 × wickets; no catches/economy), `teamOfWeekFigure`, `pickTeamOfWeek(performances, gradeOrder, size = 12)` (best match per player, grade only as tie-break), built by `centralRoundResults` (seniors, private players dropped). Only consumer: manual prefill `GET /social-prefill/round-results` (`routes/social-prefill.ts:96-128`) with `teamOfWeekPhotos`.
- Card kind `teamOfWeek` exists (input `players: TeamOfWeekPlayer[]`, capped at 12 in bind, club-kit design, starter body and form; `CLUB_KIT_ONLY_KINDS`). Family `roundup`, slot `roundUp`.
- Grade weighting hook: `gradeSeniorityRank` in `lib/scorecard/src/grade-order.ts` (A–H → 0–7, numbered 10+n, women +100, PPL 200, Colts 201, Over 40s 240…), and club order via `club-grade-order.ts`. No numeric tier in `central/grades.ts`.
- Juniors: `junior_match_batting/bowling` have runs/wickets but no catches; junior rounds are free text (no round order by design) → scope by date window. Age-group order from `juniorMatchDisplaySettingsTable.ageGroupOrder`. Naming via `junior-names.ts`; junior cards carry no photos.
- Settings: `PostingRow` is `{enabled, packaging, grades, others}`; `normalizePostingPlan` drops unknown keys, so row-specific criteria/weights need the model extended or a sibling jsonb.
- Round scoping: `latestPlayedRound` in `engines/round-sets.ts` (6-day window before the weekend-wrap anchor; central only; finals never picked because `parseRound` returns null for them).

**Record**

- `centralClubRecords` (all-time, optional grade/season filter), `centralRecordProgressionRows` (per-match best innings/figures), and `walkProgression`/`beats` in `records-analytics.ts` ("equal never breaks"). No per-match "record broken" detection runs today. Tenant `club_records` / `honour_board_records` are curated text. `record` card input: title, playerName, value, grade?; caption hard-codes "Club Record".

**Premiership**

- `central.premiers` (season, grade, format, confidence, decider match). Tenant `premierships` seeded from it by `premierships-seed.ts` (backfill only). No live "won the grand final" detection; `parseStage` can identify a Grand Final label. Existing drafter: `generatePremiershipRecapCards` in `roundup.ts` (season recap only).
