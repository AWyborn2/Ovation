# architect — Index

Cross-cutting notes for this role. Entries tagged [CONFIRMED 2026-10-07] were discovered in the codebase and confirmed by the user.

## Active features

- [email-distribution-lists](email-distribution-lists.md) — Postgres outbox (`email_sends`) + lists/members/teams; reuses server team-sheet PDF + card-render harness PNG; drained after commit and by hourly sweep (proposed 20 Oct 2026)
- [social-auto-queue-criteria](social-auto-queue-criteria.md)
- [card-kind-templates](card-kind-templates.md)
- [selection-hub-decoupling](selection-hub-decoupling.md) — on-demand rounds/drafts, carry-over, admin status, participant crosswalk, public-name flag (design proposed 19 Oct 2026; ADR-008)
- [player-sponsors](player-sponsors.md) — `sponsor_players` join table (name snapshot), `social_drafts.subject_player_id`; one `cardSponsors` rule in `@workspace/scorecard` for preview and post; sponsors resolved at draw time (proposed 27 Oct 2026)
- [studio-create-consolidation](studio-create-consolidation.md) — `tenants.new_studio_enabled` (0076) read via `TenantPlan.newStudio`; `previewTabs` + hidden tabs in admin-nav; Create wizard ends in `createSocialDraft` and the existing editors; junior prefill `GET /juniors/fixtures/{id}/social-prefill`; editor panels mounted around, not in, the editors (design complete 29 Oct 2026)

## Feature ADRs

- card-kind-templates: ADR-001, ADR-002, ADR-003 (ADR-003's switch and lazy starter creation superseded by ADR-011)
- social-template-library: ADR-011

- [team-of-the-week-engines](team-of-the-week-engines.md) — discovery only, next spec
- [admin-menu-consolidation](admin-menu-consolidation.md) — category column on shirt_numbers, juniors overlap endpoint, Imports hub, Stats & Data group. Design complete 2026-10-19
- [selection-side-size](selection-side-size.md) — per-grade side_sizes/overseas_caps maps on availability_settings, per-draft side_size, shared sideShape helper, squad_member_seasons, finalise snapshot; ADR-009 accepted 2026-10-20. Design complete
- [match-day-carousel-content](match-day-carousel-content.md) — one server content builder + shared field/visibility contract for all social cards (auto, Create a Card, carousel sets); name overrides + crests; junior same-day consolidation; packs cut to 3. ADR-010 proposed 2026-10-20
- [selection-hub-redesign](selection-hub-redesign.md) — client-only; AdminLayout sidebar slot + portal for the pool, Focus/Board view hook, Radix fill/place popovers over existing applyMove; 2 PRs (Design complete 21 Oct 2026)
- [social-template-library](social-template-library.md) — one format v2 (pages, stack groups, conditions, richer style, vector, motion presets); library tables (looks, templates, immutable versions) plus club copies in `card_templates` (one default per kind); repo bundles for Ovation looks, database for everything later; one harness fit check (CI, list, save); converter from rendered DOM; everyone moves at once and `KIND_TEMPLATES` goes; Claude Opus 5.5 designer tool; Figma import. ADR-011, migration 0057. Design complete 21 Oct 2026
- [honours-kiosk-redesign](honours-kiosk-redesign.md) — kiosk settings UX + TV look redesign: per-board display schema, header/scroll layout fix, live preview, drag rotation builder (raised 22 Oct 2026, precedes slideshow UI)
- [kiosk-photo-rotation](kiosk-photo-rotation.md) — junior photo library (senior parity, multi-child tags, fail-closed consent) + kiosk photo slideshows resolved server-side (design proposed 22 Oct 2026)

## Cross-cutting principles

- Shared (cross-tenant) data and tenant-private data live in different tables, so tenant isolation is a table boundary, not a filter (ADR-011).
- Templates, drafts and carousels copy their design; nothing renders a live reference to another tenant's or the library's current version (ADR-002, ADR-011).
- Sessions never need production access: anything Ovation ships either goes through the repo and a republish, or is made in the running app (ADR-011).
- Club data reaches the shared library only through the server's `publishableDocument`, the asset policy and the author's rights confirmation; a flag blocks publishing (ADR-012).
- Per-club third-party tokens (Figma) are sealed with `secret-box` like the Meta tokens and never returned or logged (ADR-012).
