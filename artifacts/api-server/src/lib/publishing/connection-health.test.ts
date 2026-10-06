/**
 * The daily Meta connection check (plan 2026-10-06-001 U8). Real-DB
 * integration test (needs DATABASE_URL); the destination is faked.
 */
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  socialDraftsTable,
  socialConnectionsTable,
  socialConnectionPendingTable,
  socialPublicationsTable,
  notificationsTable,
} from "@workspace/db";
import { seal } from "../secret-box";
import { logger } from "../logger";
import { setDestination } from "./meta-adapter";
import { DestinationError, type Destination } from "./destination";
import { checkConnectionHealth, HEALTH_CHECK_INTERVAL_MS } from "./connection-health";

const STAMP = Date.now();
const saved = { ...process.env };
let tenantId: number;
let health: Destination["checkHealth"];
let checks = 0;

const fake: Destination = {
  createMedia: async () => [],
  publish: async () => ({ kind: "processing" }),
  findLanded: async () => null,
  checkHealth: async (a) => {
    checks++;
    return health(a);
  },
};

const connection = async () =>
  (
    await db
      .select()
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.tenantId, tenantId))
  )[0];
const reconnectNotices = async () =>
  db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.tenantId, tenantId),
        eq(notificationsTable.kind, "reconnect_needed"),
      ),
    );

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `health-${STAMP}`, centralClubId: 98408, name: "Health", plan: "pro" })
    .returning();
  tenantId = t.id;
});

afterAll(async () => {
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialPublicationsTable).where(eq(socialPublicationsTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db
    .delete(socialConnectionPendingTable)
    .where(eq(socialConnectionPendingTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

beforeEach(async () => {
  process.env.META_PUBLISHING_ENABLED = "1";
  process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
  setDestination(fake);
  checks = 0;
  health = async () => ({ ok: true });
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  await db.insert(socialConnectionsTable).values({
    tenantId,
    status: "connected",
    pageId: "page-1",
    pageToken: seal("EAAHealthCheckPageToken1"),
    lastHealthCheckAt: new Date(Date.now() - HEALTH_CHECK_INTERVAL_MS - 1000),
  });
});

afterEach(() => {
  setDestination(null);
  process.env = { ...saved };
});

describe("checkConnectionHealth", () => {
  it("records a healthy check and skips again within a day", async () => {
    const now = new Date();
    expect(await checkConnectionHealth(tenantId, now, logger)).toBe("healthy");
    expect((await connection()).lastHealthCheckAt?.getTime()).toBe(now.getTime());
    expect(await checkConnectionHealth(tenantId, new Date(now.getTime() + 60_000), logger)).toBe(
      "skipped",
    );
    expect(checks).toBe(1);
  });

  it("flips a revoked connection, holds scheduled posts, and notifies once", async () => {
    const [d] = await db
      .insert(socialDraftsTable)
      .values({ tenantId, engine: "adhoc", status: "ready", cardInput: {} })
      .returning();
    const [p] = await db
      .insert(socialPublicationsTable)
      .values({
        tenantId,
        draftId: d.id,
        platform: "facebook",
        scheduledFor: new Date(Date.now() + 3_600_000),
        nextAttemptAt: new Date(Date.now() + 3_600_000),
      })
      .returning();
    health = async () => ({ ok: false, reason: "Meta access was revoked or expired." });
    expect(await checkConnectionHealth(tenantId, new Date(), logger)).toBe("needs_reconnect");
    expect(await connection()).toMatchObject({
      status: "needs_reconnect",
      statusReason: "Meta access was revoked or expired.",
    });
    const [held] = await db
      .select()
      .from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.id, p.id));
    expect(held.status).toBe("held");
    expect(await reconnectNotices()).toHaveLength(1);

    // Already needs reconnecting: nothing more to check, no second notice.
    expect(
      await checkConnectionHealth(
        tenantId,
        new Date(Date.now() + 2 * HEALTH_CHECK_INTERVAL_MS),
        logger,
      ),
    ).toBe("skipped");
    expect(await reconnectNotices()).toHaveLength(1);
  });

  it("flips on a removed permission with that reason", async () => {
    health = async () => ({ ok: false, reason: "A required Meta permission was removed." });
    await checkConnectionHealth(tenantId, new Date(), logger);
    expect((await connection()).statusReason).toBe("A required Meta permission was removed.");
  });

  it("leaves the connection alone when Meta is down", async () => {
    health = async () => {
      throw new DestinationError("transient", "Meta responded 503");
    };
    expect(await checkConnectionHealth(tenantId, new Date(), logger)).toBe("unknown");
    expect((await connection()).status).toBe("connected");
  });

  it("purges expired pending Page choices", async () => {
    await db.insert(socialConnectionPendingTable).values({
      tenantId,
      adminId: 1,
      metaUserId: "mu",
      pages: [],
      expiresAt: new Date(Date.now() - 1000),
    });
    await checkConnectionHealth(tenantId, new Date(), logger);
    const left = await db
      .select()
      .from(socialConnectionPendingTable)
      .where(eq(socialConnectionPendingTable.tenantId, tenantId));
    expect(left).toHaveLength(0);
  });

  it("does nothing while publishing is off", async () => {
    process.env.META_PUBLISHING_ENABLED = "0";
    expect(await checkConnectionHealth(tenantId, new Date(), logger)).toBe("skipped");
    expect(checks).toBe(0);
  });
});
