# Handoff

**From:** SDE (PR B)
**To:** SDE sessions for PR C (if it merges second) and PR D
**Feature:** selection-side-size

## Context

- PR B (`wyborn21/selection-side-size-pr-b-a48658`) does TB.1–TB.5 and adds no migration.
  - Settings: `PUT /availability/settings` saves `sideSizes` through `cleanSideSizes` (12 is dropped as the default; leaving the field out keeps the stored map). GET and PUT also return `grades` (`loadSideGrades`). Admin → Availability has a "Sides by grade" card; PR C's overseas cap can go in the same card as a second column.
  - A draft fixes `selections.side_size` from `gradeSideSize(settings.sideSizes, grade)` when it's created. A junior side is keyed by `juniorSideLabel`. Lowering a grade never touches existing drafts: the board sets `warnings.gradeSideSize` and `warnings.overSize`, and the hub shows "X is now N: move K players out".
  - `saveBoard` accepts from 11 slots up to the side's size. Above 12, an older client's short post keeps the stored tail.
  - Finalise publishes order 1–N, with `twelfth: true` only on the 12th of a 12-player side. `renumberList` handles withdrawals.
  - The team sheet takes `TeamSheet.sideSize` and draws N rows. Rows shrink above 12.
- Still open:
  - The PCA team-sheet note "All 12 named players may bowl." (`team-sheet-rules.ts`, bylaw 5.3.1) still prints on a 14-player sheet. Ask Ash whether interchange grades need their own rules text.
  - **PR D:** `TeamListPlayer.twelfth` is now populated, and packs need `maxRows: 14` plus auto-compress.
  - The optional spec fields (`sideSize`, `gradeSideSize`, `overSize`) are always sent now and could be made required.

## Previous handoff

**From:** SDE (PR A)
**To:** SDE sessions for PR B and PR C
**Feature:** selection-side-size

## Context

- PR A is PR #385 (`claude/selection-side-size-pr-a-588cf8`): migration 0049, the OpenAPI fields with codegen, and `@workspace/scorecard/selection-shape` (`DEFAULT_SIDE_SIZE`, `MAX_SIDE_SIZE`, `XI_SIZE`, `sideShape`, `normaliseSlots`, `roleMemberIds`, `twelfthMemberId`). Every `SIDE_SIZE` / `TWELFTH_INDEX` use now goes through it, and every caller still passes the default (12).
- What PR A left for later:
  - The new response fields are optional in the spec and not sent yet: board `sideSize`, `overseas`, per-slot `overseas`, squad `overseas`, and `TeamListPlayer.overseas` / `twelfth`. Make them required once they're populated, and update the test fixtures that build `SelectionSide` / `AvailabilitySettings` literals.
  - `PUT /availability/settings` parses `sideSizes` / `overseasCaps` but doesn't save them yet (TB.1 / TC.3).
  - Save still accepts only 11 or 12 slots (`saveBoard`, TB.2).
  - `PUT /squad/{id}/seasons/{season}` answers 501 (TC.1).
- **PR B:** thread `selection.sideSize` / the grade's size into `sideShape(...)` at the call sites that pass `DEFAULT_SIDE_SIZE` today (`selection-drafts.ts`, `selection-board.ts`, `selection-published-players.ts`, `team-sheet.ts`). The client already reads `side.sideSize`.
- **PR C:** `squad_member_seasons` exists. Add the route, the board counter and the snapshot.
- Ash runs 0049 in Production SQL before the next republish (SQL in the #385 body).

## Previous handoff

**From:** Engineering Manager
**To:** Senior Engineer / SDE
**Feature:** selection-side-size

## Context

- Task list: `.10x/decisions/engineering-manager/selection-side-size.md`. Design: `.10x/decisions/architect/selection-side-size.md`. ADR-009 accepted 20 Oct 2026. Side size 12–14.
- Start with PR A (TA.1–TA.3: migration 0049, OpenAPI + codegen, shared `selection-shape.ts` with no behaviour change). After it merges, PR B (side size) and PR C (overseas) run as parallel sessions in their own worktrees off `main`, coordinating `selection-board.ts` / `team-card.tsx` / `team-sheet.ts` edits over SendMessage. PR D (cards + public) follows both.
- The hub-decoupling PRs (#376, #380, #381, #379) have all merged, so nothing blocks this.
- Ash applies migration 0049 in production before the first republish.

## Previous handoff

**From:** Principal Architect
**To:** Staff Engineer / Engineering Manager
**Feature:** selection-side-size

## Context

- Design: `.10x/decisions/architect/selection-side-size.md`; ADR-009 (proposed). Requirements: `.10x/decisions/product-manager/selection-side-size.md`.
- Migration 0049 (additive): `availability_settings.side_sizes` / `overseas_caps` jsonb maps, `selections.side_size`, new `squad_member_seasons`. Ash applies it in prod before republishing.
- The shared `sideShape(size)` helper replaces the duplicated `SIDE_SIZE`/`TWELFTH_INDEX` in `selection-drafts.ts` and `apply-move.ts`. "12th" only when the size is 12.
- Finalise snapshots `overseas`, the order and `twelfth` into `team_lists.players`. Over the cap = warn only.
- Cards: every pack goes to `maxRows: 14` with auto-compress (Ash chose this), and the Studio `ck.xi-list` likewise.
- Slices: PR A foundation, then PR B (size) and PR C (overseas) in parallel, then PR D (cards + public). Start after selection-hub-decoupling PR1–PR3 merge.

## Previous handoff

**From:** Product Manager
**To:** Principal Architect
**Feature:** selection-side-size

## Context

- Requirements: `.10x/decisions/product-manager/selection-side-size.md` (agreed with Ash 19 Oct 2026).
- Per-grade side size 12 (default) to 14, set by an admin. Above 12: slots 1–N, any player can be captain or keeper, no "12th" label on the hub, team sheet, Team List card or availability message. A grade at 12 is unchanged.
- Priority: (1) per-grade size + hub slots + team sheet (P0), (2) Team List card fits 14 rows across packs, availability text, PlayHQ import of more than 12 names (P1).
- Design needs: where the size lives (grade/team config, migration applied by hand in prod), how to replace the shared `XI_SIZE`/`TWELFTH_INDEX` constants and `normaliseSlots`, and what happens when the size is lowered.
- **Part 2, overseas players:** a per-season flag on the squad member (admin), an OS badge in the hub, on the team sheet, on the Team List card and on the public site, and a per-grade cap that warns without blocking finalise. See the doc.
- Sequence after selection-hub-decoupling PR1–PR3, which touch the same files.

## Previous handoff

**From:** Principal Architect
**To:** Staff Engineer / SDE
**Feature:** admin-menu-consolidation

## Context

- Product decision agreed with Ash 2026-10-19 (scope B): `.10x/decisions/product-manager/admin-menu-consolidation.md`.
- Architecture + units: `.10x/decisions/architect/admin-menu-consolidation.md`. PR 1 = U1–U2 (menu moves, Imports hub, no migration). PR 2 = U3–U6 (shirt categories, migration 0047, applied by hand in prod before republish).
- Requirement change: a person may be in several registers per season (allowed, badged, 'Also add to…').
- Original PM priority order: (1) shirt-number category + unified People → Shirt numbers tab (needs migration; juniors stay in `junior_shirt_numbers`), (2) URL redirects, (3) Imports hub, (4) remaining menu moves + tour/test updates.
- Acceptance: see Requirements and Success criteria in the decision file.

## Previous handoff

---

**From:** Engineering Manager
**To:** Senior Engineer / SDE
**Feature:** selection-hub-decoupling

## Context

- Task list: `.10x/decisions/engineering-manager/selection-hub-decoupling.md`. Design: `.10x/decisions/architect/selection-hub-decoupling.md`. ADR-008 accepted.
- Start with PR0 (T0.1–T0.3: migration 0047, OpenAPI with codegen, `writeReply` and `publicName` extraction). After PR0 merges, PR1, PR2 and PR3 run as parallel sessions in their own worktrees off `main`; they coordinate shared files over SendMessage and merge in order PR1, PR2, PR3.
- Ash applies migration 0047 in production before the first republish.

## Previous handoff

**From:** Principal Architect
**To:** Staff Engineer / Engineering Manager
**Feature:** selection-hub-decoupling

## Context

- Design: `.10x/decisions/architect/selection-hub-decoupling.md`; ADR-008 (proposed). Requirements: `.10x/decisions/product-manager/selection-hub-decoupling.md`.
- Components touched: `selection-board.ts` (on-demand `ensureRound` + `prepareRoundDrafts`, `weekend` param, read-only past rounds), `selection-drafts.ts` (seed from previous selection, no Yes-only pruning), `availability-grades.ts` `buildMemberMatcher` (participant crosswalk first), new `lib/availability-replies.ts` (shared `writeReply`), new route `PUT /selection/members/:id/status`, `selection-published-players.ts` `publicName()`.
- One migration, 0046 (additive): `availability_responses.source/set_by_*`, `selection_events.round_id`, `squad_member_participants`, `squad_members.show_name_publicly`. Prod is applied by hand before republish.
- Slice order: draft any time + carry-over, then private mapping, then admin status, then public toggle, then round nav UI. Status colours: yellow none/maybe, green yes, red no, plus a non-colour cue.

## Previous handoff

**From:** Product Manager
**To:** Principal Architect
**Feature:** selection-hub-decoupling

## Context

- Requirements, acceptance criteria and priorities: `.10x/decisions/product-manager/selection-hub-decoupling.md` (agreed with Ash 19 Oct 2026).
- Priority order: P0 draft-on-demand plus carry-over of last week's side; P0 private-slot mapping (crosswalk); P0 availability-off as a first-class mode; P0 admin-set (verbal) status; P1 round navigation (previous/next); P1 per-player public-name toggle.
- Root cause to confirm: PlayHQ team lists name withheld players "Private Player", the slot stays unmatched (`memberId` null) and the team sheet drops it.
- Open for the Architect: whether the public-name toggle applies to junior members (default: no); round creation on demand versus the availability schedule; where the crosswalk lives (`player_id_map`-style, tenant-scoped).

## Previous handoff

**From:** DevOps + SRE (Phase 6)
**To:** Ash (release) / next feature
**Feature:** junior-card-photos

## Context

- Plan `docs/plans/2026-10-16-001-feat-junior-card-photos-plan.md` implemented (U1–U7) on `claude/junior-card-photos`; ADR-007 accepted; decisions per role under `decisions/*/junior-card-photos.md`; review `reviews/2026-10-16-junior-card-photos-review.md`.
- Release: apply `lib/db/migrations/0045_junior_card_photos.sql` in the Production SQL runner (statement by statement) BEFORE republishing; runbook §3c. Then upload a junior photo and check Admin → Junior players and one junior card.

## Previous feature

**From:** DevOps + SRE (Phase 6, delivered)
**To:** next feature
**Feature:** social-auto-queue-criteria

## Context

- Plan `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md` implemented end to end (U1–U10) on `claude/social-auto-queue-criteria`. Decisions per role under `decisions/*/social-auto-queue-criteria.md`; review in `reviews/2026-10-15-social-auto-queue-criteria-review.md`; ADRs 004–006.
- PR #361 merged to `main` (7b4d0aee) and released to production on 16 Oct 2026: projector SQL, republish, release SQL (171 retired-kind drafts dismissed) and the feats backfill all run. Watch the first match-day sync for `playhq.balls` rows and `central.match_feats` entries.

## Release

Done (runbook `docs/runbooks/meta-publishing.md` §3b). Lessons recorded there: the Production SQL runner executes one statement at a time, and the feats backfill script takes `--org` / `--season` / `--match` with `--yes`.

## Parked

- card-kind-templates: Delivery in progress (design track D1–D3, release R1–R4) — unchanged.
- Next spec: Record / Team of the week / Premiership engines — discovery in `decisions/architect/team-of-the-week-engines.md` (ToW with admin criteria, grade-weighted points, senior and junior versions). Starts with Phase 0 brainstorming.
- Follow-ups noted by the SDE: "pack's own look" panel slot still fed by `juniors_colour`; trading-card renderer kept for posted cards.

## Handoff 2026-10-19 (PM -> Architect)

Read `.10x/decisions/product-manager/social-tile-short-names.md`. Order: 1) preview-render bug in share-card-modal/use-card-preview (own PR); 2) tenant name-override table + auto short-name; 3) crest slot in renderer; 4) square layout fit.
