# Senior Engineer — social-auto-queue-criteria

## Phase 3 implementation approach (2026-10-15)

Per-unit approach, files, patterns and test scenarios are in the plan's Implementation Units (U1–U10). Notes beyond the plan:

- **T1.x.** Keep `PostingRow` keys stable (`enabled, packaging, grades, others`) and add `juniors?`; put `juniorRunsBar` under a plan-level `bigMoments` object rather than on the row so `normalizePostingPlan` stays row-generic. Export `defaultPostingPlan(central)` and keep `POSTING_STYLES` as functions of `central` too (styles must also be central-aware for the results row).
- **T2.1.** `draftingGates(settings, central)` must take `central` everywhere; find callers of `loadDraftingGates` that pass none and thread `tenantIsCentral`.
- **T2.4.** Combined carousel: build senior slides with the existing match-result input, junior slides via `matchToSummaryInput` with junior naming; cover groups `senior[]` / `junior[]` — check `lib/scorecard/src/card-sets.ts` `SET_CAPS.weekendWrap = 4` and decide the slide cap for combined sets (do not sum totals). Set `cardInput.junior = true` whenever any junior slide exists.
- **T3.2.** Detector input: `{ balls: Ball[] (seq order), fielding: Fielding[] }` per match; output `{ kind, inningsNumber, participantId, detail }`. Treat `dismissal_type` case-insensitively; map unknown → not bowler-credited.
- **T3.3.** Projector: `delete from central.match_feats where match_id = $1` then insert; wrap with the match's projection transaction.
- **T5.1.** `juniorTeams` entries `{ ageGroup, teamName }` resolved with the same normalisation `juniorTeamPublishMode` uses. The SQL twin cannot resolve team modes; make `juniorAutoPostClear` return false for any junior-marked draft and let the TS gate be the only path that can clear a junior card (document the asymmetry in a comment and the agreement test).
- **T5.2.** Privacy re-check: reuse `isJuniorWithheld` with a fresh participant lookup; re-render = regenerate `cardInput` via the drafting engine for that key when available, else clear `autoReadyAt`/ready and `notifyClub`.
- **T6.x.** Keep `CardKind` enum intact; only remove options and routes. Grep for `tradingCard` in `SHIRT_NUMBER_DRAFT_KINDS` — leave it (harmless) or remove with a test.
- **T7.2.** Grade picker: junior age groups come from the junior sync settings' known age groups; show under a "Juniors" subheading; `juniorsUnavailable` rules from `plan-text.ts` updated to KTD6.
- **T8.x.** Search `#42342B`, `JUNIOR_PANEL`, `JUNIOR_BROWN`, `juniorsColour`, `--juniors-accent`; keep `junior` flag semantics for labels/photos.
- **T9.1.** Team-mode reset: `update junior_sync_settings set team_publishing = (select jsonb_object_agg(k, '"approval"') …)`; handle empty `{}`.

**Tricky parts.** Combined-carousel cover; the SQL/TS gate asymmetry; harness ball fetch; keeping posted retired cards rendering after option removal.

**Review focus.** Junior markers on every new junior draft; no legacy reads; idempotent release SQL; no drift in generated clients.
