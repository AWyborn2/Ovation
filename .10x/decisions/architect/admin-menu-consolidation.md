# admin-menu-consolidation — Architecture + implementation plan

**Status:** Design complete 2026-10-19. Upstream: `decisions/product-manager/admin-menu-consolidation.md` (scope B).

## Requirement change agreed with Ash (2026-10-19)

A person can legitimately be **active in more than one register in the same season**: a junior
who also plays seniors, a woman who also plays in a men's side. Admins must be able to do this
easily. So the PM's "one entry per person per season across categories" is withdrawn.
Replacement rules:

- One entry per person **per category** per season (Men, Female, Juniors).
- Number clashes are checked **within a category only**.
- Being in several categories is allowed and **visible** (an "Also in: Female" badge), never
  blocked. That badge is how an admin spots an accidental double entry.
- "Also add to…" copies a person into another category in one click (number pre-filled).

## Landscape (verified in code)

- `lib/db/src/schema/shirt_numbers.ts`: `shirt_numbers` (senior; unique per tenant+season+
  participant and per tenant+season+player), `junior_shirt_numbers` (participant-keyed, `held`),
  `shirt_number_settings` (one switch and policy set for both registers).
- `lib/db/src/shirt-numbers.ts`: `seasonNumbersInUse` (season-wide; drives the `block` policy),
  `numberAfterDuplicatePolicy`, carry-forward, held linking. Routes: `api-server/src/routes/
  shirt-numbers.ts`, `juniors-shirt-numbers.ts`. UI: `components/shirt-numbers/*` (register
  table with Duplicates filter + badge, settings panel).
- Grade classifier `lib/db/src/central/grades.ts` already knows women's grades
  ("Female A/B Grade", WA "Women's …").
- Admin IA: `src/lib/admin-nav.ts` (single source), group pages in `pages/admin-groups.tsx`
  (`/admin/<group>/:tab?`), legacy `<Redirect>`s already in `App.tsx`.

## Options considered (shirt numbers)

1. **`category` column on `shirt_numbers` ('men' | 'female'); juniors stay in their own table — RECOMMENDED.**
   Small migration, keeps juniors isolation, and the duplicate scope becomes one extra `where`.
2. A separate `female_shirt_numbers` table. Rejected: a third copy of the routes, ingest and UI
   for no isolation benefit (female seniors are seniors).
3. Derive the category from the grades played. Rejected: women play men's grades; it's
   ambiguous and changes under the admin's feet.

## Design

### Data (migration `0047_shirt_number_category.sql`, idempotent)

- `ALTER TABLE shirt_numbers ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'men'`
  + `CHECK (category IN ('men','female'))`. Existing rows backfill to `men` via the default.
- Replace the two partial unique indexes with `(tenant_id, season, category, participant_id)` and
  `(tenant_id, season, category, player_id)` (same `WHERE … IS NOT NULL`). Drop the old indexes
  in the same migration (`DROP INDEX IF EXISTS`). Production: apply by hand before republishing.
- `junior_shirt_numbers` is unchanged.

### Shared lib

- `seasonNumbersInUse(executor, tenantId, season, category)`: clashes are scoped by category.
- Carry-forward and rollover carry the category (a female entry rolls to female).
- Lineup-sourced entries: the category comes from the fixture's grade via the classifier
  (women's grade → `female`, otherwise `men`). Add `isWomensGrade(appGrade)` beside the classifier.

### API (OpenAPI-first: `lib/api-spec/openapi.yaml` → codegen)

- `GET /shirt-numbers?season&category`. The list and the `duplicate` / `duplicateWith` flags
  are computed within the category.
- `POST` / `PATCH /shirt-numbers` accept `category` (default `men`). Upload and "add squad"
  take a `category`.
- Entries gain `alsoIn: ("men"|"female")[]` (the other senior categories that hold the same person).
- **Cross-register (senior ↔ junior), admin-only, juniors-namespaced:**
  `GET /api/juniors/shirt-numbers/overlap?season` returns, per participant id, the registers that
  person is in. Admin-only, flags only, never used on public pages and never joins stats. This
  is the only read that touches both tables, kept under `/api/juniors/*` per the isolation rule.
  It drives the "Also in: Juniors / Men" badges.
- "Also add to…" is a client action: a normal `POST` to the destination register (senior route
  with `category`, or the juniors route) with name, participant id and number pre-filled. There's
  no new cross-table write endpoint.

### Public reads

Unchanged for juniors. For seniors, a team-list or match context uses the fixture's category, and
the player profile shows the number for the category of the grades that player plays most this
season (a tie goes to `men`). This needs one helper in the player shirt-number read
(`player-shirt-numbers.ts`).

### Admin UI / information architecture

| Change | Implementation |
|---|---|
| People → **Shirt numbers** | One tab `/admin/people/shirt-numbers`: the settings panel at the top, then a segmented control **Men / Female / Juniors** (`?section=`). Men and Female reuse `register-table` with `category`; Juniors renders the existing junior register (junior hooks only). Badges: "Also in: …"; row action "Also add to…". |
| **Imports** hub | `/admin/import/:tab?` with tabs **Stats** (the current page), **Squad** (the PlayHQ participant upload moved out of `admin-availability.tsx` into `components/imports/squad-upload.tsx`), **Shirt numbers** (upload with a category picker; juniors uploads go to the junior route). The nav label becomes "Imports". Availability and Shirt numbers keep "Upload →" links. |
| Display & kiosk | Tab `display` moves to the `settings` group (`/admin/settings/display`). |
| **Stats & Data** group | New group `data` at `/admin/data`: Stats, Junior scorecards, Corrections, Duplicate players. Removed from People. |
| Junior fixtures | Selection Hub gains tabs: "Senior selection" (`/admin/selection`) and "Junior team lists" (`/admin/selection/junior-fixtures`). |
| Honours & Records | Keeps only Premierships, Awards, Team of the Decade, Caps, Life members, Junior premierships. |
| Redirects | `App.tsx` `<Redirect>` for every old path: `/admin/honours/shirt-numbers`, `…/junior-shirt-numbers` (→ `?section=juniors`), `…/display`, `/admin/people/stats`, `…/junior-scorecards`, `…/corrections`, `…/duplicates`, `…/junior-fixtures`. Fix the existing redirects that point at the old People paths. |

Feature gating is kept: shirt numbers and the data tabs keep `curation`; `display` keeps `clubroomTv`.

## Failure modes / risks

- **Migration not applied before republish** → inserts with `category` fail. Mitigation: the
  migration goes first in the release notes; `db-drift-check.mjs` lists it.
- **Juniors isolation regression** via the overlap endpoint or the unified page. Mitigation:
  a test that the overlap endpoint returns no stats fields and isn't reachable by non-admins; the
  junior section only calls `/api/juniors/*`.
- **Wrong category on backfill** (existing women entered as men). Mitigation: a bulk
  "Move to Female" action on selected rows (P2). False clashes clear as soon as rows are moved.
- **Broken bookmarks / tour steps** → redirects + `lib/tour.ts` update + `admin-shell-v2.test.tsx`.

## Implementation units (two PRs)

**PR 1: menu moves (no migration, ships first)**
- U1 `admin-nav.ts`: new `data` group, Selection tabs, Display → settings, Honours trimmed,
  "Imports" label; `admin-groups.tsx` tab routing for the new groups; redirects in `App.tsx`;
  tour and shell tests updated.
- U2 Imports hub: `/admin/import/:tab?`, extract the squad upload component, link from Availability.

**PR 2: shirt-number categories (migration 0047)**
- U3 Migration + schema + shared lib (category, indexes, scoped `seasonNumbersInUse`, rollover,
  lineup category via `isWomensGrade`). Tests: men/female same number = no clash; same person
  in both categories allowed; block policy is per category.
- U4 OpenAPI + routes: `category` param and body, `alsoIn`, juniors overlap endpoint; codegen.
  Isolation and tenant tests.
- U5 Unified People → Shirt numbers page (sections, badges, "Also add to…", bulk "Move to
  Female"); Imports → Shirt numbers upload with a category picker; remove the old Honours shirt tabs.
- U6 Public player number per category helper; release notes (migration first).
