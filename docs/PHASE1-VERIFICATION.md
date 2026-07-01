# Phase 1 Verification Runbook — hand this to your Replit/cowork Claude

**For the person running this:** you can paste this whole file to Claude in your
Replit (or cowork) environment and say "work through this and report back." It
verifies Phase 1 of the central stats-correctness work that was built but not yet
run. You don't need to understand the commands — the agent does the work and
tells you the results.

---

## Context for the verifying agent

You are verifying **Phase 1 — central stats correctness**, implemented on branch
`claude/adoring-archimedes-hcqjtg`. The plan is
`docs/plans/2026-07-01-002-fix-central-stats-correctness-plan.md`. The code was
written in an environment with **no `pnpm`, no database, and no code-generation**,
so nothing was typechecked, tested, or run — that is your job here.

**Hard guardrails:**
- The central PCA database is **READ-ONLY**. Never write to it. (`CENTRAL_DATABASE_URL`)
- Do **not** make large refactors. If typecheck or tests fail, fix only obvious,
  local errors in the files changed this phase; otherwise report the errors
  verbatim and stop.
- Requires `DATABASE_URL` (tenant app DB) and `CENTRAL_DATABASE_URL` (central).

**Files changed this phase (where any type errors will be):**
`lib/db/src/provision.ts`, `lib/db/src/central-queries.ts`,
`lib/db/src/schema/player_curation.ts`, `lib/db/src/schema/index.ts`,
`artifacts/api-server/src/lib/central-curation.ts`,
`artifacts/api-server/src/routes/{player-curation,grades,milestones,index}.ts`,
`artifacts/api-server/src/routes/player-curation-isolation.test.ts`,
`scripts/src/{backfill-player-id-map,diagnose-central-identity}.ts`.

---

## Steps (run in order; report the result of each)

### Step 1 — Get on the branch and install
```bash
git checkout claude/adoring-archimedes-hcqjtg
git pull
pnpm install
```
**Expect:** checkout succeeds; recent commits include "test(central): tenant-scoped
admin-only player curation (U6)" and below it U5, U4, U2, and the crosswalk/diagnostic
commit. `pnpm install` finishes without errors.

### Step 2 — Typecheck (the most important gate)
```bash
pnpm run typecheck
```
**Expect:** no type errors. **If it fails:** capture every error, fix only the
obvious local ones in the files listed above, re-run until clean, and report what
you changed. If an error implies a real logic problem (not a quick fix), stop and
report it.

### Step 3 — Create the new curation table
```bash
pnpm --filter @workspace/db run push
```
**Expect:** drizzle applies a new `player_curation` table (additive, safe). Report
what it created.

### Step 4 — Backfill the player crosswalk (this fixes the dead links)
```bash
pnpm --filter @workspace/scripts run backfill-player-id-map -- --dry-run
pnpm --filter @workspace/scripts run backfill-player-id-map
```
**Expect:** the dry run lists, per central tenant, how many mappings it *would*
mint; the real run mints them and prints counts. **Run it a second time** — it
should mint **0** (idempotent). Report the per-tenant counts.

### Step 5 — Run the identity diagnostic (share this output back)
```bash
pnpm --filter @workspace/scripts run diagnose-central-identity -- --club-id=68
pnpm --filter @workspace/scripts run diagnose-central-identity -- --club-id=3
```
(68 = White Knights Baldivis, 3 = Mandurah.) **Expect:** a report ending in a
"Sizing summary" with three counts: split candidates (cause A), merge/rename
candidates (cause B), and name-only lines (cause C). **Copy the full Sizing
summary for both clubs back to the human** — it decides how much split-curation
work Phase 1 still needs.

### Step 6 — Run the API tests
```bash
pnpm --filter @workspace/api-server run test
```
**Expect:** all pass, including `player-curation-isolation.test.ts`. **If any
fail:** report which tests and the error messages verbatim.

### Step 7 — Eyeball a central club (manual checks)
Start the app, then view a central tenant (White Knights or Mandurah — by
subdomain, or with header `x-tenant-id: 68` on the API). Check:
1. **Leaderboard links work** — clicking a player opens their profile (no dead
   links / no "player 0").
2. **No impossible merged careers** — you should NOT see a single player with,
   say, 200+ innings and a low top score. Two people who share a name (e.g. two
   "M Brown") should appear as two separate rows.
3. **Milestones show career crossings** — the milestone board includes things
   like "200 career games" or "1000 career runs", not just centuries/five-fors.
4. **Rename works** — as a logged-in club admin, `PUT /api/player-curation/<a GUID>`
   with body `{"overrideDisplayName":"Test Name"}` → that name then shows on that
   club's leaderboard, and only that club's.
5. **Halls Head unchanged** — tenant 1 (Halls Head) looks exactly as before.

---

## What to report back to the human

A short summary they can paste back:
1. Typecheck: clean, or the errors (and anything you fixed).
2. Tests: all pass, or which failed + messages.
3. Backfill: per-tenant mint counts; did a second run mint 0?
4. **Diagnostic Sizing summaries for club 68 and club 3** (full text).
5. Manual checks 1–5: what you observed (links work? merges gone? milestones
   showing? rename worked? Halls Head unchanged?).
6. Anything that errored, verbatim.
