import { db, notificationsTable, type NotificationRow } from "@workspace/db";
import { env } from "../config";
import { sendEmail } from "./integrations/email";
import { enqueueAssetReady, kickOutbox, socialListAddresses } from "./email-outbox";
import { clubLink } from "./tenant-origin";

type Logger = { warn: (obj: unknown, msg?: string) => void };

/**
 * One notification per batch of drafts that became ready (KTD5): the in-app
 * row is authoritative and written first. Email goes through the club's social
 * lists (email-distribution-lists PR2): each card is queued as an "asset ready"
 * send for every list with that toggle on, and never blocks.
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

  try {
    const queued = await enqueueAssetReady(db, {
      tenantId,
      draftIds,
      origin: env.RENDER_HARNESS_ORIGIN() ?? null,
    });
    if (queued > 0) kickOutbox(tenantId, logger);
  } catch (err) {
    logger.warn({ tenantId, err }, "draft-ready emails not queued");
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
 * One in-app notice, echoed by email (best-effort, bcc'd) to the members of
 * the club's active social lists, which replaced the single
 * social_settings.notification_email address (migration 0056 copied it into a
 * "Social media" list; the column stays readable for one release). Shared by the Meta publishing notices (plan 2026-10-06-001):
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
  const recipients = await socialListAddresses(tenantId);
  const from = env.EMAIL_FROM();
  if (recipients.length > 0 && from) {
    const result = await sendEmail({
      to: from,
      bcc: recipients,
      subject: notice.title,
      // The in-app link is a path; the email needs it on the club's own app.
      text: `${notice.body}\n\n${await clubLink(tenantId, notice.link, env.RENDER_HARNESS_ORIGIN() ?? null)}`,
    });
    if (!result.sent && result.reason === "failed") {
      logger.warn({ tenantId, error: result.error }, `${notice.kind} email failed`);
    }
  }
  return row;
}
