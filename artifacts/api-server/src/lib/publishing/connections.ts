import { and, eq, inArray, lt } from "drizzle-orm";
import {
  db,
  socialConnectionsTable,
  socialConnectionPendingTable,
  socialPublicationsTable,
  socialSettingsTable,
  type SocialConnectionRow,
} from "@workspace/db";
import { env } from "../../config";
import { hasEntitlement } from "../entitlements";
import { getTenantPlan } from "../tenant";
import { open } from "../secret-box";
import type { DestinationAccount } from "./destination";

/**
 * A club's Meta connection: reading it, presenting it (never the token), and
 * the side effects of connect, disconnect and reconnect on its publications.
 */

export const PROVIDER = "meta";

export type MetaConnectionView = {
  available: boolean;
  status: "not_connected" | "connected" | "needs_reconnect" | "disconnected";
  statusReason: string | null;
  pageName: string | null;
  igUsername: string | null;
  connectedAt: string | null;
};

export async function loadConnection(tenantId: number): Promise<SocialConnectionRow | null> {
  const [row] = await db
    .select()
    .from(socialConnectionsTable)
    .where(
      and(
        eq(socialConnectionsTable.tenantId, tenantId),
        eq(socialConnectionsTable.provider, PROVIDER),
      ),
    );
  return row ?? null;
}

/** Platform kill switch on AND the club's plan includes publishing. */
export async function publishingAvailable(tenantId: number): Promise<boolean> {
  if (!env.metaPublishingEnabled()) return false;
  return hasEntitlement(await getTenantPlan(tenantId), "socialPublishing");
}

export async function presentConnection(tenantId: number): Promise<MetaConnectionView> {
  const [row, available] = await Promise.all([
    loadConnection(tenantId),
    publishingAvailable(tenantId),
  ]);
  if (!row) {
    return {
      available,
      status: "not_connected",
      statusReason: null,
      pageName: null,
      igUsername: null,
      connectedAt: null,
    };
  }
  return {
    available,
    status: row.status as MetaConnectionView["status"],
    statusReason: row.statusReason,
    pageName: row.status === "disconnected" ? null : row.pageName,
    igUsername: row.status === "disconnected" ? null : row.igUsername,
    connectedAt: row.connectedAt?.toISOString() ?? null,
  };
}

/** The decrypted account the destination needs, or null when not usable. */
export function accountFor(row: SocialConnectionRow): DestinationAccount | null {
  if (row.status !== "connected" || !row.pageId || !row.pageToken) return null;
  return { pageId: row.pageId, igUserId: row.igUserId, token: open(row.pageToken) };
}

const OPEN_STATUSES = ["scheduled", "held"];

/** Cancel every scheduled or held publication for these tenants. */
export async function cancelOpenPublications(tenantIds: number[], reason: string): Promise<number> {
  if (tenantIds.length === 0) return 0;
  const rows = await db
    .update(socialPublicationsTable)
    .set({ status: "cancelled", lastError: reason, updatedAt: new Date() })
    .where(
      and(
        inArray(socialPublicationsTable.tenantId, tenantIds),
        inArray(socialPublicationsTable.status, OPEN_STATUSES),
      ),
    )
    .returning({ id: socialPublicationsTable.id });
  return rows.length;
}

/** Hold every scheduled publication while the club needs to reconnect (R16). */
export async function holdScheduled(tenantId: number): Promise<number> {
  const rows = await db
    .update(socialPublicationsTable)
    .set({ status: "held", leaseUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(socialPublicationsTable.tenantId, tenantId),
        eq(socialPublicationsTable.status, "scheduled"),
      ),
    )
    .returning({ id: socialPublicationsTable.id });
  return rows.length;
}

export async function freshnessHours(tenantId: number): Promise<number> {
  const [row] = await db
    .select({ hours: socialSettingsTable.autoPublishFreshnessHours })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return row?.hours ?? 24;
}

export const TOO_LATE_REASON = "Held while Meta needed reconnecting, and now too late to post.";

/**
 * After a reconnect (R16): held posts whose time is within the freshness
 * cut-off go back to scheduled for the next run; older ones are cancelled and
 * their drafts stay ready.
 */
export async function releaseHeld(
  tenantId: number,
  now: Date = new Date(),
): Promise<{ resumed: number; cancelled: number }> {
  const cutoff = new Date(now.getTime() - (await freshnessHours(tenantId)) * 3_600_000);
  const held = and(
    eq(socialPublicationsTable.tenantId, tenantId),
    eq(socialPublicationsTable.status, "held"),
  );
  const cancelled = await db
    .update(socialPublicationsTable)
    .set({ status: "cancelled", lastError: TOO_LATE_REASON, updatedAt: now })
    .where(and(held, lt(socialPublicationsTable.scheduledFor, cutoff)))
    .returning({ id: socialPublicationsTable.id });
  const resumed = await db
    .update(socialPublicationsTable)
    .set({ status: "scheduled", nextAttemptAt: now, updatedAt: now })
    .where(held)
    .returning({ id: socialPublicationsTable.id });
  return { resumed: resumed.length, cancelled: cancelled.length };
}

/** Drop every pending Page choice that has expired. */
export async function purgeExpiredPending(now: Date = new Date()): Promise<void> {
  await db
    .delete(socialConnectionPendingTable)
    .where(lt(socialConnectionPendingTable.expiresAt, now));
}
