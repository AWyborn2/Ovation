import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  PROJECTABLE_STATUSES,
  assertIngestScope,
  assertProjectorScope,
  centralProjectorConfigured,
  getCentralProjectorPool,
  projectToCentral,
  duePlans,
  loadCadenceInputs,
  type DuePlan,
  dropJuniorGrades,
  getPlayhqIngestPool,
  loadRows,
  projectFixtures,
  projectTeamLists,
  linkHeldShirtNumbers,
  rowsFromDump,
  syncLineupShirtNumbers,
  type Dump,
  type LoadRows,
  type Queryable,
  type RunMeta,
} from "@workspace/db/playhq-ingest";
import type { z } from "zod";
import type { IngestPlayhqDumpResponse } from "@workspace/api-zod";
import { runDraftSweep } from "./draft-sweep";
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

  // Juniors isolation: drop junior/pathway grades by name, and by what playhq already knows.
  const gradeIds = referencedGradeIds(parsed);
  const known = gradeIds.length
    ? await reader.query<{ id: string }>(
        `select id from playhq.grades where id = any($1::uuid[]) and is_junior`,
        [gradeIds],
      )
    : { rows: [] };
  const { rows, droppedGradeIds } = dropJuniorGrades(
    parsed,
    known.rows.map((r) => r.id),
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
  const teamListsWritten = new Map<number, number>();
  if (rows.match_lineups.length)
    try {
      const lists = await projectTeamLists({
        orgIds,
        syncEnabledOnly: true,
        central: reader,
        log: (line) => log.info(`playhq team lists: ${line}`),
      });
      for (const l of lists) teamListsWritten.set(l.tenantId, l.written);
    } catch (err) {
      log.error({ err }, "playhq ingest: team list projection failed");
      warnings.push(`team list projection failed: ${err instanceof Error ? err.message : err}`);
    }

  // Season shirt numbers (KTD9): lineup players join their fixture's season register, for
  // tenants with the feature on. Runs on every sync (idempotent) so a list saved earlier
  // still feeds the register; a failure is a warning and never fails the ingest.
  if (orgIds.length)
    try {
      await syncLineupShirtNumbers({
        orgIds,
        syncEnabledOnly: true,
        log: (line) => log.info(`playhq shirt numbers: ${line}`),
      });
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

  // Held shirt-number entries link once their player has played for the club in central
  // (F2): after the projection, so this sync's results count. Reads central only.
  if (orgIds.length)
    try {
      await linkHeldShirtNumbers({
        orgIds,
        syncEnabledOnly: true,
        log: (line) => log.info(`playhq shirt numbers: ${line}`),
      });
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
    warnings,
    ...(centralProjection ? { centralProjection } : {}),
  };
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
  if (!matchIds.length)
    return { mode, considered: 0, created: 0, updated: 0, skipped: 0, playersInserted: 0 };
  try {
    const pool = getCentralProjectorPool();
    await assertProjectorScope(pool);
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
    if (!s.dryRun && s.created + s.updated > 0) {
      // New results must show now, not after the read caches' TTL.
      const { clearCentralQueriesCache } = await import("@workspace/db/central-queries");
      clearCentralQueriesCache();
      clearMilestonesCache();
    }
    return {
      mode,
      considered: s.considered,
      created: s.created,
      updated: s.updated,
      skipped: s.skipped.length,
      skipReasons: countSkipReasons(s.skipped.map((k) => k.reason)),
      playersInserted: s.playersInserted,
    };
  } catch (err) {
    log.error({ err }, "playhq ingest: central projection failed");
    warnings.push(`central projection failed: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

/**
 * The plans due now for every PlayHQ organisation linked to an active tenant with sync
 * switched on (U5, U4). Reads
 * `playhq.*` through the ingest pool: sync is either fully configured or answers 503.
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
  const orgIds = linked.map((t) => t.orgId!.toLowerCase());
  const { matches, lastRuns } = await loadCadenceInputs(pool as unknown as Queryable, orgIds);
  return {
    now: now.toISOString(),
    plans: duePlans(now, orgIds, matches, lastRuns),
  };
}
