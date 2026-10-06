import { and, asc, eq, inArray, lt, lte, or } from "drizzle-orm";
import {
  db,
  socialConnectionsTable,
  socialDraftsTable,
  socialPublicationsTable,
  type SocialConnectionRow,
  type SocialPublicationRow,
} from "@workspace/db";
import { env } from "../../config";
import { notifyClub } from "../draft-notifications";
import { accountFor, holdScheduled, loadConnection } from "./connections";
import { DestinationError, type DestinationAccount, type PreparedPost } from "./destination";
import { destination } from "./meta-adapter";
import { captionFor, prepareMedia, removeImages } from "./prepare-media";
import { postDraftIfDone } from "./publications";
import { logger as appLogger } from "../logger";
import type { Platform, PostType } from "./destination";

/**
 * The publish worker (plan 2026-10-06-001 U6, KTD5, KTD6, KTD6a, KTD10).
 *
 * Each run claims due publications with a guarded update, so concurrent runs
 * never process one twice, then for each:
 *
 *  1. club not connected → held (no Meta call, R16);
 *  2. ids from an earlier attempt → "did it land?" first (R11, AE7);
 *  3. no ids yet → render at publish time, upload without going live, and
 *     persist the ids before anything else;
 *  4. publish: Facebook at once; Instagram once its containers are FINISHED,
 *     otherwise released to check again next run (five minutes max);
 *  5. errors by class: transient retries at 5, 15 and 45 minutes, a token
 *     error holds the club's posts and asks for a reconnect, a duplicate runs
 *     the landed-check, anything else fails with Meta's reason.
 *
 * Images are deleted once a post is finished with them; a draft becomes
 * posted when every post it was scheduled for is published.
 */

export const LEASE_MS = 10 * 60 * 1000;
export const RUN_LIMIT = 20;
export const BACKOFF_MS = [5, 15, 45].map((m) => m * 60 * 1000);
/** Attempts before a transient failure becomes final: the first plus three retries. */
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
/** How soon to look again at an Instagram container still processing. */
export const PROCESSING_RECHECK_MS = 60 * 1000;
/** How long Instagram may take to process media before that counts as a failed attempt. */
export const PROCESSING_WINDOW_MS = 5 * 60 * 1000;

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export type PublishRunSummary = {
  skipped?: boolean;
  claimed: number;
  published: number;
  failed: number;
  held: number;
  waiting: number;
};

type Outcome = "published" | "failed" | "held" | "waiting" | "retry" | "cancelled";

let running: Promise<PublishRunSummary> | null = null;

/** One run at a time per process; a second call while one runs is a no-op. */
export async function runPublishSweep(
  opts: { tenantId?: number; now?: Date; limit?: number },
  log: Logger,
): Promise<PublishRunSummary> {
  if (!env.metaPublishingEnabled()) {
    return { skipped: true, claimed: 0, published: 0, failed: 0, held: 0, waiting: 0 };
  }
  if (running) {
    return { skipped: true, claimed: 0, published: 0, failed: 0, held: 0, waiting: 0 };
  }
  running = runOnce(opts, log);
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function claimDue(now: Date, limit: number, tenantId?: number) {
  const due = or(
    and(
      eq(socialPublicationsTable.status, "scheduled"),
      lte(socialPublicationsTable.nextAttemptAt, now),
    ),
    and(
      eq(socialPublicationsTable.status, "publishing"),
      lt(socialPublicationsTable.leaseUntil, now),
    ),
  );
  const scope = tenantId != null ? and(due, eq(socialPublicationsTable.tenantId, tenantId)) : due;
  const candidates = await db
    .select({ id: socialPublicationsTable.id })
    .from(socialPublicationsTable)
    .where(scope)
    .orderBy(asc(socialPublicationsTable.nextAttemptAt))
    .limit(limit);
  if (candidates.length === 0) return [];
  // Re-check the due condition in the UPDATE: a concurrent run that claimed a
  // row first leaves it `publishing` with a fresh lease, so it no longer matches.
  return db
    .update(socialPublicationsTable)
    .set({ status: "publishing", leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now })
    .where(
      and(
        inArray(
          socialPublicationsTable.id,
          candidates.map((c) => c.id),
        ),
        scope,
      ),
    )
    .returning();
}

async function runOnce(
  opts: { tenantId?: number; now?: Date; limit?: number },
  log: Logger,
): Promise<PublishRunSummary> {
  const now = opts.now ?? new Date();
  const claimed = await claimDue(now, opts.limit ?? RUN_LIMIT, opts.tenantId);
  const summary: PublishRunSummary = {
    claimed: claimed.length,
    published: 0,
    failed: 0,
    held: 0,
    waiting: 0,
  };

  const byTenant = new Map<number, SocialPublicationRow[]>();
  for (const row of claimed) {
    byTenant.set(row.tenantId, [...(byTenant.get(row.tenantId) ?? []), row]);
  }

  for (const [tenantId, rows] of byTenant) {
    const published: SocialPublicationRow[] = [];
    const failed: SocialPublicationRow[] = [];
    let connection = await loadConnection(tenantId);
    for (const row of rows) {
      let outcome: Outcome;
      try {
        outcome = await processOne(row, connection, now, log);
      } catch (err) {
        log.error({ err, publicationId: row.id }, "publish worker crashed on a row");
        outcome = await recordFailure(row, err, now);
      }
      if (outcome === "published") {
        summary.published++;
        published.push(row);
      } else if (outcome === "failed") {
        summary.failed++;
        failed.push(row);
      } else if (outcome === "held") {
        summary.held++;
        // A token error flips the connection; the rest of this club's rows wait.
        connection = await loadConnection(tenantId);
      } else if (outcome === "waiting" || outcome === "retry") {
        summary.waiting++;
      }
    }
    await notifyOutcomes(tenantId, published, failed, log);
  }
  return summary;
}

function postFor(row: SocialPublicationRow, caption: string | null): PreparedPost {
  return {
    platform: row.platform as Platform,
    postType: row.postType as PostType,
    imageUrls: [],
    caption,
  };
}

async function update(row: SocialPublicationRow, set: Partial<SocialPublicationRow>) {
  await db
    .update(socialPublicationsTable)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(socialPublicationsTable.id, row.id));
}

async function markPublished(row: SocialPublicationRow, postId: string, now: Date) {
  await update(row, {
    status: "published",
    externalPostId: postId,
    publishedAt: now,
    leaseUntil: null,
    lastError: null,
    imagePaths: [],
  });
  await removeImages(row.imagePaths);
  await postDraftIfDone(row.tenantId, row.draftId);
}

async function processOne(
  row: SocialPublicationRow,
  connection: SocialConnectionRow | null,
  now: Date,
  log: Logger,
): Promise<Outcome> {
  const [draft] = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(eq(socialDraftsTable.id, row.draftId), eq(socialDraftsTable.tenantId, row.tenantId)),
    );
  if (!draft || draft.status === "dismissed") {
    await update(row, { status: "cancelled", leaseUntil: null, lastError: "The draft is gone." });
    await removeImages(row.imagePaths);
    return "cancelled";
  }

  const account: DestinationAccount | null = connection ? accountFor(connection) : null;
  if (!account) {
    await update(row, { status: "held", leaseUntil: null });
    return "held";
  }
  const dest = destination();
  const caption = await captionFor(draft, row.platform as Platform, row.postType as PostType);

  try {
    let mediaIds = row.mediaIds;
    if (mediaIds.length > 0) {
      const landed = await dest.findLanded(account, postFor(row, caption), mediaIds);
      if (landed) {
        await markPublished(row, landed, now);
        return "published";
      }
    } else {
      const prepared = await prepareMedia(
        draft,
        row.platform as Platform,
        row.postType as PostType,
        appLogger,
      );
      try {
        mediaIds = await dest.createMedia(account, prepared.post);
      } catch (err) {
        await removeImages(prepared.imagePaths);
        throw err;
      }
      // Persist before anything can go live, so a retry can always check (KTD6).
      await update(row, {
        mediaIds,
        mediaCreatedAt: now,
        imagePaths: prepared.imagePaths,
      });
      row = { ...row, mediaIds, mediaCreatedAt: now, imagePaths: prepared.imagePaths };
    }

    const outcome = await dest.publish(account, postFor(row, caption), mediaIds);
    if (outcome.kind === "processing") {
      // Five minutes from creating the media (KTD6a), then it counts as a
      // failed attempt and the next one starts with fresh media.
      if (
        row.mediaCreatedAt &&
        now.getTime() - row.mediaCreatedAt.getTime() > PROCESSING_WINDOW_MS
      ) {
        throw new DestinationError(
          "transient",
          "Instagram took too long to process the image.",
          undefined,
          true,
        );
      }
      await update(row, {
        status: "scheduled",
        nextAttemptAt: new Date(now.getTime() + PROCESSING_RECHECK_MS),
        leaseUntil: null,
      });
      return "waiting";
    }
    await markPublished(row, outcome.postId, now);
    return "published";
  } catch (err) {
    if (err instanceof DestinationError && err.kind === "token") {
      await needsReconnect(row.tenantId, err.message, log);
      await update(row, { status: "held", leaseUntil: null, lastError: err.message });
      return "held";
    }
    if (err instanceof DestinationError && err.kind === "duplicate" && row.mediaIds.length) {
      const landed = await dest.findLanded(account, postFor(row, caption), row.mediaIds);
      if (landed) {
        await markPublished(row, landed, now);
        return "published";
      }
    }
    return recordFailure(row, err, now);
  }
}

/** Transient → retry with backoff until attempts run out; anything else fails now. */
async function recordFailure(row: SocialPublicationRow, err: unknown, now: Date): Promise<Outcome> {
  const isDest = err instanceof DestinationError;
  // A render or network crash outside Meta is worth another go.
  const transient = !isDest || err.kind === "transient";
  const message = isDest ? err.message : "Something went wrong preparing the post.";
  const attempts = row.attempts + 1;
  const resetMedia = isDest && err.resetMedia;

  if (transient && attempts < MAX_ATTEMPTS) {
    await update(row, {
      status: "scheduled",
      attempts,
      lastError: message,
      leaseUntil: null,
      nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[attempts - 1]),
      ...(resetMedia ? { mediaIds: [], mediaCreatedAt: null, imagePaths: [] } : {}),
    });
    if (resetMedia) await removeImages(row.imagePaths);
    return "retry";
  }
  // Final. A permanent error means nothing went live, so the media can go; a
  // transient one keeps its ids so a retry checks whether it landed first.
  const clear = !transient || resetMedia;
  await update(row, {
    status: "failed",
    attempts,
    lastError: message,
    leaseUntil: null,
    ...(clear ? { mediaIds: [], mediaCreatedAt: null, imagePaths: [] } : {}),
  });
  if (clear) await removeImages(row.imagePaths);
  return "failed";
}

/** Flip the connection, hold the club's scheduled posts, tell the club once. */
async function needsReconnect(tenantId: number, reason: string, log: Logger): Promise<void> {
  const flipped = await db
    .update(socialConnectionsTable)
    .set({ status: "needs_reconnect", statusReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(socialConnectionsTable.tenantId, tenantId),
        eq(socialConnectionsTable.status, "connected"),
      ),
    )
    .returning({ id: socialConnectionsTable.id });
  await holdScheduled(tenantId);
  if (flipped.length > 0) {
    await notifyReconnectNeeded(tenantId, reason, log);
  }
}

export async function notifyReconnectNeeded(
  tenantId: number,
  reason: string,
  log: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  await notifyClub(
    tenantId,
    {
      kind: "reconnect_needed",
      title: "Reconnect Facebook and Instagram",
      body: `${reason} Scheduled posts are on hold until you reconnect.`,
      link: "/admin/social/cards",
    },
    log,
  );
}

async function notifyOutcomes(
  tenantId: number,
  published: SocialPublicationRow[],
  failed: SocialPublicationRow[],
  log: Logger,
): Promise<void> {
  try {
    if (published.length) {
      const n = published.length;
      const draftIds = [...new Set(published.map((p) => p.draftId))];
      await notifyClub(
        tenantId,
        {
          kind: "published",
          title: n === 1 ? "1 post published" : `${n} posts published`,
          body: "Your scheduled cards went out to Facebook and Instagram.",
          link: `/admin/social/queue?ids=${draftIds.join(",")}`,
          payload: { draftIds, publicationIds: published.map((p) => p.id) },
        },
        log,
      );
    }
    if (failed.length) {
      const n = failed.length;
      const draftIds = [...new Set(failed.map((p) => p.draftId))];
      await notifyClub(
        tenantId,
        {
          kind: "publish_failed",
          title: n === 1 ? "1 post couldn't be published" : `${n} posts couldn't be published`,
          body: "Open the queue to see why and try again.",
          link: `/admin/social/queue?ids=${draftIds.join(",")}`,
          payload: { draftIds, publicationIds: failed.map((p) => p.id) },
        },
        log,
      );
    }
  } catch (err) {
    log.warn({ err, tenantId }, "publish notifications failed");
  }
}
