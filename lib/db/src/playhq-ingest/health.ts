/**
 * Scheduled-sync health (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md, U8):
 * is each linked PlayHQ organisation being kept up to date?
 *
 *   overdue — a plan has been due longer than its grace period (`weekly`: 26 h, because a
 *             runner outage of a day should page; every match-calendar plan: 3 h, because
 *             match-day results go stale fast). This is what catches a dead runner.
 *   failed  — the organisation's most recent run failed outright (a collector `failed`, not
 *             a `partial`, which still loaded what it collected).
 *   ok      — otherwise.
 *
 * Pure; `loadRunSummaries` gathers the latest-run facts from `playhq.scrape_runs`, and the
 * due plans come from `duePlans` (./cadence.ts), so health and scheduling share one calendar.
 */
import type { Queryable } from "./load";
import type { DuePlan } from "./cadence";

export type SyncState = "ok" | "overdue" | "failed";

export interface RunSummary {
  orgId: string;
  /** Latest run of any status. */
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunPlan: string | null;
  lastRunCollector: string | null;
  /** Latest run that loaded something (ok or partial). */
  lastSuccessAt: Date | null;
}

export interface OrgHealth {
  orgId: string;
  state: SyncState;
  reasons: string[];
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunPlan: string | null;
  lastRunCollector: string | null;
  lastSuccessAt: Date | null;
  due: { planName: string; slot: string; waitingMs: number }[];
}

const HOUR = 3_600_000;

/** How long a plan may stay due before the organisation counts as overdue. */
export function graceMs(planName: string): number {
  return planName === "weekly" ? 26 * HOUR : 3 * HOUR;
}

function hours(ms: number): string {
  return `${Math.round((ms / HOUR) * 10) / 10} h`;
}

export function assessHealth(
  now: Date,
  orgIds: string[],
  due: DuePlan[],
  runs: RunSummary[],
): OrgHealth[] {
  const t = now.getTime();
  const runByOrg = new Map(runs.map((r) => [r.orgId.toLowerCase(), r]));
  return [...new Set(orgIds.map((o) => o.toLowerCase()))].sort().map((orgId) => {
    const run = runByOrg.get(orgId);
    const mine = due
      .filter((d) => d.orgId.toLowerCase() === orgId)
      .map((d) => ({
        planName: d.planName,
        slot: d.slot,
        waitingMs: Math.max(0, t - Date.parse(d.slot)),
      }));
    const reasons: string[] = [];
    let state: SyncState = "ok";
    if (run?.lastRunStatus === "failed") {
      state = "failed";
      reasons.push(
        `latest run (${run.lastRunPlan ?? "unplanned"}) failed at ${run.lastRunAt?.toISOString() ?? "?"}`,
      );
    }
    for (const d of mine)
      if (d.waitingMs > graceMs(d.planName)) {
        if (state === "ok") state = "overdue";
        reasons.push(`${d.planName} due for ${hours(d.waitingMs)} (slot ${d.slot})`);
      }
    return {
      orgId,
      state,
      reasons,
      lastRunAt: run?.lastRunAt ?? null,
      lastRunStatus: run?.lastRunStatus ?? null,
      lastRunPlan: run?.lastRunPlan ?? null,
      lastRunCollector: run?.lastRunCollector ?? null,
      lastSuccessAt: run?.lastSuccessAt ?? null,
      due: mine,
    };
  });
}

/** Latest run, and latest successful run, per organisation from `playhq.scrape_runs`. */
export async function loadRunSummaries(c: Queryable, orgIds: string[]): Promise<RunSummary[]> {
  if (orgIds.length === 0) return [];
  const orgs = [...new Set(orgIds.map((o) => o.toLowerCase()))];
  const res = await c.query<{
    org_id: string;
    last_run_at: Date | null;
    last_run_status: string | null;
    last_run_plan: string | null;
    last_run_collector: string | null;
    last_success_at: Date | null;
  }>(
    `select o.org_id,
            l.loaded_at as last_run_at, l.status as last_run_status,
            l.plan_name as last_run_plan, l.collector as last_run_collector,
            (select max(s.loaded_at) from playhq.scrape_runs s
              where s.org_id::text = o.org_id and s.status in ('ok', 'partial')) as last_success_at
       from unnest($1::text[]) as o(org_id)
       left join lateral (
         select r.loaded_at, r.status, r.plan_name, r.collector
           from playhq.scrape_runs r
          where r.org_id::text = o.org_id
          order by r.loaded_at desc, r.id desc
          limit 1
       ) l on true`,
    [orgs],
  );
  return res.rows.map((r) => ({
    orgId: r.org_id,
    lastRunAt: r.last_run_at ? new Date(r.last_run_at) : null,
    lastRunStatus: r.last_run_status,
    lastRunPlan: r.last_run_plan,
    lastRunCollector: r.last_run_collector,
    lastSuccessAt: r.last_success_at ? new Date(r.last_success_at) : null,
  }));
}
