# Handoff

**From:** SDE (P4, auto photos)
**To:** SDE sessions for P3, P5, P6, then P7
**Feature:** match-day-carousel-content

## Context

- **P4 (T4.1–T4.3)** is on `wyborn21/loving-mahavira-8d703f`. Migration **0054** `photo_usage (tenant_id, photo_id, used_at, draft_id)` (0053 went to email lists, #399). Ash runs 0054 in Production SQL before republishing.
- **Usage:** `recordPhotoUsage` / `notePhotoUsage` (`api-server/src/lib/card-content/photos.ts`) write one row per library photo when a draft is posted: `POST /social-drafts/:id/posted` and the publish worker's `postDraftIfDone`. A carousel records each slide's `photoId` (and `data.photoUrl`); a single card its `photoUrl` when it is a library photo. Only the draft's own tenant's photos; UNIQUE (tenant, photo, draft), so a re-post records nothing. Best effort: a failed write is logged and never fails posting.
- **Picks:** `createPhotoPicker(tenantId, grades)` loads the pools (`loadCarouselPhotos`, the same pools the sources route returns, moved out of the route), `photo_usage` and fixed card photo rules once. Order: least picked in this build, then least recently posted (never first), then team-tagged for the cover, then newest.
  - Senior fixture: its grade's batting/bowling/fielding photos; a `fixed` matchDay card photo rule wins when its photo is in that pool.
  - Cover: Club-wide · Season 2026 photos (the rule the Weekend Carousel already had; graded team photos were not added); stock only when there are none.
  - Junior fixture, or the cover of a set with no senior fixture: junior stock images only. Never a junior player's photo, a junior grade's photo or a rule.
  - Nothing fits: null, and the slide prints on the brand background with no warning.
- `buildMatchDayPhotos(tenantId, content[])` → `{ cover, fixtures: { [fixtureId]: photoId | null } }`. `buildMatchDayContent` is unchanged (the content snapshot stays photo-free, so sweep parity and the legacy draft input hold); the sources route calls both and returns `photoPicks` (OpenAPI `WeekendCarouselPhotoPicks`). The sweep's single Match Day cards still use `pickDraftPhoto`.
- **UI:** `createTeamSlides` / `refreshTeamSlides` take the picks (`TeamSlide.autoPhotoId`); the auto cover is frozen at generate (`generated.autoCoverId`). `AutoPhotoStatus` shows the pick with Swap / Use auto pick. A slide whose photo differs from its pick is swapped: `photoOverride` puts it in `contentOverride.photos` (`{ cover?, fixtures? }`, read by `readContentOverride`). Other set types keep the random grade photo.

## For the next phases

- **P3:** junior consolidated slides should take one stock pick per slide (`picker.pick({ kind: "fixture", junior: true, ... })`); `photoPicks.fixtures` is keyed by fixture id today.
- **P6:** 0053 is taken; use the next free number at rebase, and regenerate the snapshot so its `prevId` chains to 0054's and its `when` is later than 0054's (the migrator skips an entry older than the last applied one).
- **P7:** results / team list sets can use `createPhotoPicker` the same way instead of the client's random pick.

## Previous handoff

**From:** SDE (P2, content contract + Match Day builder)
**To:** SDE sessions for P3–P6 (at most two at once), then P7
**Feature:** match-day-carousel-content

## Context

- **P2 (T2.1–T2.6)** is on `wyborn21/carousel-p2-content-contract`. It adds migration 0052: `social_settings.card_content` jsonb (default `{"matchDay":{"preset":"standard","fields":{},"juniorConsolidateByDay":true}}`) and `social_settings.livestream_url`. Ash runs 0052 in Production SQL before republishing. The EM plan's numbers are shifted: P2's migration is 0052 because #393 took 0050 and P1 took 0051. The sponsors migration (P6) and `photo_usage` (P4) take the next free numbers at rebase.
- **The contract: `@workspace/scorecard/card-content`** (pure):
  - `types.ts` has `MatchDayTitleContent`, `MatchDayFixtureContent` and `MatchDaySponsorsContent`, all display-ready. A fixture keeps a `source` block with its raw values, and `day` (club-time YYYY-MM-DD) is there for P3 grouping.
  - The field catalogue is `CONTENT_FIELDS` in `kind-templates/fields.ts`. Keys are `<slide>.<field>`, each core or optional, with its presets. Standard is the cards as they were; Full equals Standard until P5 adds fields with `presets: ["full"]` (or `STANDARD_UP` if they should be on by default).
  - `resolveVisibleFields(kind, clubSettings, override)`: core is always on. An override preset starts again from that preset.
  - `readCardContentSettings` / `readContentOverride` clean stored values and drop anything unknown.
  - `matchDayFixtureContent(fixture, { names, junior, juniorTeamName, gradeLabel })` builds a fixture's content. A junior-looking grade is treated as junior (fail closed).
  - `matchDayDraftInput(content)` is the sweep's legacy draft input. It is byte-identical to the old `fixtureToMatchDayInput`, so existing drafts never refresh.
  - `contentInput(content, visible)` is the field projection a template binds. Hidden fields are blanked, and `namesResolved: true` tells `bindInput` not to shorten names or look up crests again.
- **The builder:** `api-server/src/lib/card-content/match-day.ts` → `buildMatchDayContent(tenantId, fixtures, { junior })`. It loads `loadCardNames` once, best effort. The caller picks the fixtures.
  - The sweep (`engines/match-day.ts`) and `GET /weekend-carousel/sources` both call it. The route returns `matchDayContent` keyed by fixture id; `content` stays for teamList and results.
  - Junior fixtures come in through `juniorCarouselContent(...).junior` (gradeLabel and team name). They no longer have a legacy input.
  - `match-day.db.test.ts` is the parity test: the sweep and the carousel produce identical content, the draft equals the legacy input, and an old draft stays unchanged.
  - The client mapping in `weekend-carousel/model.ts` is gone. Match Day team slides carry `content`. `buildWeekendSlides(..., visible)` honours visibility for round, crest, team sponsor, photo, cover and presenting sponsor. A hidden photo or sponsor also drops its warning.
- **Saved carousel v2:** `readQueuedCarousel` reads v1 unchanged.
  - A v2 content slide stores `{ content, visibleFields, photoId, data, ... }` with no `input`. The reader derives `input` via `contentSlideInput`, which the preview uses too.
  - Kinds not on the pipeline yet (teamList, results, matchSummary middle slides) keep `input` in v2.
  - `contentOverride` is saved. A junior slide's flag must equal its content's, or the read fails.
  - Retired pack ids: `RETIRED_PACK_IDS` in `pack-resolve.ts` (empty until P9) map to Club Kit in `readQueuedCarousel` and `resolvePackIdForKind` (`livePackId`).
- **Layout contract:** `cricket-club/src/lib/pack-templates/content-layouts.ts` declares slots and `capacity[size][preset]` for Club Kit and Broadcast Dark. Capacity is 1 everywhere: P3 raises it for the multi-fixture junior layout. Other packs lay out as Club Kit.
  - `content-layouts.test.ts` is the fit grid: 2 packs × 3 presets × 4 sizes × title/fixture/sponsors, with worst-case names. CI has no browser, so fit is checked against each `data-fit` capacity at MIN_FIT over two lines.
  - `data-drop-if-field="key [key…]"` (`dropEmptyFieldBlocks`) removes an optional text box when its field is empty. A span is unwrapped when it has a value, so markup stays byte-identical. It is used for the round line (both packs and every cover) and Broadcast Dark's note.
  - The fit grid found two Broadcast Dark gaps, both fixed: the Match Day card had no grade box (it now shows the grade), and the template's sample note ("BAR & KITCHEN OPEN") printed on every real card (`applyPackData` now blanks it). Broadcast Dark's own-look digests were regenerated.
- **UI:**
  - Social Studio → "What match day cards show" (`card-content-section.tsx`): presets plus per-field switches. The same `ContentFieldPicker` drives the Weekend Carousel's "What these cards show" panel, which is Match Day sets only and saves `contentOverride`.
  - The junior same-day switch and the livestream input are not in the UI yet. Their stored values pass through untouched. P3 adds the switch; P5 adds the link input and its title slot (the PATCH route already validates https).

## For the next phases

- **P3:** use `content.day` and `readCardContentSettings(...).matchDay.juniorConsolidateByDay`. Raise `capacity` for the multi-fixture layout and extend the fit grid with a multi-fixture slide.
- **P5:** add fields to `CONTENT_FIELDS` (`presets: ["full"]`), load each one in `buildMatchDayContent` only when visible, add a slot in both packs, and add a row to the grid's checks.
- **P7:** move teamList and results to builders. Their v2 slides switch from `input` to `content`.

## Previous handoff

**From:** SDE (P1, names and crests)
**To:** SDE session for P2 (content contract + Match Day builder)
**Feature:** match-day-carousel-content

## Context

- **P1 (T1.1–T1.6)** is on `wyborn21/carousel-p1-team-names`. It adds migration 0051 (renumbered from 0050, which #393 took for `selection_all_play`), which Ash runs in Production SQL before republishing.
- **Data (0051):**
  - `team_name_overrides (tenant_id, central_club_id, grade_key null, short_name)` is UNIQUE NULLS NOT DISTINCT. A NULL grade means every grade.
  - `competition_label_overrides (tenant_id, grade_key, label)`.
  - Both are tenant-curated and never written to central. The Drizzle schema is `lib/db/src/schema/card_name_overrides.ts`.
- **Pure names:** `@workspace/scorecard/card-names` has `autoShortTeamName`, `autoCompetitionLabel`, `cardNameKey`, `resolveCardTeamName` / `resolveCardCompetition`, `cardTeamCrest`, `teamMonogram` and the `CardNames` map type.
  - The automatic team name drops brackets, a " - " suffix, grade, gender and format words (Senior, Women's, T20, U21, Colts…) and club suffixes. It keeps sponsors and lone letters ("Mount Lawley D").
  - The automatic competition label only drops numbering, season years and "Competition". "Female A Grade" stays as it is: "Women's A" is the club's override, not automatic.
- **Server:** `api-server/src/lib/card-content/names.ts` has the following:
  - `resolveTeamName(tenantId, centralClubId, gradeKey?)`: grade override, then club override, then automatic, then raw.
  - `resolveCompetitionLabel`, plus `set*Override`.
  - `listCardNames`, for the admin listing: the club and every club met this season or last.
  - `loadCardNames(tenantId)` → `CardNames`.
  - Central reads live in `lib/db/src/central/card-names.ts`, behind the barrel.
  - Crests are PlayHQ organisation logos, reached through `central.club_playhq_orgs`, else the PlayHQ side of a projected match. `central.clubs` has no logo column. With no crest, the monogram stands in.
- **How cards get names today:** the `CardNames` map rides on `PackCardData.names`.
  - The client gets it from `SocialSettingsBundle.cardNames` through `buildPackData({ names })`, which every surface passes.
  - The server gets it in `draft-render.ts`.
  - `bindInput(input, packId, names)` resolves every team name and the competition and grade labels (ladder, match day, team list heading, results rows). A crest the input lacks also comes from the map.
  - Saved carousels keep the `data` snapshot from when they were built. A v1 carousel with no `names` prints the automatic names.
- **For P2:** `buildMatchDayContent` should call `resolveTeamName` / `resolveCompetitionLabel` directly, or put `loadCardNames` once per build into `CardContent`. Either way the client resolving in `bindInput` can retire with the `model.ts` mapping.
- **Name fit (T1.6):** `fitNames` in `pack-render/name-fit.ts` is the one rule: shrink to 0.6, then two lines, then "…".
  - `data-fit-row` marks a list-row box, which wraps only at the minimum size so the row keeps its height.
  - Ladder rows in every pack, plus Club Kit's results, fixtures and match-day opposition, are now fit-marked. Their capacities were measured in the browser per size (`nameFit(f, square, other)` in `club-kit/designs.ts`).
  - `card-names-bind.test.ts` fails if a pack adds an unmarked name box.
  - The own-look parity digests were regenerated, a markup-only change.
- **Admin UI:** Social Studio → "Team and competition names" (`components/social-studio/card-names-section.tsx`). Names save on blur or Enter, Reset or an empty field goes back to automatic, and "By grade" opens per-grade names. API: `GET /social-settings/card-names` and `PUT .../teams` / `.../competitions` (a null name clears it).
- **Still open:**
  - Ladder, result and fixture rows have no crest slot yet. That is P2 layout work.
  - The listing lists senior grades only (juniors isolation). Junior opposition names still resolve automatically on junior cards.
  - The capacities were measured with fallback fonts, so they lean conservative. Recheck them on the CI headless renderer in the P2 fit grid.

## Previous handoff

**From:** Engineering Manager
**To:** Senior Engineer / SDE sessions
**Feature:** match-day-carousel-content

## Context

- The task list is in `.10x/decisions/engineering-manager/match-day-carousel-content.md`. Design: ADR-010 in `.10x/decisions/architect/match-day-carousel-content.md`.
- Start now, in parallel sessions off `main`:
  - **P0:** the Share to Socials preview fix (T0.1)
  - **P1:** names and crests (T1.1–T1.6, migration 0050)
- Next comes P2, the content contract plus the Match Day builder. It is the foundation for P3–P7, and its sweep/carousel parity test must pass before merge.
- This runs in parallel with selection-side-size and admin-menu-consolidation, which share none of these files. Renumber the migrations at rebase if another feature takes a number first.

## Previous handoff

**From:** Principal Architect
**To:** Engineering Manager / Staff Engineer
**Feature:** match-day-carousel-content

## Context

- Design: `.10x/decisions/architect/match-day-carousel-content.md` (ADR-010 proposed). Requirements: `.10x/decisions/product-manager/match-day-carousel-content.md`; also covers `social-tile-short-names`.
- Scope set by Ash: the same content pipeline for every card path (auto-queued, Create a Card, all four carousel set types). Junior match-day and results carousels can put same-day matches on one slide.
- Components:
  - `@workspace/scorecard/card-content`: the field catalogue, presets, `resolveVisibleFields` and `groupSlides`
  - `api-server/src/lib/card-content/`: the name resolver, the builders and `pickPhoto`
  - a layout contract in which packs declare what they can fit
  - saved carousel v2
- Migrations 0050–0053 (name overrides, the `card_content` jsonb and livestream link, sponsor tier and background, `photo_usage`). Ash runs each one by hand.
- Delivery order has 8 steps, listed in the design file. Check that `central.ladder` exists before step 5.

## Previous handoff

**From:** Product Manager
**To:** Principal Architect
**Feature:** match-day-carousel-content

## Context

- Requirements: `.10x/decisions/product-manager/match-day-carousel-content.md` (decided with Ash 20 Oct 2026).
- Build one server-side content builder for Match Day slides (title, fixture, sponsors) used by both the sweep and the carousel UI; remove the client duplicate in `components/weekend-carousel/model.ts`.
- Content settings: per-field toggles, Minimal/Standard/Full presets, club default plus per-carousel override.
- Packs: Club Kit and Broadcast Dark on shared slots, plus one new pack; retire the other four with a read-time fallback.
- Depends on social-tile-short-names (names and crests). Design the ADR so each layout declares what it can fit for every preset and size.

## Previous handoff

**From:** SDE (PR D, the last slice)
**To:** whoever picks up selection-side-size follow-ups
**Feature:** selection-side-size — delivery complete once PR D merges (A #385, B #389, C #388, D)

## Context

- **PR D (cards + public, TD.1–TD.3, no migration)** on `wyborn21/selection-side-size-pr-d-25eb99`:
  - **Cards:** `bindInput` binds every team-list player (up to 14) plus a row `os` ("OS" or ""). Every Team List design (Broadcast Dark, the four skeleton packs via `teamListFormats`, Club Kit Team Selection and Starting XI) declares `maxRows: 14` and `data-repeat-max="14" data-repeat-compress="12"`.
  - **Auto-compress:** a compressible list writes its lengths `calc(<len> * var(--xi-scale,1))` and its two-column rows `repeat(var(--xi-rows,6),auto)`. `expandRepeats` sets `--xi-scale` (12 / n) and `--xi-rows` (ceil(n / 2)) above 12, and at 12 or fewer unwraps them, so 12-row markup is byte-identical (the own-look digests are unchanged).
  - **OS:** a `data-badge` span after the role (dropped when empty by `cleanupEmptyBadges`), set like the role; a chip on Starting XI. No card shows "12th" (none did before).
  - **Studio `ck.xi-list`:** parses up to 14 rows, scales by `xiScaled(u, n)`, has a fourth `os` column, and drops a "12th" tag when there are more than 12.
  - **Builder:** `ROW_CAPS.teamList` is 14 (it truncated to 12).
  - **Public:** `GET /fixtures/:id/team-list` runs `maskOverseas` (no OS on a "Private Player"). Junior Selection Hub sides now snapshot `overseas` into `junior_team_lists.players`; `shapePublicJuniorTeamList` and the junior card drop it with a withheld name. `juniors-fixtures.tsx` shows the OS badge. There is no senior public team-list page (web or mobile); the senior list reaches the public only on cards.
  - Tests: `pack-render/team-list-side-size.test.ts` renders every pack's Team List designs at 12 and 14 rows in all four sizes.
- **Still open:**
  - Studio card-kind starter templates (`lib/scorecard/src/kind-templates/starters`) still lay out 12 list rows a slide; a 13th and 14th spill to a second slide rather than compress.
  - The PCA "All 12 named players may bowl." note on a 14-player team sheet (from PR B) still needs Ash's call.
  - The optional spec fields from PR B/C could be made required.

## Previous handoff

**From:** SDE (PR C, merged after PR B)
**To:** SDE session for PR D
**Feature:** selection-side-size

## Context

- **PR B (side size, #389, merged):**
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
- **PR C (overseas, #388):**
  - PR C (overseas players, TC.1–TC.5) is on `wyborn21/selection-overseas-pr-c-56fa5b`. It adds no migration; 0049 from PR A holds the table and the caps map.
  - **Flag:** `PUT /squad/{id}/seasons/{season}` `{ overseas }` (admin, tenant-scoped) upserts `squad_member_seasons`. `GET /squad` and `GET /squad/{id}` return `overseas` for the current season (Perth, `seasonStartYearFor`). There's no carry-over: a season with no row reads as false. Helpers live in `api-server/src/lib/overseas.ts`.
  - **Cap:** `overseasCaps` is read and written on `/availability/settings`. Keys are trimmed, values are 0–14, and a grade with no key has no cap. Matching is by exact app-grade key, like `team_sheet_overs`. The admin UI is its own "Overseas players" card on Admin → Availability, listing the settings response's `grades` plus any capped grade that no longer plays.
  - **Board:** the per-slot `overseas` is set only when true. A draft reads it live; a final side reads the snapshot. The side-level `overseas {count, cap, over}` is always sent. The Hub's `finaliseHeadsUp` adds "overseas N / cap M" when over the cap, and never blocks.
  - **Snapshot:** finalise writes `overseas: true` onto that player's `SelectionSlot` in `selections.slots`, which the board and team sheet read. It also writes it onto `TeamListPlayer`, but only when the name is public, so a "Private Player" gets no marker. The team sheet prints "OS" after the name, plus an "OS overseas player" key line when any are listed.
  - **For PR D:** public reads of `team_lists.players` already carry `overseas` (masked with the name at publish time). A junior side's published list (`junior_team_lists`) doesn't snapshot overseas.
  - The new response fields are still optional in the spec, and the fixtures haven't been touched.

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
**To:** Staff Engineer / Engineering Manager
**Feature:** social-photo-tag-selection

## Context

- Design: `.10x/decisions/architect/social-photo-tag-selection.md`. Requirements: `.10x/decisions/product-manager/social-photo-tag-selection.md`.
- Components: `PHOTO_POLICY` + `pickCandidatePhoto` in `api-server/src/lib/draft-enrich.ts`; `rankedPerformerPlayerIds` in `match-top-performer.ts`; `matchCardPhoto` / `draftPickOptions` pass candidate lists.
- Units: U1 picker (api only) → U2 rule retirement (route + OpenAPI + admin UI + retire-rules migration (next free number; 0049 is taken), which Ash runs in prod before republishing) → U3 filtered picker (OpenAPI params, DTO `photoCandidatePlayerIds`, share-modal filters). U2 and U3 share `openapi.yaml`.
- Decided with Ash: headshots count after tagged photos; no grade fallback for Team List / Result / Summary; Match Day = the grade's team/celebrating photos only.

## Previous handoff

**From:** Product Manager
**To:** Principal Architect
**Feature:** social-photo-tag-selection

## Context

- Decision file: `.10x/decisions/product-manager/social-photo-tag-selection.md` (agreed with Ash 2026-10-19).
- Priority: (1) tag-based candidates for teamList + matchSummary (top performer first), (2) Match Day restricted to the grade's team/celebrating photos, (3) no auto fallback: leave empty, (4) filtered library picker for admins.
- Decided: retire `random`/`player` card photo rules for these kinds; `fixed` rules and manual picks still win.

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

## Current Handoff

**From:** Principal Architect → **To:** Staff Engineer / EM (20 Oct 2026)
**Read:** `.10x/decisions/architect/email-distribution-lists.md` (requirements: `.10x/decisions/product-manager/email-distribution-lists.md`)
Spike resolved: team-sheet PDF already server-side (`buildTeamSheet` + `renderHtmlToPdf`). Social PNG via `/__card-render` harness — needs `RENDER_HARNESS_URL` in prod.
Build order: PR1 = transport (bcc + attachments), migration 0053 (email_lists, members, teams, email_sends), outbox enqueue/drain, team-sheet on_publish/manual/off, admin API + Email lists page + send log. PR2 = social toggles (migrate notificationEmail), scheduled mode, UPDATED re-send.
Confirm the team key the Selection Hub uses for a fixture. Senior fixtures only.
