import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, notificationsTable, type NotificationRow } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";

/**
 * `/notifications` — the admin bell (Social Studio KTD5): the club's recent
 * notifications with an unread count; opening the bell marks them read.
 */
const router: IRouter = Router();

const RECENT = 20;

function present(n: NotificationRow) {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  };
}

async function list(tenantId: number) {
  const [items, [unread]] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.tenantId, tenantId))
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(RECENT),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.tenantId, tenantId), isNull(notificationsTable.readAt))),
  ]);
  return { unreadCount: Number(unread?.count ?? 0), items: items.map(present) };
}

router.get("/notifications", requireAdmin, async (req, res): Promise<void> => {
  res.json(await list(getTenantId(req)));
});

router.post("/notifications/read", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.tenantId, tenantId), isNull(notificationsTable.readAt)));
  res.json(await list(tenantId));
});

export default router;
