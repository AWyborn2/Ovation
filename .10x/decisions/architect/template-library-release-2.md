# Architect: template library release 2 (ADR-012)

**Status:** Proposed 27 Oct 2026. **Scope:** `decisions/product-manager/social-template-library.md`
(Release 2). **ADR:** `.10x/adrs/012-club-published-templates.md`.

## Answers from Ash (27 Oct 2026)

- **Generate cap:** 20 runs per club per month.
- **Figma:** both sign-in (OAuth) and a pasted personal access token.
- **AI gate:** check the designer tool's first-try fit rate in production before Generate goes
  live (query below).

## What release 1 left ready [CONFIRMED in code 27 Oct 2026]

- **Library tables**
  - `library_templates`: `origin` allows `'club'`; `author_tenant_id`, `listed` and the
    `unlisted_by` author/ovation fields are in place.
  - `library_template_versions`: the fit status and report per version.
  - Club copies are `card_templates` rows with `source = 'kind'`, `origin_template_id` and
    `origin_version` (`template-library/copies.ts`).
  - Browse lists only listed, passed versions (`store.ts`, `listLibraryTemplates`).
- **Fit check**: asynchronous and in-process (`fit.ts`, `fit-job.ts`), writing the result to the
  version or the copy.
- **Save as element**
  - Content removal runs in the browser: `studio-editor/element-save.ts`
    (`elementFromSelection`, `sampleText`, `tokeniseColours`). The server checks the result:
    `elementSaveErrors` and `libraryAssetPolicyErrors`.
  - Reports and moderation: `library_element_reports` and `element-moderation.ts`.
- **Designer**
  - `template-ai/jobs.ts` runs one serial chain for everyone and writes `tenant_id = null`.
    `generate.ts` retries twice for errors and fit warnings.
  - Generation rows record cost, attempts and `first_try_fit`. The
    `template_generations_tenant_month` index exists.
  - `images.ts` accepts PNG/JPEG only, strips EXIF and stores nothing.
  - The route refuses library photo fields.
- **Figma**
  - `figma.ts` `createFigmaClient({ token })` already takes the token as an argument.
  - `figmaToTemplate` does the mapping.
  - The import always saves a console template.
- **Secrets and OAuth**
  - `lib/secret-box.ts` `seal`/`open` (AES-256-GCM, key versions).
  - The Meta pattern: `social_connections` plus pending table, `signed-token.ts`, and the
    `/oauth/callback` route.
- **Gaps**
  - No club publish or author unlist for templates.
  - No blank-canvas template (blank exists for drafts only, and that saves `source = 'editor'`).
  - No tags, favourites or used-by count.
  - No club-facing generation or Figma route.
  - No index on `card_templates.origin_template_id`.

## Data (migration 0072 or later; additive, idempotent)

| Change                                                                                                                                                | Why                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `library_templates.tags text[] default '{}'` (checked set)                                                                                            | Style tags; GIN index for filtering         |
| `library_template_versions.rights_confirmed_by_admin_id int`, `rights_confirmed_at timestamptz`                                                       | Rights confirmation per published version   |
| `library_template_versions.published_by_tenant_id int`                                                                                                | Which club published each version (audit)   |
| `card_templates.published_template_id int → library_templates(id) on delete set null`                                                                 | The club's source template for re-publishes |
| index `card_templates(origin_template_id)`                                                                                                            | "Used by N clubs"                           |
| `library_template_reports` (template, tenant, reason, created, resolved…), unique (template, tenant)                                                  | Reports, as for elements                    |
| `library_template_favourites` (tenant, template), primary key (tenant, template)                                                                      | P2 favourites                               |
| `figma_connections` (tenant unique, method `oauth`/`token`, sealed access, sealed refresh, expires_at, figma_user, status, status_reason, timestamps) | Club Figma                                  |
| `figma_connection_pending` (nonce, tenant, admin, expires_at)                                                                                         | OAuth state, as for Meta                    |
| `template_generations.error text`                                                                                                                     | Errors survive a restart (today in memory)  |
| `platform_settings.club_generate_enabled boolean default false`                                                                                       | The platform switch for club Generate       |

Style tags (first set, extended in code): `photo-led`, `bold-type`, `minimal`, `dark`,
`light`, `retro`, `broadcast`, `textured`. Checks against the design:

- `photo-led` needs a photo slot covering at least 30% of the primary page at some size.
- `dark` and `light` must agree with the page background's luminance.

## Removing the club's content (shared)

`lib/scorecard/src/kind-templates/publishable.ts`:

- **`publishableDocument(doc, kind, identity)`** returns `{ document, changes, flags }`, where
  `identity` is the club's name and short name, logo URL, sponsor names and logos, and colours.
  - Every page of a v2 document, groups included. The browser's element code moves onto it.
  - The club logo becomes `{{clubLogo}}`, and sponsor logos become their sponsor slots.
  - Any other uploaded image under the club's storage becomes a photo slot.
  - Library and bundled images stay, under the asset policy.
  - Club colours become palette tokens.
  - The club name in free text becomes `{{clubName}}` when it is the whole text, and is flagged
    when it is part of a sentence.
  - Sponsor names and short names in free text are always flagged.
  - Flags carry the layer id and page, so the editor can select the layer.
- **The server** loads the identity from the tenant, brand and active sponsors, runs it, and
  refuses to publish while flags remain (422 with the flags).
- **The browser** runs the same function to preview "what other clubs will see".

## Routes (OpenAPI first)

**Club (`requireAdmin` + `requireEntitlement("socialStudio")`)**

- `POST /template-library/copies` with `{ kind, blank: true }`: a blank club template for the
  kind, with the kind's minimum page set.
- `GET /template-library/copies/{id}/publish-preview`: the publishable document, its changes and
  flags, the current tags and the tag checks.
- `POST /template-library/copies/{id}/publish`
  - Body: `{ name, tags, rightsConfirmed: true }`.
  - It creates or versions the library template, stores rights, and starts the fit check.
  - It answers `pending`. A pass lists the template automatically, and a fail leaves it unlisted
    with the report.
- `POST /template-library/templates/{id}/unlist`: author only.
- `POST /template-library/templates/{id}/report`, plus `PUT`/`DELETE …/favourite` (P2).
- Browse gains `tags`, `sort` (`popular` | `new` | `ovation` | `club`, P2), `favourites=true`,
  `authorName` and `usedBy`.
- `GET /template-library/generations`, `POST …/generations` (multipart brief and image), and
  `GET …/generations/{id}`: the tenant's own only, with `remaining` for the month.
- `GET /figma-connection`, `POST /figma-connection/token`, `POST /figma-connection/oauth/start`,
  `GET /figma/oauth/callback` (public, signed state), `DELETE /figma-connection`, and
  `POST /template-library/import/figma` (`{ url, kind }` → a private club template and the
  import report).

**Platform (`requirePlatformAdmin`)**

- The console lists club templates with their open reports, and can unlist, relist and dismiss
  reports (as for elements).
- A designer switch, `platform_settings.club_generate_enabled`, with the quality numbers beside it.

## Generate for clubs

- `startGeneration({ tenantId, adminId, kind, brief, image })`.
- Before inserting, count this month's rows for the tenant. A month is a calendar month in
  Australia/Perth, and rows with outcome `provider_error` or `refused` don't count. At 20 or more
  the answer is 429 with `remaining: 0`.
- The result is a club template (`card_templates`, `source = 'kind'`, no origin), private and not
  the kind's default. `resultRef = { copyId }`.
- Queue: the in-process chain becomes a small round robin, one running job per tenant and
  `TEMPLATE_AI_CONCURRENCY = 1` overall. A restart still fails interrupted jobs, as today.
- Errors are stored on the row (`error` text column in the migration) instead of in memory.
- **Gate.** Club Generate is offered only when:
  - `generationQuality()` over the first 50 finished console runs shows 70% or more first-try
    fits; and
  - the platform switch is on.

  Otherwise the route answers 503 `generate_unavailable` and the UI hides the button.

- The privacy rules are unchanged: sample data only, no library or junior photos, and the image
  is never stored. The UI tells the admin what is sent.

**Quality check for Ash (read-only, Production SQL):**

```sql
SELECT count(*) AS finished,
       count(*) FILTER (WHERE first_try_fit) AS first_try_passes,
       round(100.0 * count(*) FILTER (WHERE first_try_fit) / nullif(count(*), 0), 1) AS pct,
       round(avg(cost_micros) / 1e6, 4) AS mean_cost_usd
FROM (
  SELECT first_try_fit, cost_micros FROM template_generations
  WHERE tenant_id IS NULL AND status = 'done'
  ORDER BY created_at LIMIT 50
) first_fifty;
```

## Figma for clubs

**Sign-in (OAuth 2)**

- The start route stores a pending row and redirects to Figma's authorize URL with signed
  state.
- The callback exchanges the code (`FIGMA_CLIENT_ID`/`SECRET`) for access and refresh tokens,
  seals them and marks the connection connected.
- Before a request, a token expiring within 5 minutes is refreshed. If refreshing fails, the
  connection is marked `needs_reconnect`.
- The scope is the narrowest file-read scope Figma offers. Confirm the scope names when the app is
  registered.

**Pasted token**

- `POST /figma-connection/token` calls `GET https://api.figma.com/v1/me` with the token. Only on
  success is it sealed and stored, along with the Figma handle (shown so the admin can confirm).
- Its expiry is unknown, so a 401/403 later marks the connection `needs_reconnect`.

**Both**

- The token is never returned, logged or sent to the browser.
- `DELETE` removes the sealed values.
- The import uses `createFigmaClient({ token: open(sealed) })` and `figmaToTemplate`, then
  writes a private club template. Images go to the club's own storage, not the shared library.
- The platform import is unchanged.

## Security and isolation

- **Isolation tests.** For each new route: another tenant can't read or act on a club template,
  a generation, a connection, a report or a favourite. A published version contains no author
  URL, name or sponsor (assert on the document).
- **Secrets.** Sealing reuses the `SOCIAL_TOKEN_KEY` rotation. The OAuth state is signed and
  expires in 10 minutes with a single-use nonce.
- **Juniors.** A template carries slots, never photos, so publishing can't carry a junior photo.
  Generation keeps refusing library photo fields.
- **Data governance.** Templates hold no scraped data, and publishing shares designs only.

## Not building in release 2

- Release 3 (full motion), release 4 (premium looks).
- Checking what an uploaded reference image shows. It is still refused by type and size only;
  the UI asks the admin not to upload player photos.
- A Canva connection (Canva comes in through the reference image).

## Slices

Each is its own PR to `main` and safe alone.

| Slice                  | What                                                                                                                                                            | Visible?                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| R2-A foundation        | Migration, schema, OpenAPI + codegen, `publishableDocument` (shared) with tests; "Save as element" moved onto it                                                | No (element save behaves the same)                |
| R2-B blank and publish | Blank club template; publish preview and publish (flags, rights, tags, fit, auto-list); re-publish; author unlist; credit and used-by in browse; publish dialog | Yes                                               |
| R2-C moderation        | Reports and console moderation for club templates; P2 sort, tag filter, favourites                                                                              | Yes                                               |
| R2-D Generate          | Tenant-scoped generations, cap, round-robin queue, stored errors, gate and platform switch, Generate dialog                                                     | Hidden until the gate passes                      |
| R2-E Figma             | Connections (token and OAuth), refresh, club import into a private template, settings card and import dialog                                                    | Yes (token now; OAuth once the app is registered) |

Order: A first. Then B, D and E in parallel; they touch different files except the OpenAPI
file, so merge `main` often. C comes after B.
