import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { env } from "../config";
import { logger as defaultLogger } from "./logger";

/**
 * The Selection Hub's "Fetch latest from PlayHQ" (admins only): the club asks for its matches
 * and the sides named in PlayHQ now, instead of waiting for the next scheduled lineup fetch.
 *
 * The server owns the request, as it owns the sync calendar: it is stored on the tenant, and
 * `GET /internal/playhq/plans` serves it as the `ondemand` plan until a run of that plan loads
 * (the ingest stamps `playhq_fetch_completed_at`). Starting the GitHub workflow here only
 * wakes the runner sooner — the workflow runs one at a time and GitHub drops a waiting run when
 * another queues, so a dropped wake-up costs nothing: the next run (at the latest the hourly
 * one) still collects it. With no dispatch token configured the request simply waits for that
 * hourly run.
 *
 * Applying PlayHQ's sides to the drafts stays a selector's choice ("Sync from PlayHQ"): a fetch
 * never changes a draft.
 */

/** A request older than this is dropped rather than run late. */
export const FETCH_REQUEST_TTL_MS = 6 * 3600_000;

/** One request per club per this long, so repeated clicks never queue a pile of runs. */
export const FETCH_COOLDOWN_MS = 10 * 60_000;

const WORKFLOW_FILE = "playhq-sync.yml";
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type PlayhqFetchStatus = {
  /** The club is linked to PlayHQ with the scheduled sync on. */
  available: boolean;
  /** A request is waiting for (or in) a sync run. */
  pending: boolean;
  requestedAt: Date | null;
  requestedBy: string | null;
  completedAt: Date | null;
  /** While the cooldown runs, when the next request is allowed. */
  nextAllowedAt: Date | null;
};

export type WakeResult = "dispatched" | "not_configured" | "failed";

export class PlayhqFetchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function loadPlayhqFetchStatus(
  tenantId: number,
  now: Date = new Date(),
): Promise<PlayhqFetchStatus> {
  const [t] = await db
    .select({
      orgId: tenantsTable.playhqOrgId,
      syncEnabled: tenantsTable.playhqSyncEnabled,
      suspendedAt: tenantsTable.suspendedAt,
      requestedAt: tenantsTable.playhqFetchRequestedAt,
      requestedBy: tenantsTable.playhqFetchRequestedBy,
      completedAt: tenantsTable.playhqFetchCompletedAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!t) {
    return {
      available: false,
      pending: false,
      requestedAt: null,
      requestedBy: null,
      completedAt: null,
      nextAllowedAt: null,
    };
  }
  const requested = t.requestedAt?.getTime() ?? null;
  const pending =
    requested !== null &&
    requested > now.getTime() - FETCH_REQUEST_TTL_MS &&
    (t.completedAt === null || t.completedAt.getTime() < requested);
  const nextAllowed = requested !== null ? requested + FETCH_COOLDOWN_MS : null;
  return {
    available: !!t.orgId && t.syncEnabled && t.suspendedAt === null,
    pending,
    requestedAt: t.requestedAt,
    requestedBy: t.requestedBy,
    completedAt: t.completedAt,
    nextAllowedAt:
      nextAllowed !== null && nextAllowed > now.getTime() ? new Date(nextAllowed) : null,
  };
}

/** Perth wall-clock time, for messages. */
function perthTime(at: Date): string {
  return at.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Perth",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Record an admin's request and wake the sync. 409 when the club isn't linked to PlayHQ sync;
 * 429 inside the cooldown (checked and claimed in one conditional update, so two admins
 * clicking at once make one request).
 */
export async function requestPlayhqFetch(
  tenantId: number,
  requestedBy: string,
  opts: { now?: Date; wake?: () => Promise<WakeResult> } = {},
): Promise<{ status: PlayhqFetchStatus; wake: WakeResult }> {
  const now = opts.now ?? new Date();
  const before = await loadPlayhqFetchStatus(tenantId, now);
  if (!before.available) {
    throw new PlayhqFetchError(409, "This club isn't linked to the PlayHQ sync.");
  }
  const claimed = await db
    .update(tenantsTable)
    .set({ playhqFetchRequestedAt: now, playhqFetchRequestedBy: requestedBy })
    .where(
      and(
        eq(tenantsTable.id, tenantId),
        or(
          isNull(tenantsTable.playhqFetchRequestedAt),
          lte(tenantsTable.playhqFetchRequestedAt, new Date(now.getTime() - FETCH_COOLDOWN_MS)),
        ),
      ),
    )
    .returning({ id: tenantsTable.id });
  if (claimed.length === 0) {
    const next = before.nextAllowedAt ?? new Date(now.getTime() + FETCH_COOLDOWN_MS);
    throw new PlayhqFetchError(
      429,
      `A PlayHQ fetch was just requested. You can ask again after ${perthTime(next)}.`,
    );
  }
  const wake = await (opts.wake ?? wakePlayhqSync)();
  return { status: await loadPlayhqFetchStatus(tenantId, now), wake };
}

/**
 * Start the PlayHQ sync workflow now (GitHub workflow_dispatch, no inputs: the run asks the
 * API what is due, which includes the request). Best-effort: never throws, never logs the token.
 */
export async function wakePlayhqSync(
  fetchImpl: typeof fetch = fetch,
  log: Pick<typeof defaultLogger, "warn"> = defaultLogger,
): Promise<WakeResult> {
  const token = env.PLAYHQ_DISPATCH_TOKEN();
  if (!token) return "not_configured";
  const repo = env.PLAYHQ_DISPATCH_REPO() || "AWyborn2/Ovation";
  if (!REPO_RE.test(repo)) {
    log.warn({ repo }, "playhq fetch: PLAYHQ_DISPATCH_REPO is not owner/name");
    return "failed";
  }
  const ref = env.PLAYHQ_DISPATCH_REF() || "main";
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ovation-api",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 204) return "dispatched";
    log.warn({ status: res.status }, "playhq fetch: workflow dispatch refused");
    return "failed";
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "playhq fetch: workflow dispatch failed",
    );
    return "failed";
  }
}
