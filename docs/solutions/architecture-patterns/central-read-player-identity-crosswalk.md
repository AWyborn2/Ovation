---
title: Central-read stats — resolve identity via the crosswalk in the route, group by GUID
date: 2026-07-01
category: architecture-patterns
module: central-read stats
problem_type: architecture_pattern
component: database
severity: high
applies_when:
  - Writing or reviewing a central-read stats query or its route
  - Adding a per-club stat surface (leaderboard, records, milestones, dashboard, profile)
  - Debugging wrong, missing, or merged player identity on a central-data tenant
tags: [central-database, player-identity, crosswalk, multi-tenant, leaderboard, playhq]
---

# Central-read stats — resolve identity via the crosswalk in the route, group by GUID

> Status: the mechanism below is verified by code trace; the Phase 1 fix that
> applies it (`docs/plans/2026-07-01-002-fix-central-stats-correctness-plan.md`)
> was implemented but not yet runtime-verified when this was written.

## Context

Ovation reads player stats from two databases: each tenant's own app DB (curated
content + the `player_id_map` crosswalk) and a shared, **read-only** central PCA
database. The two identify players differently:

- App/native (Halls Head): integer `players.id`, full names, curated.
- Central: PlayHQ **participant GUID** as the key; `display_name` stored as
  "Initial Surname" (e.g. "M Brown"), seniors-only, scorecard-era.

The crosswalk table `player_id_map (tenant_id, participant_id GUID -> player_id int)`
bridges them so a central row can carry a clickable app `playerId`. Central-data
tenants rendered wrong stats — dead player links and impossible merged careers
(one "M Brown" showing 214 innings) — and a code trace pinned down why. The rules
below are the durable pattern; get them wrong and any new central-read surface
reproduces the same class of bug.

## Guidance

**1. Fill `playerId` in the route, not the central query.** A central query runs
on the central pool and cannot reach the tenant DB where the crosswalk lives, so
it cannot resolve a tenant-local `playerId`. Do **not** ship a central projection
that hard-codes `playerId: 0`. The route builds the GUID→int map from
`player_id_map` for the request's tenant and either maps the rows post-query or
passes the map into the query. Every central-read handler already follows this
(`intByGuid`); a new one must too.

**2. Aggregate by participant GUID, never by display name.** Because the central
display name is only "Initial Surname", grouping or de-duping by name silently
merges different people who share an initial+surname — this is the "214 innings"
bug. Key every aggregation on `participant_id`.

**3. Exclude NULL-participant lines from careers.** A scorecard line with no
participant GUID cannot be attributed to a person. Show it by name in the match
scorecard, but never roll it into a career total or make it clickable.

**4. Keep the crosswalk complete.** `player_id_map` is minted at provisioning;
existing tenants and participants added after provisioning can be missing rows,
and a missing row is exactly what produces `playerId: 0` → a dead link. Backfill
idempotently through the shared minting helper.

**5. Curate app-side; never write central.** Per-club identity corrections
(rename, merge) live in an app-side overlay applied on read. The central DB is
read-only from the app — no exceptions.

## Why This Matters

A club site that shows the wrong numbers, dead links, or a rival's merged career
is unusable regardless of how many features sit behind it — and central-read is
the platform's top *silent* correctness risk, because a leak or mis-key returns
plausible-looking data with no error. The route-owns-identity rule is not
stylistic: it is forced by the tenant/central DB separation, and skipping it is
what left `playerId: 0` on the leaderboard while every other handler resolved it.

## When to Apply

- Any new or changed central-read query or its route handler.
- Any per-club stat surface: leaderboard, records, milestones, dashboard, player
  profile, centuries/five-fors.
- Diagnosing central-tenant stats that look wrong, merged, or unlinked.

## Examples

Before — the grade leaderboard projected app rows but hard-coded the id, so every
central row was unclickable and look-alikes could re-merge downstream:

```ts
// central query projection
return { id: 0, playerId: 0, surname, givenName, /* ... */ };
```

After — the query accepts the tenant crosswalk and fills the id; the route builds
the map (identical to the dashboard/records handlers) and passes it:

```ts
// central query
const resolvedPlayerId = opts.intByGuid?.get(participantId) ?? 0;
return { id: resolvedPlayerId, playerId: resolvedPlayerId, /* ... */ };

// route
const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
res.json(await centralGradeLeaderboard(grade, { clubId, intByGuid }));
```

Two distinct "M Brown" GUIDs now render as two rows with distinct player ids —
never one merged career. A single GUID that genuinely covers several real people
(a source-data problem) is left for the curation split tool, not papered over by
name-grouping.

## Related

- Plan: `docs/plans/2026-07-01-002-fix-central-stats-correctness-plan.md`
- Contract: `docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md`
- Review: `docs/DATA-RENDERING-REVIEW.md`
- Orientation: `AGENTS.md` ("dual-read boundary"), `CLAUDE.md` ("central PCA database")
