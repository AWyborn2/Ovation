---
title: Isolation Gaps (Phase 3) - Plan
type: fix
date: 2026-07-02
topic: isolation-gaps
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan
execution: code
origin: docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md
---

# Isolation Gaps (Phase 3) - Plan

Implements **Phase 3** of the origin contract (docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md), advancing origin R9–R11. Product Contract unchanged. Depends on nothing in Phase 1 or Phase 2 — safe to build independently.

---

## Goal Capsule

- **Objective:** No tenant can read or write another tenant's settings, captain accounts, or curated card/social content. Every global-singleton table becomes per-tenant; every table that already carries `tenant_id` is actually enforced on every route, not just some.
- **Product authority:** Ash (reviews outcomes, approves phases).
- **Execution profile:** Deep. Seven units. `tenantIdColumn()` (`lib/db/src/schema/_tenant.ts`) is the established, low-risk column pattern (`NOT NULL DEFAULT 1`, non-interactive `db push`, backfills every existing row to Halls Head) — this reuses it everywhere a straight column add applies, and reworks the handful of tables whose fixed `id=1` primary key needs restructuring to go per-tenant.
- **Stop conditions:** Halls Head (tenant #1) must read/write exactly the same settings/captains/content it does today after migration — a behaviour change for tenant #1 is a hard stop, surface it.

---

## Product Contract

### Summary

Tenant-scope the remaining global tables: seven `id=1`-pinned settings singletons, the `captains` login table, and eight social/card-studio content-library tables that currently have no tenant dimension at all. Audit and fix two known enforcement gaps in tables that already carry `tenant_id` but aren't actually checked on every route. Extend the isolation-test suite to prove all of it.

### Problem Frame

A code audit (see prior research, folded in below) found the isolation gap is worse than the origin plan's R9/R10 wording implies — this isn't just "these tables will eventually collide across tenants," it's a **live cross-tenant vulnerability today**:

- `GET/PATCH/DELETE /captains` (`artifacts/api-server/src/routes/captains.ts`) never filter by tenant at all — any authenticated club admin (tenant-checked via `requireAdmin`) can list every captain on the platform, and rename, delete, or reset the password of a captain belonging to _any other tenant_ just by guessing/incrementing a numeric id. `captains.username` is also globally unique, so two clubs can't both have a "captain1".
- `sponsors` already has a `tenant_id` column and correctly scopes `GET`/`POST`, but `PATCH /sponsors/:id` and `DELETE /sponsors/:id` filter only by `id` — the same cross-tenant write gap.
- `card_themes` has a `tenant_id` column that is **never referenced by any route** — it behaves as a pure global list despite the column existing. This is the concrete counter-example proving "add the column" is necessary but not sufficient.
- Seven settings tables (`honour_display_settings`, `match_display_settings`, `records_display_settings`, `trading_card_settings`, `junior_match_display_settings`, `social_settings`, `milestone_board_settings`) are literal singletons — every route hard-codes `SETTINGS_ID = 1` (or equivalent) and reads/writes that one row regardless of which tenant is asking. `social_settings` is the sharpest example: its `clubHashtag`/`clubUrl` columns `NOT NULL DEFAULT` to `"#HHCC"` / `"hallsheadcricket.com.au"` — every tenant that hasn't explicitly overridden them shares Halls Head's own values (this is also why Phase 2 U3 had to patch around it at the render layer instead of fixing it at the source; this phase fixes the source).
- Eight more social/card-studio tables (`card_audio_tracks`, `card_templates`, `card_layouts`, `card_effect_presets`, `card_sets`, `caption_templates`, `milestone_events`, `social_drafts`, `tracked_links`) have no tenant dimension at all — every tenant shares one card-audio library, one caption-template set, one tracked-link slug namespace.

`lib/db/src/schema/_tenant.ts:17-55` already documents this as a self-aware staged rollout (the column-add pattern was applied to curated content in an earlier migration; settings singletons and captains were explicitly deferred "with rationale"). This phase closes that backlog.

### Key Decisions

- **Reuse `tenantIdColumn()` everywhere a straight column add applies.** `NOT NULL DEFAULT 1`, non-interactive `db push`, every existing row backfills to Halls Head (tenant #1) automatically — no manual migration step, no downtime. This covers the 8 content-library tables and `captains`.
- **Settings singletons get a schema rework, not just a column.** A fixed `id=1` PK can't hold one row per tenant. Each of the 7 settings tables adds `tenantId` (via `tenantIdColumn()`) plus a `unique` constraint on `tenantId`, and every route moves from `eq(table.id, SETTINGS_ID)` to a get-or-create-by-tenant pattern (mirrors `getTenantBrand`'s resolve-or-default shape): a tenant's first read/write creates its own row (seeded with the table's schema defaults — not copied from Halls Head's current row, so a new tenant never inherits Halls Head's saved choices); Halls Head's existing `id=1` row becomes `tenantId=1` via the same default-backfill and its behaviour is unchanged.
- **Captains mirror `admins` exactly.** `adminsTable` already has the target shape (`tenantId` + `unique(tenantId, username)`, `resolveAdmin` rejecting a session whose tenant doesn't match the request) — copy that pattern onto `captains`/`captain-auth`/`require-captain` rather than inventing a new one.
- **Fix known enforcement gaps as part of this phase, not deferred.** `sponsors` PATCH/DELETE and all of `card_themes`'s routes get tenant filters now — they're the direct evidence that "the column exists" isn't sufent, and leaving them unscoped while fixing everything else would be inconsistent.
- **No shared query-builder introduced.** Confirmed no middleware or Drizzle plugin auto-scopes queries platform-wide; enforcement stays the existing manual-`eq(table.tenantId, getTenantId(req))`-per-route convention. Introducing a new enforcement mechanism is a larger, separate refactor not undertaken here — this phase's job is closing the gap within the existing convention.

### Actors

- A1. Club admin — manages their own club's settings, captains, and card/social content; must never see or affect another club's.
- A2. Club captain — logs in with a per-club username/password; a session must only work for the club it was issued for.
- A3. Platform super-admin — unaffected; continues to operate cross-tenant via the separate `platform_admins` path.

### Requirements

- R9. Every settings/config table that was a single global row (`honour_display_settings`, `match_display_settings`, `records_display_settings`, `trading_card_settings`, `junior_match_display_settings`, `social_settings`, `milestone_board_settings`) is tenant-scoped: each tenant reads/writes its own row, seeded with schema defaults on first access, never another tenant's.
- R10. `captains` is tenant-scoped: `username` is unique per `(tenant_id, username)` not globally; captain login, session resolution, and every admin-facing captain-management route (`list/create/update/delete`, grade-permission edits) filter by the caller's tenant.
- R11. Isolation tests prove no cross-tenant read or write for every table touched by R9/R10, plus the two known pre-existing gaps (`sponsors` PATCH/DELETE, all `card_themes` routes) and the 8 content-library tables tenant-scoped alongside this work.

### Acceptance Examples

- AE1. Covers R9. Given tenant B has never touched its trading-card settings, when it requests `GET /trading-card-settings`, then it receives the schema defaults — never tenant A's saved values (even if tenant A saved something non-default first).
- AE2. Covers R9. Given tenant A updates its `social_settings` hashtag, when tenant B reads its own `social_settings`, then tenant B's hashtag is unchanged (defaults or its own prior save), never tenant A's.
- AE3. Covers R10. Given tenant A and tenant B each create a captain named "sarah", when both log in with their own club's URL/host, then each authenticates as their own club's "sarah" and each session is rejected if replayed against the other tenant's host.
- AE4. Covers R10/R11. Given an authenticated admin of tenant A, when they call `PATCH /captains/:id` or `DELETE /captains/:id` with a captain id belonging to tenant B, then the request is rejected (404/403), not applied.
- AE5. Covers R11 (regression). Given an authenticated admin of tenant A, when they call `PATCH /sponsors/:id` or any `card_themes` route with a resource id belonging to tenant B, then the request is rejected, not applied.

---

## Implementation Units

### U1. Captains tenant-scoping (the live vulnerability — highest priority)

- **Goal:** Close the cross-tenant read/write gap in captain accounts today.
- **Requirements:** R10
- **Dependencies:** none
- **Files:** `lib/db/src/schema/captains.ts` (add `tenantId: tenantIdColumn()`; change `unique().on(username)` to `unique().on(tenantId, username)`); `artifacts/api-server/src/lib/auth.ts` (`getCaptainByUsername`/`getCaptainById` take a tenant id, mirroring `getAdminByUsernameForTenant` vs. `getAdminById`); `artifacts/api-server/src/middlewares/require-captain.ts` (`resolveCaptain` rejects when `captain.tenantId !== getTenantId(req)`, mirroring `resolveAdmin`); `artifacts/api-server/src/routes/captain-auth.ts` (login resolves by `(tenantId, username)`); `artifacts/api-server/src/routes/captains.ts` (every route — list/create/update/delete/grade-permissions — filters/sets by `getTenantId(req)`).
- **Approach:** Copy the `admins` pattern column-for-column and check-for-check; this is a known-good shape already in the codebase, not a new design.
- **Patterns to follow:** `lib/db/src/schema/admins.ts:20-33` (schema); `artifacts/api-server/src/middlewares/require-admin.ts:20-26` (`resolveAdmin`); `artifacts/api-server/src/lib/auth.ts:112-126` (`getAdminByUsernameForTenant`).
- **Test scenarios:**
  - Covers AE3. Two tenants each create a captain with the same username; each logs in via their own tenant and gets their own captain.
  - Covers AE4. A session minted for tenant A's captain is rejected when replayed with `x-tenant-id` set to tenant B.
  - Covers AE4. Tenant A's admin cannot `GET`/`PATCH`/`DELETE` a captain id belonging to tenant B (404, not silently applied).
- **Verification:** `captains-isolation.test.ts` (new, mirrors `admins-isolation.test.ts`'s direct-middleware style plus the HTTP-level route checks); Halls Head's existing captains keep working unchanged (backfilled to `tenantId=1`).

### U2. Fix known enforcement gaps on already-tenant-scoped tables

- **Goal:** `sponsors` and `card_themes` are actually enforced on every route, not just some.
- **Requirements:** R11 (regression closure for a pre-existing gap)
- **Dependencies:** none
- **Files:** `artifacts/api-server/src/routes/social-cards.ts` (`PATCH /sponsors/:id`, `DELETE /sponsors/:id` add `eq(sponsorsTable.tenantId, getTenantId(req))` to the `WHERE`; every `card_themes` route — `ensureThemes`, `GET`, `POST`, `PATCH`, `DELETE` — add the same tenant filter/set that `sponsors`' `GET`/`POST` already have).
- **Approach:** Mechanical — add the missing `eq(table.tenantId, getTenantId(req))` predicate (or `tenantId: getTenantId(req)` on insert) to each identified call site; no schema change (`card_themes.tenant_id` already exists).
- **Patterns to follow:** `sponsors`' own correctly-scoped `GET`/`POST` in the same file, as the working reference right next to the gap.
- **Test scenarios:** Covers AE5. A PATCH/DELETE against another tenant's sponsor or theme id is rejected; a card-theme created by tenant A never appears in tenant B's `GET /card-themes`.
- **Verification:** New assertions in `tenant-isolation.test.ts` (extends the existing sponsors coverage to PATCH/DELETE) plus a new `card_themes` block.

### U3. Settings singletons → per-tenant rows

- **Goal:** The 7 `id=1`-pinned settings tables become per-tenant, each tenant getting its own row seeded with schema defaults.
- **Requirements:** R9
- **Dependencies:** none
- **Files:** `lib/db/src/schema/honour_display_settings.ts`, `match_display_settings.ts`, `records_display_settings.ts`, `trading_card_settings.ts`, `social_cards.ts` (`socialSettingsTable`, `milestoneBoardSettingsTable`), `lib/db/src/schema/juniors.ts` (`juniorMatchDisplaySettingsTable`) — each adds `tenantId: tenantIdColumn()` + `unique` on `tenantId`; the six route files that pin `*_SETTINGS_ID = 1` (`artifacts/api-server/src/routes/honour-display.ts`, `matches.ts`, `grades.ts`, `trading-card-settings.ts`, `social-cards.ts`, `milestones.ts`, `juniors.ts`) move to a shared `getOrCreateSettings(table, tenantId)` helper (new, small, in `artifacts/api-server/src/lib/`) instead of the hardcoded id.
- **Approach:** Write one small `getOrCreateSettings` helper used by all seven routes (select by `tenantId`; on miss, insert a default row for that tenant and return it) rather than seven bespoke implementations — this is the one deliberate small abstraction in this phase, justified because the same 3-line pattern would otherwise repeat 7 times with the classic risk of one copy drifting (exactly the `card_themes`-vs-`sponsors` gap this phase is fixing elsewhere).
- **Patterns to follow:** `getTenantBrand`'s resolve-with-fallback shape (`artifacts/api-server/src/lib/tenant-brand.ts`) for the "read own row, create default if absent" flow; `tenantIdColumn()`'s existing non-interactive-backfill contract for the schema side.
- **Test scenarios:**
  - Covers AE1. A brand-new tenant's first `GET` on any of the 7 settings endpoints returns schema defaults, not Halls Head's saved values.
  - Covers AE2. Tenant A's write to any settings table never appears when tenant B reads the same table.
  - Halls Head's existing settings (currently at `id=1`) are unchanged after migration (same values, now keyed by `tenantId=1`).
- **Verification:** `settings-isolation.test.ts` (new, one block per table, following `tenant-isolation.test.ts`'s multi-table style); manual check that Halls Head's live site (trading card settings, honour display, milestone board config) renders identically before/after.

### U4. Content-library tables tenant-scoped

- **Goal:** The 8 remaining global social/card-studio tables become per-tenant content libraries.
- **Requirements:** R9 (adjacent — same "curated content, no tenant dimension yet" class named in `_tenant.ts`'s STAGED list)
- **Dependencies:** none
- **Files:** `lib/db/src/schema/social_cards.ts` (`cardAudioTracksTable`, `cardTemplatesTable`, `cardLayoutsTable`, `cardEffectPresetsTable`, `cardSetsTable`, `captionTemplatesTable`, `milestoneEventsTable`, `socialDraftsTable`, `trackedLinksTable`) — each adds `tenantId: tenantIdColumn()`; `cardLayoutsTable`'s existing `uniqueIndex` on `cardKind` alone becomes `(tenantId, cardKind)`; `captionTemplatesTable`'s `unique(engine, platform)` becomes `(tenantId, engine, platform)`; `trackedLinksTable`'s `unique(slug)` becomes `(tenantId, slug)` (a tracked link's short slug can now repeat across tenants, not just within one). Every route in `artifacts/api-server/src/routes/social-cards.ts` and wherever `card-templates`/`card-layouts`/`tracked-links`/`caption-templates` are routed adds the tenant filter on read/write, following U2's pattern.
- **Approach:** Same mechanical column-add + route-filter pattern as U1/U2, batched since all 8 tables are shaped the same way (simple owned content, no cross-tenant sharing need).
- **Patterns to follow:** U2's sponsors fix, applied to 8 more tables.
- **Test scenarios:** One card audio track / template / layout / tracked link created by tenant A never appears in tenant B's list endpoints; a tracked-link slug can be reused across two tenants without a uniqueness conflict.
- **Verification:** Extends `tenant-isolation.test.ts` with one block per table (or a parameterized loop, since the shape repeats).

### U5. Isolation regression suite

- **Goal:** One place proving no cross-tenant leak across everything U1–U4 touched.
- **Requirements:** R11
- **Dependencies:** U1, U2, U3, U4
- **Files:** `artifacts/api-server/src/routes/captains-isolation.test.ts` (new), `artifacts/api-server/src/routes/settings-isolation.test.ts` (new), extensions to `artifacts/api-server/src/routes/tenant-isolation.test.ts` (sponsors PATCH/DELETE, card_themes, the 8 content-library tables).
- **Approach:** Follow the three established patterns exactly (`tenant-isolation.test.ts`'s seed-via-DB + dual-header-request + no-smuggling style; `admins-isolation.test.ts`'s direct-middleware-call style for the captain-session-rejection case).
- **Test scenarios:** All of AE1–AE5, plus the existing suite's "no smuggling" pattern (a request body trying to set `tenantId` to another tenant is ignored server-side) applied to every new writable table.
- **Verification:** Full suite green; a deliberately-reintroduced gap (e.g. removing a `WHERE` clause) fails the relevant test — spot-checked on one table before considering the suite trustworthy.

### U6. Docs + verification runbook

- **Goal:** `lib/db/src/schema/_tenant.ts`'s inventory comment reflects reality after this phase (nothing "STAGED" that's actually done); a short verification note for Ash.
- **Requirements:** supports R9–R11 (no new behaviour)
- **Dependencies:** U1–U5
- **Files:** `lib/db/src/schema/_tenant.ts` (move the now-applied tables from STAGED to APPLIED, update the STAGED list to just the per-club stats core); a short addition to `docs/PHASE1-VERIFICATION.md` or a new `docs/PHASE3-VERIFICATION.md` with the manual checks below.
- **Approach:** Documentation-only.
- **Verification:** n/a.

---

## Verification Contract

- Typecheck: `pnpm run typecheck`.
- After each schema change (U1, U3, U4): `pnpm --filter @workspace/db run push` (non-interactive, backfills existing rows to tenant 1 automatically per `tenantIdColumn()`'s contract).
- Tests: `pnpm --filter @workspace/api-server run test` (incl. all new/extended isolation suites).
- Manual: as tenant #1 (Halls Head) — captains list/login, sponsors, card themes, trading-card settings, honour-display settings, social-card hashtag/URL settings, milestone board config, tracked links all show/behave exactly as before. As a second tenant (or via `x-tenant-id` override) — none of the above ever shows Halls Head's data, and a fresh tenant's settings are schema defaults, not Halls Head's.

## Definition of Done

- Origin R9–R11 satisfied; Halls Head (tenant #1) is behaviourally unchanged across every table touched.
- No table with a `tenant_id` column has an unscoped read or write route (U2's sponsors/card_themes gaps closed; no new ones introduced in U3/U4).
- `captains` login and management are fully tenant-isolated; the pre-existing cross-tenant read/write on `/captains` is closed.
- Isolation regression suite (U5) covers every table this phase touches and passes.
- `_tenant.ts`'s inventory comment is accurate (U6).
- Full API test suite green; typecheck clean.

## Outstanding Questions

**Resolved by this plan, no open questions carried forward** — the origin plan's Phase 3 wording ("settings... are tenant-scoped", "captain logins are tenant-scoped") is fully covered by R9/R10 as scoped above. One judgment call made explicitly rather than left open: the 8 content-library tables (U4) are included even though the origin plan's R9 text most literally matches only the 7 `id=1` singletons (U3) — they're named in `_tenant.ts`'s own STAGED inventory as the same class of gap, and leaving them out while fixing everything else nearby would be an inconsistent stopping point. Flagging this inclusion for Ash's awareness rather than treating it as silently in-scope.

## Scope Boundaries

**Deferred to Follow-Up Work**

- The per-club STATS core (`players`, `matches`, etc.) staying single-tenant — explicitly out of scope per `_tenant.ts`'s own rationale (slated for replacement by central-DB reads, not a tenant_id add).
- A shared query-builder/middleware that auto-scopes every query — the enforcement convention stays manual-per-route, consistent with the rest of the codebase; introducing a new mechanism is a larger refactor not undertaken here.
- Phases 4–5 of the origin contract (social studio hardening, UI/design refresh).
