import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  playhqSyncIncidentsTable,
  tenantsTable,
  UNCLASSIFIED_GRADES_INCIDENT_KIND,
} from "@workspace/db";
import {
  PROJECTABLE_STATUSES,
  assertIngestScope,
  assertProjectorScope,
  centralProjectorConfigured,
  getCentralProjectorPool,
  projectToCentral,
  upgradeNamesFromPlayhq,
  normaliseCentralNames,
  duePlans,
  loadCadenceInputs,
  type DuePlan,
  dropJuniorGrades,
  getPlayhqIngestPool,
  loadRows,
  mergeUnclassifiedGrades,
  unclassifiedGradesByOrg,
  type KnownJuniorGrade,
  type UnclassifiedGrade,
  projectFixtures,
  projectJuniors,
  juniorProjectionErrorText,
  projectTeamLists,
  linkHeldShirtNumbers,
  rowsFromDump,
  syncLineupShirtNumbers,
  type Dump,
  type LoadRows,
  type Queryable,
  type RunMeta,
  type TeamListUpdate,
  type JuniorProjectionSummary,
  type JuniorSyncTenantRef,
} from "@workspace/db/playhq-ingest";
import type { z } from "zod";
import type { IngestPlayhqDumpResponse } from "@workspace/api-zod";
import { runDraftSweep } from "./draft-sweep";
import { loadJuniorSyncTenants } from "./junior-sync";
import { recomputeParticipantMetadata } from "./junior-admin-helpers";
import { clearMilestonesCache } from "./milestones-cache";
import { env } from "../config";

type Logger = Parameters<typeof runDraftSweep>[2];
type PlayhqIngestResponse = z.infer<typeof IngestPlayhqDumpResponse>;
/** Wire shape of GET /internal/playhq/plans (timestamps as ISO strings). */
type DuePlansResponse = { now: string; plans: DuePlan[] };

export interface IngestInput {
  collector: string;
  planName?: string;
  status?: "ok" | "partial" | "failed";
  errors?: Record<string, unknown>[];
  durationMs?: number;
  sourceName?: string;
  dump: Dump;
}

/** Every grade a dump's rows point at, so known-junior grades can be looked up. */
function referencedGradeIds(rows: LoadRows): string[] {
  const ids = new Set<string>();
  for (const table of [
    rows.grades.map((g) => ({ grade_id: g.id })),
    rows.teams,
    rows.matches,
    rows.ladders,
    rows.player_grade_stats,
    rows.scorecards,
  ])
    for (const r of table) if (typeof r.grade_id === "string") ids.add(r.grade_id);
  return [...ids];
}

/**
 * The scheduled-sync ingest (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md, U3):
 * load one harness dump into `playhq.*` through the playhq-scoped role, then project the
 * fixtures of every tenant linked to an organisation in it and run their fixtures sweep.
 *
 * The load is one transaction. Projection and sweeps run after it commits: a failure there
 * is reported (run status `partial`, a warning) and never undoes the load, so a re-send
 * of the same dump retries the follow-up work idempotently.
 */
export async function ingestPlayhqDump(
  input: IngestInput,
  log: Logger,
): Promise<PlayhqIngestResponse> {
  const pool = getPlayhqIngestPool();
  await assertIngestScope(pool);
  const reader = pool as unknown as Queryable;

  const sourceName = input.sourceName ?? `${input.collector} ${input.dump.exportedAt}`;
  const parsed = rowsFromDump(input.dump, sourceName);
  if (parsed.runs.length === 0)
    // A dump with no plan record (hand-assembled, or a future collector) still gets a run row.
    parsed.runs.push({
      source_file: sourceName,
      org_id: null,
      plan: null,
      exported_at: Number.isNaN(Date.parse(input.dump.exportedAt))
        ? null
        : new Date(input.dump.exportedAt).toISOString(),
      notes: `harness ${input.dump.version} (no plan record)`,
      harness_version: input.dump.version,
    });

  // Juniors isolation: drop junior/pathway grades by name, and by what playhq already knows,
  // except those of organisations with junior sync enabled (junior sync plan U4, KTD1/KTD2).
  // The gate is decided once, here; with no club enabled the drop is exactly as before.
  const juniorSyncTenants = await loadJuniorSyncTenants();
  const juniorOrgIds = new Set(juniorSyncTenants.map((t) => t.orgId.toLowerCase()));
  const gradeIds = referencedGradeIds(parsed);
  const known = gradeIds.length
    ? await reader.query<{
        id: string;
        owner_org_id: string | null;
        source_org_id: string | null;
      }>(
        `select id::text as id, owner_org_id::text as owner_org_id,
                source_org_id::text as source_org_id
           from playhq.grades where id = any($1::uuid[]) and is_junior`,
        [gradeIds],
      )
    : { rows: [] };
  const knownJunior: KnownJuniorGrade[] = known.rows.map((r) => ({
    id: r.id,
    ownerOrgId: r.owner_org_id,
    sourceOrgId: r.source_org_id,
  }));
  const { rows, droppedGradeIds, keptJuniorGradeIds } = dropJuniorGrades(
    parsed,
    knownJunior,
    juniorOrgIds,
  );
  if (keptJuniorGradeIds.length)
    log.info(
      { juniorGrades: keptJuniorGradeIds.length },
      "playhq ingest: junior grades kept for junior-sync clubs",
    );

  const meta: RunMeta = {
    collector: input.collector,
    planName: input.planName ?? null,
    status: input.status ?? "ok",
    errors: input.errors ?? null,
    durationMs: input.durationMs ?? null,
  };
  const client = await pool.connect();
  let loaded: Awaited<ReturnType<typeof loadRows>>;
  try {
    await client.query("begin");
    loaded = await loadRows(client as unknown as Queryable, rows, sourceName, meta);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const warnings: string[] = [];
  const orgIds = [
    ...new Set(
      rows.matches
        .flatMap((m) => [m.home_org_id, m.away_org_id])
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  let summaries: Awaited<ReturnType<typeof projectFixtures>> = [];
  try {
    summaries = await projectFixtures({
      orgIds,
      syncEnabledOnly: true,
      central: reader,
      log: (line) => log.info({ orgIds: orgIds.length }, `playhq projection: ${line}`),
    });
  } catch (err) {
    log.error({ err }, "playhq ingest: fixtures projection failed");
    warnings.push(`fixtures projection failed: ${err instanceof Error ? err.message : err}`);
  }

  // The sides clubs named in PlayHQ become their fixtures' team lists (never an admin's).
  // A dump with scorecards also runs it: after play, PlayHQ's side replaces a Selection Hub
  // list, and the match-day plan fetches scorecards but no lineups.
  const teamListsWritten = new Map<number, number>();
  const teamListUpdates: { tenantId: number; update: TeamListUpdate }[] = [];
  if (rows.match_lineups.length || rows.scorecards.length)
    try {
      const lists = await projectTeamLists({
        orgIds,
        syncEnabledOnly: true,
        central: reader,
        log: (line) => log.info(`playhq team lists: ${line}`),
      });
      for (const l of lists) {
        teamListsWritten.set(l.tenantId, l.written);
        for (const update of l.updates) teamListUpdates.push({ tenantId: l.tenantId, update });
      }
    } catch (err) {
      log.error({ err }, "playhq ingest: team list projection failed");
      warnings.push(`team list projection failed: ${err instanceof Error ? err.message : err}`);
    }

  // Season shirt numbers: lineup players join their fixture's season register, for
  // tenants with the feature on. Runs on every sync (idempotent) so a list saved earlier
  // still feeds the register; a failure is a warning and never fails the ingest.
  if (orgIds.length)
    try {
      const lineup = await syncLineupShirtNumbers({
        orgIds,
        syncEnabledOnly: true,
        log: (line) => log.info(`playhq shirt numbers: ${line}`),
      });
      // One tenant failing never stops the others; each failure is a warning.
      for (const e of lineup.errors) {
        log.error(
          { tenantId: e.tenantId, err: e.message },
          "playhq ingest: shirt-number lineup sync failed",
        );
        warnings.push(`shirt-number lineup sync failed for tenant ${e.tenantId}: ${e.message}`);
      }
    } catch (err) {
      log.error({ err }, "playhq ingest: shirt-number lineup sync failed");
      warnings.push(`shirt-number lineup sync failed: ${err instanceof Error ? err.message : err}`);
    }

  const tenants: PlayhqIngestResponse["tenants"] = [];
  for (const s of summaries) {
    let swept = false;
    if (s.inserted + s.updated + (teamListsWritten.get(s.tenantId) ?? 0) > 0)
      try {
        await runDraftSweep(s.tenantId, { kind: "fixtures" }, log);
        swept = true;
      } catch (err) {
        log.error({ err, tenantId: s.tenantId }, "playhq ingest: draft sweep failed");
        warnings.push(`draft sweep failed for tenant ${s.tenantId}`);
      }
    tenants.push({
      tenantId: s.tenantId,
      slug: s.slug,
      matches: s.matches,
      inserted: s.inserted,
      updated: s.updated,
      swept,
    });
  }

  const centralProjection = await projectDumpToCentral(rows, warnings, log);

  // Junior projection (junior sync plan U5, KTD5): the kept junior grades (`is_junior = true`
  // in playhq.*) of the enabled tenants go to their `junior_*` tables only, after the senior
  // projections. Every senior step above filters `is_junior = false`, so it never sees them.
  if (juniorSyncTenants.length)
    await projectDumpJuniors(rows, juniorSyncTenants, reader, warnings, log);

  // Grades an enabled club's organisation has that are neither junior nor senior are
  // reported to the platform admin, never guessed (KTD4). Names and seasons only.
  if (juniorOrgIds.size)
    try {
      await recordUnclassifiedGrades(unclassifiedGradesByOrg(rows.grades, juniorOrgIds));
    } catch (err) {
      log.error({ err }, "playhq ingest: recording unclassified grades failed");
      warnings.push(
        `recording unclassified grades failed: ${err instanceof Error ? err.message : err}`,
      );
    }

  // Held shirt-number entries link once their player has played for the club in central
  // (F2): after the projection, so this sync's results count. Reads central only.
  if (orgIds.length)
    try {
      const links = await linkHeldShirtNumbers({
        orgIds,
        syncEnabledOnly: true,
        log: (line) => log.info(`playhq shirt numbers: ${line}`),
      });
      for (const e of links.errors) {
        log.error(
          { tenantId: e.tenantId, err: e.message },
          "playhq ingest: shirt-number held-entry link failed",
        );
        warnings.push(`shirt-number held-entry link failed for tenant ${e.tenantId}: ${e.message}`);
      }
    } catch (err) {
      log.error({ err }, "playhq ingest: shirt-number held-entry link failed");
      warnings.push(
        `shirt-number held-entry link failed: ${err instanceof Error ? err.message : err}`,
      );
    }

  let status = meta.status ?? "ok";
  if (warnings.length && status === "ok") status = "partial";
  if (warnings.length && loaded.runIds.length)
    await reader.query(
      `update playhq.scrape_runs
          set status = $2,
              errors = coalesce(errors, '[]'::jsonb) || $3::jsonb
        where id = any($1::bigint[])`,
      [loaded.runIds, status, JSON.stringify(warnings.map((w) => ({ stage: "ingest", error: w })))],
    );

  return {
    status,
    runIds: loaded.runIds,
    counts: loaded.counts,
    fixtureChanges: loaded.counts.fixture_changes ?? 0,
    juniorGradesDropped: droppedGradeIds.length,
    tenants,
    teamLists: await namedTeamListUpdates(teamListUpdates),
    warnings,
    ...(centralProjection ? { centralProjection } : {}),
  };
}

/** Every PlayHQ match a dump's rows mention (fixtures, scorecards, lineups). */
function dumpMatchIds(rows: LoadRows): string[] {
  const ids = new Set<string>();
  for (const table of [
    rows.matches.map((m) => ({ match_id: m.id })),
    rows.scorecards,
    rows.match_lineups,
  ])
    for (const r of table) if (typeof r.match_id === "string") ids.add(r.match_id.toLowerCase());
  return [...ids];
}

/**
 * Project this dump's junior matches for the junior-sync tenants (junior sync plan U5), then
 * recompute the stored metadata (lines, appearances, seasons, teams) of every junior
 * participant the projection touched, with the admin merge's own recompute. A failure is a
 * warning carrying ids, stages and counts only, never a player's name, and never fails the
 * ingest; the next sync retries idempotently.
 */
export async function projectDumpJuniors(
  rows: LoadRows,
  tenants: readonly JuniorSyncTenantRef[],
  reader: Queryable,
  warnings: string[],
  log: Logger,
): Promise<JuniorProjectionSummary[]> {
  const matchIds = dumpMatchIds(rows);
  if (!tenants.length || !matchIds.length) return [];
  let summaries: JuniorProjectionSummary[] = [];
  try {
    summaries = await projectJuniors({
      tenants,
      central: reader,
      matchIds,
      log: (line) => log.info(`playhq junior projection: ${line}`),
    });
  } catch (err) {
    const text = juniorProjectionErrorText(err);
    log.error({ err: text }, "playhq ingest: junior projection failed");
    warnings.push(`junior projection failed: ${text}`);
    return [];
  }
  for (const s of summaries) {
    for (const e of s.errors) {
      log.error(
        { tenantId: s.tenantId, stage: e.stage, playhqMatchId: e.playhqMatchId, err: e.message },
        "playhq ingest: junior projection step failed",
      );
      warnings.push(
        `junior projection ${e.stage} failed for tenant ${s.tenantId}` +
          (e.playhqMatchId ? ` (PlayHQ match ${e.playhqMatchId})` : "") +
          `: ${e.message}`,
      );
    }
    if (!s.touchedParticipantIds.length) continue;
    try {
      await db.transaction(async (tx) => {
        for (const participantId of s.touchedParticipantIds)
          await recomputeParticipantMetadata(tx, s.tenantId, participantId);
      });
    } catch (err) {
      const text = juniorProjectionErrorText(err);
      log.error(
        { tenantId: s.tenantId, participants: s.touchedParticipantIds.length, err: text },
        "playhq ingest: junior participant recompute failed",
      );
      warnings.push(
        `junior participant recompute failed for tenant ${s.tenantId} ` +
          `(${s.touchedParticipantIds.length} participants): ${text}`,
      );
    }
  }
  return summaries;
}

/**
 * Keep one open `unclassified_grades` incident per organisation listing every grade (name and
 * season) no classifier recognises: new grades are added to the open row, never removed, and
 * the watchdog never touches the kind. Lives in the app database, like every incident.
 */
export async function recordUnclassifiedGrades(
  byOrg: Map<string, UnclassifiedGrade[]>,
): Promise<void> {
  for (const [orgId, incoming] of byOrg) {
    if (!incoming.length) continue;
    const openRow = () =>
      db
        .select({ id: playhqSyncIncidentsTable.id, detail: playhqSyncIncidentsTable.detail })
        .from(playhqSyncIncidentsTable)
        .where(
          and(
            eq(playhqSyncIncidentsTable.orgId, orgId),
            eq(playhqSyncIncidentsTable.kind, UNCLASSIFIED_GRADES_INCIDENT_KIND),
            isNull(playhqSyncIncidentsTable.resolvedAt),
          ),
        );
    let [open] = await openRow();
    if (!open) {
      const { grades } = mergeUnclassifiedGrades([], incoming);
      const [inserted] = await db
        .insert(playhqSyncIncidentsTable)
        .values({
          orgId,
          kind: UNCLASSIFIED_GRADES_INCIDENT_KIND,
          detail: { reasons: grades.map(describeGrade), grades },
        })
        .onConflictDoNothing()
        .returning({ id: playhqSyncIncidentsTable.id });
      if (inserted) continue;
      [open] = await openRow(); // a concurrent ingest opened it first
      if (!open) continue;
    }
    const { grades, changed } = mergeUnclassifiedGrades(open.detail?.grades, incoming);
    if (!changed) continue;
    await db
      .update(playhqSyncIncidentsTable)
      .set({ detail: { reasons: grades.map(describeGrade), grades } })
      .where(eq(playhqSyncIncidentsTable.id, open.id));
  }
}

/**
 * The platform-admin tenant page's list: the open unclassified-grades reports of a tenant's
 * senior and junior PlayHQ organisations, one entry per grade and season.
 */
export async function unclassifiedGradesForTenant(t: {
  playhqOrgId: string | null;
  playhqJuniorOrgId: string | null;
}): Promise<{ orgId: string; grade: string; season: string | null; since: string }[]> {
  const orgs = [
    ...new Set(
      [t.playhqOrgId, t.playhqJuniorOrgId]
        .map((o) => o?.trim().toLowerCase())
        .filter((o): o is string => !!o),
    ),
  ];
  if (!orgs.length) return [];
  const open = await db
    .select({
      orgId: playhqSyncIncidentsTable.orgId,
      detail: playhqSyncIncidentsTable.detail,
      openedAt: playhqSyncIncidentsTable.openedAt,
    })
    .from(playhqSyncIncidentsTable)
    .where(
      and(
        inArray(playhqSyncIncidentsTable.orgId, orgs),
        eq(playhqSyncIncidentsTable.kind, UNCLASSIFIED_GRADES_INCIDENT_KIND),
        isNull(playhqSyncIncidentsTable.resolvedAt),
      ),
    )
    .orderBy(playhqSyncIncidentsTable.orgId);
  return open.flatMap((row) =>
    mergeUnclassifiedGrades(row.detail?.grades, []).grades.map((g) => ({
      orgId: row.orgId,
      grade: g.grade,
      season: g.season,
      since: row.openedAt.toISOString(),
    })),
  );
}

function describeGrade(g: UnclassifiedGrade): string {
  return g.season ? `${g.grade} (${g.season})` : g.grade;
}

/**
 * Copy the dump's finished matches into the central stats tables
 * (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md, P5): every match whose
 * scorecard arrived in this dump, plus abandoned / cancelled / forfeited matches (result rows,
 * D3). Behind CENTRAL_PROJECTION (off | dry | on). Like the fixtures projection, a failure
 * becomes a warning and never undoes the load; the next sync retries it.
 */
/** Skip reasons counted, with ids blanked so like reasons group (e.g. "… maps to no club"). */
export function countSkipReasons(reasons: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reasons) {
    const key = r.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "…");
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function clearCentralCaches(): Promise<void> {
  const { clearCentralQueriesCache } = await import("@workspace/db/central-queries");
  clearCentralQueriesCache();
  clearMilestonesCache();
}

export async function projectDumpToCentral(
  rows: LoadRows,
  warnings: string[],
  log: Logger,
): Promise<PlayhqIngestResponse["centralProjection"]> {
  const mode = env.CENTRAL_PROJECTION();
  if (mode === "off") return undefined;
  if (!centralProjectorConfigured()) {
    warnings.push(`CENTRAL_PROJECTION=${mode} but CENTRAL_PROJECTOR_DATABASE_URL is not set`);
    return undefined;
  }
  const resultOnly = new Set<string>(PROJECTABLE_STATUSES.filter((s) => s !== "COMPLETED"));
  const matchIds = [
    ...new Set([
      ...rows.scorecards.map((s) => String(s.match_id)),
      ...rows.matches
        .filter((m) => typeof m.status === "string" && resultOnly.has(m.status))
        .map((m) => String(m.id)),
    ]),
  ];
  // Full names from PlayHQ's grade stats reports (weekly plan, names backfill).
  const hasNames = (rows.players ?? []).some((p) => p.full_name);
  try {
    const pool = getCentralProjectorPool();
    await assertProjectorScope(pool);
    // Names stored surname first ("Phelps, Chris") are turned round once; a no-op after.
    const reordered = await normaliseCentralNames(pool, { dryRun: mode === "dry" });
    if (!matchIds.length && !hasNames) {
      if (reordered > 0) await clearCentralCaches();
      return {
        mode,
        considered: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        playersInserted: 0,
        ...(reordered ? { namesUpgraded: reordered } : {}),
      };
    }
    const namesFromReports = hasNames
      ? await upgradeNamesFromPlayhq(pool, { dryRun: mode === "dry" })
      : 0;
    const s = await projectToCentral(pool, {
      matchIds,
      dryRun: mode === "dry",
      log: (line) => log.info(`central projection: ${line}`),
    });
    for (const k of s.skipped) {
      log.warn({ playhqMatchId: k.playhqMatchId }, `central projection skipped: ${k.reason}`);
      if (k.reason.startsWith("error:"))
        warnings.push(`central projection failed for PlayHQ match ${k.playhqMatchId}: ${k.reason}`);
    }
    const namesUpgraded = reordered + namesFromReports + s.namesUpgraded;
    if (!s.dryRun && (s.created + s.updated > 0 || namesUpgraded > 0)) {
      // New results must show now, not after the read caches' TTL.
      await clearCentralCaches();
    }
    return {
      mode,
      considered: s.considered,
      created: s.created,
      updated: s.updated,
      skipped: s.skipped.length,
      skipReasons: countSkipReasons(s.skipped.map((k) => k.reason)),
      playersInserted: s.playersInserted,
      namesUpgraded,
    };
  } catch (err) {
    log.error({ err }, "playhq ingest: central projection failed");
    warnings.push(`central projection failed: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

/**
 * The plans due now for every PlayHQ organisation linked to an active tenant with sync
 * switched on (U5, U4), plus each junior-sync club's junior organisation (junior sync plan
 * U4, KTD2): those organisations' plans ask the harness for junior grades too, their junior
 * match days are scheduled, and a separate junior organisation is planned as its own org.
 * Reads `playhq.*` through the ingest pool: sync is either fully configured or answers 503.
 */
export async function listDuePlans(now: Date): Promise<DuePlansResponse> {
  const pool = getPlayhqIngestPool();
  await assertIngestScope(pool);
  const linked = await db
    .selectDistinct({ orgId: tenantsTable.playhqOrgId })
    .from(tenantsTable)
    .where(
      and(
        isNotNull(tenantsTable.playhqOrgId),
        isNull(tenantsTable.suspendedAt),
        eq(tenantsTable.playhqSyncEnabled, true),
      ),
    );
  const juniorOrgIds = [
    ...new Set((await loadJuniorSyncTenants()).map((t) => t.orgId.toLowerCase())),
  ];
  const orgIds = [...new Set([...linked.map((t) => t.orgId!.toLowerCase()), ...juniorOrgIds])];
  const { matches, lastRuns } = await loadCadenceInputs(
    pool as unknown as Queryable,
    orgIds,
    juniorOrgIds,
  );
  return {
    now: now.toISOString(),
    plans: duePlans(now, orgIds, matches, lastRuns, juniorOrgIds),
  };
}

/** The run's team-list updates with each club's name, for the sync's run log. */
async function namedTeamListUpdates(
  updates: { tenantId: number; update: TeamListUpdate }[],
): Promise<NonNullable<PlayhqIngestResponse["teamLists"]>> {
  if (updates.length === 0) return [];
  const ids = [...new Set(updates.map((u) => u.tenantId))];
  const clubs = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(inArray(tenantsTable.id, ids));
  const nameOf = new Map(clubs.map((c) => [c.id, c.name]));
  return updates.map(({ tenantId, update: u }) => ({
    tenantId,
    club: nameOf.get(tenantId) ?? `tenant ${tenantId}`,
    grade: u.grade,
    opponent: u.opponent,
    startAt: new Date(u.startAt),
    players: u.players,
    change: u.change,
  }));
}
