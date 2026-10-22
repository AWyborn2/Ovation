# architect — Index

Cross-cutting notes for this role. Entries tagged [CONFIRMED 2026-10-07] were discovered in the codebase and confirmed by the user.

## Active features

- [email-distribution-lists](email-distribution-lists.md) — Postgres outbox (`email_sends`) + lists/members/teams; reuses server team-sheet PDF + card-render harness PNG; drained after commit and by hourly sweep (proposed 20 Oct 2026)
- [social-auto-queue-criteria](social-auto-queue-criteria.md)
- [card-kind-templates](card-kind-templates.md)
- [selection-hub-decoupling](selection-hub-decoupling.md) — on-demand rounds/drafts, carry-over, admin status, participant crosswalk, public-name flag (design proposed 19 Oct 2026; ADR-008)

## Feature ADRs

- card-kind-templates: ADR-001, ADR-002, ADR-003

- [team-of-the-week-engines](team-of-the-week-engines.md) — discovery only, next spec
- [admin-menu-consolidation](admin-menu-consolidation.md) — category column on shirt_numbers, juniors overlap endpoint, Imports hub, Stats & Data group. Design complete 2026-10-19
- [selection-side-size](selection-side-size.md) — per-grade side_sizes/overseas_caps maps on availability_settings, per-draft side_size, shared sideShape helper, squad_member_seasons, finalise snapshot; ADR-009 accepted 2026-10-20. Design complete
- [match-day-carousel-content](match-day-carousel-content.md) — one server content builder + shared field/visibility contract for all social cards (auto, Create a Card, carousel sets); name overrides + crests; junior same-day consolidation; packs cut to 3. ADR-010 proposed 2026-10-20
- [selection-hub-redesign](selection-hub-redesign.md) — client-only; AdminLayout sidebar slot + portal for the pool, Focus/Board view hook, Radix fill/place popovers over existing applyMove; 2 PRs (Design complete 21 Oct 2026)
- [honours-kiosk-redesign](honours-kiosk-redesign.md) — kiosk settings UX + TV look redesign: per-board display schema, header/scroll layout fix, live preview, drag rotation builder (raised 22 Oct 2026, precedes slideshow UI)
- [kiosk-photo-rotation](kiosk-photo-rotation.md) — junior photo library (senior parity, multi-child tags, fail-closed consent) + kiosk photo slideshows resolved server-side (design proposed 22 Oct 2026)
