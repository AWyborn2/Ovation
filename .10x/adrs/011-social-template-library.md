# ADR-011: One template format, a shared library, and club copies

**Status:** Accepted
**Date:** 2026-10-21 (design agreed with Ash in the architect session)
**Feature:** social-template-library
**Author:** 10x-Team (Principal Architect)
**Detail:** `.10x/decisions/architect/social-template-library.md`

## Context

Social cards come from two template systems. The code-built packs (Club Kit, Broadcast Dark, Duotone; four more hidden by P9) carry the ADR-010 content contract: presets, declared capacity and a CI fit grid. The card kind templates (ADR-001..003) are layer documents on the blank base, one per club per kind, live for one pilot club behind the `KIND_TEMPLATES` env switch. Ash approved a Canva-style library (`decisions/product-manager/social-template-library.md`). It has many templates per kind grouped into looks, one default per kind, and copies a club owns. Clubs publish designs (R2), full motion follows in R3 and premium looks in R4. Release 1 needs one format, a fit check that does the CI grid's job on data, a converter for seven packs with motion parity, an AI designer tool and a Figma import.

Constraints:

- One renderer for preview, editor and server (ADR-001).
- Drafts copy their design (ADR-002).
- The warnings gate keeps cards that don't fit out of automation (ADR-003).
- Juniors isolation and private players are enforced at render.
- The pilot's templates must carry over unchanged.
- Production schema changes are applied by hand, and sessions can't reach production.
- The feature merges to `main` once.

## Decision

1. **One format.** The layer document gains a format version 2, a superset of today's:
   - **Pages.** Match Day has title, fixture, day and sponsors pages. Match summary has result and day pages, and the Results carousel set uses them too. Team list has a team page, and every other kind has one page. A version 1 `{ layers }` document reads as its kind's primary page, and stored documents are never rewritten.
   - **Layout.** Stack groups, in which a hidden or empty child collapses. Layers can also show only when a field is on or a photo is present (`showWhen`).
   - **Data.** Page token catalogues, each token tied to its ADR-010 content field so presets hide the right layers. Rows capacity is read from the rows layer's geometry, which replaces the `CONTENT_LAYOUTS` constants.
   - **Styling.** Gradients, text fills, borders, shadows, blend modes, photo filters (duotone) and sanitised SVG in token colours.
   - **Motion.** Per-layer `motion: { in, loop }` plus an optional document `timeline`. Release 1 ships the presets the packs use (rise, fade, pop; pulse and shine loops). Release 3 adds `out`, keyframes and the timeline editor without changing the format.
2. **Storage.**
   - **Library.** Global tables hold what every club can read: `template_looks`, `library_templates` (one kind each; author Ovation or a club; origin `bundle`, `console` or `club`; listed or unlisted) and immutable `library_template_versions` (document, coverage, fit report).
   - **Club copies** stay in `card_templates` (`source = 'kind'`), now many per kind. New columns: `is_kind_default`, `origin_template_id`, `origin_version`, `edited_at`. The one-per-kind unique index becomes one default per kind. Existing kind rows only gain `is_kind_default = true`.
   - **Drafts** still copy a document and record `template_ref`. A one-off post copies a library version directly.
   - **Bundles.** Ovation's converted looks and the three starters ship as JSON bundles in `lib/template-bundles/`. CI fit-checks them, and they load into the library at server start. Everything made later lives only in the database.
3. **One fit check.** A harness routine renders a template at every page, size and preset with worst-case content and records warnings. The same routine runs in CI for bundles, on the server before listing or publishing, and after every copy save. Until it passes, automation is blocked, as today.
4. **Copies and updates.** Using a template creates the club's own copy. An unedited copy shows "update available" and can take it. The first saved edit makes the copy standalone: no more update prompts, and only a "based on" credit remains (Ash).
5. **Rollout and retirement.**
   - Every club moves at once when the library ships, and the `KIND_TEMPLATES` switch is deleted (Ash). Rollback means reverting the release.
   - `PACK_TO_LOOK` replaces `PACK_TO_STARTER`. Each club's default is created lazily from its current pack's converted look, and hidden packs map to Club Kit.
   - Drafts and carousels saved before the ship keep rendering through pack code. A pack's code is deleted once no unposted draft or saved carousel names it. After that, `resolveActivePackId` gives way to a read-time map from pack id to look.
6. **AI and imports.**
   - **AI.** Claude Opus 5.5 is the provider (Ash), behind one adapter module. Input is a brief and/or a reference image, with a cached prompt. Output is a JSON document, checked by `validate.ts` and then the fit check, with up to two retries that send back the errors. The result lands as a private draft. Usage and cost go in `template_generations`, which also holds the per-club monthly cap from R2. Only sample data and uploaded reference images are sent, never a library photo.
   - **Figma import.** Frames map to sizes, auto layout to stacks, `{{tokens}}` in text to fields, slot-named image fills to slots, and vectors to SVG. Release 1 uses Ovation's own token. In release 2 each club signs in with OAuth, and its token is sealed by `secret-box` in `social_connections` (`provider = 'figma'`).
7. **Premium looks (R4).** `template_looks.tier` plus a `premiumLooks` entitlement. It's checked when a club adopts a look, uses one of its templates or takes an update, never at render, so existing copies keep working on any plan. A copy of a premium template can't be published.

## Alternatives Considered

| Alternative                                                                       | Pros                              | Cons                                                                                                                                                   | Why Not                                                |
| --------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Everything in `card_templates`, global rows with a null tenant and a scope column | One table                         | Every tenant query must reason about null tenants; `clearDefaultKinds` and the `is_default` fallback already ignore `source`; harder to isolate or RLS | Mixes private and shared data in one table             |
| All-new tables, kind rows migrated to a `club_templates` table                    | Clean slate                       | Moves the pilot's live rows and rewrites the draft pipeline's lookup on the day of the ship                                                            | Puts the byte-identical carry-over at risk for no gain |
| Database only for Ovation templates (converter output uploaded in the console)    | No deploy for any template        | Converted looks unreviewed, not in git, no CI fit check; sessions can't reach production                                                               | Ash chose the hybrid                                   |
| Repo bundles for every Ovation template                                           | Everything reviewed               | Every new Ovation design needs a PR and a republish                                                                                                    | Ash chose the hybrid                                   |
| Conditional layers only, no stacks                                                | Simplest renderer                 | Gaps don't close; the converter writes duplicate layers a club must edit twice; Figma auto layout is lost                                              | Ash chose stacks                                       |
| Per-preset boxes                                                                  | Exact                             | Up to 12 boxes per layer to keep in step                                                                                                               | Ash chose stacks                                       |
| One template per carousel page                                                    | Pages mixable across looks        | A look multiplies by four for Match Day; mismatched carousels; capacity and fit split across templates                                                 | A template designs one card kind (PM decision 4)       |
| Per-club library switch                                                           | Gradual rollout, instant rollback | Two paths in production for longer                                                                                                                     | Ash chose everyone at once                             |
| "Take update" replaces an edited copy                                             | Clubs always get fixes            | Overwrites a club's work                                                                                                                               | Ash: an edited copy becomes standalone                 |

## Consequences

### Positive

- One format, one renderer and one fit check for every card, Ovation-made or club-made.
- New Ovation templates, AI drafts and Figma imports go live with no code change. Converted looks are reviewed and CI-checked once.
- The pilot's documents are never rewritten. Saved drafts and carousels render as before.
- Shared and private data live in different tables, so tenant isolation is a table boundary, not a filter.
- Release 3 motion and release 4 premium looks extend the format and the looks table. Neither needs a migration of documents.

### Negative

- The renderer, validator and editor grow: pages, stacks, conditions, richer style, vector layers and motion presets.
- Every club's new drafts are templated, so the warnings-gate renders (ADR-003) now run for every club. The sweep's per-club cap (20 drafts, 60 renders) bounds it, but SRE must watch render time.
- Pack code and the template path coexist until old drafts age out.
- Bundles in the repo and console templates in the database are two places to look. The `origin` column says which one owns a template.

### Risks

- **Converter fidelity.** It works from rendered output; unmapped parts are listed per pack, and any pack that converts badly is hand-designed instead. Active looks need Ash's visual sign-off before the merge.
- **Structured-output schema limits.** Nested stacks may exceed them. The spike decides between a schema and validator-only retries.
- **Fit-check load on the shared render queue.** Publish renders take priority. Fit jobs run batched in one page.
- **No per-club rollback.** Parity gates the single merge, and reverting the release is the fallback.

## Dependencies

- Extends ADR-001 (document shape), ADR-002 (drafts copy; carousels hold one document, now with pages) and ADR-003 (the warnings gate stays; the switch and lazy starter creation are superseded).
- Builds on ADR-010 (content contract, field catalogue, presets). Its layout contract (`CONTENT_LAYOUTS`, the fit grid) retires with the pack code.
- Requires migration 0057 (library tables, `card_templates` columns and index swap, `social_drafts.template_ref`, `template_generations`), applied by hand in production before republishing.
