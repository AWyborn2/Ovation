import { eq } from "drizzle-orm";
import { db, notificationsTable, socialSettingsTable, type NotificationRow } from "@workspace/db";
import { sendEmail } from "./integrations/email";

type Logger = { warn: (obj: unknown, msg?: string) => void };

/**
 * One notification per batch of drafts that became ready (KTD5): the in-app
 * row is authoritative and written first; the email to the club's
 * notification address is a best-effort echo that never blocks.
 */
export async function notifyDraftsReady(
  tenantId: number,
  draftIds: number[],
  logger: Logger,
): Promise<NotificationRow | null> {
  if (draftIds.length === 0) return null;
  const n = draftIds.length;
  const title = n === 1 ? "1 card is ready to post" : `${n} cards are ready to post`;
  const body =
    "Their review window ended, so they moved to Ready. Open the queue to download and share them.";
  const link = `/admin/social/queue?ids=${draftIds.join(",")}`;
  const [row] = await db
    .insert(notificationsTable)
    .values({ tenantId, kind: "drafts_ready", title, body, link, payload: { draftIds } })
    .returning();

  const [settings] = await db
    .select({ email: socialSettingsTable.notificationEmail })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  if (settings?.email) {
    const result = await sendEmail({
      to: settings.email,
      subject: title,
      text: `${body}\n\n${link}`,
    });
    if (!result.sent && result.reason === "failed") {
      logger.warn({ tenantId, error: result.error }, "draft-ready email failed");
    }
  }
  return row;
}

/**
 * Posting calendar (plan 2026-10-07-003, KTD12): at most one notice of each
 * kind per club per run.
 *
 *  - `posts_due`: cards whose planned time arrived and that the club shares by
 *    hand (Meta publishing off, or a junior card) — the ready-to-share nudge.
 *  - `cards_rolled`: cards still waiting for approval at their time, rolled to
 *    a later slot, or (pinned by an admin) left in place as overdue.
 */
export async function notifyPostsDue(
  tenantId: number,
  draftIds: number[],
  logger: Logger,
): Promise<NotificationRow | null> {
  if (draftIds.length === 0) return null;
  const n = draftIds.length;
  return notifyClub(
    tenantId,
    {
      kind: "posts_due",
      title: n === 1 ? "1 card is due to share now" : `${n} cards are due to share now`,
      body: "It's their posting time. Open the queue to share them, then mark them posted.",
      link: `/admin/social/queue?ids=${draftIds.join(",")}`,
      payload: { draftIds },
    },
    logger,
  );
}

export async function notifyCardsNeedApproval(
  tenantId: number,
  rolled: number[],
  overdue: number[],
  logger: Logger,
): Promise<NotificationRow | null> {
  const draftIds = [...rolled, ...overdue];
  if (draftIds.length === 0) return null;
  const n = draftIds.length;
  const parts = [
    rolled.length ? `${rolled.length} moved to their next posting time` : "",
    overdue.length ? `${overdue.length} kept the time you chose and are overdue` : "",
  ].filter(Boolean);
  return notifyClub(
    tenantId,
    {
      kind: "cards_rolled",
      title: n === 1 ? "1 card needs approving" : `${n} cards need approving`,
      body: `Their posting time came before anyone approved them: ${parts.join("; ")}.`,
      link: `/admin/social/queue?ids=${draftIds.join(",")}`,
      payload: { rolled, overdue },
    },
    logger,
  );
}

/**
 * One in-app notice, echoed by email to the club's notification address
 * (best-effort). Shared by the Meta publishing notices (plan 2026-10-06-001):
 * posts published, posts that failed for good, and a connection that needs
 * reconnecting.
 */
export async function notifyClub(
  tenantId: number,
  notice: {
    kind: "published" | "publish_failed" | "reconnect_needed" | "posts_due" | "cards_rolled";
    title: string;
    body: string;
    link: string;
    payload?: Record<string, unknown>;
  },
  logger: Logger,
): Promise<NotificationRow> {
  const [row] = await db
    .insert(notificationsTable)
    .values({ tenantId, ...notice, payload: notice.payload ?? {} })
    .returning();
  const [settings] = await db
    .select({ email: socialSettingsTable.notificationEmail })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  if (settings?.email) {
    const result = await sendEmail({
      to: settings.email,
      subject: notice.title,
      text: `${notice.body}\n\n${notice.link}`,
    });
    if (!result.sent && result.reason === "failed") {
      logger.warn({ tenantId, error: result.error }, `${notice.kind} email failed`);
    }
  }
  return row;
}
