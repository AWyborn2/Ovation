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
