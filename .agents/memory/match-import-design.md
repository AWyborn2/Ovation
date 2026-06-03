---
name: Per-match xlsx import design
description: How the per-match scorecard import adds to a running season total, and the one-method-per-grade+season constraint it imposes.
---

# Per-match xlsx scorecard import

Admin uploads ONE match `.xlsx` scorecard (PlayCricket-style) → preview
(header, matched/new players, parsed batting/bowling/fielding) → commit ADDS
that match to the running season total and stores permanent per-match history.

**Source-of-truth split:**
- `matches` (one per grade+season+round) + `match_player_lines` (one per player
  per match) are the permanent per-match history.
- `imports.kind` distinguishes `'csv'` (whole-season) from `'match'`; `round` is
  the match round number.
- On match commit, `deriveSeasonSnapshotFromMatches(grade, season)` REWRITES the
  derived season snapshot: it DELETEs the `player_grade_season_stats` rows for
  that (grade, season) with `import_id IS NULL`, then re-INSERTs them by summing
  ALL match lines for that grade+season. Then `recomputeAggregates` rolls up to
  `player_grade_stats` / `players` / `grade_summaries`, and caps auto-sync.

**Idempotent re-import:** committing the same (grade, season, round, stage) again
first deletes the existing match for that key, so re-uploading a corrected
scorecard replaces rather than doubles. The delete/conflict checks must use
`IS NULL` SQL for whichever of round/stage is null (drizzle `eq` can't match NULL).

**Finals stages (round-less matches):** a match's identity is `(grade, season,
round, stage)` with `UNIQUE NULLS NOT DISTINCT`. A regular match has `round` set
+ `stage` NULL; a final has `round` NULL + `stage` set (one of FINALS_STAGES in
match-scorecard.ts: Elimination/Qualifying/Semi/Preliminary/Grand Final). Stage
ALWAYS wins and forces round=null (parser, commit, PATCH, and both frontend
editors all enforce this XOR). drizzle-kit 0.31 can't manage NULLS NOT DISTINCT
multi-col uniques → the constraint is created in scripts/src/ensure-constraints.ts
(with `nullsNotDistinct`+`replaces` to drop the old `(grade,season,round)` unique),
NOT in the Drizzle schema (same pattern as cap_register). Finals coexist with
regular rounds in the same grade+season; `deriveSeasonSnapshotFromMatches` groups
by (grade,season) only so null-round finals are already summed in — no aggregation
change needed. Display everywhere via `matchLabel(round, stage)` helper
(cricket-club/src/lib/utils.ts): stage name else `Round N`.

**KEY CONSTRAINT — one ingestion method per (grade, season).** The match-commit
snapshot DELETE keys on (grade, season, import_id IS NULL). A whole-season CSV
import for the same grade+season also writes `import_id IS NULL` baseline-style
rows, so mixing both for the SAME grade+season would let a match commit wipe the
CSV's rows (and vice-versa). Clubs must pick CSV *or* per-match for a given
grade+season, not both. Different grades/seasons are independent and safe.

**Abandoned matches:** parser flags `abandoned` (no innings/players); they commit
for history only and add zero stats (preview warns).

**Rollback:** see import-delete-rollback-gaps.md — `undo-season` + per-match
delete use shared `rollback.ts` (reverseCaps + cleanupOrphanPlayers).

Parser: `artifacts/api-server/src/lib/match-scorecard.ts` (fielding is derived
from opposition dismissal text via initial+surname matching).

**Opposition scorecard (display-only):** the parser ALSO emits `opposition`
(`ParsedOppositionLine[]`) — the opposition's batting (their block), bowling
(HHCC block's bowlers), and fielding (derived from HHCC batsmen dismissal text,
incl. fielders known only by initial+surname). Stored in `match_opposition_lines`
(name as plain TEXT, NO player FK, cascades via match). **Display only — never
summed into any club aggregate/record/milestone.** Both commit paths insert it;
GET /matches/:id returns `oppositionLines`; rendered as a second innings on
match-detail.tsx (plain text, no links). Abandoned matches store none.

## Season batch upload (many scorecards / .zip at once)

Extends the single-match flow: admin uploads multiple `.xlsx` and/or a `.zip` →
one preview of every candidate match → resolve player names ONCE across the
whole batch → commit all valid matches together.

- **Holder pattern:** upload creates ONE pending `imports` row `kind='match-batch'`,
  `payload={files:[{filename,parsed?,error?}]}` — NO stats/match/player writes yet.
  Commit writes one real `kind='match'` row PER match and DELETEs the holder, so
  the existing per-match delete / undo-season works unchanged. Cancelling a
  pending batch just deletes the holder row (delete branch in imports.ts).
- **Per-file status** (classifyBatchFiles): `ready | abandoned | duplicate`
  (committable) vs `needsResolution | duplicateInBatch | unmappableGrade | parseError`
  (excluded). A file that parsed with neither a numeric round nor a recognised
  finals stage is `needsResolution` — the admin assigns a round OR stage per-file
  via the commit body's `fileResolutions` ([{filename, round?|stage?}], matched by
  filename, stage wins) to make it committable. First file for a given
  grade+season+(round|stage) wins; later copies become `duplicateInBatch`.
  `duplicate` = already in DB → replaces it. (`missingRound` kept as a legacy alias
  in the OpenAPI enum.)
- **Commit derives ONCE:** shared resolver creates each new player once; after all
  matches inserted, `deriveSeasonSnapshotFromMatches` runs once per distinct
  (grade,season), `recomputeAggregates` once for all affected grades, caps sync
  once per grade (debut order concatenated across that grade's seasons, first-seen
  wins). Social via `runBatchPostCommitSocial`; created caps attach only to the
  earliest-round match per grade (detector's fire-once de-dup handles the rest).
- Same **one-method-per-(grade,season)** constraint as single-match still applies.
- `.zip` expansion uses `jszip` (expandUploads skips `__MACOSX`/non-xlsx).
- Tests: `artifacts/api-server/src/routes/imports-batch.test.ts` (upload/preview/zip/
  dedup/cancel against real A Grade fixtures in attached_assets/).
