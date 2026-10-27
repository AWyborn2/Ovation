# ADR-012: Clubs publish templates, generate drafts and import from Figma

**Status:** Accepted (Ash, 27 Oct 2026)
**Date:** 2026-10-27
**Feature:** social-template-library, release 2
**Author:** 10x-Team (Principal Architect)
**Detail:** `.10x/decisions/architect/template-library-release-2.md`

## Context

Release 1 (ADR-011) is on `main`. It added the shared library (`library_templates`, versions,
looks), club copies in `card_templates`, the asynchronous fit check, the platform designer tool
(Claude, platform admins only) and the Figma import (Ovation's own token). Club "Save as element"
already publishes a fragment to every club after removing the club's content. That removal runs
in the browser, and the server only checks the result.

Release 2 (product decision, `decisions/product-manager/social-template-library.md`) lets a
club:

- design a template from a blank canvas and publish it to every club, after automatic checks;
- generate a private draft with AI, capped per month;
- import a private draft from its own Figma account.

Ash's answers on 27 Oct 2026:

- **Generate cap:** 20 runs per club per month.
- **Figma:** a club can both sign in to Figma (OAuth) and paste a personal access token.
- **AI gate:** check the designer tool's first-try fit rate against real data before Generate
  goes live.

## Decision

1. **A published template is a library template with `origin = 'club'`.**
   - Publishing copies the club's template into a new library version. Re-publishing adds a
     version, and other clubs' copies see "update available" as they do today.
   - The club's own template records which library template it publishes to
     (`card_templates.published_template_id`).
   - Library rows stay free of club data (ADR-011's table boundary).
2. **The server removes the club's content, and its result is the one that counts.**
   - `publishableDocument` lives in `lib/scorecard`, shared with the browser's preview of what
     will be published. It works on every page of a v2 document.
   - It swaps the club's logo, photos, sponsor logos and colours for slots and tokens, and its
     name for `{{clubName}}`.
   - It flags literal club or sponsor names (and short names) left in free text.
   - A flag blocks publishing until the author replaces the text with a field.
   - "Save as element" moves onto the same function.
3. **Checks before listing.**
   - The asset policy, the author's rights confirmation (who and when, on the version), style tags
     checked against the design, then the existing asynchronous fit check.
   - A pass lists the template automatically. There is no approval queue (decision 3).
4. **Unlisting and reports.**
   - The author can unlist their own template, and Ovation can unlist any.
   - `library_template_reports` mirrors the element reports table, and console moderation mirrors
     the element moderation.
   - Copies keep working either way, because copies never read live library rows.
5. **Credit and counts.** Credit comes from `author_tenant_id`. "Used by N clubs" counts the
   distinct other tenants holding a copy, with a new index on `card_templates.origin_template_id`.
6. **Club Generate reuses the designer pipeline, scoped to the tenant.**
   - `startGeneration` takes the tenant, and the result lands as a private club template (never
     in the library).
   - The cap is 20 runs per tenant per calendar month (Perth time), counted from
     `template_generations`. Provider errors and refusals don't count.
   - The queue takes one job per tenant at a time.
   - Generate is switched on only when the designer tool's first 50 runs reach a 70% first-try
     fit, and a platform switch can still turn it off.
   - Generation still uses sample data only, and reference images still refuse library photos.
7. **Figma for clubs.**
   - `figma_connections` holds one row per tenant. The method is `oauth` or `token`, and the
     access and refresh tokens are sealed with `secret-box` (AES-256-GCM, the same key rotation as
     the Meta tokens).
   - OAuth follows the Meta connection pattern (signed state, callback, refresh before expiry).
   - A pasted token is checked against `GET /v1/me` before it is stored.
   - The import writes a private club template, and the platform import keeps Ovation's token.
   - Disconnecting deletes the tokens.
8. **Delivery.** Slices go to `main` one at a time, each safe alone, as the full draft editor was
   delivered. There is no integration branch. There is one migration (0072 or later), which Ash
   runs by hand before the republish.

## Consequences

- Club data can only reach the library through `publishableDocument`, the asset policy and
  rights confirmation. Isolation tests cover every new route (a published template carries no
  author data, and another club can't see a private draft, a generation or a Figma connection).
- Two new secrets: `FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET`. The Figma app has to be
  registered once, by Ash. Until it is, only the pasted-token route works.
- AI cost stays bounded: 20 runs × up to 3 model calls per club per month. Cost is tracked on
  every row.
- The fit check queue now also carries club publishes and generations. It stays serial behind
  card renders, which is fine at pilot scale; watch the queue length.
