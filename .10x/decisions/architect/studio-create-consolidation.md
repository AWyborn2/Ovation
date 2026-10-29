# Studio create consolidation: design

**Status:** Design complete, 29 Oct 2026. **Scope:** `decisions/product-manager/studio-create-consolidation.md`
(Approved scope, plus Ash's two additions of 29 Oct: every new design opens straight in the editor, and the set
editor's page strip, grid view and Share / Download panel). **Next:** Engineering Manager.

## Summary

Option A is a new shell around the screens that already exist. One tenant column turns it on per club. When it
is off, the club gets today's Studio unchanged. The new Create is a four-step wizard. It ends by making a
`social_drafts` row with the existing create endpoints, then opens that draft in the existing editor:
`/admin/social/editor/:id` for one card, `/admin/social/set/:id` for a carousel. No form-plus-preview page sits
in between. The editors gain panels around them (a page strip counter and grid, Share / Download, a Card panel
for sponsors and content level), shown only under the switch. Their internals are unchanged.

## 1. The switch

- **Column:** `tenants.new_studio_enabled boolean not null default false` (migration `0076_new_studio_preview.sql`,
  idempotent `ADD COLUMN IF NOT EXISTS`). This copies `playhq_sync_enabled` and `junior_sync_enabled`: a platform
  admin switch stored as a tenant column, not settings JSON. A column is what the platform console already
  reads and writes, and it shows in the tenant list. Settings JSON is club-editable, and a club must not turn
  its own preview on.
- **Writing it:** `UpdateTenantBody.newStudioEnabled` (platform admin `PATCH /admin/tenants/{id}` only). The
  club-admin brand update and signup schemas do not carry it. `tenant-brand-update.test.ts` gains a case that a
  smuggled `newStudioEnabled` is ignored.
- **Reading it:** `AdminTenant.newStudioEnabled` for the console. The club web reads
  `TenantPlan.newStudio: boolean` from `GET /tenant-plan`, which the admin layout already loads on every page
  through `useEntitlements`. A new `useNewStudio()` in `lib/entitlements.ts` returns it, defaulting to `false`
  while loading, so the old Studio never flashes the new one.
- **Console:** a "New Studio (preview)" card in `pages/platform-admin/tenant-detail.tsx`, next to Junior sync.
- **Dev:** `/dev-tenants.html` sets `ovation_dev_tenant`, and the server honours `x-tenant-id` on `.replit.dev`.
  `/tenant-plan` resolves the request's tenant, so the switch follows whichever dev tenant is picked. The switch
  is set on dev from the dev platform console, or with
  `update tenants set new_studio_enabled = true where id = 1;` in the dev database.
- The switch is presentational: the server routes are the same for both Studios. Nothing new is exposed to a
  club with it off, beyond the read-only junior prefill route (section 4), which is admin-only and juniors-gated.

## 2. Menu and routes

`lib/admin-nav.ts` stays the one source for sidebar, tab bar, breadcrumb and jump-to.

- The social group gains `previewTabs` beside `tabs`. `visibleNav(entitlements, { newStudio })` and
  `AdminTabGroup` pick `previewTabs` when the switch is on.
- `AdminNavTab` gains `hidden?: boolean`: routable, but not shown in the tab bar or sidebar. This keeps the old
  pages reachable by URL and from Settings without listing them.

| New Studio tab | Path                                               | Page                                                                                        |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Home           | `/admin/social`                                    | new `StudioHomeV2`                                                                          |
| Create         | `/admin/social/create`                             | new `CreateWizard` (old page when off; same URL)                                            |
| Queue          | `/admin/social/queue`                              | existing page, plus a Seniors / Juniors filter when on                                      |
| Your designs   | `/admin/social/designs`                            | existing `YourDesigns`, plus filter chips (Everything, Drafts, Carousel sets, Templates)    |
| Templates      | `/admin/social/template-library`                   | existing                                                                                    |
| Photos         | `/admin/social/photos`                             | new tab shell: Senior photos (existing library) and Junior photos (existing junior library) |
| Settings       | `/admin/social/settings`                           | existing page, with links to Posting plan, Cards, Email lists and Fixtures (P1: card grid)  |
| hidden         | `plan`, `cards`, `fixtures`, `email-lists`, `sets` | existing pages, reachable by URL and from Settings / Your designs                           |

Redirects, applied only when the switch is on (with it off every old URL behaves as today):

- `/admin/social/juniors` → `/admin/social/create?team=junior`
- `/admin/social/sets` → `/admin/social/designs?type=set`, except `?open=<id>`, which still opens the old set
  editor (Your designs links legacy sets there)
- `/admin/social/library` → `/admin/social/photos`; `/admin/social/junior-library` → `/admin/social/photos?tab=junior`

The redirect lives in the tab group: a hidden or retired tab value maps to its new path. The `RedirectKeepingQuery`
helper from `App.tsx` is reused.

## 3. Create

`components/studio-create/`: one wizard with its state in the query string (`?team&kind&mode&source&size`), so
Back, refresh and deep links (Home's quick picks, the `/juniors` redirect) work.

1. **What.** A Seniors / Juniors toggle and a kind grid.
   - Senior kinds: the posting-plan split from `splitPostedKinds` (posted kinds first, the rest under More), then
     Blank design.
   - Junior kinds: Junior Team List, Junior Match Day, Junior Results (match summary), Junior Milestone. Each is
     backed by an existing junior builder.
2. **One or many.** Single card or carousel, offered only where a set type exists (`teamLists`, `matchDay`,
   `results`, `matchSummary`). For Team List the labels are "One team" and "Whole round".
3. **Fill from.** Each kind declares its source in a descriptor table
   (`components/studio-create/sources.ts`):

   | Kind + mode                  | Source list                                                                                              | Prefill call (existing unless marked)                                                  |
   | ---------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
   | Senior Team List, one        | `useListFixtures({upcomingOnly})` + `getFixtureTeamList` per fixture, badged from `source`/`isPublished` | `getSocialTeamListPrefill(fixtureId)`                                                  |
   | Junior Team List, one        | junior fixtures + `getJuniorFixtureTeamList`, badged                                                     | **new** `getJuniorTeamListPrefill(juniorFixtureId)`                                    |
   | Match Summary / Results, one | recent matches                                                                                           | `getSocialMatchSummaryPrefill`; junior: `getJuniorMatch` + `juniorMatchToSummaryInput` |
   | Results round, Weekend Wrap  | rounds                                                                                                   | `getSocialRoundResultsPrefill`, `getSocialWeekendWrapPrefill`                          |
   | Milestone, Big Moment        | detected moments                                                                                         | the panels `PrefillPanel` uses today; junior: `listJuniorSocialMilestones`             |
   | Other kinds, Blank design    | none                                                                                                     | `initialCardState` sample, as Create a card today                                      |
   | Any carousel                 | rounds / weekends (this weekend suggested), plus "Pick by hand"                                          | `getWeekendCarouselSources(setType, audience, from, to)`                               |

   Team badges: **Selection Hub** (published, `source` admin or selection), **PlayHQ** (`source = playhq`),
   **Draft** (saved, not published), **Fill in by hand** (no list). The badge tells the admin where the names
   came from. It does not change which list is used: the prefill reads the saved list exactly as Create a card
   does today.

4. **Look and size.** The kind's templates (club default first, then the library) at the chosen size, reusing
   `TemplateStep` / `TemplateThumb` from `studio-home/create-picker.tsx`. Sizes: Square, Portrait, Story,
   Landscape for cards; the set sizes for carousels.

**Finish = open the editor.** "Open in editor" calls:

- **one card:** `createSocialDraft({ cardInput, templateRef | packId, subjectPlayerId? })`, then
  `/admin/social/editor/:id?format=<size>`. This is the call `useStartDesign` and `EditorStarters` already make.
- **carousel:** the weekend carousel's assembly, lifted out of `use-weekend-carousel.ts` into a pure
  `assembleWeekendCarousel(sources, templateRef, size, overrides)`. The hook keeps calling it, so the old page
  is unchanged. Then `createSocialDraft({ cardInput: { kind, weekendCarousel: v3 } })` and
  `/admin/social/set/:id`.
- **"Pick by hand":** a free set draft (pages layout) from the chosen look's set template, then the set editor.

Every draft starts `awaiting_review`, as ad-hoc drafts do today: nothing posts without review. Old export-only
`card_sets` are not started from Create (Ash, 29 Oct). They stay listed, opened and exported from Your designs.

## 4. Juniors without blending

- **Data path.** A junior kind reads only `/api/juniors/*` and junior tables:
  - `getJuniorFixtureTeamList`, `getJuniorMatch`, `listJuniorSocialMilestones`;
  - one new read-only route, `GET /juniors/fixtures/{id}/social-prefill` (operationId `getJuniorTeamListPrefill`,
    admin + `juniors` entitlement, in `routes/juniors-fixtures.ts`). It runs the existing
    `buildJuniorTeamListContent` for that one fixture and returns `SocialCardPrefill` plus
    `source: selection | admin | playhq | none` and `isPublished`.

  Junior carousels use `getWeekendCarouselSources?audience=junior`, the route the junior Match Day carousel
  already uses. Senior and junior never share a source list: the wizard's `team` decides which descriptor table
  is read. There is no "All" in Create.

- **Marking.** `createSocialDraft` sets `source_match_is_junior = true` when `cardInput.junior === true`. Today
  hand-made junior drafts miss this. With it, the Queue filter and `juniorDraftMayAutoPublish`'s fail-closed
  check see them. That check holds a junior draft without `juniorTeams` for an admin, so hand-made junior drafts
  are never auto-posted.
- **Photos (fail-closed).** A client cannot set junior photo consent:
  - `createSocialDraft` strips `juniorPhotoAllowed`, `featuredParticipantId` and any photo URL from a junior
    `cardInput`;
  - for a junior Team List it stamps a server pick with `pickJuniorCardPhoto` + `juniorPhotoFields`, the sweep's
    path;
  - render and export already show no junior photo unless `juniorPhotoAllowed === true`.

  The Share / Download panel renders through the same draft-render rules, so a download never carries a photo
  the card would not show.

- **Fill-ins.** Prefill and content builders already exclude `player_id >= 90000`. Create adds no new player
  query.

## 5. Editor additions (around the editors, switch-gated)

Each is a new component mounted by the existing page through a prop or slot. The canvas, layers, history,
template ops and document format are untouched. With the switch off, none of them mount.

- **Page strip and grid (set editor).** `admin-set-draft-editor` already passes `slidesMode` to
  `TemplateEditorV2`, which renders the slide strip and its reorder, add and delete. New: an "N / M" counter and
  a grid toggle. The grid is an overlay listing every slide large, with the same `onMove`, `onDelete` and add
  handlers, so reordering there is the same operation.
- **Share / Download (both editors).** A Share button in `EditorShell`'s extra-actions slot opens
  `ShareDownloadPanel`:
  - Pages: All, This page, or Custom.
  - Size label from `SIZES[format]`.
  - PNG, and JPG through the existing canvas export (`toBlob` type), which costs little.
  - One page downloads one image. Several pages download a zip named after the set, with files `<set-slug>-01.png`
    in slide order. This reuses `components/weekend-carousel/export.ts` (zip and naming) and the per-slide
    renderer the set editor's thumbnails use.
  - Single cards get the same panel with one page.
  - Downloading never changes draft status.
- **Card panel (single editor), and Set panel (set editor).**
  - Sponsors on/off.
  - "What these cards show" (Minimal / Standard / Full), stored per draft the way the weekend carousel stores
    `contentOverride` today (`readContentOverride`). For a single card the slice first checks whether the
    single-card render reads a per-draft override. If it does not, the panel offers the club-wide setting
    instead (a link to What cards show) and the per-draft version goes to P1. No new column either way.
  - "Send to queue": `approveSocialDraft`, the same action as Approve in the queue drawer, then back to the
    Queue.

  Photo placement and swap are already editor controls (ContentPanel photo focal and zoom, PhotosPanel).

- **Sponsors per slide.** When the sponsor session's component lands on `main`, it mounts in the Set panel.

## 6. Home, Queue, Your designs

- **Home.** `StudioHomeV2` has:
  - "Needs you": pending count and junior "check" drafts, from `listSocialDrafts`;
  - "Make something": quick picks deep-linking to Create;
  - "Continue designing": `useRecentDesigns(6)`.

  All existing data; no new endpoint.

- **Queue.** The page gains `team = all | senior | junior`, filtered on the client with `isJuniorDraft` (both
  markers). A draft with neither marker (sponsor, announcement) counts as senior.
- **Your designs.** `YourDesigns` gains type filter chips, read from `?type=`. Dismiss and Delete from #595 are
  kept.

## 7. P1 design notes

- **Per-slide layout and "apply to every slide".** Absent today: every data slide draws with its set's repeat
  page. Design: `arrangement.pageFor[slideKey] = pageId`, an optional map in the set document's arrangement,
  read by `setDraftSlides`. "Apply to every slide" clears the map and sets the repeat page. This adds an optional
  field to the set-draft arrangement, not to the template format. It needs Ash's review as a format-adjacent
  change before build.
- **Open one slide in the card editor.** "Edit this slide" makes a child ad-hoc draft from the slide's input and
  page (`createSocialDraft` with `templateRef`), opens it in `/admin/social/editor/:id?returnTo=set:<id>`, and on
  save writes the slide's override back through `saveDraftSetDesign`. The set editor itself is unchanged.
- **Settings cards and Photos tabs.** Pure navigation over the existing pages (Uploads: `club_uploads`;
  Collections: photo folders).

## Risks

- **Weekend carousel extraction.** It is the one refactor of live code (section 3). It is covered by
  `weekend-carousel.test.tsx` running unchanged against the hook.
- **Two Studios side by side** until every club moves. The switch keeps the old one byte-for-byte.
  `admin-nav-social.test.ts` asserts both tab lists.
- **Hand-made junior drafts:** marking them and stripping their photos changes how the queue treats them for
  every club, including clubs with the switch off. This is a correctness fix (they should already be junior and
  photo-safe), noted in the PR.
