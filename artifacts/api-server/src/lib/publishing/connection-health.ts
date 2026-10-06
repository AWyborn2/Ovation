import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import { env } from "../../config";
import { DestinationError } from "./destination";
import { destination } from "./meta-adapter";
import { accountFor, holdScheduled, loadConnection, purgeExpiredPending } from "./connections";
import { notifyReconnectNeeded } from "./publish-worker";

/**
 * The daily connection check (plan 2026-10-06-001 U8, R2): at most once a day
 * per connected club, ask Meta whether the stored Page token still works. A
 * revoked or permission-stripped connection flips to "reconnect needed",
 * holds the club's scheduled posts and tells the club once — before the next
 * weekend post fails, not because of it. A Meta outage proves nothing, so a
 * transient error leaves the connection alone and is checked again next run.
 */

export const HEALTH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

type Logger = { warn: (obj: unknown, msg?: string) => void };

export type HealthResult = "skipped" | "healthy" | "needs_reconnect" | "unknown";

export async function checkConnectionHealth(
  tenantId: number,
  now: Date,
  log: Logger,
): Promise<HealthResult> {
  if (!env.metaPublishingEnabled()) return "skipped";
  await purgeExpiredPending(now);
  const connection = await loadConnection(tenantId);
  if (connection?.status !== "connected") return "skipped";
  if (
    connection.lastHealthCheckAt &&
    now.getTime() - connection.lastHealthCheckAt.getTime() < HEALTH_CHECK_INTERVAL_MS
  ) {
    return "skipped";
  }
  const account = accountFor(connection);
  if (!account) return "skipped";

  let result;
  try {
    result = await destination().checkHealth(account);
  } catch (err) {
    log.warn(
      { tenantId, err: err instanceof DestinationError ? err.message : String(err) },
      "meta health check inconclusive",
    );
    return "unknown";
  }

  if (result.ok) {
    await db
      .update(socialConnectionsTable)
      .set({ lastHealthCheckAt: now })
      .where(eq(socialConnectionsTable.id, connection.id));
    return "healthy";
  }

  const flipped = await db
    .update(socialConnectionsTable)
    .set({
      status: "needs_reconnect",
      statusReason: result.reason,
      lastHealthCheckAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(socialConnectionsTable.id, connection.id),
        eq(socialConnectionsTable.status, "connected"),
      ),
    )
    .returning({ id: socialConnectionsTable.id });
  await holdScheduled(tenantId);
  if (flipped.length) await notifyReconnectNeeded(tenantId, result.reason, log);
  return "needs_reconnect";
}
