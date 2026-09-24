import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  trackedLinksTable,
  importsTable,
  milestoneEventsTable,
  matchesTable,
  juniorMatchesTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { publicWriteRateLimiter } from "../middlewares/rate-limit";
import {
  CreateTrackedLinkBody,
  GenerateRecapsBody,
  UpdateSocialDraftBody,
} from "@workspace/api-zod";
import { generateRoundUpDrafts, generateRecapDrafts } from "../lib/roundup";
import {
  generateMatchSummaryDrafts,
  generateJuniorMatchSummaryDrafts,
} from "../lib/match-summary-drafter";
import { getTenantId } from "../middlewares/tenant-context";
import {
  isDraftStatus,
  normalizeDraftStatus,
  storedValuesFor,
  type DraftStatus,
} from "../lib/draft-status";
import {
  listDraftRevisions,
  recordDraftRevision,
  revertDraftToRevision,
} from "../lib/draft-revisions";

const router: IRouter = Router();

const randomSlug = (): string =>
  Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

/** A draft row as the API returns it: legacy status values mapped to new names. */
function presentDraft<T extends { status: string }>(row: T): T & { status: DraftStatus } {
  return { ...row, status: normalizeDraftStatus(row.status) };
}

function parseId(raw: unknown): number | null {
  const id = parseInt(String(raw), 10);
  return Number.isInteger(id) ? id : null;
}

async function loadDraft(tenantId: number, id: number) {
  const [draft] = await db
    .select()
    .from(socialDraftsTable)
    .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)));
  return draft ?? null;
}

router.get("/social-drafts", requireAdmin, async (req, res): Promise<void> => {
  const conditions: SQL[] = [eq(socialDraftsTable.tenantId, getTenantId(req))];
  const status = req.query.status;
  if (status !== undefined) {
    if (!isDraftStatus(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    conditions.push(inArray(socialDraftsTable.status, storedValuesFor(status)));
  }
  if (typeof req.query.family === "string" && req.query.family) {
    conditions.push(eq(socialDraftsTable.family, req.query.family));
  }
  if (typeof req.query.grade === "string" && req.query.grade) {
    conditions.push(sql`${socialDraftsTable.cardInput}->>'grade' = ${req.query.grade}`);
  }
  const rows = await db
    .select()
    .from(socialDraftsTable)
    .where(and(...conditions))
    .orderBy(desc(socialDraftsTable.createdAt));
  res.json(rows.map(presentDraft));
});

router.get("/social-drafts/pending-count", requireAdmin, async (req, res): Promise<void> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, getTenantId(req)),
        inArray(socialDraftsTable.status, storedValuesFor("awaiting_review")),
      ),
    );
  res.json({ count: Number(row?.count ?? 0) });
});

/** Mark a draft ready to post (the endpoint keeps its original "approve" name). */
router.post(
  "/social-drafts/:id/approve",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const tenantId = getTenantId(req);
    const draft = await loadDraft(tenantId, id);
    if (!draft) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const current = normalizeDraftStatus(draft.status);
    if (current !== "awaiting_review" && current !== "ready") {
      res.status(409).json({ error: `Cannot mark a ${current} draft ready` });
      return;
    }
    let slug = draft.trackedSlug;
    if (!slug && draft.appPath) {
      slug = randomSlug();
      await db.insert(trackedLinksTable).values({
        tenantId,
        slug,
        targetUrl: draft.appPath,
        label: `${draft.engine} #${draft.id}`,
        engine: draft.engine,
      });
    }
    const [updated] = await db
      .update(socialDraftsTable)
      .set({ status: "ready", trackedSlug: slug, reviewedAt: new Date() })
      .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
      .returning();
    res.json(presentDraft(updated));
  },
);

/** Return a ready draft to review. Clears auto-promotion so the choice sticks. */
router.post(
  "/social-drafts/:id/send-back",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const tenantId = getTenantId(req);
    const draft = await loadDraft(tenantId, id);
    if (!draft) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (normalizeDraftStatus(draft.status) !== "ready") {
      res.status(409).json({ error: "Only a ready draft can be sent back" });
      return;
    }
    const [updated] = await db
      .update(socialDraftsTable)
      .set({ status: "awaiting_review", autoReadyAt: null, reviewedAt: new Date() })
      .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
      .returning();
    res.json(presentDraft(updated));
  },
);

router.post(
  "/social-drafts/:id/posted",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const tenantId = getTenantId(req);
    const draft = await loadDraft(tenantId, id);
    if (!draft) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (normalizeDraftStatus(draft.status) === "dismissed") {
      res.status(409).json({ error: "Reopen a dismissed draft before posting it" });
      return;
    }
    const [updated] = await db
      .update(socialDraftsTable)
      .set({ status: "posted", reviewedAt: new Date() })
      .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
      .returning();
    // Stamp the linked milestone event so other features (push notifications,
    // "just posted" feeds) and re-detection know this moment has been shared.
    if (updated.milestoneEventId) {
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
    res.json(presentDraft(updated));
  },
);

router.post(
  "/social-drafts/:id/dismiss",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const tenantId = getTenantId(req);
    const [updated] = await db
      .update(socialDraftsTable)
      .set({ status: "dismissed", reviewedAt: new Date() })
      .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (updated.milestoneEventId) {
      await db
        .update(milestoneEventsTable)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(milestoneEventsTable.id, updated.milestoneEventId),
            eq(milestoneEventsTable.tenantId, tenantId),
          ),
        );
    }
    res.status(204).end();
  },
);

/** Bring a dismissed draft back to review. Clears auto-promotion so it waits for A1. */
router.post(
  "/social-drafts/:id/reopen",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const tenantId = getTenantId(req);
    const draft = await loadDraft(tenantId, id);
    if (!draft) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (normalizeDraftStatus(draft.status) !== "dismissed") {
      res.status(409).json({ error: "Only a dismissed draft can be reopened" });
      return;
    }
    try {
      const [updated] = await db
        .update(socialDraftsTable)
        .set({ status: "awaiting_review", autoReadyAt: null, reviewedAt: null })
        .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
        .returning();
      res.json(presentDraft(updated));
    } catch (err) {
      // A newer undismissed draft already holds this event (dedupe index).
      if ((err as { code?: string }).code === "23505") {
        res.status(409).json({ error: "A newer draft for the same event already exists" });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/social-drafts/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateSocialDraftBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const draft = await loadDraft(tenantId, id);
    if (!draft) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (normalizeDraftStatus(draft.status) === "dismissed") {
      res.status(409).json({ error: "Reopen the draft before editing it" });
      return;
    }
    const { caption, photoUrl } = parsed.data;
    const patch: Partial<typeof socialDraftsTable.$inferInsert> = {
      // A manual action: stop any pending auto-promotion (KTD4).
      autoReadyAt: null,
    };
    if (caption !== undefined) {
      patch.caption = caption;
      // Marks the caption as the admin's: data refreshes keep it.
      patch.editedAt = new Date();
    }
    if (photoUrl !== undefined) {
      patch.photoUrl = photoUrl;
      // The admin's choice is never replaced by an automatic pick (KTD6).
      patch.photoSource = photoUrl === null ? null : "manual";
      if (photoUrl === null) patch.editedAt = patch.editedAt ?? new Date();
    }
    const updated = await db.transaction(async (tx) => {
      await recordDraftRevision(draft, "edit", tx);
      const [row] = await tx
        .update(socialDraftsTable)
        .set(patch)
        .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
        .returning();
      return row;
    });
    res.json(presentDraft(updated));
  },
);

router.get("/social-drafts/:id/revisions", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const tenantId = getTenantId(req);
  if (!(await loadDraft(tenantId, id))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(await listDraftRevisions(tenantId, id));
});

router.post(
  "/social-drafts/:id/revisions/:revisionId/revert",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    const revisionId = parseId(req.params.revisionId);
    if (id === null || revisionId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const updated = await revertDraftToRevision(getTenantId(req), id, revisionId);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(presentDraft(updated));
  },
);

router.post(
  "/social-roundups",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const grade = String(req.body?.grade ?? "");
    const season = parseInt(String(req.body?.season ?? ""), 10);
    if (!grade || !Number.isInteger(season)) {
      res.status(400).json({ error: "grade and season required" });
      return;
    }
    const [imp] = await db
      .select({ id: importsTable.id })
      .from(importsTable)
      .where(
        sql`${importsTable.grade} = ${grade} AND ${importsTable.season} = ${season} AND ${importsTable.status} = 'committed'`,
      )
      .orderBy(desc(importsTable.importedAt))
      .limit(1);
    const created = await generateRoundUpDrafts(getTenantId(req), grade, season, imp?.id ?? null);
    res.json(created);
  },
);

router.post(
  "/social-recaps",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = GenerateRecapsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "grade and season required" });
      return;
    }
    const { grade, season } = parsed.data;
    const created = await generateRecapDrafts(getTenantId(req), grade, season);
    res.json(created);
  },
);

// ---------------------------------------------------------------------------
// Sweep: bulk-generate match summary drafts for a set of matches.
// ---------------------------------------------------------------------------
router.post(
  "/social-drafts/sweep",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const tenantId = getTenantId(req);
    const matchIds: number[] | undefined = req.body?.matchIds;
    const junior: boolean = !!req.body?.junior;
    const season: number | undefined =
      req.body?.season != null ? parseInt(String(req.body.season), 10) : undefined;
    const grade: string | undefined = req.body?.grade || undefined;

    let ids: number[] = [];

    if (Array.isArray(matchIds) && matchIds.length > 0) {
      // Explicit match IDs provided.
      ids = matchIds.map((id) => parseInt(String(id), 10)).filter(Number.isInteger);
    } else if (season != null && Number.isInteger(season)) {
      // Query matches for the given season (+grade) filter.
      if (junior) {
        const conditions = [
          eq(juniorMatchesTable.tenantId, tenantId),
          eq(juniorMatchesTable.seasonStartYear, season),
        ];
        if (grade) {
          conditions.push(eq(juniorMatchesTable.ageGroup, grade));
        }
        const rows = await db
          .select({ id: juniorMatchesTable.id })
          .from(juniorMatchesTable)
          .where(and(...conditions));
        ids = rows.map((r) => r.id);
      } else {
        const conditions = [eq(matchesTable.season, season)];
        if (grade) {
          conditions.push(eq(matchesTable.grade, grade));
        }
        const rows = await db
          .select({ id: matchesTable.id })
          .from(matchesTable)
          .where(and(...conditions));
        ids = rows.map((r) => r.id);
      }
    } else {
      res.status(400).json({ error: "Provide matchIds or season to sweep" });
      return;
    }

    const result = junior
      ? await generateJuniorMatchSummaryDrafts(tenantId, ids)
      : await generateMatchSummaryDrafts(tenantId, ids);

    res.json(result);
  },
);

// Mint a tracked short link for an on-demand share. Public (share buttons are
// on public pages) but restricted to in-app paths so it can't be abused as an
// open redirect.
const ALLOWED_APP_PATHS =
  /^\/(players|grades|records|premierships|stats|)(\/[A-Za-z0-9%\-_ ]+)?\/?$/;

router.post("/tracked-links", publicWriteRateLimiter, async (req, res): Promise<void> => {
  // Public, unauthenticated write: the generated schema bounds every free-text
  // field (see CreateTrackedLinkBody in openapi.yaml) so a client cannot store
  // arbitrarily large strings against the tenant.
  const parsed = CreateTrackedLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { targetUrl, engine = "ondemand", platform = "", label = "" } = parsed.data;
  if (!targetUrl.startsWith("/") || !ALLOWED_APP_PATHS.test(targetUrl)) {
    res.status(400).json({ error: "targetUrl must be an in-app path" });
    return;
  }
  const slug = randomSlug();
  const [row] = await db
    .insert(trackedLinksTable)
    .values({ tenantId: getTenantId(req), slug, targetUrl, label, engine, platform })
    .returning();
  res.status(201).json(row);
});

router.get("/tracked-links", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(trackedLinksTable)
    .where(eq(trackedLinksTable.tenantId, getTenantId(req)))
    .orderBy(desc(trackedLinksTable.clickCount));
  res.json(rows);
});

// /go/:slug redirect with click logging. Mounted at the app root (with
// tenantContext applied in app.ts, since a slug is only unique per tenant).
export const goRedirectRouter: IRouter = Router();
goRedirectRouter.get("/go/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [link] = await db
    .select()
    .from(trackedLinksTable)
    .where(and(eq(trackedLinksTable.slug, slug), eq(trackedLinksTable.tenantId, getTenantId(req))));
  if (!link) {
    res.status(404).send("Not found");
    return;
  }
  await db
    .update(trackedLinksTable)
    .set({
      clickCount: sql`${trackedLinksTable.clickCount} + 1`,
      lastClickedAt: new Date(),
    })
    .where(eq(trackedLinksTable.id, link.id));
  const target = link.targetUrl.startsWith("http")
    ? link.targetUrl
    : `https://${req.headers.host ?? ""}${link.targetUrl.startsWith("/") ? "" : "/"}${link.targetUrl}`;
  res.redirect(302, target);
});

export default router;
