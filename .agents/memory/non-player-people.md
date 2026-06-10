---
name: Non-player people profiles
description: How club officials who never played get linkable lightweight profiles.
---

Some committee/captain role-holders never played, so they have no `players` row and used to be dead plain text on the committee board.

- `non_player_people` table (id, name, bio nullable). `club_roles.nonPlayerId` is a nullable FK (onDelete set null).
- A role row links to EITHER a player (`playerId`) OR a non-player (`nonPlayerId`).
  **Mutual exclusivity is enforced at the UI level only** (admin-committee RoleForm disables the non-player select when a player is chosen, and vice versa) — there is NO DB constraint. Any new write path must respect this itself.
- API: `routes/people.ts` — public GET list/get, admin POST/PATCH/DELETE. Generated zod body schemas are operationId-named (`CreatePersonBody`/`UpdatePersonBody`), NOT the component names.
- Public render: committee-tab + grade-leaderboard render linked names as links for BOTH link types. `/people/:id` bio page shows name, bio, and service history = published club-roles filtered by `nonPlayerId`.
- Admin tile lives in `seed-nav-items.ts` ADMIN_TILES (nav is admin-configurable; fallback in admin.tsx covers DBs seeded before this).
- Non-players are NOT auto-created by `seed-committee.ts` — admins create them by hand.
