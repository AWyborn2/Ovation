import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  socialPublicationsTable,
  milestoneEventsTable,
  type SocialPublicationRow,
} from "@workspace/db";
import type { Platform, PostType } from "./destination";

/**
 * Publications: one row per draft, platform and post type (plan 2026-10-06-001
 * KTD4). Their lifecycle:
 *
 *   scheduled → publishing → published
 *   scheduled ⇄ held          (club needs to reconnect Meta)
 *   publishing → scheduled    (transient retry, or Instagram still processing)
 *   publishing → failed       (permanent, or attempts exhausted) → scheduled on retry
 *   scheduled | held → cancelled
 *
 * A draft becomes posted when every non-cancelled publication is published.
 */

export const OPEN_STATUSES = ["scheduled", "held", "publishing"] as const;

export type PublicationView = {
  id: number;
  draftId: number;
  platform: Platform;
  postType: PostType;
  status: SocialPublicationRow["status"];
  origin: string;
  scheduledFor: string;
  attempts: number;
  lastError: string | null;
  publishedAt: string | null;
};

export function viewPublication(row: SocialPublicationRow): PublicationView {
  return {
    id: row.id,
    draftId: row.draftId,
    platform: row.platform as Platform,
    postType: row.postType as PostType,
    status: row.status,
    origin: row.origin,
    scheduledFor: row.scheduledFor.toISOString(),
    attempts: row.attempts,
    lastError: row.lastError,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/** The newest row per platform and post type, so retried history doesn't repeat. */
export function latestPerSlot(rows: SocialPublicationRow[]): SocialPublicationRow[] {
  const bySlot = new Map<string, SocialPublicationRow>();
  for (const r of [...rows].sort((a, b) => a.id - b.id))
    bySlot.set(`${r.platform}:${r.postType}`, r);
  return [...bySlot.values()];
}

/**
 * Needs attention (R18): something failed for good and nothing else for the
 * draft is still on its way.
 */
export function needsAttention(rows: SocialPublicationRow[]): boolean {
  const latest = latestPerSlot(rows);
  return (
    latest.some((r) => r.status === "failed") &&
    !latest.some((r) => (OPEN_STATUSES as readonly string[]).includes(r.status))
  );
}

/** Publications for many drafts at once, grouped by draft id. */
export async function publicationsByDraft(
  tenantId: number,
  draftIds: number[],
): Promise<Map<number, SocialPublicationRow[]>> {
  const map = new Map<number, SocialPublicationRow[]>();
  if (draftIds.length === 0) return map;
  const rows = await db
    .select()
    .from(socialPublicationsTable)
    .where(
      and(
        eq(socialPublicationsTable.tenantId, tenantId),
        inArray(socialPublicationsTable.draftId, draftIds),
      ),
    );
  for (const r of rows) {
    const list = map.get(r.draftId) ?? [];
    list.push(r);
    map.set(r.draftId, list);
  }
  return map;
}

/** The API's view of a draft's publications. */
export function draftPublishing(rows: SocialPublicationRow[] | undefined): {
  publications: PublicationView[];
  needsAttention: boolean;
} {
  const list = rows ?? [];
  return {
    publications: latestPerSlot(list)
      .sort((a, b) => a.id - b.id)
      .map(viewPublication),
    needsAttention: needsAttention(list),
  };
}

/** Cancel a draft's scheduled and held publications (R13). */
export async function cancelDraftPublications(
  tenantId: number,
  draftId: number,
  reason: string,
  statuses: string[] = ["scheduled", "held"],
): Promise<number> {
  const rows = await db
    .update(socialPublicationsTable)
    .set({ status: "cancelled", lastError: reason, updatedAt: new Date() })
    .where(
      and(
        eq(socialPublicationsTable.tenantId, tenantId),
        eq(socialPublicationsTable.draftId, draftId),
        inArray(socialPublicationsTable.status, statuses),
      ),
    )
    .returning({ id: socialPublicationsTable.id });
  return rows.length;
}

export class ScheduleConflictError extends Error {
  readonly status = 409;
}

/**
 * Create one scheduled publication per platform and post type. A slot that
 * already has an open or published row is a conflict (no reposting).
 */
export async function schedulePublications(input: {
  tenantId: number;
  draftId: number;
  platforms: Platform[];
  postTypes: PostType[];
  at: Date;
  origin: "manual" | "auto";
}): Promise<SocialPublicationRow[]> {
  const values = input.platforms.flatMap((platform) =>
    input.postTypes.map((postType) => ({
      tenantId: input.tenantId,
      draftId: input.draftId,
      platform,
      postType,
      origin: input.origin,
      status: "scheduled",
      scheduledFor: input.at,
      nextAttemptAt: input.at,
    })),
  );
  if (values.length === 0) return [];
  try {
    return await db.insert(socialPublicationsTable).values(values).returning();
  } catch (err) {
    const code =
      (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") {
      throw new ScheduleConflictError("That post is already scheduled or published.");
    }
    throw err;
  }
}

/**
 * When every non-cancelled publication of a draft is published, the draft is
 * posted — through the same stamps as "Mark posted" (milestone postedAt).
 * Returns whether it moved.
 */
export async function postDraftIfDone(tenantId: number, draftId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(socialPublicationsTable)
    .where(
      and(
        eq(socialPublicationsTable.tenantId, tenantId),
        eq(socialPublicationsTable.draftId, draftId),
        ne(socialPublicationsTable.status, "cancelled"),
      ),
    );
  // A failed row that a retry superseded isn't the latest for its slot.
  const latest = latestPerSlot(rows);
  if (latest.length === 0 || !latest.every((r) => r.status === "published")) return false;

  const [updated] = await db
    .update(socialDraftsTable)
    .set({ status: "posted", reviewedAt: new Date() })
    .where(
      and(
        eq(socialDraftsTable.id, draftId),
        eq(socialDraftsTable.tenantId, tenantId),
        notInArray(socialDraftsTable.status, ["posted", "dismissed"]),
      ),
    )
    .returning();
  if (updated?.milestoneEventId) {
    await db
      .update(milestoneEventsTable)
      .set({ postedAt: new Date() })
      .where(
        and(
          eq(milestoneEventsTable.id, updated.milestoneEventId),
          eq(milestoneEventsTable.tenantId, tenantId),
        ),
      );
  }
  return !!updated;
}
