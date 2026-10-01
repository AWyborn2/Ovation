/**
 * Scheduled-sync cadence (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md, KTD4 /
 * U5): which harness plans are due for which PlayHQ organisation, right now.
 *
 * The server decides; the runner is dumb. An hourly runner asks "what's due?", runs exactly
 * that, and posts each dump to the ingest endpoint, which records a `playhq.scrape_runs` row
 * with the plan name. A plan is due when its latest slot has passed and no successful run of
 * that plan for that organisation has loaded since the slot — so a missed hour, a late cron
 * or a failed run heals itself on the next tick, and a slot is never run twice.
 *
 * Slots are wall-clock times in Perth (AWST, UTC+8, no daylight saving), where every current
 * tenant plays. `duePlans` is pure so the calendar can be tested with a fake clock;
 * `loadCadenceInputs` gathers its inputs from `playhq.*`.
 */
import type { Queryable } from "./load";

export type PlanName = "weekly" | "preweekend" | "matchmorn" | "matchday" | "dayafter" | "catchup";

/** The plan object the harness's `__ov.start(plan)` takes. */
export interface HarnessPlan {
  orgId: string;
  seasons: "current";
  kinds: string[];
  balls: "none";
  scorecards: "none" | "since";
  since?: string;
  resume?: boolean;
}

export interface DuePlan {
  orgId: string;
  planName: PlanName;
  /** The slot this run serves (ISO, UTC). */
  slot: string;
  plan: HarnessPlan;
}

export interface CadenceMatch {
  homeOrgId: string | null;
  awayOrgId: string | null;
  startAt: Date;
  /** Start of the last scheduled day (multi-day matches); null = single day. */
  lastDayStartAt?: Date | null;
  status: string | null;
  matchType: string | null;
}

export interface LastRun {
  orgId: string;
  planName: string;
  loadedAt: Date;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Perth is UTC+8 all year. */
const AWST = 8 * HOUR;

/** Matches still unresolved after their day (a scorecard not entered yet, a result pending). */
const RESOLVED = new Set(["COMPLETED", "ABANDONED", "CANCELLED", "FORFEIT", "FORFEITED"]);

/** Midnight (AWST) of the Perth day containing `t`, as a UTC instant. */
function perthMidnight(t: number): number {
  return Math.floor((t + AWST) / DAY) * DAY - AWST;
}
/** Day of week in Perth, 0 = Sunday. */
function perthDow(t: number): number {
  return new Date(t + AWST).getUTCDay();
}
/** `YYYY-MM-DD` of the Perth day containing `t`. */
function perthDate(t: number): string {
  return new Date(t + AWST).toISOString().slice(0, 10);
}

/** How long a match runs after its (last day's) start, for the match-day window. */
export function matchDurationMs(matchType: string | null): number {
  return /t20|twenty/i.test(matchType ?? "") ? 3.5 * HOUR : 7 * HOUR;
}

export function harnessPlan(orgId: string, name: PlanName, since?: string): HarnessPlan {
  switch (name) {
    case "weekly":
      return {
        orgId,
        seasons: "current",
        kinds: ["matches", "ladder", "gradeTeams", "rounds"],
        balls: "none",
        scorecards: "none",
      };
    case "preweekend":
    case "matchmorn":
      return { orgId, seasons: "current", kinds: ["matches"], balls: "none", scorecards: "none" };
    case "matchday":
      return {
        orgId,
        seasons: "current",
        kinds: ["matches", "ladder"],
        balls: "none",
        scorecards: "since",
        since,
      };
    case "dayafter":
    case "catchup":
      return {
        orgId,
        seasons: "current",
        kinds: ["matches", "ladder"],
        balls: "none",
        scorecards: "since",
        since,
        resume: true,
      };
  }
}

/** Every plan due for each organisation at `now`. */
export function duePlans(
  now: Date,
  orgIds: string[],
  matches: CadenceMatch[],
  lastRuns: LastRun[],
): DuePlan[] {
  const t = now.getTime();
  const today = perthMidnight(t);
  const lastRun = new Map<string, number>();
  for (const r of lastRuns) {
    const k = `${r.orgId.toLowerCase()}|${r.planName}`;
    lastRun.set(k, Math.max(lastRun.get(k) ?? 0, r.loadedAt.getTime()));
  }

  const out: DuePlan[] = [];
  for (const rawOrg of [...new Set(orgIds.map((o) => o.toLowerCase()))].sort()) {
    const org = rawOrg;
    const mine = matches.filter(
      (m) => m.homeOrgId?.toLowerCase() === org || m.awayOrgId?.toLowerCase() === org,
    );
    const due = (name: PlanName, slot: number, since?: string) => {
      if (slot > t) return;
      if ((lastRun.get(`${org}|${name}`) ?? 0) >= slot) return;
      out.push({
        orgId: org,
        planName: name,
        slot: new Date(slot).toISOString(),
        plan: harnessPlan(org, name, since),
      });
    };
    /** Matches starting on the Perth day beginning at `dayStart`. */
    const onDay = (dayStart: number) =>
      mine.filter((m) => {
        const s = m.startAt.getTime();
        return s >= dayStart && s < dayStart + DAY;
      });

    // weekly — Monday 06:00, all year.
    const sinceMonday = (perthDow(t) + 6) % 7;
    let weekly = today - sinceMonday * DAY + 6 * HOUR;
    if (weekly > t) weekly -= 7 * DAY;
    due("weekly", weekly);

    // preweekend — Thu and Fri 18:00, when the org plays within the next 4 days.
    for (const back of [0, 1, 2, 3, 4, 5, 6]) {
      const day = today - back * DAY;
      const dow = perthDow(day + HOUR);
      if (dow !== 4 && dow !== 5) continue;
      const slot = day + 18 * HOUR;
      if (slot > t) continue;
      if (mine.some((m) => m.startAt.getTime() >= slot && m.startAt.getTime() < slot + 4 * DAY))
        due("preweekend", slot);
      break; // only the latest Thu/Fri slot counts
    }

    const todays = onDay(today);
    if (todays.length) {
      // matchmorn — 07:00 on a match day.
      due("matchmorn", today + 7 * HOUR);
      // matchday — hourly from first start −2h to the last scheduled end +2h.
      const first = Math.min(...todays.map((m) => m.startAt.getTime()));
      const last = Math.max(
        ...todays.map(
          (m) =>
            (m.lastDayStartAt?.getTime() ?? m.startAt.getTime()) + matchDurationMs(m.matchType),
        ),
      );
      if (t >= first - 2 * HOUR && t <= last + 2 * HOUR)
        due("matchday", Math.floor(t / HOUR) * HOUR, perthDate(t));
    }

    // dayafter — 08:00 and 18:00 the day after a match day.
    const yesterday = today - DAY;
    if (onDay(yesterday).length) {
      const slot = t >= today + 18 * HOUR ? today + 18 * HOUR : today + 8 * HOUR;
      due("dayafter", slot, perthDate(yesterday));
    }

    // catchup — 08:00 on day +3 when that match day still has unresolved fixtures.
    const threeBack = today - 3 * DAY;
    if (onDay(threeBack).some((m) => !RESOLVED.has((m.status ?? "").toUpperCase())))
      due("catchup", today + 8 * HOUR, perthDate(threeBack));
  }
  return out;
}

/**
 * Gather `duePlans` inputs from `playhq.*`: senior matches for these organisations starting
 * between four days ago and five days ahead, and the latest successful run per plan.
 */
export async function loadCadenceInputs(
  c: Queryable,
  orgIds: string[],
): Promise<{ matches: CadenceMatch[]; lastRuns: LastRun[] }> {
  if (orgIds.length === 0) return { matches: [], lastRuns: [] };
  const orgs = [...new Set(orgIds.map((o) => o.toLowerCase()))];
  const m = await c.query<{
    home_org_id: string | null;
    away_org_id: string | null;
    start_at: Date;
    end_at: Date | null;
    status: string | null;
    match_type: string | null;
  }>(
    `select m.home_org_id::text, m.away_org_id::text, m.start_at, m.end_at, m.status, m.match_type
       from playhq.matches m
       join playhq.grades g on g.id = m.grade_id
      where (m.home_org_id::text = any($1::text[]) or m.away_org_id::text = any($1::text[]))
        and g.is_junior = false
        and m.start_at >= now() - interval '4 days'
        and m.start_at <  now() + interval '5 days'`,
    [orgs],
  );
  const r = await c.query<{ org_id: string; plan_name: string; loaded_at: Date }>(
    `select org_id::text, plan_name, max(loaded_at) as loaded_at
       from playhq.scrape_runs
      where org_id::text = any($1::text[])
        and plan_name is not null
        and status in ('ok', 'partial')
        and loaded_at >= now() - interval '8 days'
      group by org_id, plan_name`,
    [orgs],
  );
  return {
    matches: m.rows.map((x) => ({
      homeOrgId: x.home_org_id,
      awayOrgId: x.away_org_id,
      startAt: new Date(x.start_at),
      lastDayStartAt: x.end_at ? new Date(x.end_at) : null,
      status: x.status,
      matchType: x.match_type,
    })),
    lastRuns: r.rows.map((x) => ({
      orgId: x.org_id,
      planName: x.plan_name,
      loadedAt: new Date(x.loaded_at),
    })),
  };
}
