# Draft GitHub issues — central-tenant data rendering

Drafted from `DATA-RENDERING-REVIEW.md`. Review, then create on GitHub
(AWyborn2/Ovation). Each is self-contained. Labels are suggestions.

---

## Issue 1 — Build `player_id_map` for central tenants (all rows render `playerId: 0`)

**Labels:** bug, central-read, high-priority

**Problem**
Every central-tenant leaderboard/stat row returns `playerId: 0`. Player links are
dead on Mandurah (#3) and White Knights Baldivis (#68). Evidence: WK A-Grade
leaderboard = 193/193 rows `playerId: 0`; Halls Head rows carry real ids.

**Root cause**
The GUID→int crosswalk `player_id_map (tenant_id, participant_id, player_id)` was
only ever minted for Halls Head. Central tenants are provisioned without it, so
`intByGuid.get(participantId)` always misses.

**Proposed fix**
- On tenant provisioning, enumerate the club's central participants
  (`centralClubParticipants(clubId)` already exists in `central-queries.ts`) and
  insert one `player_id_map` row per GUID with a freshly minted tenant-local int.
- Add a backfill script/route to do the same for existing central tenants.
- Re-verify: central leaderboard rows now carry non-zero `playerId`.

**Acceptance**
- WK + Mandurah leaderboard rows have real `playerId`s; player pages load.

---

## Issue 2 — Identity collision: multiple real people merged under one central player

**Labels:** bug, data-quality, central-read, high-priority

**Problem**
WK A-Grade "M Brown" shows 300 games, **214 innings, high score 64** — impossible
for one person; clearly several "M. Brown" players merged. Central `display_name`
is only "Initial Surname".

**Investigation needed (before fixing)**
Query the central DB for WK's club id:
```sql
-- one row per participant for this club, with innings + best score
select participant_id, display_name, count(*) innings, max(runs) hs
from central.match_batting
where club_id = <wk_central_club_id>
group by participant_id, display_name
order by innings desc;
```
Determine which case applies:
- (a) one `participant_id` has 214 innings → **source data merges people** (data
  quality; needs curation/splitting, partly upstream).
- (b) several `participant_id`s share "M Brown" → app can keep them separate
  (correct) OR is collapsing them somewhere (find + fix the name-keying).

**Proposed fix** (depends on outcome)
- If many GUIDs → one person: de-dupe via `player_id_map` (several GUIDs → one int).
- If one GUID → many people: flag as upstream data issue; consider a curation
  table keyed on the (now-built) `player_id_map` id.

**Depends on:** Issue 1 (crosswalk).

---

## Issue 3 — Tenant logo falls back to Halls Head on central tenants

**Labels:** bug, branding

**Problem**
WK page header shows the Halls Head logo, although `/tenant-brand` reports WK has
a `logoUrl` set.

**Investigation**
- Check WK's `tenants.logo_url` value (does it point at a HH asset?).
- Check the brand resolver's fallback path (`tenant-brand.ts` / `halls-head-brand`
  lineage) — does it substitute the HH logo when the tenant asset is
  missing/unreachable?

**Proposed fix**
Make the logo fall back to a neutral placeholder (or the club's initials chip),
never another tenant's logo. Ensure each pilot tenant has a correct `logo_url`.

---

## Issue 4 — Decide & document central-tenant milestones scope

**Labels:** discussion, product, central-read

**Context**
PR #7 routes `/milestones` to central for central tenants but derives only
**centuries + five-wicket-hauls**. Career crossings, debuts, and hat-tricks are
omitted (no clean central source). After deploying PR #7, those cards disappear
for central tenants.

**Decision needed**
- Accept centuries + 5-fers only? (simplest, all real data) — or
- Invest in deriving career crossings from central running totals (possible but
  heavier; debuts need a cap concept central lacks; hat-tricks aren't in central).

**Action**
Confirm intended scope, then document it (CLAUDE.md / AGENTS.md) so it's not
mistaken for a regression.

---

## Issue 5 — Verify all 9 leak-fixed endpoints after deploying PR #7

**Labels:** verification, central-read

**Context**
PR #7 (commit `11bdcf5`) fixes the Halls-Head data leak on dashboard, grades,
records-leaderboards, milestones, partnerships, centuries, five-wicket-hauls, and
the two juniors endpoints. The Replit preview hasn't deployed it yet.

**Action**
After Replit pulls `main` + restarts, re-probe each endpoint for tenants 3 and 68
and confirm: own-club data (not Halls Head), and curated/junior endpoints return
empty rather than HH content. Add a short note to the consistency test suite if a
gap is found.

**Note:** until Issue 1 (crosswalk) is done, the derived centuries/5-fers will show
`playerId: 0` (names render, links dead).
