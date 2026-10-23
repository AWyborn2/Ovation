# Engineering Manager — social-template-library

Status: PLANNING COMPLETE 21 Oct 2026.

Inputs:

- `.10x/decisions/product-manager/social-template-library.md` (approved by Ash on 21 Oct 2026)
- `.10x/decisions/architect/social-template-library.md` (slices in §15) and `.10x/adrs/011-social-template-library.md` (ADR-011, accepted)

## Decisions made with Ash (21 Oct 2026)

1. **All seven converted looks gate the single merge.** Club Kit, Broadcast Dark, Duotone, Gold Foil, Bold Type, Neon Night and Sunset must each be polished, fit-checked, listed and signed off by Ash before #411 merges. This supersedes the architect's §5 gate, where only the three active looks gated and the hidden four listed later. Polish is now on the critical path.
2. **Up to four Claude sessions at once.** The streams are below, with two of them polishing looks in parallel.
3. **The structured-output spike runs now, alongside L1.** Ash adds an `ANTHROPIC_API_KEY` to the local dev stack and approved about US$20 of API calls for it. Its result decides the shape of `format.schema.json` before L1 writes it.
4. **Milestone testing.** Slice PRs merge into the integration branch once CI is green, without waiting for Ash. Each PR body carries a short dev-stack test script. Ash runs a fuller check at five milestones and a final pass before the merge to `main`.

Delivery rule (unchanged): every PR branches off `wyborn21/social-template-library-pm` and targets it. Nothing reaches `main` until Ash has tested the whole feature on the local dev server and merges #411 himself. No session merges #411.

## Facts found while planning [CONFIRMED in code 21 Oct 2026]

- **Migration 0057 is taken.** #412 (Email all) merged `0057_email_send_batches.sql` to `main` on 21 Oct 2026. The library's migration is **0058**, designed as 0057 in ADR-011. Take the next free number when L3-A opens, and renumber at every `main` sync. L9 fixes the final number.
- **The integration branch is 2 commits behind `main`** (#412). Sync it before L1-A starts.
- **`ensure-constraints` puts the old index back.** `scripts/src/ensure-constraints.ts` recreates `card_templates_kind_unique`, and it runs after every migrate, both in CI and in Replit's `post-merge.sh`. Left alone, it would bring back one-kind-row-per-tenant after 0058 drops it, and the second copy of any kind would fail. L3-A swaps that entry for `card_templates_kind_default_unique`.
- **Today's code relies on that index.** `kind-templates.ts` creates kind rows lazily with a bare `onConflictDoNothing()`. Publishing's dev→prod schema sync does not run data updates, so the `UPDATE ... set is_kind_default = true` that carries the pilot over reaches production only through Ash's hand-run SQL. See the release steps.
- **Structured outputs reject recursive schemas.** Nested stacks can't be one recursive `$ref`. The schema must be unrolled to the depth limit of 4, flattened with parent ids, or left out. Numeric and length constraints aren't supported either: the SDK strips them and checks client-side. `validate.ts` stays the authority whatever the spike picks.
- **The API ships as one esbuild file** (`artifacts/api-server/build.mjs` → `dist/index.mjs`). Bundles must be imported through a generated index so esbuild inlines them. Reading `lib/template-bundles/` from disk at runtime would fail in production.
- **`puppeteer-core` is already a dependency** of the API server. `playhq-sync.yml` installs it in CI with `CHROME_PATH=/usr/bin/google-chrome`. `@anthropic-ai/sdk` is not a dependency yet.
- **The local dev stack** (`.local/dev-stack` in Ash's `player-stats-pre-post-digital-96e790` worktree, git-ignored) applies pending migrations and rebuilds the API on restart. It sets `KIND_TEMPLATES=all`, which is simply ignored once L3-B deletes the switch.
  - It has **no object storage**: Replit's sidecar isn't there, so nothing can be stored under `library/` locally. L3-A adds a dev-only filesystem store.
  - Its `run.mjs` passes only `SESSION_SECRET` and `ADMIN_PASSWORD` from `secrets.json`. The two new secrets need passing through (task S.0).
  - Meta publishing, email and SMS are off locally. The warnings gate is checked through the sweep and the queue, not real posts.
- **Ash's test surface for the format** already exists: `admin-starter-proofs.tsx` is a contact sheet of every starter × kind × size with sample, stress and junior data. It grows into the template proofs sheet (L1-D, L2-B).

## Delivery shapes considered

| Shape                                                                         | Effort and time                       | Risk                                               | Verdict              |
| ----------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- | -------------------- |
| Four streams, milestone checks (chosen)                                       | ~150 hd of work, critical path ~45 hd | Shared files across streams; ownership rules below | Ash's choices 2 to 4 |
| One slice at a time, in the architect's order                                 | Same work, elapsed ~150 hd            | Lowest coordination; very slow                     | Too slow             |
| Four streams, Ash tests every PR before it merges into the integration branch | Same work; each PR waits for Ash      | Earliest feedback; Ash becomes the bottleneck      | Not chosen (4)       |

## Delivery shape

Estimates are in half-days (hd) and include tests. No task is longer than one half-day. The total is about 150 hd. These are nominal units: past features here ran several times faster than their half-days. Plan by the order and the dependencies, not by the totals.

### Dependencies

| PR                             | Needs                                                          |
| ------------------------------ | -------------------------------------------------------------- |
| L1-A format foundation         | Nothing (after the `main` sync)                                |
| Spike                          | T1.1's types (starts from the architect's sketch)              |
| L4-A1 converter capture        | Nothing                                                        |
| L1-B validation and schema     | L1-A, the spike's decision                                     |
| L1-C layout, L1-D style        | L1-A                                                           |
| L2-A matrix and worst case     | L1-A                                                           |
| L2-B fit everywhere            | L1-C, L2-A                                                     |
| L3-A store                     | L1-A; T3.6 needs L1-B; T3.13 needs L2-B                        |
| L3-B pipeline switch           | L3-A; T3.14 and T3.20 need L4-B's raw conversions              |
| L4-A2 converter mapping        | L1-A, L4-A1 (output checked with L1-B's validator)             |
| L4-B starters, raw conversions | L4-A2, L1-D, L2-B                                              |
| L4-C polish (one PR per look)  | L4-B                                                           |
| L4-D starters' carousel pages  | L4-B and the polished look each starter borrows its pages from |
| L5-A browse and use            | L3-A                                                           |
| L5-B editor v2                 | L1-C, L1-D, L3-A                                               |
| L5-C pickers                   | L3-B, L5-A                                                     |
| L6 update available            | L3-A, L5-A                                                     |
| L7-A console library           | L3-A, L5-B                                                     |
| L7-B designer tool             | The spike, L1-B, L2-B, L7-A                                    |
| L8-A Figma mapping             | L1-A                                                           |
| L8-B Figma import              | L8-A, L3-A (T3.12 storage), L7-A (console)                     |
| L9 release                     | Everything above, and M1 to M5 passed                          |

### Streams (at most four sessions at once)

Each stream holds one PR open at a time. Ranges are hd from the start.

| Stream                         | Sequence                                                                                                                                          | Ends |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1 Format, fit and active looks | L1-A (0–5) → L1-C (5–11) → L2-B (11–17) → L4-B (17–19) → Club Kit (19–24) → Broadcast Dark (24–29) → Duotone (29–33) → L4-D starter pages (33–36) | 36   |
| 2 Spike, styles, editor, AI    | Spike (0–4) → L1-B (5–9.5) → L1-D (9.5–15.5) → L5-B (15.5–23) → L7-A + L7-B (23–35) → L8-B (35–38.5)                                              | 38.5 |
| 3 Platform                     | waits for L1-A → L3-A (5–17.5) → L3-B (17.5–26) → L5-A (26–32) → L5-C (32–36.5) → L6 (36.5–39.5)                                                  | 39.5 |
| 4 Converter and hidden looks   | L4-A1 capture (0–3) → L2-A (5–8) → L4-A2 mapping (8–14.5) → L8-A Figma mapping (14.5–19) → Gold Foil, Bold Type, Neon Night, Sunset (19–39)       | 39   |

- **At the start, three sessions run:** Stream 1 (L1-A), Stream 2 (the spike) and Stream 4 (converter capture, which needs nothing new). Stream 3 starts when L1-A merges.
- **Critical path, about 45 hd.** Two chains are near-critical:
  - Platform: L1-A → L3-A → L3-B → L5-A → L5-C → L6 → L9 (5 + 12.5 + 8.5 + 6 + 4.5 + 3 + 5 = 44.5).
  - Looks: L1-A → L1-C → L2-B → L4-B → four hidden looks → L9 (5 + 6 + 6 + 2 + 20 + 5 = 44).
- **Buffer.** Keep 20% for surprises (about 9 hd on the critical path, so about 54 hd). Polish is the most likely overrun.
- **Rebalancing.** Stream 1 frees up first, at 36. It then takes whatever is behind: a hidden look's leftover polish, or L6.

### File ownership (parallel sessions)

| Files                                                          | Owner, and who rebases                                                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/scorecard/src/kind-templates/*`                           | L1-A creates the format modules; L1-B owns `validate.ts`, the sanitiser and the schema; L2-A owns `fit-matrix.ts` and `worst-case.ts`                                                        |
| `pack-render/render.ts`, `adjustments.ts`                      | L1-A adds the seams (layout, style, motion and vector modules, empty). L1-C fills `layer-layout.ts` and `layer-fit.ts`; L1-D fills `layer-style.ts`, `layer-motion.ts` and `layer-vector.ts` |
| `pages/card-render-harness.tsx`                                | L4-A1 adds `capture`, L2-B adds `fitCheck`. The second to merge rebases                                                                                                                      |
| `scripts/src/lib/harness-browser.ts` (new)                     | L4-A1 builds it (build the web app, serve the harness, drive Chrome); L2-B and L4 reuse it                                                                                                   |
| `lib/db/migrations/*`, Drizzle schema, `ensure-constraints.ts` | L3-A only                                                                                                                                                                                    |
| `lib/api-spec/openapi.yaml` and generated code                 | L3-A, L5-C, L6, L7, L8 each add their own paths. The second to merge regenerates codegen; never hand-merge generated files                                                                   |
| `lib/template-bundles/<look>/`                                 | L4-B creates them; each polish PR owns one look's folder                                                                                                                                     |
| `.10x/status.md`                                               | Not touched by slice PRs (four sessions would collide). Updated by the milestone sync PRs                                                                                                    |

## Spike: does the format's JSON Schema fit structured outputs? (about 4 hd, Stream 2, now)

Question: can `claude-opus-5-5` take `format.schema.json` as `output_config.format` with nested stack groups, and does it produce valid documents more often than a schema-in-the-prompt loop?

S.1 starts from the type sketch in the architect's §1 and lines up with T1.1 as soon as L1-A pushes it. S.3 runs `validate.ts` from the L1-B branch if L1-B hasn't merged yet.

| Task | Description                                                                                                                                                                                                                                                                                                                                                                                                | Est |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| S.0  | Dev stack: Ash puts `ANTHROPIC_API_KEY` in `.local/dev-stack/secrets.json`, and the session makes `run.mjs` pass it (and `FIGMA_ACCESS_TOKEN`, for L8) to the API when present. Never printed, never committed                                                                                                                                                                                             | 0.5 |
| S.1  | Draft three shapes from T1.1's types: **(a)** nested, unrolled to depth 4 with one `$defs` entry per level (no recursion); **(b)** flat layers with `parentId`, nested in code afterwards; **(c)** no schema, with the format rules in the prompt and `validate.ts` retries. Offline: size, `$ref` and `anyOf` counts, `additionalProperties: false` everywhere, and which constraints the SDK would strip | 1   |
| S.2  | `scripts/src/spike-template-schema.ts`: send (a) per kind (one kind's pages and token enums) and for the whole format, then (b), to `claude-opus-5-5`. Record accepted or 400 (with the error), first-call compile latency, output tokens and cost                                                                                                                                                         | 1   |
| S.3  | Quality probe: 5 briefs × the shapes that compile, plus (c). Streamed, adaptive thinking, effort `high`. Run `validate.ts` on each output and record validity, tokens and cost. Stop at the US$20 cap                                                                                                                                                                                                      | 1   |
| S.4  | Write the decision in `docs/plans/2026-10-21-template-schema-spike.md`. It tells T1.11 which shape to write and L7 which request to send                                                                                                                                                                                                                                                                   | 0.5 |

Decision rule: take (a) per kind if every kind's schema compiles and its validity is at least (c)'s. Otherwise take (b) if it compiles. Otherwise take (c). Hand any semantic errors (tokens on the wrong page, ranges, depth) to the retry loop in every case.

## L1 — format v2 and renderer (about 21.5 hd, four PRs)

### L1-A — format foundation (5 hd, Stream 1, first)

| Task | Description                                                                                                                                                                                                        | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| T1.1 | `kind-templates/format.ts`: v2 types (`TemplateDocumentV2`, `PageKey`, the layer union with `group` + `stack`, `vector`, `showWhen`, `fit`, the extended style, `motion`, optional `timeline`)                     | 1   |
| T1.2 | `normalise.ts`: v1 `{ layers }` reads as the kind's primary page, and `animation` reads as `motion.in`. In memory only; stored documents are never rewritten. Tests over every starter and a pilot-shaped document | 1   |
| T1.3 | `pages.ts`: pages per kind (primary first), Results using the Match Summary pages, and the bookend rule (title and sponsors come from the Match Day template of the same look)                                     | 0.5 |
| T1.4 | Page token catalogues extending `KIND_FIELDS`: carousel page tokens (`weekendTitle`, `dateRange`, `dayHeading`, …), the new `dayRows` and `sponsors` repeats, and each token's ADR-010 content field               | 1   |
| T1.5 | Drop rule: a layer whose bound tokens are all hidden or empty is dropped, and core fields are always visible. Unit tests per preset                                                                                | 0.5 |
| T1.6 | The renderer reads every document through `normalise()` and draws the requested page, with empty seams for layout, style, motion and vector. **v1 byte-identical test** (see Required tests)                       | 1   |

Dev-stack check: Starter proofs and the kind-template editor look exactly as before.

### L1-B — validation and schema (4.5 hd, Stream 2, after the spike)

| Task  | Description                                                                                                                                                                   | Est |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T1.7  | `validate.ts` v2, structure: known keys only, finite in-range numbers, bounded strings, page keys valid for the kind, tokens and repeats valid for the page                   | 1   |
| T1.8  | `validate.ts` v2, limits: stack depth ≤ 4, 300 layers a page and 600 a document, 64 KB a vector and 1 MB a document; the closed blend list, filter presets and gradient stops | 1   |
| T1.9  | SVG sanitiser: allowlisted elements and attributes, no `href`, scripts, `foreignObject` or external `url()`, token fills and strokes. Hostile-input tests                     | 1   |
| T1.10 | `documentRowsCapacity(page, size, repeat)` from the rows layer's geometry                                                                                                     | 0.5 |
| T1.11 | `format.schema.json` in the shape the spike picked, plus a drift test that it accepts every starter now and every bundle later                                                | 1   |

### L1-C — layout (6 hd, Stream 1)

| Task  | Description                                                                                                                                                      | Est |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T1.12 | Page selection in `renderPackCard` and `<PackCard>` for templated drafts and carousel slides                                                                     | 1   |
| T1.13 | Group layers with `stack`: CSS flex inside the group's absolute box, children's geometry ignored apart from width and height                                     | 1   |
| T1.14 | Collapse: a hidden, condition-false or empty child takes no space. Stacks nest to depth 4. Tests per preset                                                      | 1   |
| T1.15 | `showWhen` (field, photo, sponsors, junior), evaluated after the render path's junior and private-player rules. Test: a condition can't reveal anything withheld | 1   |
| T1.16 | Rows layers for the `dayRows` and `sponsors` repeats                                                                                                             | 1   |
| T1.17 | Text `fit` in `layer-fit.ts`: shrink to `minScale`, then two lines, then ellipsis, then warn                                                                     | 1   |

### L1-D — style, motion and the proofs sheet (6 hd, Stream 2)

| Task  | Description                                                                                                                                                                                               | Est |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T1.18 | Linear and radial gradients with token or hex stops; text fills (background-clip text)                                                                                                                    | 1   |
| T1.19 | Borders, `boxShadow`, `textShadow` and blend modes                                                                                                                                                        | 0.5 |
| T1.20 | Photo filters: `duotone(dark, light)` from the club's colours (reusing `duotone-vars.ts`), grayscale, blur ≤ 20 px; grain and halftone overlays                                                           | 1   |
| T1.21 | Derived palettes: `--ck-*` and `--dt-*` emitted when the document declares or uses them; token colour references                                                                                          | 1   |
| T1.22 | Vector layers drawn from sanitised SVG with token fills                                                                                                                                                   | 0.5 |
| T1.23 | Motion: `in` presets (rise, fade, pop) and `loop` presets pulse and shine, reproducing `hhPulse` and `hhShine`; keyframes inlined with the card; clip length rule unchanged, with `animation-clock` tests | 1   |
| T1.24 | Template proofs sheet: `admin-starter-proofs.tsx` also shows v2 sample documents (stacks collapsing per preset, conditions, styles, vectors, motion)                                                      | 1   |

## L2 — fit check (about 9 hd, two PRs)

### L2-A — matrix and worst-case content (3 hd, Stream 4, after L1-A)

| Task | Description                                                                                                                                                                                                              | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| T2.1 | `fit-matrix.ts`: pages × covered sizes × presets (content kinds) × photo on and off (where photo-conditioned or bound) × sponsors none and the kind's maximum. Tests count the variants per kind                         | 1   |
| T2.2 | `worst-case.ts`: worst-case content per kind and page (longest names, most digits, rows at capacity, every optional field on at Full, junior "PRIVATE PLAYER" rows)                                                      | 1   |
| T2.3 | Committed long-names fixture and `scripts/src/refresh-worst-case-names.ts`, reading any `CENTRAL_DATABASE_URL`. The dev stack has PCA only, so WA names come from a database with WA projected, or the WA builder folder | 1   |

### L2-B — the fit check everywhere (6 hd, Stream 1, after L1-C and L2-A)

| Task  | Description                                                                                                                                                                                                                                    | Est |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T2.4  | `template-fit.ts` DOM checks: overflow after fit, every core field bound on each size, hidden fields show nothing, rows at capacity fit and capacity ≥ 1, nothing data-bearing off the artboard, fonts loaded, the vector and image URL policy | 1   |
| T2.5  | Harness `fitCheck(document, kind)`: every variant in one page, no new page per still; returns the fit report (warnings per page × size × preset, renderer and fonts version)                                                                   | 1   |
| T2.6  | Server fit job on the serialised render queue, publish renders first, variants batched in one page. Writes through a `FitTarget` interface; L3-A wires it to versions and copies                                                               | 1   |
| T2.7  | A fit job that can't run leaves `pending` (automation stays blocked, ADR-003) and retries on the next sweep                                                                                                                                    | 0.5 |
| T2.8  | `scripts/src/check-template-bundles.ts` on `harness-browser.ts`: bundles whose hash changed, or every bundle when `pack-render/**` or `kind-templates/**` change; a report; non-zero exit on failure                                           | 1   |
| T2.9  | CI job `template-bundles` in `ci.yml`: Chrome, path filters, the web build cached. A required check on PRs into the integration branch                                                                                                         | 1   |
| T2.10 | The proofs sheet shows each template's fit report; `pnpm --filter @workspace/scripts run check-template-bundles` runs on the dev stack                                                                                                         | 0.5 |

Note for DevOps: CI minutes for the Chromium job. The path filters keep it to bundle and renderer changes.

## L3 — store and pipeline (about 21 hd, two PRs)

### L3-A — store (12.5 hd, Stream 3, after L1-A; T3.6 needs L1-B's validator)

| Task  | Description                                                                                                                                                                                                                                                                                                             | Est |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T3.1  | **Migration 0058** (architect §2: library tables, `card_templates` columns and the index swap, `social_drafts.template_ref`, `template_generations`), idempotent. Drizzle schema, journal entry and snapshot. Replace `card_templates_kind_unique` with `card_templates_kind_default_unique` in `ensure-constraints.ts` | 1   |
| T3.2  | Migration test: pilot-shaped kind rows gain `is_kind_default = true` with ids, versions and documents unchanged; the new index allows one default per kind and many copies; re-running is a no-op; `ensure-constraints` doesn't bring the old index back                                                                | 1   |
| T3.3  | Bundle layout (`look.json` plus `<kind>.json`) and a generated `lib/template-bundles/index.ts`, so esbuild inlines the bundles into the API build. A test that the web app never imports them                                                                                                                           | 1   |
| T3.4  | `syncBundles()` at boot: upsert looks and templates by `slug`, insert-or-ignore versions, set `current_version`; new versions start `pending` for the fit job and list once they pass. Parallel-boot test                                                                                                               | 1   |
| T3.5  | Library store: list (kind, size, look, cursor; listed and covering the size), get, looks. Library reads never return `card_templates` rows                                                                                                                                                                              | 1   |
| T3.6  | Copies: create from a library version, duplicate, get and list (tenant-filtered), save with `baseVersion` (409 on conflict), delete (refused for the default). The first document save sets `edited_at`; a save sets fit `pending`                                                                                      | 1   |
| T3.7  | Defaults: set default in one transaction (refused while the copy's fit is pending); adopt a look (reuse an unedited copy at the current version, or create one; kinds the look doesn't cover keep theirs)                                                                                                               | 1   |
| T3.8  | OpenAPI for the library and club-template routes (architect §12), then codegen                                                                                                                                                                                                                                          | 1   |
| T3.9  | Routes (writes need `socialStudio`), plus route tests                                                                                                                                                                                                                                                                   | 1   |
| T3.10 | `GET /template-library/preview-input?kind`: the club's latest **senior** draft input of the kind, else the kind's sample in the club's identity. Test with a junior draft present                                                                                                                                       | 1   |
| T3.11 | Tenant isolation tests, in the style of `tenant-isolation.test.ts`: copies, defaults, adopt, preview input, apply to waiting drafts                                                                                                                                                                                     | 1   |
| T3.12 | The library asset policy (a library document references only `library/` URLs, tokens or slots), plus a dev-only filesystem store behind `ObjectStorageService` when `LOCAL_OBJECT_STORAGE_DIR` is set. The dev stack sets it; production never does                                                                     | 1   |
| T3.13 | Wire L2-B's fit job to versions and copies (`fit_status`, `fit_report`)                                                                                                                                                                                                                                                 | 0.5 |

Dev-stack check: after a restart the migration applies. Halls Head's queue, drafts and kind templates are unchanged, and the bundle sync and fit status show in the API logs.

### L3-B — pipeline switch (8.5 hd, Stream 3, after L3-A; T3.14 and T3.20 need L4-B's raw conversions)

| Task  | Description                                                                                                                                                                                                                                              | Est |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T3.14 | `PACK_TO_LOOK` replaces `PACK_TO_STARTER`. `ensureDefaultTemplate(tenant, kind)` lazily copies the club's pack look (Club Kit if that look lacks the kind) with insert-or-ignore on the partial index. The `replaced_pack_id` notice links to the look   | 1   |
| T3.15 | Guard: a kind that has pre-library rows (no origin) but no default promotes that row instead of seeding a new one. It protects the pilot if the production data step is ever missed                                                                      | 0.5 |
| T3.16 | Drafts: the sweep and manual drafts copy the default copy and set `template_ref`, `template_version` and `layout_check_pending`; "apply to waiting drafts" keyed by kind (`draft-upsert.ts`)                                                             | 1   |
| T3.17 | Delete `KIND_TEMPLATES`: `config.ts`, `kind-templates-switch.ts`, the `enabled` flag and the 404-when-off branches. `templatedDesignFor` always applies                                                                                                  | 1   |
| T3.18 | `/kind-templates/*` stays as a thin wrapper over the default copy until L5-C, so today's editor keeps working on the dev stack                                                                                                                           | 0.5 |
| T3.19 | Saved carousel v3 in `queued-carousel.ts` (`{ version: 3, templateRef, setType, size, contentOverride?, slides }`); v1 and v2 read unchanged                                                                                                             | 1   |
| T3.20 | Carousel assembly: the picked template or the club's default; bookends from the Match Day template of the same look, else the club's default Match Day; a missing page uses the pack look for that kind as a whole template; pages never mixed otherwise | 1   |
| T3.21 | The Weekend Carousel and Create a Card routes accept `templateRef` and save v3 or templated drafts                                                                                                                                                       | 1   |
| T3.22 | **Pilot carry-over test** (see Required tests)                                                                                                                                                                                                           | 1   |
| T3.23 | Every-club test: clubs on Club Kit, Broadcast Dark, Duotone and a hidden pack get lazy defaults from the right look. Log sweep render time per club for SRE                                                                                              | 0.5 |

Dev-stack check: run the sweep. Every club's new drafts are templated, and the Weekend Carousel saves v3. Carousels saved earlier render as before, and the old editor still edits Halls Head's default.

## L4 — converter and content (about 48.5 hd)

### L4-A — converter (9.5 hd, Stream 4; capture first, mapping after L1-A)

| Task  | Description                                                                                                                                                                                    | Est |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T4.1  | Harness `capture(packId, input, size)`, dev and CI only: per element the tag, the `data-*` slot attributes, the box relative to the card root, computed styles and `::before`/`::after` styles | 1   |
| T4.2  | Sentinel content per kind × page (each field a unique marker), two contrasting sentinel palettes, worst-case input for boxes                                                                   | 1   |
| T4.3  | `harness-browser.ts` (build, serve, drive Chrome with `puppeteer-core`) and the `convert-pack.ts` driver over every pack × kind × page × size × preset                                         | 1   |
| T4.4  | Map text: markers to `{{tokens}}` with style; `data-fit` and `data-fit-row` to `fit { minScale 0.6, maxLines 2, ellipsis }`                                                                    | 1   |
| T4.5  | Map slots (photo, logo, crest; monogram fallback to `showWhen`) and `data-repeat` to rows layers (cells, row height, gap)                                                                      | 1   |
| T4.6  | Map stacks (flex containers whose children move between presets) and `showWhen` (`data-drop-if-field`, photo and no-photo branches)                                                            | 1   |
| T4.7  | Map shapes and the extended style; a colour equal to a sentinel token in both palettes becomes `var(--token)`; inline SVG becomes a tokenised vector layer                                     | 1   |
| T4.8  | Map motion: `hhPulse` to `loop: pulse, 1400`, `hhShine` to `loop: shine, 5500` with a gradient text fill; static glows to `textShadow`                                                         | 0.5 |
| T4.9  | Merge per-size captures into one document (geometry per size, preset differences resolved by stacks); unmapped parts listed                                                                    | 1   |
| T4.10 | `report.md` per look: layers mapped, polish items, colours not tokenised, motion found and mapped, the fit result and a pixel-diff score against the pack, per kind × page × size              | 1   |

PRs: L4-A1 is T4.1–T4.3, L4-A2 is T4.4–T4.10.

### L4-B — starters and raw conversions (2 hd, Stream 1, after L2-B and L4-A)

| Task  | Description                                                                                                                                                                | Est |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T4.11 | Export the three starters as bundles (`club-kit-classic`, `broadcast-classic`, `clubhouse`), byte-identical to the TypeScript starters (test). The TypeScript goes in L5-C | 1   |
| T4.12 | Raw conversions of all seven packs, committed as unlisted bundles with their reports, so L3-B and polish can start                                                         | 1   |

### L4-C — polish, one PR per look (34 hd; Streams 1 and 4)

Each look follows the same task list. Designer polish edits the bundle JSON and checks it on the proofs sheet.

| Task | Description                                                                                                                             | Est |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P1   | Match Day fixture and title pages                                                                                                       | 1   |
| P2   | Match Day day and sponsors pages                                                                                                        | 1   |
| P3   | Match Summary result and day pages (also the Results set)                                                                               | 1   |
| P4   | Team List                                                                                                                               | 0.5 |
| P5   | Every other kind the look covers                                                                                                        | 1   |
| P6   | Fit pass at every page × size × preset in CI, motion parity and pixel diff in `report.md`, half-days logged; the bundle marked `listed` | 0.5 |

| Look           | Stream | Est | Notes                                                     |
| -------------- | ------ | --- | --------------------------------------------------------- |
| Club Kit       | 1      | 5   | Every carousel's fallback look; do it first               |
| Broadcast Dark | 1      | 5   | LIVE pulse                                                |
| Duotone        | 1      | 4   | Three kinds only (no P5); duotone filter and no-photo art |
| Gold Foil      | 4      | 5   | Foil shine and pulse                                      |
| Bold Type      | 4      | 5   | LIVE pulse                                                |
| Neon Night     | 4      | 5   | LIVE pulse, glow as `textShadow`                          |
| Sunset         | 4      | 5   | LIVE pulse, shadow as `textShadow`                        |

- The PM's target is an average of 5 hd of polish per pack or less. Each report records the actual figure.
- If a look passes 8 hd, the stream stops and tells Ash, with the report: hand-design it (ADR-011 allows that), or give it more time. Dropping it isn't an option, because all seven gate the merge.

### L4-D — the starters' carousel pages (3 hd, Stream 1)

`club-kit-classic`, `broadcast-classic` and `clubhouse` each gain the Match Day title, day and sponsors pages and the Match Summary day page, taken from the nearest converted look. Then they pass the fit check and are listed. 1 hd each.

## L5 — library UI (about 18 hd, three PRs)

### L5-A — browse and use (6 hd, Stream 3; needs L3-A, runs after L3-B in its stream)

| Task | Description                                                                                                                                               | Est |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T5.1 | Studio → Library: route and navigation; kind, size and look filters; 24 a page                                                                            | 1   |
| T5.2 | Thumbnails: `<PackCard packId="blank">` with the club's `PackCardData` and the preview input, loaded once per kind, drawn lazily as they scroll into view | 1   |
| T5.3 | Template detail: pages × sizes in the club's data, look and author; Use, and Use as default                                                               | 1   |
| T5.4 | Looks: a look's kinds side by side; Adopt look, with a confirmation listing the defaults that change                                                      | 1   |
| T5.5 | Your templates: copies per kind, default badge, duplicate, delete (not the default), set default (disabled while fit is pending), "Based on …" credit     | 1   |
| T5.6 | Web tests for browse, use, adopt and defaults                                                                                                             | 1   |

### L5-B — editor v2 (7.5 hd, Stream 2, after L1 and L3-A)

| Task  | Description                                                                                                                          | Est |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | --- |
| T5.7  | The editor loads and saves copies through `/club-templates/:id` (`baseVersion`, 409), and shows fit status and warnings after a save | 1   |
| T5.8  | Page switcher, and a preset preview (Minimal, Standard, Full)                                                                        | 1   |
| T5.9  | Group and stack controls: group, direction, gap, alignment, child order; depth guard                                                 | 1   |
| T5.10 | `showWhen` controls and text fit (max lines, min scale) in the text style bar                                                        | 1   |
| T5.11 | Style controls: gradient, text fill, border, shadow, blend, photo filter                                                             | 1   |
| T5.12 | Motion controls: in preset with delay and duration, loop preset with period, play in preview                                         | 1   |
| T5.13 | Vector layers: select, move, resize, swap token colours. No SVG drawing in R1 (vectors come from conversion and import)              | 0.5 |
| T5.14 | Editor tests (extend `template-mode` and `editor-templated`)                                                                         | 1   |

### L5-C — pickers and retiring the old surfaces (4.5 hd, Stream 3, after L5-A)

| Task  | Description                                                                                                                                                                                                                                         | Est |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T5.15 | Template picker: the club's copies and the library for the kind, default preselected                                                                                                                                                                | 1   |
| T5.16 | Create a Card uses the picker; the draft copies the chosen document with `templateRef`; the default doesn't change                                                                                                                                  | 1   |
| T5.17 | The Weekend Carousel uses the picker, saves v3 and previews the assembled pages                                                                                                                                                                     | 1   |
| T5.18 | Remove `/kind-templates/*` (wrapper, spec, codegen), the kind-templates section, the starter chooser and the dialogs it replaces; delete the starter TypeScript, `starterForPack`, `startingDocument`, `placeholderDocument` and `RETIRED_PACK_IDS` | 1   |
| T5.19 | New posts list templates, never packs; old pack drafts still render through pack code (tests)                                                                                                                                                       | 0.5 |

## L6 — update available (3 hd, Stream 3)

| Task | Description                                                                                                                                                                                                                    | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| T6.1 | `updateAvailable` on unedited copies whose origin's `current_version` is newer (listed or not). `POST /club-templates/:id/update` replaces the document, sets `origin_version` and bumps `version`; refused for an edited copy | 1   |
| T6.2 | Tests of the edit rule: using a template, taking an update or setting a default never sets `edited_at`; the first document save does                                                                                           | 0.5 |
| T6.3 | UI: the badge in Your templates and the editor, a side-by-side preview, Take update; "Based on X by Y" on edited copies                                                                                                        | 1   |
| T6.4 | A way to see it on the dev stack: bump a bundle's version locally and restart                                                                                                                                                  | 0.5 |

## L7 — AI designer tool (about 12 hd, Stream 2, after L3-A and L5-B)

### L7-A — platform console library (2.5 hd)

| Task | Description                                                                                                                                                                                                      | Est |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T7.1 | Platform routes and OpenAPI: list and create templates, new version, list and unlist, create looks                                                                                                               | 1   |
| T7.2 | Console → Library: templates with origin, listed and fit; edit with editor v2 (a save is a new version); duplicating a bundle template makes a console copy; listing needs a pass at every page, size and preset | 1   |
| T7.3 | Route and page tests                                                                                                                                                                                             | 0.5 |

### L7-B — the designer tool (9.5 hd)

| Task  | Description                                                                                                                                                                                                                             | Est |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T7.4  | Add `@anthropic-ai/sdk` to the API server. `template-ai/provider.ts` is its only import. Config: model `claude-opus-5-5`, `max_tokens` 64000, prices $4 / $20 per MTok and cache reads $0.20                                            | 1   |
| T7.5  | `prompt.ts`: a system block cached for 1 hour (format rules, design guidance, 2–3 bundle examples), a second cached block (the kind's pages and tokens), then the brief, image and sample content. A test reads cache hits from `usage` | 1   |
| T7.6  | The request: streamed to `finalMessage()`, adaptive thinking, effort `high`, structured output in the spike's shape, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. A refusal records outcome `refused`            | 1   |
| T7.7  | The loop: validate, send errors back in an appended turn, fit job, send warnings back; at most two retries; always saved as an unlisted console template, with its warnings                                                             | 1   |
| T7.8  | Jobs: a `template_generations` row (queued, running, done, failed), worked in-process and polled; a job running at restart is marked failed; tokens, cost, attempts, `first_try_fit` and outcome recorded                               | 1   |
| T7.9  | Reference images: uploads only (PNG or JPEG, ≤ 5 MB), downscaled to a 1,568 px long edge, EXIF stripped, only the hash kept. Library photo ids are refused                                                                              | 1   |
| T7.10 | **No club data reaches the provider** (see Required tests)                                                                                                                                                                              | 1   |
| T7.11 | Console UI: brief, image upload, kind, a notice of what is sent, job status, and a link to the resulting template                                                                                                                       | 1   |
| T7.12 | Routes, OpenAPI and codegen; tests with a stub provider                                                                                                                                                                                 | 1   |
| T7.13 | The quality-bar figure (share of `first_try_fit` over the first 50 generations) and cost per generation, shown in the console                                                                                                           | 0.5 |

## L8 — Figma import (about 8 hd)

### L8-A — mapping (4.5 hd, Stream 4, after L1-A)

| Task | Description                                                                                                                                                               | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T8.1 | A recorded Figma file fixture, so tests run without the token. `FIGMA_ACCESS_TOKEN` goes in the dev stack (S.0 passes it through)                                         | 0.5 |
| T8.2 | `template-import/figma.ts` client: `GET /v1/files/:key/nodes` and `GET /v1/images/:key` (SVG and PNG); an expired or revoked token gives a clear reconnect message        | 1   |
| T8.3 | Frames to page × size (named `<page>/<size>`, or by dimensions); layers matched across sizes by name path                                                                 | 1   |
| T8.4 | TEXT to text layers (tokens, font, weight, size as % of width, letter spacing, case, alignment); fonts outside the catalogue get the nearest substitute and a report line | 1   |
| T8.5 | Colours (`ovation/*` variables to tokens, else hex); rectangles and ellipses to shapes (fills, gradients, radius, stroke, shadow)                                         | 1   |

### L8-B — the import (3.5 hd, Stream 2, after L3-A and L7)

| Task | Description                                                                                                                   | Est |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | --- |
| T8.6 | Image fills: `{{photo}}` and `{{clubLogo}}` become slots; other images are copied to `library/`                               | 1   |
| T8.7 | Auto layout to stacks; `rows:<repeat>` frames to rows layers; vectors, boolean operations and complex groups to sanitised SVG | 1   |
| T8.8 | The import report; the result is an unlisted console template, validated and sent to the fit job                              | 0.5 |
| T8.9 | `POST /platform/admin/library/import/figma`, OpenAPI and codegen, the console UI, and tests from the fixture                  | 1   |

## L9 — release (about 5 hd, one session, after M5 and all seven looks)

| Task | Description                                                                                                                                                                                                         | Est |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| T9.1 | Sync `main` into the integration branch, renumber the migration to the next free number, regenerate codegen; CI green                                                                                               | 1   |
| T9.2 | Runbook `docs/runbooks/social-template-library-release.md`: the production steps below, with the read-only checks and their expected results                                                                        | 1   |
| T9.3 | Add 0058's checks to `scripts/apply-production-sql.mjs` (before: the pilot's kind rows and the old index; after: no kind without a default where rows exist, new index present, old index gone, new tables present) | 0.5 |
| T9.4 | Final regression on the dev stack with Halls Head's data: every kind × size, the queue, carousels saved before the library, a sweep run, render times                                                               | 1   |
| T9.5 | `scripts/src/pack-references.ts`: unposted drafts and saved carousels per pack id, for the cleanup PRs after the release                                                                                            | 0.5 |
| T9.6 | SRE watch plan for the first weekend: sweep render time, warning rate and fit-job queue time, with thresholds                                                                                                       | 0.5 |
| T9.7 | #411's description: what ships, the test evidence, each look's sign-off and the release steps                                                                                                                       | 0.5 |

## Milestones (Ash, on the local dev stack)

Pull `wyborn21/social-template-library-pm` into the dev-stack worktree and restart. Pending migrations apply and the API rebuilds.

| Milestone             | After                 | Ash checks                                                                                                                                                                                             |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 Format             | L1-A to L1-D, L2      | Proofs sheet: the starters look as before; v2 samples show stacks collapsing per preset, conditions, styles, vectors and motion; fit reports per template. `check-template-bundles` runs locally       |
| M2 Store and pipeline | L3-A, L3-B, L4-B      | The migration applied. Halls Head's drafts and kind templates unchanged. The sweep makes templated drafts for every club; the Weekend Carousel saves v3; old carousels render as before                |
| M3 Library UI         | L5-A to L5-C, L6      | Browse with previews in Halls Head's data; use, default, adopt a look; edit a copy in editor v2; pick a template for a one-off post and a carousel; "update available" after a bundle bump             |
| M4 Looks              | All seven looks, L4-D | Each look on the proofs sheet and in the library at every size and preset, against its report (motion parity, pixel diff). Ash signs each off in its `report.md`. Can run look by look as the PRs land |
| M5 AI and Figma       | L7, L8                | A brief and a screenshot become console drafts with their warnings and cost; a Figma test file imports                                                                                                 |
| Final                 | L9                    | The full checklist in the runbook, then Ash's go                                                                                                                                                       |

`main` is synced into the integration branch before each milestone.

## Migration 0058 and the release (Ash's steps)

0058 is designed as 0057 in ADR-011; the number moved because #412 took 0057. It's idempotent: new tables, new columns, the `UPDATE` that marks existing kind rows as defaults, the new partial unique index, and dropping `card_templates_kind_unique`.

Order:

1. Ash finishes the final pass on the dev stack and merges #411 into `main` himself.
2. **Right before republishing**, Ash runs 0058 in Production SQL, or with `node scripts/apply-production-sql.mjs lib/db/migrations/0058_<name>.sql`, which shows the checks from T9.3.
   - Not earlier: the running code relies on `card_templates_kind_unique`.
   - Not left to the publish: the schema sync doesn't run the `UPDATE`, so the pilot's rows would not become defaults (T3.15 is the safety net, not the plan).
3. Ash adds `ANTHROPIC_API_KEY` and `FIGMA_ACCESS_TOKEN` (Ovation's designer account, read-only file content) to Replit secrets. Without them the app still runs, and the designer tools say they aren't configured.
4. Republish. The bundles sync on start. Check the platform console: seven looks and three starters listed, fit `pass`.
5. Check the pilot club's cards are unchanged and a sweep makes templated drafts. `KIND_TEMPLATES` can then be removed from secrets.
6. SRE watches the first weekend (T9.6).

Rollback means reverting the release. 0058 can stay, because the old code doesn't use its tables or columns. The old code does expect `card_templates_kind_unique`, so the runbook has the statement that re-creates it, and a query for clubs that made a second copy of a kind since the release. Those copies block the index, and Ash decides what happens to them.

## Required tests

| Test                                 | Where                | What it proves                                                                                                                                                                                     |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 documents render byte-identically | T1.6, again in T3.22 | Every starter × kind × size × sample, stress and junior, plus pilot-shaped documents: the rendered HTML string is identical before and after v2                                                    |
| Tenant isolation                     | T3.5, T3.11, T6.1    | Library reads never return `card_templates` rows. Every copy, default, adopt, update, preview-input and apply query is tenant-filtered; a second tenant can't read or change another's copies      |
| No junior content in previews        | T3.10, T1.15         | Preview input is the latest senior draft or a sample, never a junior draft. A `showWhen` condition can't reveal junior photos or private players                                                   |
| No club data in AI input             | T7.9, T7.10          | With a stub provider, the outbound request contains only sample content, the brief and an uploaded image: no tenant name, player name, junior data or library photo. Library photo ids are refused |
| Bundle fit job in CI                 | T2.8, T2.9           | Every bundle passes at every page, size and preset with worst-case content. A required check on PRs into the integration branch                                                                    |
| Pilot carry-over                     | T3.2, T3.15, T3.22   | A pilot-shaped tenant keeps its row ids, versions and documents, gains `is_kind_default`, renders its drafts identically, keeps its own designs on single cards and its pack look on carousels     |

Also kept green: saved v1 and v2 carousels and pack drafts render unchanged (T3.19, T5.19); the warnings gate blocks automation for any draft with a layout warning (ADR-003, existing tests); juniors isolation and fill-in exclusion.

## Definition of done (every slice PR)

- Branched off the latest `wyborn21/social-template-library-pm` and targeting it. Never `main`; never merge #411.
- CI green, including `template-bundles` once it exists. The session merges its own PR into the integration branch when green.
- The PR body has: what changed, the tasks done, and a "Test on the dev stack" script for the next milestone (restart, secrets or data steps included).
- `npx prettier@3.9.6` on changed files; OpenAPI codegen committed; never hand-edit generated files.
- L3-A only: the migration is idempotent and its SQL is in the PR body.
- The required tests for the slice are in, and juniors isolation and fill-in exclusion are untouched.
- `.10x/status.md` is left alone; the milestone sync PRs update it.

## Risks

| Risk                                                            | Mitigation                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Migration number drift while the branch lives apart from `main` | Take the number at L3-A, renumber at each sync, fix it in L9                                                        |
| `ensure-constraints` restores the one-per-kind index            | T3.1 swaps the entry; T3.2 tests it                                                                                 |
| The production data step is missed or out of order              | Ash runs 0058 by hand right before the republish, with the T9.3 checks; T3.15 promotes an orphaned pilot row anyway |
| Structured outputs can't take the schema                        | The spike runs first and picks (a), (b) or (c); `validate.ts` stays the authority                                   |
| Polish overruns with all seven gating                           | Two polish streams; half-days logged per look; past 8 hd on a look, stop and ask Ash                                |
| Shared files across four sessions                               | The ownership table; one open PR per stream; codegen regenerated, never hand-merged                                 |
| Render-queue load once every club is templated, plus fit jobs   | The sweep's per-club caps stay; publish renders first; render time logged (T3.23); SRE plan (T9.6)                  |
| CI minutes for the Chromium job                                 | Path filters and bundle-hash skipping; DevOps reviews T2.9                                                          |
| The dev stack can't show library images, Meta posts or email    | The dev-only filesystem store (T3.12); the warnings gate is checked through the sweep and the queue                 |
| Other features landing on `main` in Social Studio files         | Sync before each milestone; watch social-photo-tag-selection U2 and U3 (Team List photos)                           |
| AI spend                                                        | Spike capped at US$20; `max_tokens` per generation; cost recorded per row                                           |
| Secrets                                                         | Only in Replit secrets and the dev stack's git-ignored `secrets.json`; never printed or committed                   |

## How we'll know the plan worked

- Every slice merges into the integration branch with CI green, and Ash passes M1 to M5 and the final check without a slice being reopened for a design change.
- Polish averages 5 hd or less per converted pack, from the per-look reports (PM target).
- The CI bundle job and the byte-identical tests stay green through every main sync.
- First weekend after the release: no auto-post with a layout warning, the pilot club's cards unchanged, and sweep render time inside SRE's threshold.
- The designer tool's `first_try_fit` share is tracked from the first generation (the 70% bar gates club Generate in R2, not this release).

## Cleanup after the release (not in this merge)

- Pack retirement PRs once `pack-references.ts` shows a pack with no unposted drafts or saved carousels: its code, its `CONTENT_LAYOUTS` entry and its fit-grid rows. With the last pack gone, `resolveActivePackId` becomes `lookForPackId`.
