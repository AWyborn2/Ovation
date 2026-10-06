import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, socialDraftsTable, socialPublicationsTable } from "@workspace/db";
import { RescheduleSocialPublicationBody, ScheduleDraftPublicationsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { effectiveDraftStatus, loadAutoPost } from "../lib/effective-draft-state";
import { clubTimeToUtc } from "../lib/round-schedules";
import { loadConnection, publishingAvailable } from "../lib/publishing/connections";
import {
  ScheduleConflictError,
  schedulePublications,
  viewPublication,
} from "../lib/publishing/publications";
import type { Platform, PostType } from "../lib/publishing/destination";

/**
 * The officer's publishing controls (plan 2026-10-06-001 U5, R3, R8, R17):
 * schedule a ready draft to Facebook and/or Instagram as a feed post, a Story
 * or both, at a club-local time or now; move, cancel or retry one post.
 * Every lookup is scoped to the request's tenant.
 */
const router: IRouter = Router();

const guard = [requireAdmin, requireEntitlement("socialPublishing")];
/** A time this far in the past still counts as "now" (clock skew, slow forms). */
const PAST_GRACE_MS = 5 * 60 * 1000;

function parseId(raw: unknown): number | null {
  const id = Number.parseInt(String(raw), 10);
  return Number.isInteger(id) ? id : null;
}

function parseAt(at: string | undefined, now: Date): Date | "invalid" | "past" {
  if (at === undefined) return now;
  const when = clubTimeToUtc(at);
  if (!when) return "invalid";
  if (when.getTime() < now.getTime() - PAST_GRACE_MS) return "past";
  return when.getTime() < now.getTime() ? now : when;
}

async function loadPublication(req: Request) {
  const id = parseId(req.params.id);
  if (id === null) return null;
  const [row] = await db
    .select()
    .from(socialPublicationsTable)
    .where(
      and(
        eq(socialPublicationsTable.id, id),
        eq(socialPublicationsTable.tenantId, getTenantId(req)),
      ),
    );
  return row ?? null;
}

router.post("/social-drafts/:id/publications", ...guard, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ScheduleDraftPublicationsBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [draft] = await db
    .select()
    .from(socialDraftsTable)
    .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)));
  if (!draft) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (effectiveDraftStatus(draft, await loadAutoPost(tenantId)) !== "ready") {
    res.status(409).json({ error: "Only a ready draft can be scheduled." });
    return;
  }
  const connection = await loadConnection(tenantId);
  if (!(await publishingAvailable(tenantId)) || connection?.status !== "connected") {
    res.status(409).json({ error: "Connect Facebook and Instagram first." });
    return;
  }
  const connected: Platform[] = connection.igUserId ? ["facebook", "instagram"] : ["facebook"];
  const platforms = [...new Set(parsed.data.platforms ?? connected)] as Platform[];
  const missing = platforms.filter((p) => !connected.includes(p));
  if (missing.length || platforms.length === 0) {
    res.status(409).json({
      error: platforms.length ? "No Instagram account is linked to this Page." : "Pick a platform.",
    });
    return;
  }
  const postTypes = [...new Set(parsed.data.postTypes ?? ["feed"])] as PostType[];
  if (postTypes.length === 0) {
    res.status(400).json({ error: "Pick feed, story or both." });
    return;
  }
  const at = parseAt(parsed.data.at, new Date());
  if (at === "invalid") {
    res.status(400).json({ error: "Time must be YYYY-MM-DDTHH:mm in club time." });
    return;
  }
  if (at === "past") {
    res.status(400).json({ error: "That time has already passed." });
    return;
  }
  try {
    const rows = await schedulePublications({
      tenantId,
      draftId: id,
      platforms,
      postTypes,
      at,
      origin: "manual",
    });
    res.json(rows.map(viewPublication));
  } catch (err) {
    if (err instanceof ScheduleConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/social-publications/:id/reschedule", ...guard, async (req, res): Promise<void> => {
  const row = await loadPublication(req);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = RescheduleSocialPublicationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const at = parseAt(parsed.data.at, new Date());
  if (at === "invalid" || at === "past") {
    res.status(400).json({
      error: at === "past" ? "That time has already passed." : "Time must be YYYY-MM-DDTHH:mm.",
    });
    return;
  }
  const [updated] = await db
    .update(socialPublicationsTable)
    .set({ scheduledFor: at, nextAttemptAt: at, updatedAt: new Date() })
    .where(
      and(eq(socialPublicationsTable.id, row.id), eq(socialPublicationsTable.status, "scheduled")),
    )
    .returning();
  if (!updated) {
    res.status(409).json({ error: "Only a scheduled post can be moved." });
    return;
  }
  res.json(viewPublication(updated));
});

router.post("/social-publications/:id/cancel", ...guard, async (req, res): Promise<void> => {
  const row = await loadPublication(req);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [updated] = await db
    .update(socialPublicationsTable)
    .set({ status: "cancelled", lastError: "Cancelled by the club.", updatedAt: new Date() })
    .where(
      and(
        eq(socialPublicationsTable.id, row.id),
        // Only rows that haven't started; a publishing row may already be live.
        eq(socialPublicationsTable.status, row.status === "held" ? "held" : "scheduled"),
      ),
    )
    .returning();
  if (!updated) {
    res.status(409).json({ error: "It's already publishing or finished." });
    return;
  }
  res.json(viewPublication(updated));
});

router.post("/social-publications/:id/retry", ...guard, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const row = await loadPublication(req);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if ((await loadConnection(tenantId))?.status !== "connected") {
    res.status(409).json({ error: "Reconnect Facebook and Instagram first." });
    return;
  }
  const now = new Date();
  let updated;
  try {
    [updated] = await db
      .update(socialPublicationsTable)
      .set({
        status: "scheduled",
        attempts: 0,
        lastError: null,
        scheduledFor: now,
        nextAttemptAt: now,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(
        and(eq(socialPublicationsTable.id, row.id), eq(socialPublicationsTable.status, "failed")),
      )
      .returning();
  } catch (err) {
    // The slot already has a newer scheduled or published post.
    if ((err as { cause?: { code?: string }; code?: string }).code === "23505") {
      res.status(409).json({ error: "That post is already scheduled or published." });
      return;
    }
    throw err;
  }
  if (!updated) {
    res.status(409).json({ error: "Only a failed post can be retried." });
    return;
  }
  res.json(viewPublication(updated));
});

export default router;
