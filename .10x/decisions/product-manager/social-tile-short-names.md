# Social tiles: logos, short names, square layouts, preview fix

Status: RECOMMENDED 2026-10-19 (awaiting architect plan)

## Problem
Followers see truncated PlayHQ team/competition names on square (1080x1080) feed cards
(e.g. "SJ Blues Senior A Wo", "White Knights Baldivi"), plus the headline wraps to 3 lines
and squeezes the table. It looks unprofessional on the club's feed. Separately, the
Share to Socials modal's preview tiles render blank (`useCardPreview`), so admins can't
see what they will download.

## Target user
Primary: club followers on Instagram/Facebook (readability). Secondary: club admins
(set names once, never fix per card).

## Decision (Ash, 2026-10-19)
Each team row = club crest + club-set short name. When no short name is set, an
automatic short name is used (strip grade/gender/"Cricket Club" suffixes etc.).
Competition names get club-set short labels too (e.g. "Female A Grade" -> "Women's A").

## Scope / priority
- P0 Preview fix: Share to Socials preview tiles render the card (bug, ship first, own PR).
- P0 Tenant-scoped name overrides: per-tenant short name per opposing club/team and per
  competition/grade. Curated tenant content (`tenant_id`), never written to `central`.
- P0 Auto short-name fallback, deterministic, unit-tested on real PCA/WA names.
- P0 Crest per team on ladder/result/fixture rows, from `central.clubs` logo; monogram
  fallback when no logo.
- P1 Square-feed layout review: headline max 2 lines with auto-fit, table rows never
  truncate mid-word (ellipsis only as last resort), all Pack layouts checked at 1080x1080.
- P1 Admin UI: "Team & competition names" in Social Studio settings, prefilled with
  auto names, inline-editable; editor's Content panel shows the resolved name.
- P2 Per-card override in the editor (already partly possible via text fields).

## User stories
- As a follower, I can read every team on a square ladder card without cut-off names.
- As an admin, I set "SJ Blues" once and every future card uses it.
- As an admin, the preview in Share to Socials shows the exact card I will download.

## Success criteria
- 0 truncated team names on square ladder/result cards for Halls Head's current season.
- Preview renders for every card kind/size in the modal (tested).
- Admins edit cards less: fewer text-field edits per card before posting (track via
  existing draft edit history if available).

## Not building
- Association-wide/shared name registry (tenant-only for now).
- Logo upload for opposing clubs (use central logos; monogram fallback).
- Changing PlayHQ/central data.

## Risks
- Missing/low-res logos in `central.clubs` -> monogram fallback; audit coverage first.
- Name overrides keyed on unstable ids (team names change per season) -> key on
  central club id + grade, not display text.
- Pack designs (B–E) may need renderer work for a crest slot (see memory on pack renderer).
