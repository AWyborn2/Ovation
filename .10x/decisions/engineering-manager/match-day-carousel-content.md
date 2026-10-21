# Engineering Manager — match-day-carousel-content

Inputs: `.10x/decisions/product-manager/match-day-carousel-content.md`,
`.10x/decisions/product-manager/social-tile-short-names.md`, and
`.10x/decisions/architect/match-day-carousel-content.md` (ADR-010, accepted by Ash on 20 Oct 2026).

## Current state (20 Oct 2026)

- The team is Ash plus Claude sessions, using the same shape as selection-side-size: a foundation PR
  in one session, then parallel sessions, each in its own worktree off `main`. PRs are not stacked,
  and each merges only when it is green and CLEAN.
- Ash chose to run this in parallel with selection-side-size (PR B–D) and
  admin-menu-consolidation. Those features touch none of the same files. Migrations here are
  0050–0053. If another feature claims a number first, renumber at rebase.
- Ash runs every migration in Production SQL before the next republish (SQL goes in the PR body).

## Delivery shape

```
P0 preview fix ─┐ (any time)
P1 names ───────┼─> P2 content contract + Match Day ─┬─> P3 junior consolidation
                                                     ├─> P4 auto photos
                                                     ├─> P5 optional data fields
                                                     ├─> P6 sponsors page
                                                     └─> P7 other kinds -> P8 new pack -> P9 hide legacy packs
```

- P0 and P1 can start now, in parallel.
- P2 is the foundation for everything after it. It waits for P1 because it consumes the name resolver.
- After P2, P3–P6 run in parallel sessions (at most 2 at once to limit work in progress). The shared
  files are the pack templates and `card-content` types; the second session to merge rebases.
- P7 needs P3 and P5, because the results and summary builders reuse grouping and the data loaders.
- Estimates are in half-days (hd) and include tests. The total is about 36 hd.

### P0 — Share to Socials preview fix (about 1 hd)

| Task | Description                                                                | Est |
| ---- | -------------------------------------------------------------------------- | --- |
| T0.1 | `useCardPreview` renders every kind and size in the modal; regression test | 1   |

### P1 — names and crests (about 6 hd)

| Task | Description                                                                                                                                                                                     | Est |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T1.1 | Migration 0050 `team_name_overrides`, `competition_label_overrides` (tenant-scoped, idempotent); Drizzle; drift check                                                                           | 1   |
| T1.2 | Auto short name (deterministic, pure, in `@workspace/scorecard`): tests on real PCA + WA club, team and grade names                                                                             | 1   |
| T1.3 | `api-server/src/lib/card-content/names.ts`: `resolveTeamName` / `resolveCompetitionLabel` (override, then auto, then raw), crest from `central.clubs`, monogram fallback; tenant-isolation test | 1   |
| T1.4 | OpenAPI + codegen: overrides CRUD; existing card inputs carry the resolved short names and crests (replace the `cardTeamName()` call sites in `bind.ts`)                                        | 1   |
| T1.5 | Admin UI: "Team and competition names" in Social Studio settings, pre-filled with the auto names and editable inline                                                                            | 1.5 |
| T1.6 | Shared name-fit rule (shrink, then wrap to 2 lines, then ellipsis) used by every pack                                                                                                           | 0.5 |

### P2 — content contract + Match Day builder (about 8 hd)

| Task | Description                                                                                                                                                                                                         | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T2.1 | `@workspace/scorecard/card-content`: `CardContent` types (Match Day title, fixture, sponsors); field catalogue extended with core/optional and presets; `resolveVisibleFields` + unit tests                         | 1.5 |
| T2.2 | Migration 0051: `social_settings.card_content jsonb` (default Standard, junior consolidation on), `livestream_url`; OpenAPI settings shape; codegen                                                                 | 1   |
| T2.3 | `buildMatchDayContent` (core fields only); the sweep `engines/match-day.ts` and `routes/weekend-carousel.ts` both use it; delete the mapping in `model.ts`; parity test showing the sweep and carousel output match | 2   |
| T2.4 | Saved carousel v2 (content snapshot, `visibleFields`, `contentOverride`); v1 still read; retired pack ids fall back to Club Kit when read                                                                           | 1   |
| T2.5 | Club Kit and Broadcast Dark templates on the content contract, each declaring its capacity per size and preset                                                                                                      | 1.5 |
| T2.6 | Content settings UI (presets plus per-field toggles) and a per-carousel override panel in the Weekend Carousel                                                                                                      | 1   |

### P3 — junior same-day consolidation (about 4 hd)

| Task | Description                                                                                                                   | Est |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | --- |
| T3.1 | `groupSlides` in `card-sets.ts`: group by local date, split at capacity, Meta 10-slide warning; never mixes senior and junior | 1   |
| T3.2 | Multi-fixture layout in Club Kit and Broadcast Dark for Match Day                                                             | 1.5 |
| T3.3 | Results and match summary junior sets use the same grouping and a multi-result layout                                         | 1.5 |

### P4 — auto photos (about 2.5 hd)

| Task | Description                                                                                                                                                                           | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T4.1 | Migration 0053 `photo_usage`, written when a draft is published                                                                                                                       | 0.5 |
| T4.2 | `pickPhoto`: picks the least recently used photo for the cover and each fixture, respecting the junior photo rules, with a brand background when none is found; the admin can swap it | 1.5 |
| T4.3 | Weekend Carousel UI shows the auto pick with a "Swap" control                                                                                                                         | 0.5 |

### P5 — optional data fields (about 5 hd)

| Task | Description                                                                                                                               | Est |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T5.0 | Check that `central.ladder` exists and how complete it is in Replit Postgres (dev and prod read); report back before T5.1                 | 0.5 |
| T5.1 | Ladder positions helper in `central-queries.ts` + consistency test                                                                        | 1   |
| T5.2 | Last meeting helper (`central.matches`) + test                                                                                            | 1   |
| T5.3 | Milestone watch, reusing `milestone-crossings` (senior only, fill-ins excluded)                                                           | 1   |
| T5.4 | Fields wired into the builder; each field hides itself when its data is missing or a read fails; the title page shows the livestream link | 1   |
| T5.5 | Template slots for these fields in both packs, plus fit tests                                                                             | 0.5 |

### P6 — sponsors page (about 3 hd)

| Task | Description                                                                                                                                       | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T6.1 | Migration 0052 `sponsors.tier`, `social_settings.sponsors_background_photo_id`; OpenAPI; sponsor admin tier picker                                | 1   |
| T6.2 | Sponsors content: tiered grid, grade sponsors included, thank-you and CTA, next home game and social links, background image; each one toggleable | 1.5 |
| T6.3 | Template slots in both packs + fit tests                                                                                                          | 0.5 |

### P7 — remaining kinds on builders (about 5 hd)

| Task | Description                                                                                                                | Est |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | --- |
| T7.1 | `buildResultsContent` / `buildMatchSummaryContent` (carousel and single cards)                                             | 2   |
| T7.2 | `buildTeamListContent`                                                                                                     | 1   |
| T7.3 | Create a Card prefills from the same builders; check that the auto-queued and manually created versions of each kind match | 2   |

### P8 — new pack (about 3 hd, after a design brief agreed with Ash)

### P9 — hide Gold Foil, Bold Type, Neon Night and Sunset (about 1 hd; revised 21 Oct 2026)

- Hide them everywhere: the new-carousel and Create a Card pickers, the editor's pack switcher,
  the club default pack setting and the auto-queue pack resolution (`resolvePackIdForKind`).
- Saved drafts, carousels and defaults that name one render as Club Kit (read-time fallback, one
  helper, tested). Keep the template code; do not delete it.
- Gate them behind a single `LEGACY_PACK_IDS` list, so the template library can bring them back.

## Definition of done (every PR)

- Tests green, and `npx prettier@3.9.6` run.
- OpenAPI codegen is committed.
- The migration is idempotent, and its SQL is in the PR body.
- A visual fit grid for the packs touched: every preset at every size, with no overflow.
- Juniors isolation and fill-in exclusion are covered by tests.

## Risks

- `central.ladder` may be missing or patchy (T5.0 checks this before any ladder work).
- The fit grid grows with packs, presets, sizes and kinds. Keep it to the CI headless renderer and
  serialise the renders.
- P2 touches the live sweep, so the parity test must pass before merge to keep auto-queued drafts unchanged.
- Migration numbers could collide with parallel features. Renumber at rebase.
