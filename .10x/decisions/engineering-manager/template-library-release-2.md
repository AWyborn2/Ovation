# Delivery plan: template library release 2 (27 Oct 2026)

**Inputs:**

- Scope: `decisions/product-manager/social-template-library.md`, Release 2.
- Design: `decisions/architect/template-library-release-2.md` and `.10x/adrs/012-club-published-templates.md`
  (accepted).

**Status:** Complete. ADR-012 accepted 27 Oct 2026; all five slices merged to `main`: R2-A #558, R2-B #565,
R2-C #572, R2-D #564, R2-E #566.

## Delivery model

- Five slices, each its own PR to `main`, safe alone. There is no integration branch (as for
  the full draft editor).
- Merge on green and clean (Ash's standing rule). Ash tests on the dev stack after R2-B, R2-D
  and R2-E, the slices people can see.
- R2-A goes first. Then R2-B, R2-D and R2-E can run in parallel sessions (at most three). R2-C
  follows R2-B.
- Parallel slices all touch `lib/api-spec/openapi.yaml`, so each adds its paths in its own block
  and merges `main` before its PR.
- There is one migration (0072 unless something lands first), in R2-A. Ash runs it in Production
  SQL before the republish that carries R2-B.
- `.10x/status.md` is updated by this plan's PR and when each slice merges, never by two slices
  at once.

## Before anything goes live (Ash)

1. Run the quality query in the design note (§ Generate for clubs). Club Generate needs 70% or
   more first-try fits over the designer tool's first 50 runs.
2. Register Ovation as a Figma app (OAuth), then add `FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET`
   to the Replit secrets. Until then the pasted-token route works and Sign in with Figma is
   hidden.
3. Run the migration before the republish that carries R2-B.

## R2-A foundation (about 4 half-days)

| Task | Work                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TA.1 | Migration and Drizzle schema: every change in the design note's data table; idempotent SQL; snapshot                                                                                                                                 |
| TA.2 | OpenAPI for every R2 route and schema, then codegen. Routes are added later, slice by slice; the spec can lead                                                                                                                       |
| TA.3 | `publishableDocument` in `lib/scorecard/src/kind-templates/publishable.ts`: every v2 page and group, logo, sponsors, photos, colours, name tokens, flags with layer and page. Unit tests, including multi-page Match Day and a group |
| TA.4 | "Save as element" moves onto it (`element-save.ts`). Element saves produce the same output (existing tests pass unchanged)                                                                                                           |

Done when the migration applies twice cleanly, `ensure-constraints` passes, and nothing in the
app behaves differently.

## R2-B blank canvas and publish (about 8 half-days)

| Task | Work                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB.1 | `createCopy` with `blank: true`: a club template with the kind's page set and no origin. "New design" button in Your templates                                                                        |
| TB.2 | Server identity loader (tenant, brand, active sponsors) and the publish preview route                                                                                                                 |
| TB.3 | Publish: create or version the library template (`origin 'club'`), rights columns, tags with their checks, start the fit check; a pass lists automatically; re-publish adds a version; 422 with flags |
| TB.4 | Author unlist; relisting your own unlisted template goes through publish again                                                                                                                        |
| TB.5 | Browse: `authorName`, `usedBy` (distinct other tenants with a copy), tag filter                                                                                                                       |
| TB.6 | Publish dialog in the template editor: preview of what other clubs see, flags that select the layer, tags, rights checkbox, status (checking / listed / failed with the fit report)                   |
| TB.7 | Isolation tests: another club can't publish, unlist or read the private source; the published document holds no author URL, name or sponsor                                                           |

Ash checks: design a card from blank, publish it, see it listed from a second test club, take a
copy there, re-publish and see "update available".

## R2-C moderation and browse extras (about 4 half-days)

| Task | Work                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ |
| TC.1 | Report a template (club route; unique per club)                                                  |
| TC.2 | Console: club templates with open reports, unlist as Ovation (resolves reports), relist, dismiss |
| TC.3 | P2: sort (popular, new, Ovation, club) and favourites (`library_template_favourites`)            |

## R2-D club Generate (about 7 half-days)

| Task | Work                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| TD.1 | `startGeneration` takes the tenant; the result saves as a private club template; `resultRef.copyId`; errors stored on the row                   |
| TD.2 | The monthly cap (20, Perth calendar month; provider errors and refusals don't count) and `remaining` on the routes                              |
| TD.3 | Round-robin queue: one job per tenant at a time, one overall                                                                                    |
| TD.4 | The gate (first-try fit ≥ 70% over the first 50 console runs) plus `platform_settings.club_generate_enabled`; console switch with the numbers   |
| TD.5 | Club routes (list, start, poll) and the Generate dialog beside New design: brief, optional reference image, what is sent, remaining this month  |
| TD.6 | Tests: cap edges (19 → 20 → 429, a provider error not counted, the month boundary in Perth), isolation, gate off → 503, no library photo fields |

Ash checks: with the switch on, generate two drafts for one kind and see the count go down.

## R2-E Figma for clubs (about 7 half-days)

| Task | Work                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TE.1 | Connection store: seal and open, status, present without the token                                                                                     |
| TE.2 | Pasted token: check with `/v1/me`, store with the Figma handle; 401/403 later → `needs_reconnect`                                                      |
| TE.3 | OAuth: start (pending row, signed state), public callback, code exchange, refresh within 5 minutes of expiry; hidden without the client id             |
| TE.4 | Club import: `{ url, kind }` → `figmaToTemplate` with the club's client → a private club template; images to the club's own storage; the import report |
| TE.5 | Settings card (Connect with Figma / Paste a token / Disconnect) and an Import from Figma dialog beside New design                                      |
| TE.6 | Tests: the token never appears in a response or log, isolation, refresh failure, disconnect deletes the sealed values                                  |

Ash checks: paste a token, import a frame, edit and save it. Once the Figma app is registered,
sign in with Figma.

## Risks

- **Removing content misses something.** Mitigation: the server is the authority, flags block
  publishing, and tests assert on the published document.
- **Fit queue load.** Publishes and generations share the serial fit checker with card renders.
  Watch the pending count, and add a second worker only if it grows.
- **Figma API details** (scope names, token lifetimes) are confirmed at app registration. The
  pasted-token route doesn't depend on them.
- **AI quality.** If the gate isn't met, R2-D still merges with Generate off; the console shows
  the numbers.
