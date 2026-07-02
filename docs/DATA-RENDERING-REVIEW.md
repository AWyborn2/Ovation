# Multi-tenant data-rendering review — Halls Head vs Mandurah vs White Knights Baldivis

**Date:** 30 Jun 2026
**Scope:** Why central tenants (Mandurah #3, White Knights Baldivis #68) render
inconsistent / impossible stats compared to Halls Head (#1, native).
**Method:** Read-only. Live API probing on the Replit preview + code/schema review.
No code changed in this pass.

---

## ⚠️ Read this first: two baselines

The Replit preview is running the **pre-fix** API. PR #7 ("route 9 stats
endpoints to central per-club", merged to `main`, commit `11bdcf5`) is **not yet
deployed there**. So every finding below is tagged:

- **[FIXED-BY-#7]** — the merged fix already resolves this; it will disappear once
  Replit pulls `main` and restarts. Re-verify after the pull.
- **[STILL-BROKEN]** — PR #7 does **not** address this; it remains after the pull.
- **[VERIFY-AFTER-PULL]** — behaviour depends on post-fix code; can't be confirmed
  on the stale preview.

---

## Architecture recap (so the root causes make sense)

- **Tenancy:** each request resolves a `tenantId`. `tenants.reads_from_central`
  decides the data source. Halls Head (#1) reads its **native** tables
  (`players`, `player_grade_stats`, `matches`, …). Central tenants (Mandurah #3,
  WK #68) read the shared **central PCA database** (`central.*`), filtered by
  `tenants.central_club_id`.
- **Player identity differs by source:**
  - Native: `players.id` (integer), full given/surname, curated.
  - Central: PlayHQ `participant_id` (GUID) as the key; `display_name` stored as
    **"Initial Surname"** (e.g. "M Brown"), seniors-only, scorecard-era (2002/03+).
- **Crosswalk:** `player_id_map (tenant_id, participant_id GUID → player_id int)`
  is meant to bridge the two so central rows can carry a clickable int `playerId`.
- **Central read queries** live in `lib/db/src/central-queries.ts`. The grade
  leaderboard (`centralGradeLeaderboard`) groups central batting lines by
  `participant_id`, counts games as distinct match ids, and projects to the app's
  `PlayerGradeStat` shape with `playerId: 0` when the GUID isn't in the crosswalk.

---

## Findings (with live evidence)

### 1. Dashboard / top-card totals show Halls Head's numbers  **[FIXED-BY-#7]**

**Symptom (your screenshot):** WK senior page top cards read 979 players /
28,994 games / 329,347 runs / 18,429 wickets / 10 grades, and "Scott Buchholz"
as a top performer — all **Halls Head** figures, not WK's.

**Evidence:** `GET /api/dashboard` with `x-tenant-id: 68` returns
`totalGames: 28792, totalPlayers: 751, topRunScorer: "Scott Buchholz"` — Halls
Head's club totals, served to WK.

**Root cause:** the pre-fix `/dashboard` (and 8 other endpoints) had no
`shouldReadCentral` branch and read native tables for every tenant.

**Resolution:** **already fixed by PR #7** — `/dashboard` now derives totals from
central per club. Re-verify after the Replit pull. The "28,542 / 28,994" the user
saw on the records/board view is the same leak surfacing through the records page.

---

### 2. `player_id_map` is EMPTY for every central tenant  **[STILL-BROKEN]**

**Symptom:** every central leaderboard row has `playerId: 0`. No player on a
Mandurah or WK page is clickable; "view player" links are dead.

**Evidence:** WK A-Grade leaderboard — **193/193 rows have `playerId: 0`**.
Mandurah A-Grade — **all rows `playerId: 0`**. Halls Head A-Grade — rows carry
real ids (e.g. Chris Phelps `playerId: 1`).

**Root cause:** the GUID→int crosswalk (`player_id_map`) was only ever minted for
Halls Head. New central tenants are provisioned without building their crosswalk,
so `intByGuid.get(participantId)` always misses → `playerId: 0`.

**Resolution (proposed):** during tenant provisioning (and as a backfill for
existing central tenants), enumerate the club's central participants
(`centralClubParticipants(clubId)`) and insert a `player_id_map` row per GUID,
minting a tenant-local int id. Then every central read can resolve a real
`playerId`. This is the single highest-leverage fix — it unblocks player links
**and** is the foundation for de-duping identities (#3).

---

### 3. Identity collision: multiple real people merged into one player  **[STILL-BROKEN]**

**Symptom:** WK's A-Grade "M Brown" shows **300 games, 214 innings, high score
64**. 214 innings with a top score of only 64 is statistically impossible for one
individual — it is clearly several different "M. Brown" players merged.

**Evidence:** WK A-Grade top row: `M Brown — games 300, innings 214, HS 64,
playerId 0`. Summing M Brown's per-grade games gives ~346 (A 300, B 14, E 3, F 5)
— and the A-Grade 300 alone is already implausible. Halls Head's equivalent (Chris
Phelps 371g/315i/HS 131*) is a real, internally-consistent career.

**Root cause:** central `display_name` is just "Initial Surname". Over 24 seasons
a club has many people who share an initial+surname. Central *should* keep them
apart by `participant_id` (GUID), but the data exhibits merging — most likely
because (a) different real people were issued the **same** GUID in the source, or
(b) the same person has **multiple** GUIDs and a downstream step name-keys them,
or (c) a fallback in the aggregation collapses on name when the GUID is absent.
Needs a direct central-DB query to confirm which (see "Open questions").

**Resolution (proposed):** depends on the confirmed cause:
- If one GUID covers many people → a data-quality issue in the central dataset;
  needs a curation/splitting pass (and is partly unavoidable until the source is
  cleaned).
- If many GUIDs for one person → de-dupe in `player_id_map` (map several GUIDs to
  one int id) so the app presents them as one.
- Either way, **building `player_id_map` (#2) is the prerequisite** for any
  curation, because it gives a stable per-tenant id to attach corrections to.

---

### 4. Milestones board shows Halls Head players  **[FIXED-BY-#7, with a caveat]**

**Symptom (your screenshot, WK page):** "Recent Milestones" lists Timothy Miles,
Alec Smith, Jarod Little, Jason Young, Matthew Guyton — Halls Head players — plus
career-crossing cards ("200 career games", "150 career wickets", "350 career
games").

**Root cause:** pre-fix `/milestones` read native tables for all tenants.

**Resolution / caveat:** PR #7 routes `/milestones` to central for central
tenants — BUT it deliberately derives **only centuries and five-wicket-hauls**
(the two per-innings achievements with a clean central source). It **omits**
career crossings, debuts, and hat-tricks for central tenants (no reliable central
source — career crossings need running totals over time; debuts need a cap
register; hat-tricks aren't in central). So after the pull, WK's milestones will
show its own centuries/5-fers and the career/debut/hat-trick cards will
**disappear**. **Confirm this is the behaviour you want** (see Open questions).

---

### 5. The five other leaking endpoints  **[FIXED-BY-#7]**

`/grades`, `/records-leaderboards`, `/partnerships`, `/centuries`,
`/five-wicket-hauls`, `/juniors/overview`, `/juniors/premierships` all leaked
Halls Head data pre-fix. PR #7 handles all of them (derive-from-central where
possible; empty-for-tenant where there's no central source). Re-verify after the
pull. Note: with `player_id_map` empty (#2), the derived centuries/5-fers will
render with `playerId: 0` (names show, links dead) until the crosswalk is built.

---

### 6. Logo falls back to Halls Head  **[STILL-BROKEN — separate from the data fix]**

**Symptom:** the WK page header shows the **Halls Head** logo even though
`/tenant-brand` reports a `logoUrl` is "set" for WK.

**Likely cause:** either WK's `tenants.logo_url` points at a Halls-Head asset, or
the brand resolver falls back to the Halls Head logo when the tenant's own asset
is missing/unreachable. Needs a look at the WK tenant row + the brand resolver's
fallback. Not touched by PR #7.

---

### 7. `/players` directory is capped at 20 rows  **[VERIFY — likely by design]**

`GET /api/players` returns 20 players for WK. This is probably pagination, not a
bug — but worth confirming the directory page paginates correctly for central
tenants (and that the count/search works against central data).

---

## Severity & sequencing (proposed)

| # | Issue | Severity | Status | Depends on |
|---|---|---|---|---|
| 1 | Dashboard/totals leak | High | FIXED-BY-#7 | pull main |
| 5 | Other endpoint leaks | High | FIXED-BY-#7 | pull main |
| 2 | `player_id_map` empty | **High** | STILL-BROKEN | — (do first) |
| 3 | Identity collision (M Brown) | **High** | STILL-BROKEN | #2 + central-DB diagnosis |
| 4 | Milestones content (career cards) | Medium | design decision | confirm intent |
| 6 | Logo fallback | Medium | STILL-BROKEN | brand resolver review |
| 7 | Players pagination | Low | verify | — |

**Recommended order tomorrow:**
1. Pull `main` in Replit + restart → clears findings 1, 4, 5 (the leaks). Re-probe
   to confirm.
2. Build `player_id_map` for central tenants (#2) — provisioning step + backfill.
3. Diagnose the identity collision against the central DB (#3) — one query to see
   whether "M Brown" is one GUID covering many, or many GUIDs.
4. Decide milestones scope (#4) and logo fallback (#6).

---

## Open questions for you

1. **Milestones scope (#4):** OK that central tenants show only centuries +
   5-fers (no career-crossing / debut / hat-trick cards), or do you want those
   derived from central too (more work, some not cleanly possible)?
2. **Identity (#3):** is the single-initial display name ("M Brown") something we
   accept and de-dupe via the crosswalk, or do you want full names pulled from the
   central player register where available?
3. **Crosswalk scope (#2):** build `player_id_map` for all central tenants now, or
   only for pilot clubs you're actively demoing?
4. **Logo (#6):** should I check WK's tenant row + brand fallback now, or is that a
   separate branding task?

## Diagnostics still to run (need direct central-DB access)

- Confirm root cause of #3: query `central.match_batting` for WK's club id,
  group by `participant_id`, and check whether "M Brown" is one GUID with 214
  innings (→ source data merges people) or whether multiple GUIDs share that
  display name (→ crosswalk/UI can de-dupe).
- Verify the exact source of the "28,542" figure post-fix (it disappears if it was
  the dashboard leak; reappears differently if there's a real aggregation bug).
