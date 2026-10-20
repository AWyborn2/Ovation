# Architect — match-day-carousel-content (ADR-010)

Status: ACCEPTED 2026-10-20 by Ash (option A; scope widened the same day)
Requirements: `.10x/decisions/product-manager/match-day-carousel-content.md`
Absorbs: `.10x/decisions/product-manager/social-tile-short-names.md` (names + crests)

## Scope (Ash, 2026-10-20)

- One content pipeline for **every** social card path: auto-queued drafts (sweep engines),
  Create a Card (Studio), and carousel sets (`matchDay`, `teamList`, `results`,
  `matchSummary`). Same fields, names, fallbacks and toggles wherever a card is made.
  Match Day is the first kind migrated; the others follow kind by kind on the same contract.
- Junior carousels (automated or on demand) can consolidate slides: fixtures/results played
  on the same day share a slide. Applies only to match-day (fixtures) and results / match
  summary sets. Senior behaviour unchanged (one fixture per slide).

## Current landscape [CONFIRMED 2026-10-20]

- Carousel saved inside the draft input (`weekendCarousel`, `lib/scorecard/src/queued-carousel.ts:40`,
  v1) with each slide's `input` + `data` frozen. Server renders PNGs at publish via headless
  Chromium (`draft-render.ts`, `post-pack.ts`); the browser renders the same templates for preview.
- Fixture mapping duplicated: `api-server/src/lib/engines/match-day.ts:42` vs
  `cricket-club/src/components/weekend-carousel/model.ts:376`.
- Per-kind field catalogue already exists (`lib/scorecard/src/kind-templates/fields.ts`, ADR-001..003);
  list splitting in `lib/scorecard/src/card-sets.ts` (`SET_CAPS`).
- `social_settings` one row per tenant; jsonb already used (`match_summary_grade_config`, `family_config`).
- Missing: name overrides, sponsor tier, livestream link, photo usage tracking, last-meeting
  helper; ladder has no Drizzle helper (verify `central.ladder` exists in Replit Postgres first).
- Latest migration 0049; next ADR 010.

## Decision: server content builder + layout contract (option A)

Rejected: B (pure builder in the browser — data like ladder/milestones needs the server
anyway, two call sites drift); C (declarative JSON layouts — a layout engine for 3 packs).

### Components

1. `@workspace/scorecard/card-content` (shared, pure, no DB/DOM)
   - `CardContent<K>` per kind: resolved, display-ready values (names already short, dates
     formatted in tenant time zone, fallbacks applied). Match Day: `TitleContent`,
     `FixtureContent`, `SponsorsContent`.
   - Field catalogue = the existing `kind-templates/fields.ts`, extended with
     `{ key, core | optional, presets: ('minimal'|'standard'|'full')[] }`.
   - `resolveVisibleFields(kind, settings, override)` → `Set<fieldKey>`; core always on.
   - `groupSlides(kind, items, { junior, consolidateByDay, capacity })` in `card-sets.ts`:
     junior + consolidate → group by local date, then split each group at the layout's
     `capacity` for the size; otherwise one item per slide. Same function for fixtures and
     results; preserves the 10-slide Meta limit warning.
2. `api-server/src/lib/card-content/` (the only builder)
   - `resolveTeamName(tenantId, centralClubId, gradeKey?)` and `resolveCompetitionLabel(...)`:
     override → auto short name (deterministic stripper, tested on PCA + WA names) → raw.
     Crest from `central.clubs` logo, monogram fallback.
   - `buildMatchDayContent(tenantId, range, audience)`; later `buildResultsContent`,
     `buildTeamListContent`, `buildMatchSummaryContent`, and single-card builders reuse the
     same resolvers. Optional data (ladder, last meeting, milestone watch) loaded only when
     the field is visible; any failure or missing row hides the field (never "TBC").
     Central reads go through `central-queries.ts`; milestones reuse `milestone-crossings.ts`
     (senior only, `player_id >= 90000` excluded, juniors isolated).
   - `pickPhoto(tenantId, scope)`: least recently used from `photo_usage`, junior rules from
     `card_photo_rules`/junior photos respected; null → brand background.
   - Called by: sweep engines (`engines/match-day.ts` etc.), `routes/weekend-carousel.ts`,
     Create a Card prefill. Client mapping in `model.ts` deleted.
3. Layout contract (web pack templates, rendered client and server alike)
   - Templates consume `CardContent` + visible field set only; no data shaping in templates.
   - Each pack x kind declares `capacity[size][preset]` (rows / fixtures per slide) and the
     slots it supports. One name-fit rule shared by all packs: shrink to min scale, then wrap
     to 2 lines, ellipsis only past that.
   - Packs: `club-kit-v1`, `broadcast-dark-v1`, new pack (id TBD). Retired ids map to
     `club-kit-v1` at read time (`readQueuedCarousel`, `resolvePackIdForKind`).
   - Junior consolidated slide = a "multi-fixture" layout per pack (list of compact rows under
     a date heading), required for matchDay and results/matchSummary.

### Data model (migrations 0050+; idempotent, Ash runs in Production SQL before republish)

- 0050 `team_name_overrides` (tenant_id, central_club_id, grade_key null, short_name,
  unique(tenant_id, central_club_id, grade_key)); `competition_label_overrides`
  (tenant_id, grade_key, label). Tenant-scoped curated content; never written to `central`.
- 0051 `social_settings.card_content jsonb` = `{ [kind]: { preset, fields: {key: bool},
juniorConsolidateByDay: bool } }` (default: standard preset, consolidate on for juniors);
  `social_settings.livestream_url text`.
- 0052 `sponsors.tier text` ('major'|'standard', default 'standard');
  `social_settings.sponsors_background_photo_id`.
- 0053 `photo_usage` (tenant_id, photo_id, used_at, draft_id) written when a draft is published.
- OpenAPI first: settings, overrides CRUD, carousel sources response carry the new shapes; codegen.

### Saved payload

`QueuedCarousel` v2: `{ version: 2, packId, setType, size, contentOverride?, slides: [{ id,
content, visibleFields, photoId?, junior }] }`. Content is a snapshot (what was approved is
what posts). v1 still read and rendered unchanged.

### Failure modes

| Failure                                    | Handling                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Central read fails/slow for optional field | Field hidden, warning on draft; core content still builds                                                              |
| Name override deleted/club renamed         | Keyed on central club id; falls back to auto short name                                                                |
| Preset doesn't fit at a size               | CI grid (3 packs x 3 presets x 4 sizes x kinds) fails the build; runtime fit warning blocks automation (existing gate) |
| Junior day group > capacity                | Split into further slides for that day; >10 slides → existing Meta warning                                             |
| Retired pack id in saved draft             | Read-time fallback to Club Kit                                                                                         |
| Photo library empty                        | Brand background, no warning                                                                                           |
| Juniors leakage                            | Junior content built only from junior sources; consolidated slides never mix senior and junior                         |

### Delivery order

1. Names: overrides tables + resolver + auto short name + crests; existing cards switch to it (fixes truncation broadly). Also the Share-to-Socials preview bug as its own small PR.
2. Content contract + Match Day builder + settings jsonb + v2 payload; Club Kit and Broadcast Dark on the contract; delete client mapping; name-fit rule.
3. Junior consolidation (`groupSlides`, multi-fixture layouts) for matchDay, then results/matchSummary.
4. Auto photos (`photo_usage`, LRU).
5. Optional data fields (ladder, last meeting, milestone watch, livestream link).
6. Sponsors page options (tier, background, CTA, next home game / socials).
7. Migrate remaining kinds (teamList, results, matchSummary, single cards / Create a Card) to builders.
8. New pack (design brief first), then retire four packs.
