# Architect: social-template-library (ADR-011)

Status: DESIGN COMPLETE 2026-10-21. ADR-011 accepted, and the design summary was approved by Ash in the architect session.
Requirements: `.10x/decisions/product-manager/social-template-library.md` (approved 21 Oct 2026; scope revised in decisions 10–13).
Builds on: ADR-001..003 (`card-kind-templates.md`) and ADR-010 (`match-day-carousel-content.md`).
Delivery rule: every PR for this feature targets `wyborn21/social-template-library-pm` (draft PR #411). It reaches `main` in one merge, after Ash tests it on a local dev server.

## Choices made with Ash (21 Oct 2026)

1. **Where Ovation templates live: hybrid.**
   - The seven converted looks and the three starters ship as JSON bundles in the repo. CI fit-checks them, and they load into the library when Ash republishes.
   - Everything made later (AI drafts, Figma imports, platform-console edits, club designs) lives only in the database and goes live with no deploy.
   - Ash asked whether a session could have temporary production access through a `.env`. Declined: the design must not depend on it. Such access skips review, ends anyway, and the file could be committed by mistake.
2. **Reflow: stack groups.** A group lays out its children in a column or row with a gap, and a hidden or empty child collapses. Layers also take show-when conditions.
3. **Rollout: everyone at once.** There is no per-club switch. The `KIND_TEMPLATES` switch is deleted when the library ships, and rollback means reverting the release.
4. **AI provider: Claude Opus 5.5** (`claude-opus-5-5`), behind one adapter module.
5. **Updates to an edited copy.** "Once the club makes an edit, it becomes its own standalone template." Only unedited copies show "update available".

## Current landscape [CONFIRMED in code 2026-10-21]

- **Layer document** (`lib/scorecard/src/kind-templates/document.ts`): `{ layers }`.
  - Each layer has `geometry` per size in percent, optional `sizes`, and an optional `rows` spec. Capacity is `rowsCapacity` (geometry ÷ row pitch).
  - Layer kinds: text, shape, image, photo, rows, element, sticker, medal (`validate.ts`).
  - `animation: { kind: none|rise|fade|pop, delayMs }` is validated and rendered (`pack-render/adjustments.ts`). Nothing sets it.
  - Rendered on the blank base by `renderPackCard(..., "blank", adjustments)` (`pack-render/render.ts`). Shrink-to-fit plus overflow warnings come from `layer-fit.ts` (`MIN_TEXT_FIT` 0.6).
- **Kind templates** (`api-server/src/lib/kind-templates.ts`):
  - `card_templates` rows with `source = 'kind'`, at most one per tenant and kind under `card_templates_kind_unique` (migration **0036**).
  - Optimistic `version`. Created lazily from `PACK_TO_STARTER` (club-kit; broadcast; clubhouse unmapped; Duotone falls back to club-kit).
  - Drafts copy the document into `social_drafts.adjustments` with `template_version`, `layout_check_pending` and `layout_warnings`. Automation is gated by `layoutBlocksAutomation`.
  - `card_templates.is_default` and `default_for_kinds` belong to pack and background rows (`pack-resolve.ts`). Kind rows must not use them (KTD5).
- **Switch.** `KIND_TEMPLATES` is an env var, `"all"` or a list of tenant ids (`config.ts`, `kind-templates-switch.ts`). It is on for one pilot club in production.
- **Content contract** (ADR-010): `CardContent` → `contentInput(content, visible)` → card input → `bindInput`. Carousel pages flatten to values (`weekendTitle`, `dayHeading`, `day{i}.*`, sponsors).
  - Layouts declare slots and capacity in `pack-templates/content-layouts.ts`; the CI fit grid is `content-layouts.test.ts`.
  - Every carousel set opens and closes with Match Day title and sponsors pages (`weekend-carousel/model.ts`, `bookend`).
- **Motion today.**
  - Club Kit and Duotone have none.
  - Broadcast Dark, Bold Type, Neon Night and Sunset pulse a LIVE dot on Big Moment (`hhPulse 1.4s infinite`).
  - Gold Foil also sweeps a foil shine over hero numbers (`hhShine 5.5s infinite`, `--sk-num-anim`).
  - Neon Night's glow and Sunset's shadow are static text shadows.
  - Clips (`card-video-renderer.ts`) ignore infinite loops, so pack clips today are effectively stills.
  - Separately, uploaded-background templates have canvas motion presets (`share-card/animation.ts`). Not touched here.
- **Render harness** (`pages/card-render-harness.tsx`): `renderStill` returns warnings, and the server screenshots the card.
  - One page per still; renders are serialised globally (`draft-render.ts`).
  - The sweep caps layout checks at 20 drafts and 60 renders per club per sweep.
  - Fonts load from a committed Google Fonts catalogue (`lib/document-fonts.ts`).
- **CI** (`ci.yml`) has no browser. `playhq-sync.yml` already drives the runner's Chrome through `puppeteer-core`.
- **Secrets and connections.** `secret-box.ts` (AES-256-GCM, `SOCIAL_TOKEN_KEY`) seals Meta page tokens in `social_connections`, unique on (tenant, provider), with a signed-state OAuth callback.
- **Entitlements** (`entitlements.ts`): free / club / pro plans and feature checks (`requireEntitlement`). Dormant unless `BILLING_ENABLED`.
- **Other facts.**
  - No AI provider integration exists.
  - Object storage is Replit's (`objectStorage.ts`).
  - The platform console is `/platform/admin/*` behind platform auth.
  - Latest migration: 0056.

## Components and boundaries

```
lib/template-bundles/<look>/            JSON bundles (repo-owned Ovation looks + starters); never imported by the web app
lib/scorecard/src/kind-templates/        format v2 types, normalise(v1→v2), pages per kind, token catalogue,
                                         validate (v2), fit matrix + worst-case content (pure), PACK_TO_LOOK
artifacts/cricket-club/src/lib/pack-render/
                                         layer renderer v2 (pages, stacks, conditions, styles, vector, motion),
                                         template-fit.ts (DOM fit over the matrix), converter capture (dev only)
artifacts/cricket-club/src/pages/card-render-harness.tsx
                                         + fitCheck(document, kind) batch; + capture(pack, input, size) for the converter
artifacts/api-server/src/lib/template-library/
                                         store (looks, library templates, versions), copies (card_templates),
                                         defaults + adopt look, bundles sync at boot, fit jobs, preview input
artifacts/api-server/src/lib/template-ai/    provider adapter (Anthropic, the only SDK import), prompt, loop, usage
artifacts/api-server/src/lib/template-import/figma.ts   Figma REST → document v2
scripts/src/convert-pack.ts, scripts/src/check-template-bundles.ts   converter + CI bundle fit check
web: Studio → Library (browse, previews, looks), Your templates (copies, defaults), editor v2,
     template picker in Create a Card and the Weekend Carousel; platform console → Library (designer tools)
```

The ownership rule: **the library tables hold only shareable data; club copies hold club data and are always tenant-filtered.** Nothing in the library references a tenant's assets.

## 1. Template format v2

```ts
type TemplateDocumentV2 = {
  formatVersion: 2;
  pages: Partial<Record<PageKey, { layers: TemplateLayer[] }>>;
  timeline?: { durationMs?: number; holdMs?: number; loop?: boolean }; // optional in R1; R3's editor fills it
  palette?: "club-kit" | "duotone" | "foil" | ...;                     // derived token sets the doc uses (see Styles)
  sponsorLock?: boolean;                                                // as starters have today
};
type PageKey = "card" | "title" | "fixture" | "day" | "sponsors" | "result" | "team";
```

**Pages per kind.**

| Kind             | Pages (primary first)                 | Notes                                                                                                               |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `matchDay`       | `fixture`, `title`, `day`, `sponsors` | The single Match Day card is the `fixture` page. `day` is the junior day slide.                                     |
| `matchSummary`   | `result`, `day`                       | The Results set uses this template too: its projection already drops the top performers, and their stack collapses. |
| `teamList`       | `team`                                |                                                                                                                     |
| every other kind | `card`                                |                                                                                                                     |

- A Results, Match Summary or Team List carousel takes its bookends (`title`, `sponsors`) from the Match Day template of the same look. If there is none, it uses the club's default Match Day template.
- The draft stores the assembled document, one document per carousel as ADR-002 requires.
- If the converter finds a pack whose Results slide differs from its Match Summary slide beyond the performers block, `results` becomes its own kind. That change is additive.

**Version 1 normalisation.** A stored `{ layers }` (the pilot's and the starters') reads in memory as `{ formatVersion: 2, pages: { <kind's primary page>: { layers } } }`. Stored rows are never rewritten. A test renders every v1 starter and a pilot-shaped document byte-identically before and after.

**Tokens.**

- Each page has a token catalogue: text fields, images and repeats, extending `KIND_FIELDS`.
- Carousel pages bind what `bindInput` already produces (`weekendTitle`, `dateRange`, `dayHeading`, …). Two repeats are new: `dayRows` (junior day rows) and `sponsors`, so day and sponsors pages use rows layers instead of indexed `day{i}.*` fields.
- Every token declares its ADR-010 content field (for example `roundLabel → fixture.round`, `oppositionLogoUrl → fixture.oppositionCrest`). A layer whose bound tokens are all hidden or empty is dropped, which is the `data-drop-if-field` rule.
- Core fields are always visible.

**Capacity.** A page's capacity is `documentRowsCapacity(page, size, repeat)`, read from the rows layer's geometry and the same at every preset. It replaces `CONTENT_LAYOUTS[...].capacity`: the Weekend Carousel's `dayCapacity` reads the template. Slots (which content fields have a box) are derived from the tokens the page uses.

**Stack groups.**

- A `group` layer may carry `stack: { direction: "column" | "row"; gap; align; justify }`. Children are laid out by the stack inside the group's box, so their own geometry is ignored apart from width and height.
- A hidden, condition-false or empty child takes no space.
- Stacks may nest, to a depth limit of 4.
- Rendered as CSS flex inside the group's absolutely positioned box, so the same DOM is fit-checked.

**Conditions.**

- `showWhen?: { field?: string; photo?: boolean; sponsors?: boolean; junior?: boolean }`, evaluated at render from the content, the visible set and the input.
- An "or no photo" alternative uses `photo: false`, which covers Duotone's no-photo logo art.
- Juniors and private-player rules still apply at render. A condition can't reveal anything the render path withholds.

**Text fit.**

- `fit?: { minScale?: number; maxLines?: 1 | 2; ellipsis?: boolean }`.
- The converter maps pack name boxes to `{ minScale: 0.6, maxLines: 2, ellipsis: true }`, so ADR-010's one name-fit rule holds in templates.
- `layer-fit.ts` gains the two-line step before it warns.

**Styles.** The vocabulary is extended, and every value is validated:

- fills: solid or linear/radial gradient with token or hex stops, plus text fills (background-clip text, as the foil numbers need)
- borders, `boxShadow`, `textShadow`
- `blend` (a closed list) and `filter` presets (`duotone(dark, light)`, `grayscale`, `blur ≤ 20px`), plus `grain` and `halftone` overlays
- Colours are a hex or a token reference (`var(--accent)`, `--panel`, `--ink`, `--gold`, and the derived palettes `--ck-*` and `--dt-*`). The renderer emits a derived palette when the document declares or uses it, as `--ck-*` already works.
- Duotone's `finish` gradient map becomes the `duotone` photo filter, built from the club's colours.

**Vector layers.**

- `kind: "vector"` with `svg` markup, sanitised on save. Allowed elements: svg, g, path, rect, circle, ellipse, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask.
- Attributes are allowlisted. No `href`, scripts, `foreignObject` or external `url()`.
- Fills and strokes may be tokens. Each layer is at most 64 KB, and a document at most 1 MB.

**Motion.**

```ts
motion?: {
  in?: { preset: "rise" | "fade" | "pop" | ...; delayMs?: number; durationMs?: number; easing?: Easing };
  loop?: { preset: "pulse" | "shine" | "glow" | ...; periodMs?: number; delayMs?: number };
  // R3 adds: out?: {...}; keyframes?: Array<{ at: number; props: {...}; easing?: Easing }>
};
```

- The old `animation: { kind, delayMs }` reads as `motion.in`.
- R1 implements the presets above. Keyframes are inlined with the card, as `LAYER_KEYFRAMES` are today, so exports carry them.
- `pulse` and `shine` reproduce `hhPulse` and `hhShine`.
- The document `timeline` exists in R1 but is optional. R3 adds the editor timeline, `out`, keyframe tracks and video-first templates as new optional fields, so no document migrates.
- Clip length rules (`animation-clock.ts`) are unchanged in R1. R3 counts loops as N periods.

**Validation** (`validate.ts` v2):

- Strict as today: known keys only, finite in-range numbers, bounded strings, page keys valid for the kind, and tokens and repeats valid for the page.
- Also enforced: stack depth, SVG sanitisation, and a limit of 300 layers per page and 600 per document.
- One JSON Schema of the format (`format.schema.json`) is kept for the AI's structured output. A drift test asserts it accepts every bundle document. `validate.ts` stays the authority.

## 2. Storage and data model (migration 0057)

Idempotent, applied by Ash in Production SQL before the republish. Drizzle schema updated alongside.

```sql
create table if not exists template_looks (
  id serial primary key,
  slug text not null unique,                 -- 'club-kit', 'gold-foil', 'clubhouse'
  name text not null,
  description text,
  author_tenant_id integer references tenants(id) on delete set null,   -- null = Ovation
  origin text not null check (origin in ('bundle','console','club')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists library_templates (
  id serial primary key,
  slug text unique,                          -- 'club-kit/matchDay' for bundle templates; null otherwise
  look_id integer references template_looks(id) on delete set null,
  kind text not null,
  name text not null,
  author_tenant_id integer references tenants(id) on delete set null,   -- null = Ovation
  origin text not null check (origin in ('bundle','console','club')),
  current_version integer not null default 1,
  listed boolean not null default false,
  listed_at timestamptz,
  unlisted_at timestamptz,
  unlisted_by text check (unlisted_by in ('author','ovation')),
  unlist_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists library_templates_kind_listed on library_templates (kind) where listed;
create table if not exists library_template_versions (
  template_id integer not null references library_templates(id) on delete cascade,
  version integer not null,
  document jsonb not null,
  coverage jsonb not null,                   -- { pages: PageKey[], sizes: TemplateSize[] }
  fit_status text not null default 'pending' check (fit_status in ('pending','pass','fail')),
  fit_report jsonb,                          -- warnings per page × size × preset, renderer + fonts version
  bundle_hash text,                          -- bundle origin only
  created_by_admin_id integer,               -- platform admin, when console-made
  created_at timestamptz not null default now(),
  primary key (template_id, version)
);
alter table card_templates add column if not exists is_kind_default boolean not null default false;
alter table card_templates add column if not exists origin_template_id integer references library_templates(id) on delete set null;
alter table card_templates add column if not exists origin_version integer;
alter table card_templates add column if not exists edited_at timestamptz;      -- set on first saved edit: standalone
alter table card_templates add column if not exists fit_status text not null default 'pass';
alter table card_templates add column if not exists fit_report jsonb;
update card_templates set is_kind_default = true where source = 'kind' and not is_kind_default;
create unique index if not exists card_templates_kind_default_unique
  on card_templates (tenant_id, base_kind) where source = 'kind' and is_kind_default;
drop index if exists card_templates_kind_unique;
alter table social_drafts add column if not exists template_ref jsonb;            -- { copyId? | libraryTemplateId?, version }
create table if not exists template_generations (
  id serial primary key,
  tenant_id integer references tenants(id) on delete cascade,   -- null = Ovation designer tool
  admin_id integer,                          -- club admin or platform admin
  kind text not null,
  model text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  input_tokens integer, cache_read_tokens integer, cache_write_tokens integer, output_tokens integer,
  cost_micros bigint,
  attempts integer not null default 0,
  first_try_fit boolean,
  outcome text,                              -- 'pass' | 'warnings' | 'invalid' | 'provider_error' | 'refused'
  result_ref jsonb,                          -- { libraryTemplateId | copyId, version }
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists template_generations_tenant_month on template_generations (tenant_id, created_at);
```

`card_templates.fit_status` defaults to `pass` only so that existing rows read correctly. The app always sets it when it writes:

- a copy taken from the library inherits that version's status
- a save sets it to `pending` until the fit job finishes

- **Why a new default column.** `is_default` and `default_for_kinds` carry pack and background choices, and `clearDefaultKinds` ignores `source` (ADR-002). A kind row reusing them could steal the club's pack claim.
- **Pilot carry-over.** The pilot's kind rows keep their documents, ids and versions. They gain `is_kind_default = true`, have no origin (their own designs, so already standalone), and `fit_status` defaults to `pass` (they passed the warnings gate as they are). Their drafts keep rendering exactly as before.
- **Copies.**
  - `card_templates` rows with `source = 'kind'`, many per kind, and the same optimistic `version` as today.
  - A copy's `version` is its own save counter, and `origin_version` is the library version it came from.
  - **Edited** means the club saved a change to the document; using the template, taking an update or setting it as default don't count. The first such save sets `edited_at`.
- **Bundles** (`lib/template-bundles/<look>/look.json` plus `<kind>.json`).
  - At server start, `syncBundles()` upserts each look and template by `slug` (origin `bundle`). It inserts any `(template, version)` that isn't there yet (insert-or-ignore, safe on parallel boots) and sets `current_version` to the bundle's.
  - A new version starts `fit_status = 'pending'`, and a server fit job checks it. A bundle template marked `listed` is listed once its current version passes.
  - Bundle-owned templates are read-only in the console: "Edit" makes a console-origin duplicate. Boot sync therefore never overwrites a designer's work.
  - The web app never imports bundles.
- **Assets.**
  - Library images (bundle, console, AI, Figma; R2 club publishes) are copied to object storage under `library/` (public read). A library document references only `library/` URLs, tokens or slots, and validation enforces this for library rows.
  - Club copies may reference the club's own uploads, as today.

## 3. Flows

- **Browse.**
  - `GET /template-library?kind&size&look&cursor` returns listed templates whose current version covers that kind and size: metadata plus the current document, 24 per page.
  - The client draws thumbnails in the browser with `<PackCard packId="blank">`, the club's `PackCardData`, and `GET /template-library/preview-input?kind`. That returns the club's latest **senior** draft input of the kind, or the kind's sample in the club's identity. Juniors never feed previews.
  - Thumbnails render lazily as they scroll into view. Club copies appear under "Your templates".
- **Use.**
  - `POST /club-templates { libraryTemplateId, version? }` copies the version into a new `card_templates` row (origin set, not edited).
  - "Use as default" does the same and sets `is_kind_default` in one transaction (unset the old default, set the new).
- **Adopt a look.** For every kind the look covers: reuse the club's existing unedited copy of that look's template at its current version, or create one. Then set it as the default, all in one transaction. Kinds the look doesn't cover keep their default.
- **Lazy default.**
  - `ensureDefaultTemplate(tenant, kind)` returns the default copy. If there is none, it inserts a copy of `PACK_TO_LOOK(resolvePackIdForKind(club pack rows, kind))`'s template for the kind, or Club Kit's if that look lacks it, with insert-or-ignore on the new partial index.
  - `replaced_pack_id` and the notice keep working for a club whose pack was hidden. The notice now links to that pack's look in the library.
- **Drafts.** Unchanged from ADR-002: a new draft copies the default copy's document, sets `template_ref`, `template_version` and `layout_check_pending`, and renders on the blank base. "Apply to waiting drafts" stays, keyed by kind.
- **One-off post** (Create a Card, Weekend Carousel). The template picker lists the club's copies and the library for the kind. The draft copies the chosen document, with `template_ref.libraryTemplateId` for a library template. The default doesn't change.
- **Carousels.**
  - Saved carousel **v3**: `{ version: 3, templateRef, setType, size, contentOverride?, slides }`. The assembled document sits in the draft's `adjustments`, like any templated draft. v1 and v2 (pack) carousels read and render unchanged.
  - A set's template is the picked one or the club's default for its kind. If that template lacks a page the set needs (for example a pilot v1 copy with only `fixture`), the carousel uses the club's pack look for that kind, `PACK_TO_LOOK(resolvePackIdForKind(...))`, as a whole template. Pages from different templates are never mixed, apart from the Match Day bookends of the same look. So the pilot's carousels look as they did, and its single cards keep its own designs.
- **Update available.**
  - An unedited copy whose origin template's `current_version` is greater than its `origin_version` shows "update available" (listed or not).
  - Taking it replaces the document, sets `origin_version` and bumps `version`. The copy stays unedited, so nothing of the club's is lost.
  - An edited copy never prompts, and keeps "Based on <template> by <author>" while the origin exists.

## 4. Fit check

- **Matrix** (pure, `kind-templates/fit-matrix.ts`):
  - every page the template has × every size it covers × every preset (content kinds only; other kinds have no presets)
  - × photo present / absent where any layer is photo-conditioned or photo-bound
  - × sponsors none / the kind's maximum where sponsor tokens are used
- **Worst-case content** (`kind-templates/worst-case.ts`):
  - the longest short team and competition names from PCA and WA (a committed fixture, refreshed by a script)
  - the longest player names, maximum digits in scores and figures
  - rows layers filled to capacity, every optional field on at Full
  - junior variants with "PRIVATE PLAYER" rows
- **Checks per variant:**
  - text overflow after fit, with two lines where `maxLines` allows
  - every core field of the page has a bound layer on that size
  - a hidden field shows nothing
  - a rows layer at capacity fits its box, and capacity is at least 1
  - nothing data-bearing falls outside the artboard
  - fonts loaded
  - the vector and image URL policy holds
- **Where it runs.** One DOM routine, `template-fit.ts`, exposed as the harness `fitCheck(document, kind)`, which loops every variant in one page, with no new page per still.
  - **CI:** `scripts/src/check-template-bundles.ts` builds the web app, serves the harness and drives the runner's Chrome with `puppeteer-core`, as `playhq-sync.yml` does. A new CI job runs it for bundles whose hash changed, and for all bundles when `pack-render/**` or `kind-templates/**` change.
  - **Server:** a fit job on the existing serialised render queue, with publish renders first. It runs when a library version is created (bundle sync, console save, AI, Figma; R2 publish) and when a club copy is saved. The result is stored on the version or copy (`fit_status`, `fit_report`).
- **Gates.**
  - Listing needs `pass` at all four sizes, every page of the kind and every preset (PM rule).
  - A club copy may fail or cover fewer sizes. Its drafts are still made, and the ADR-003 gate blocks automation per draft. A copy can't be set as default while its fit job is pending, only once it has finished, pass or fail; the editor shows the warnings.
- **Retires** the CI fit grid (`content-layouts.test.ts`) and `CONTENT_LAYOUTS` once the pack code is deleted. Both stay frozen until then.
- **Cost.** About 4 pages × 4 sizes × 3 presets × up to 2 photo variants is roughly 100 variants for a carousel kind, and 4–8 for other kinds. At about 50 ms a variant in one page, that's about 5 s per carousel-kind template and about 20 s per look.

## 5. Converter (release 1, dev and CI only)

- **Input:** the rendered DOM, not pack source (PM risk mitigation). `scripts/src/convert-pack.ts` drives the harness's `capture(packId, input, size)` for every pack × kind × page × size × preset, with:
  1. sentinel content: each field's value is a unique marker, so text nodes map back to `{{token}}`s
  2. worst-case content, for boxes
  3. two contrasting sentinel brand palettes, so colours map back to tokens
- **Capture per element:** tag, the `data-slot`, `data-repeat`, `data-fit`, `data-fit-row` and `data-drop-if-field` attributes, its box relative to the card root, computed styles (fonts, colour, background and gradient, border, radius, shadows, opacity, transform, filter, blend, display/flex, animation name and duration), and `::before`/`::after` styles.
- **Mapping:**

  | Pack DOM                                                   | Layer                                                                              |
  | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
  | text containing markers                                    | text layer with `{{tokens}}` and style; `data-fit`/`data-fit-row` → `fit`          |
  | `data-slot` photo / logo / crest                           | photo or image slot; monogram fallback → `showWhen`                                |
  | `data-repeat`                                              | rows layer (first row → cells, row pitch → `rowHeight`/`gap`, columns from layout) |
  | flex container whose children move between presets         | stack group                                                                        |
  | `data-drop-if-field`, photo / no-photo branches            | `showWhen`                                                                         |
  | backgrounds, panels, gradients, borders                    | shape layers with the extended style                                               |
  | inline SVG                                                 | vector layer, colours tokenised                                                    |
  | computed colour equal to a sentinel token in both palettes | `var(--token)`                                                                     |
  | `hhPulse` / `hhShine` animation                            | `motion.loop: pulse` / `shine`                                                     |
  | anything else                                              | reported for polish                                                                |

- **Output:**
  - `lib/template-bundles/<look>/<kind>.json`.
  - `lib/template-bundles/<look>/report.md`, covering per kind × page × size: layers mapped, items needing polish, colours not mapped to tokens, motion found → mapped or not, the fit-check result, and a pixel-diff score against the pack for the same inputs.
  - Designer polish edits the JSON (or uses the console editor and exports) and records half-days in the report.
- **Gates.**
  - Club Kit, Broadcast Dark and Duotone (the active looks) need a passing CI fit check, motion parity in the report, and Ash's visual sign-off before the single merge.
  - The four hidden looks list when they pass. Until then their bundles are unlisted, and their pack ids keep rendering as Club Kit (P9).
  - A pack that converts badly is hand-designed into the same bundle shape, and the report says so.
- **Starters.** Club Kit, Broadcast and Clubhouse are exported once into bundles (`club-kit-classic`, `broadcast-classic`, `clubhouse`), byte-identical to the TypeScript starters, which are then deleted. Their Match Day, Match Summary and Team List templates gain the missing carousel pages during polish (from the nearest converted look), so they can be listed.
- **Later packs.** No new code pack is written after release 1 starts. New looks are authored straight into bundles or the console.

## 6. What happens to `KIND_TEMPLATES`, `PACK_TO_STARTER` and `LEGACY_PACK_IDS`

- **`KIND_TEMPLATES`.** Deleted when the library ships (Ash: everyone at once): `config.ts`, `kind-templates-switch.ts`, the `enabled` flag in the kind-templates API, and the 404-when-off branches. `templatedDesignFor` always applies to template kinds. The env var can stay set in Replit; it's simply ignored.
- **`PACK_TO_STARTER`** becomes **`PACK_TO_LOOK`**, used only to seed a club's lazy default:
  - `club-kit-v1 → club-kit`
  - `broadcast-dark-v1 → broadcast-dark`
  - `duotone-v1 → duotone`, for its three kinds; its other kinds → `club-kit`
  - legacy and unknown ids → `club-kit`

  `starterForPack`, `startingDocument`, `placeholderDocument` and the starter modules are deleted once the bundles exist. `RETIRED_PACK_IDS` (an alias) goes too.

- **`LEGACY_PACK_IDS` and `resolveActivePackId`.** Unchanged for as long as any pack code exists: drafts and carousels saved before the ship still name packs and render through it. Retirement is two steps:
  1. **At ship.** Nothing new uses a pack. Pickers list templates, and the Weekend Carousel and Create a Card save v3 and templated drafts.
  2. **Later cleanup PRs, after the merge.** An ops report (`scripts/src/pack-references.ts`) counts unposted drafts and saved carousels per pack id. When a pack's count is zero, its code, its `CONTENT_LAYOUTS` entry and its fit-grid rows are deleted. With the last pack gone, `resolveActivePackId` becomes `lookForPackId`: the renderer draws any stray pack draft with the converted look's template for its kind.
- **`CAROUSEL_PACK_IDS`, `ACTIVE_PACK_IDS`, `design-packs.ts`, `source = 'pack'` rows.** Frozen at ship and read only to render old drafts and seed defaults. Deleted with the pack code.

## 7. Motion

- **R1 parity list** (from the code survey):

  | Pack                                          | Motion                                                    | Template mapping                                  |
  | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
  | Club Kit, Duotone                             | none                                                      | none                                              |
  | Broadcast Dark, Bold Type, Neon Night, Sunset | Big Moment LIVE dot `hhPulse 1.4s`                        | `loop: pulse, periodMs 1400`                      |
  | Gold Foil                                     | foil shine on hero numbers `hhShine 5.5s`, plus the pulse | gradient text fill + `loop: shine, periodMs 5500` |

  Static glows and shadows become `textShadow`. The converter report confirms each pack's mapping.

- **Auto-posting in R1 stays stills.** Clips keep today's length rule (infinite loops don't count), so nothing about posting changes.
- **R3** adds `out`, keyframe tracks, the timeline editor and video-first templates. MP4 renders run through the existing harness and video renderer. `card-video-jobs.ts` is in-memory and single-instance, so it needs persisting before automatic video. Automatic publishing posts video where Meta allows and falls back to the final frame. The fit check covers every frame that shows data. None of this changes R1 documents.

## 8. AI generation loop

- **Module** `api-server/src/lib/template-ai/`: `provider.ts` (the only `@anthropic-ai/sdk` import), `prompt.ts`, `generate.ts`, `usage.ts`. Secret: `ANTHROPIC_API_KEY` (Replit).
- **Request:**
  - `claude-opus-5-5` with adaptive thinking and `output_config.effort: "high"`, streamed to `finalMessage()`, `max_tokens` 64000.
  - Structured output: `output_config.format` with `format.schema.json`. If nested stacks exceed what structured output accepts, the spike falls back to schema-in-prompt with validator retries.
  - Refusal fallback: `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
  - Prompt caching: a 1-hour cached system block holds the format rules (from `validate.ts`), design guidance and 2–3 example templates from the bundles. A second cached block holds the kind's page and token catalogue. The brief, the image and the sample content come last, uncached.
- **Input:**
  - a brief (≤ 2,000 characters), a reference image, or both
  - **an image must be an upload** (PNG/JPEG ≤ 5 MB, downscaled to a 1,568 px long edge, EXIF stripped). It can never be chosen from the club's photo library, so junior photos can't be sent. Only its hash is kept.
  - sample content for the kind (`worst-case.ts` samples). No club or player data is sent.
  - The UI says what is sent.
- **Loop:**
  1. The model returns a document.
  2. `templateDocumentErrors` checks it. Any errors go back in a follow-up turn (append-only) for one retry.
  3. A harness fit job runs; any warnings go back for a retry.
  4. At most two retries in total.
  5. The result is saved as a private draft even if it still fails, with its warnings for polish.
- **Destinations:**
  - R1, designer tool (platform console): an unlisted console-origin library template.
  - R2, club Generate: a club copy with no origin.
- **Usage** (`template_generations`, added in 0057 so the designer tool records from day one): id, tenant_id (null for Ovation), admin id, kind, model, input/cache-read/cache-write/output tokens, cost in micro-dollars (price table in config: $4 / $20 per MTok, cache reads $0.20), attempts, `first_try_fit`, outcome, result template ref, created_at.
- **Status.** Generations run as jobs: a persisted row, worked in-process, polled by the client. A job that is running when the server restarts is marked failed.
- **Quality bar.** The 70% bar is the share of `first_try_fit` over the first 50 designer generations, a query over this table.
- **R2 monthly cap.** Generations per club per Perth calendar month are counted from the table against `TEMPLATE_AI_MONTHLY_CAP` (default 10; PM to confirm). Provider failures don't count. Club Generate ships only once the bar is met.

## 9. Figma import

- **R1 (Ovation).** `FIGMA_ACCESS_TOKEN` (Ovation designer account, read-only file content) in Replit secrets. `POST /platform/admin/library/import/figma { fileUrl, nodeIds?, kind }` calls `GET /v1/files/:key/nodes` for the tree and `GET /v1/images/:key` for SVG and PNG exports.
- **Mapping:**
  - **Frames.** One frame per page × size, named `<page>/<size>` (or sized 1080², 1080×1350, 1080×1920, 1200×630). Layers are matched across sizes by name path, and a layer missing from a size isn't on that size.
  - **TEXT** → text layer: `{{tokens}}` from the characters, plus font family, weight, size as a percentage of width, letter spacing, `textCase: UPPER` → uppercase, and alignment.
  - **Colours.** Fills bound to Figma variables named `ovation/accent|panel|ink|gold` → tokens; other solid colours → hex.
  - **RECTANGLE/ELLIPSE** → shape (solid or gradient fill, corner radius, stroke, drop shadow). An image fill named `{{photo}}` or `{{clubLogo}}` → slot; any other image fill → a `library/` image.
  - **Auto layout** (`layoutMode` with `itemSpacing` and the alignments) → stack. A frame named `rows:<repeat>` → rows layer, its first child the row template.
  - **VECTOR, BOOLEAN_OPERATION and complex groups** → SVG export → sanitised vector layer.
  - **Fonts** outside the committed Google Fonts catalogue → nearest substitute plus a report line.
  - Unsupported effects and blend modes → report.
- **Output:** an unlisted console template plus the import report, then validation and the fit job.
- **R2 (clubs).** A Figma OAuth app (read-only file scope) with a signed-state callback at `/api/figma/oauth/callback`, like Meta's. One `social_connections` row per club (`provider = 'figma'`), with access and refresh tokens and expiry sealed by `secret-box`. Tokens refresh on use. A failed refresh sets `needs_reconnect`, and disconnect deletes the token. Imports land as a private club copy.

## 10. Release 2: publishing (outline, for later design passes)

- **Publish** (`POST /club-templates/:id/publish`):
  - Runs the fit check at every page, size and preset, and swaps identity: image URLs matching the club's logo, photos or sponsor logos become slots.
  - Flags literal club, short, sponsor and hashtag names in text until they're tokens. The author confirms the rights to any remaining artwork, which is copied to `library/`.
  - Creates or versions a club-origin library template. A later re-publish from the same copy adds a version (`card_templates.published_template_id`, R2 migration).
- **Refusals.** A copy whose origin chain includes a premium template can't be published (R4).
- **Unlisting.** Unlist (author or Ovation) never touches copies.
- **Counts and tags.** "Used by N clubs" is distinct tenants with a copy of that origin, edited or not. Style tags are checked against the design (photo-led needs a photo slot).
- **Isolation tests:**
  - library reads never return `card_templates` rows
  - every copy query is tenant-filtered
  - a published version holds no tenant asset URL and no literal identity

## 11. Premium looks (release 4, gated)

- R4 migration: `template_looks.tier text not null default 'free' check (tier in ('free','premium'))`. `entitlements.ts` gains `premiumLooks`, and which plan gets it is a PM call at R4.
- `canUseLook(tenant, look)` is checked on adopt, on use (copy from library), on duplicate-from-library and on take-update. It is **never** checked at render, draft creation from an existing copy, or editing a copy, so a club that downgrades keeps every copy it has.
- Browse shows premium looks with a lock. Club-made templates are always free, and there is no marketplace.
- Until R4, there is no tier column and `canUseLook` returns true.

## 12. API surface (OpenAPI first, then codegen)

- **Club admin** (`socialStudio` entitlement for writes):
  - Library: `GET /template-library`, `GET /template-library/looks`, `GET /template-library/:id`, `GET /template-library/preview-input`.
  - Copies: `GET /club-templates`, `POST /club-templates`, `POST /club-templates/:id/duplicate`, `GET` and `PUT /club-templates/:id` (`baseVersion`), `DELETE /club-templates/:id` (refused for the default).
  - Defaults, looks and updates: `POST /club-templates/:id/default`, `POST /club-templates/:id/update`, `POST /club-templates/:id/apply` (waiting drafts), `POST /template-library/looks/:id/adopt`.
  - Draft and set creation accept `templateRef`.
- **`/kind-templates/*`** is replaced. The web client changes in the same merge.
- **Platform admin:** `GET`/`POST /platform/admin/library/templates`, `PUT .../:id` (new version), `POST .../:id/list` and `.../:id/unlist`, `POST /platform/admin/library/looks`, `POST /platform/admin/library/ai/generations`, `GET .../ai/generations/:id`, `POST /platform/admin/library/import/figma`.
- **R2 adds** publish, author unlist, club generations and the Figma connection routes.

## 13. Tenant isolation and juniors

- Library tables hold no tenant-private data. `card_templates` reads and writes always filter by `tenant_id` (existing pattern), and new isolation tests in the style of `tenant-isolation.test.ts` cover copies, defaults and previews.
- Preview input and AI input never include junior content. Junior photos and private players are enforced at render (ADR-001, ADR-007) whatever a template's conditions say.

## 14. Failure modes

| Failure                                                     | Effect                         | Handling                                                                                      |
| ----------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| Bundle version fails the server fit check                   | Template not listed            | Stays unlisted; existing copies untouched; logged with the report                             |
| Two servers sync bundles at once                            | Duplicate versions             | Insert-or-ignore on `(template_id, version)` and `slug`                                       |
| Lazy default race                                           | Two defaults                   | Partial unique index `card_templates_kind_default_unique` + insert-or-ignore, re-read         |
| Library template unlisted or deleted                        | Copies lose their source       | Copies keep their document; `origin_template_id` set null on delete; no update prompts        |
| Fit job can't run (harness down)                            | No fit result                  | `pending`; drafts stay blocked from automation (ADR-003); retried on the next sweep           |
| Club default lacks a page or size                           | Carousel or size can't render  | Carousel uses the pack look for that kind as a whole template; automation skips missing sizes |
| Concurrent copy saves                                       | Lost work                      | Version check, 409 (unchanged)                                                                |
| Converter can't map part of a pack                          | Template differs from the pack | Reported; designer polish; hand design if needed; Ash signs off active looks                  |
| AI provider error, refusal, or invalid output after retries | No usable draft                | Job failed (provider errors don't count to the cap) or saved draft with warnings              |
| AI cost overruns                                            | Ovation bill                   | Per-generation `max_tokens`; cost recorded per row; per-club monthly cap from R2              |
| Figma token expired or revoked                              | Import fails                   | Clear reconnect message; R2 connection `needs_reconnect`                                      |
| Render queue contention (fit jobs vs publish)               | Slow posts                     | Publish renders first; fit jobs batched in one page                                           |
| Old draft names a deleted pack                              | Can't render                   | `lookForPackId` draws it with the converted look                                              |
| Release regression with no per-club switch                  | Every club affected            | Parity gates the merge; rollback = revert the release (Ash)                                   |

## 15. Delivery slices (all PRs target `wyborn21/social-template-library-pm`)

1. **L1 Format v2 and renderer:**
   - types and v1 normalisation
   - pages, stacks, conditions, text fit with two lines, styles and palettes
   - vector layers and motion presets
   - validate v2 and `format.schema.json`
   - byte-identical tests for v1 documents
2. **L2 Fit check:** matrix, worst-case content, `template-fit.ts`, harness `fitCheck`, the server fit job, and the CI bundle job.
3. **L3 Store and pipeline:**
   - migration 0057 and Drizzle
   - bundle sync, library and copy services, defaults and adopt look, `PACK_TO_LOOK`
   - `template_ref` on drafts, carousel v3
   - removing `KIND_TEMPLATES`
   - isolation tests
4. **L4 Converter and content:** the converter and reports, then bundles for the seven packs and three starters, designer polish, and Ash's sign-off on the active looks. Can run alongside L3 once L2 is in.
5. **L5 Library UI:** browse with previews, Your templates, defaults, adopt look, editor v2 (page switcher, preset preview, stack and motion controls), and the template picker in Create a Card and the Weekend Carousel.
6. **L6 Update available** (unedited copies) and the standalone rule.
7. **L7 AI designer tool** (platform console). Needs L1 and L2.
8. **L8 Figma import** (platform console). Needs L1 and L2.

L7 and L8 run in parallel with L3–L6.

**Release steps (Ash):**

1. Run 0057 in Production SQL before republishing.
2. Add `ANTHROPIC_API_KEY` and `FIGMA_ACCESS_TOKEN` to Replit secrets.
3. Republish. Bundles sync on start; check the platform console shows the looks listed (fit `pass`).
4. `KIND_TEMPLATES` can then be removed from secrets.
5. SRE watches sweep render time and warning rates for the first weekend.

## Open items

- EM: the structured-output schema spike for nested stacks (L1/L7).
- PM: the club Generate cap value, and which plan gets `premiumLooks` (R4).
- DevOps: CI minutes for the Chromium bundle job. Path filters keep it to bundle and renderer changes.
- SRE: render-queue load once every club's drafts are templated (ADR-003 risk, now for every club).
