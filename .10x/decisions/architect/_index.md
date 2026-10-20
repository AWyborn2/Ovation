# architect — Index

Cross-cutting notes for this role. Entries tagged [CONFIRMED 2026-10-07] were discovered in the codebase and confirmed by the user.

## Active features

- [social-auto-queue-criteria](social-auto-queue-criteria.md)
- [card-kind-templates](card-kind-templates.md)
- [selection-hub-decoupling](selection-hub-decoupling.md) — on-demand rounds/drafts, carry-over, admin status, participant crosswalk, public-name flag (design proposed 19 Oct 2026; ADR-008)

## Feature ADRs

- card-kind-templates: ADR-001, ADR-002, ADR-003

- [team-of-the-week-engines](team-of-the-week-engines.md) — discovery only, next spec
- [admin-menu-consolidation](admin-menu-consolidation.md) — category column on shirt_numbers, juniors overlap endpoint, Imports hub, Stats & Data group. Design complete 2026-10-19
- [social-photo-tag-selection](social-photo-tag-selection.md) — kind photo policy in pickDraftPhoto (side/game/gradeTeam), retire random/player rules for those kinds (retire-rules migration, next free number), filtered library picker. Design complete 2026-10-20
- [selection-side-size](selection-side-size.md) — per-grade side_sizes/overseas_caps maps on availability_settings, per-draft side_size, shared sideShape helper, squad_member_seasons, finalise snapshot; ADR-009 accepted 2026-10-20. Design complete
- [match-day-carousel-content](match-day-carousel-content.md) — one server content builder + shared field/visibility contract for all social cards (auto, Create a Card, carousel sets); name overrides + crests; junior same-day consolidation; packs cut to 3. ADR-010 proposed 2026-10-20
