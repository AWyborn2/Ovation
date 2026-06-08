---
name: Junior office bearers
description: Manually-managed junior committee feature, kept fully separate from senior club_roles.
---

# Junior office bearers

A standalone CRUD feature mirroring the senior "Committee & Captains" but COMPLETELY
SEPARATE from senior `club_roles` and senior records.

**Why separate:** juniors data must never blend with senior records (same rule as all
`junior_*` tables). Office bearers are admin-typed per season, NOT imported.

**How it works:**
- Table `junior_office_bearers` (in `lib/db/src/schema/juniors.ts`): season int (start
  year), role/name text, `participantId` TEXT nullable with **NO FK** (cross-ref link to a
  junior participant for profile linking only, never merges stats), displayOrder, published.
  No composite unique (deliberate — avoids drizzle-kit push TTY hang).
- Routes in `artifacts/api-server/src/routes/juniors.ts` mirror club-roles: public GET
  `/juniors/office-bearers` (published only), admin GET `/all`, POST, PATCH/:id, DELETE/:id
  (all `requireAdmin`). Served under `/api/juniors/*`.
- Admin page `/admin/junior-committee`; public page `/juniors/office-bearers` (junior brown
  accent `#bc8c6b` icons/links + `#42342b` season header bars). Linked names →
  `/juniors/players/:participantId`, else plain text.
- Junior player link uses `JuniorPlayerTypeahead` (string participantId + displayName), NOT
  the senior numeric PlayerTypeahead.
