import { Router, type IRouter } from "express";
import {
  isJuniorDesignDraft,
  isJuniorCarousel,
  juniorSafeDesign,
  stripUnapprovedJuniorSetPhotos,
  validJuniorStockSelection,
} from "../lib/junior-stock-photos";
import {
  readQueuedCarousel,
  carouselPackId,
  isCarouselPackId,
  resolveActivePackId,
} from "@workspace/scorecard/queued-carousel";
import { and, desc, eq, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  socialDraftRevisionsTable,
  socialDraftsTable,
  trackedLinksTable,
  milestoneEventsTable,
  matchesTable,
  juniorMatchesTable,
  type DraftDesignSize,
  type SocialDraftRow,
} from "@workspace/db";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { publicWriteRateLimiter } from "../middlewares/rate-limit";
import {
  BackfillMatchDraftsBody,
  CreateSocialDraftBody,
  CreateTrackedLinkBody,
  GenerateRecapsBody,
  SaveDraftAsTemplateBody,
  SaveDraftSetDesignBody,
  UpdateSocialDraftBody,
} from "@workspace/api-zod";
import { familyOfKind } from "../lib/social-families";
import { loadWithheldJuniorNames, redactDraftRow } from "../lib/junior-name-redaction";
import { draftPhotoFocus } from "../lib/photo-focus-snapshot";
import { generateRecapDrafts } from "../lib/roundup";
import {
  generateMatchSummaryDrafts,
  generateJuniorMatchSummaryDrafts,
} from "../lib/match-summary-drafter";
import { getTenantId } from "../middlewares/tenant-context";
import { NATIVE_STATS_TENANT_ID } from "../lib/tenant";
import { backfillMatchDrafts } from "../lib/draft-sweep";
import { recaptionQueuedDrafts } from "../lib/draft-recaption";
import { effectiveDraftStatus, loadAutoPost, type AutoPost } from "../lib/effective-draft-state";
import { isDraftStatus, normalizeDraftStatus, type DraftStatus } from "../lib/draft-status";
import {
  listDraftRevisions,
  recordDraftRevision,
  revertDraftToRevision,
} from "../lib/draft-revisions";
import {
  cancelDraftPublications,
  draftPublishing,
  publicationsByDraft,
} from "../lib/publishing/publications";
import { BLANK_PACK_ID, templatedDesignFor, type TemplatedDesign } from "../lib/kind-templates";
import { draftLayerPhotos } from "../lib/layer-photos";
import {
  assembleCarouselDocument,
  designFromRef,
  setTemplateKind,
} from "../lib/template-library/draw";
import { TemplateLibraryError } from "../lib/template-library/errors";
import { loadDraftSetDesign, saveDraftSetDesign } from "../lib/template-library/set-design";
import {
  draftSubjectPlayerId,
  isAutoPhoto,
  photoColumns,
  resolveDraftPack,
  type PhotoPick,
} from "../lib/draft-enrich";
import { juniorAdhocCard } from "../lib/junior-adhoc";
import { nonSeniorPlayerIds } from "../lib/club-photo-library";
import { calendarEnabled, placeDraft } from "../lib/posting-writer";
import { enqueueAssetReady, kickOutbox } from "../lib/email-outbox";
import { harnessOriginFromHeaders } from "../lib/card-video-renderer";
import { notePhotoUsage } from "../lib/card-content/photos";
import { layoutCheckOwed } from "../lib/layout-check-state";
import {
  designSizeRefusal,
  initialDesignSize,
  madeInOlderSizes,
  revisionSizesByDraft,
} from "../lib/draft-design-size";

const router: IRouter = Router();

const randomSlug = (): string =>
  Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

/**
 * A draft row as the API returns it: legacy status values mapped to new names,
 * and — while auto-post is on — a draft past its deadline reads as ready even
 * before the sweep stores it (KTD4).
 */
export function presentDraft<
  T extends { status: string; autoReadyAt: Date | null; sourceKey: string | null },
>(
  row: T,
  autoPost: AutoPost = { enabled: false },
  now: Date = new Date(),
): T & { status: DraftStatus } {
  // A draft saved with a hidden legacy pack (P9) reads as Club Kit; the row is not rewritten.
  const pack =
    "packId" in row && typeof row.packId === "string"
      ? { packId: resolveActivePackId(row.packId) }
      : {};
  return { ...row, ...pack, status: effectiveDraftStatus(row, autoPost, now) };
}

/**
 * `presentDraft`, plus the older sizes (Square, Landscape) the draft was made
 * in and still draws (round 9 B8): the only older sizes its editor, queue and
 * share window offer. `revisionSizes` are its revisions' saved sizes; read
 * here when not given.
 */
async function presentSized(
  row: SocialDraftRow,
  autoPost?: AutoPost,
  now?: Date,
  revisionSizes?: DraftDesignSize[],
) {
  const sizes = revisionSizes ?? (await revisionSizesByDraft([row.id])).get(row.id) ?? [];
  return { ...presentDraft(row, autoPost, now), olderSizes: madeInOlderSizes(row, sizes) };
}

/**
 * Posting calendar (KTD13): a card sent back or reopened is no longer sent.
 * Its "sent" and "overdue" marks clear; an automatic card is placed again from
 * now (it will roll, not auto-approve — sending back cleared that), and a
 * pinned card keeps its time, overdue if that has passed.
 */
async function resetPostingTiming(draft: SocialDraftRow): Promise<SocialDraftRow> {
  if (!(await calendarEnabled(draft.tenantId))) return draft;
  const [cleared] = await db
    .update(socialDraftsTable)
    .set({ dispatchedAt: null, overdueNotifiedAt: null })
    .where(eq(socialDraftsTable.id, draft.id))
    .returning();
  if (cleared.plannedBy === "admin") return cleared;
  await db
    .update(socialDraftsTable)
    .set({ plannedAt: null, plannedBy: null })
    .where(eq(socialDraftsTable.id, draft.id));
  await placeDraft(draft.tenantId, draft.id);
  return (await loadDraft(draft.tenantId, draft.id)) ?? cleared;
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

/**
 * A card opened in the Studio editor is filed as an ad-hoc draft so the editor has something
 * to save into. Until someone saves an edit (every edit records a revision) or acts on it, it
 * stays out of the queue, so just looking at a card in the editor leaves nothing behind.
 */
export const notAnUntouchedEditorDraft = sql`NOT (
  ${socialDraftsTable.engine} = 'adhoc'
  AND ${socialDraftsTable.status} = 'awaiting_review'
  AND NOT EXISTS (
    SELECT 1 FROM ${socialDraftRevisionsTable}
    WHERE ${socialDraftRevisionsTable.draftId} = ${socialDraftsTable.id}
  )
)`;

/** Display names of the admins who made `rows` by hand, by admin id. */
async function creatorNames(
  tenantId: number,
  rows: { createdByAdminId: number | null }[],
): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((r) => r.createdByAdminId).filter((id) => id != null))];
  if (ids.length === 0) return new Map();
  const admins = await db
    .select({
      id: adminsTable.id,
      displayName: adminsTable.displayName,
      username: adminsTable.username,
    })
    .from(adminsTable)
    .where(and(eq(adminsTable.tenantId, tenantId), inArray(adminsTable.id, ids)));
  return new Map(admins.map((a) => [a.id, a.displayName?.trim() || a.username]));
}

router.get("/social-drafts", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions: SQL[] = [eq(socialDraftsTable.tenantId, tenantId), notAnUntouchedEditorDraft];
  const status = req.query.status;
  if (status !== undefined && !isDraftStatus(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  if (typeof req.query.family === "string" && req.query.family) {
    conditions.push(eq(socialDraftsTable.family, req.query.family));
  }
  if (typeof req.query.grade === "string" && req.query.grade) {
    conditions.push(sql`${socialDraftsTable.cardInput}->>'grade' = ${req.query.grade}`);
  }
  // Open work only (Studio home's Your designs): a club's posted and dismissed
  // drafts are its whole posting history, every one with its card input and
  // design, and loading them all on a cold database kept Your designs waiting
  // past the statement timeout (retest 9). Posted and dismissed are stored
  // states (auto-post only ever promotes awaiting review to ready), so this can
  // filter in SQL.
  if (req.query.open === "true") {
    conditions.push(notInArray(socialDraftsTable.status, ["posted", "dismissed"]));
  } else if (req.query.open !== undefined && req.query.open !== "false") {
    res.status(400).json({ error: "Invalid open" });
    return;
  }
  // Every draft as it may be drawn now: a junior made private since it was
  // built is withheld in its thumbnail, preview and editor (P0 2).
  const withheld = await loadWithheldJuniorNames(tenantId);
  const rows = (
    await db
      .select()
      .from(socialDraftsTable)
      .where(and(...conditions))
      .orderBy(desc(socialDraftsTable.createdAt))
  ).map((r) => redactDraftRow(r, withheld));
  // Status filters on the effective state, so it's applied after presenting.
  const autoPost = await loadAutoPost(tenantId);
  const now = new Date();
  const pubs = await publicationsByDraft(
    tenantId,
    rows.map((r) => r.id),
  );
  const names = await creatorNames(tenantId, rows);
  const revisionSizes = await revisionSizesByDraft(rows.map((r) => r.id));
  const drafts = rows.map((r) => ({
    ...presentDraft(r, autoPost, now),
    olderSizes: madeInOlderSizes(r, revisionSizes.get(r.id) ?? []),
    ...draftPublishing(pubs.get(r.id)),
    createdBy: r.createdByAdminId != null ? (names.get(r.createdByAdminId) ?? null) : null,
  }));
  res.json(status === undefined ? drafts : drafts.filter((d) => d.status === status));
});

router.get("/social-drafts/pending-count", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions: SQL[] = [
    eq(socialDraftsTable.tenantId, tenantId),
    eq(socialDraftsTable.status, "awaiting_review"),
    notAnUntouchedEditorDraft,
    // An expired card (posting calendar) no longer waits for anyone.
    isNull(socialDraftsTable.expiredAt),
  ];
  // Drafts past their deadline already read as ready while auto-post is on —
  // unless their layout needs a look on the feed size, which keeps them
  // waiting (KTD10, round 9 (b)). A synced junior draft waits for the sweep.
  const autoPost = await loadAutoPost(tenantId);
  if (!autoPost.enabled) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(socialDraftsTable)
      .where(and(...conditions));
    res.json({ count: Number(row?.count ?? 0) });
    return;
  }
  // Read as the queue reads them (effectiveDraftStatus): the feed size a
  // draft's layout is judged on can't be worked out in SQL.
  const rows = await db
    .select({
      status: socialDraftsTable.status,
      autoReadyAt: socialDraftsTable.autoReadyAt,
      sourceKey: socialDraftsTable.sourceKey,
      expiredAt: socialDraftsTable.expiredAt,
      cardInput: socialDraftsTable.cardInput,
      adjustments: socialDraftsTable.adjustments,
      templateVersion: socialDraftsTable.templateVersion,
      layoutCheckPending: socialDraftsTable.layoutCheckPending,
      layoutWarnings: socialDraftsTable.layoutWarnings,
    })
    .from(socialDraftsTable)
    .where(and(...conditions));
  const now = new Date();
  res.json({
    count: rows.filter((r) => effectiveDraftStatus(r, autoPost, now) === "awaiting_review").length,
  });
});

/**
 * One draft, as the list presents it. Unlike the list it includes a draft
 * just opened in the editor and not yet edited (`notAnUntouchedEditorDraft`),
 * which the Studio editor must be able to load.
 */
router.get("/social-drafts/:id", requireAdmin, async (req, res, next): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null || String(id) !== req.params.id) {
    next();
    return;
  }
  const tenantId = getTenantId(req);
  const stored = await loadDraft(tenantId, id);
  if (!stored) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const row = redactDraftRow(stored, await loadWithheldJuniorNames(tenantId));
  const autoPost = await loadAutoPost(tenantId);
  const pubs = await publicationsByDraft(tenantId, [row.id]);
  const names = await creatorNames(tenantId, [row]);
  res.json({
    ...(await presentSized(row, autoPost, new Date())),
    ...draftPublishing(pubs.get(row.id)),
    createdBy: row.createdByAdminId != null ? (names.get(row.createdByAdminId) ?? null) : null,
  });
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
    if (draft.expiredAt !== null) {
      res.status(409).json({
        error: "This card is past the club's age limit. Move it to a time to bring it back.",
      });
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
    // Social email lists with "card ready" on get the card (one send per draft per list).
    try {
      const queued = await enqueueAssetReady(db, {
        tenantId,
        draftIds: [id],
        origin: harnessOriginFromHeaders(req.headers),
      });
      if (queued > 0) kickOutbox(tenantId, req.log);
    } catch (err) {
      req.log?.warn({ err, tenantId, draftId: id }, "card-ready email not queued");
    }
    res.json(await presentSized(updated));
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
    if (effectiveDraftStatus(draft, await loadAutoPost(tenantId)) !== "ready") {
      res.status(409).json({ error: "Only a ready draft can be sent back" });
      return;
    }
    const [updated] = await db
      .update(socialDraftsTable)
      .set({ status: "awaiting_review", autoReadyAt: null, reviewedAt: new Date() })
      .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
      .returning();
    // A draft back in review must not go out on its old schedule (R13).
    await cancelDraftPublications(tenantId, id, "Sent back to review.");
    res.json(await presentSized(await resetPostingTiming(updated)));
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
    // Shared by hand: nothing still queued may post it again, and a failed
    // post no longer needs attention (R18).
    await cancelDraftPublications(tenantId, id, "Marked posted by the club.", [
      "scheduled",
      "held",
      "failed",
    ]);
    // The photos it showed are now the most recently used (ADR-010 P4).
    await notePhotoUsage(updated);
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
    res.json(await presentSized(updated));
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
    await cancelDraftPublications(tenantId, id, "The draft was dismissed.");
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
      res.json(await presentSized(await resetPostingTiming(updated)));
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

/**
 * Start an ad-hoc card (U18): made by hand, on a blank canvas, or from a saved
 * editor template. It waits for review with no auto-promotion and no import
 * anchor, so it never auto-posts.
 */
router.post(
  "/social-drafts",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateSocialDraftBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { templateId, templateRef } = parsed.data;
    let { cardInput } = parsed.data;
    const kind = cardInput.kind;
    if (typeof kind !== "string" || !kind) {
      res.status(400).json({ error: "cardInput.kind is required" });
      return;
    }
    const tenantId = getTenantId(req);
    // A junior card (New Studio's Create, Create a card's junior switch) is marked junior,
    // so the queue and the fail-closed publishing gate treat it as one, and its photo is
    // the server's to pick: the request's consent markers never survive (juniors isolation).
    const junior = cardInput.junior === true;
    let juniorPhoto: PhotoPick | null = null;
    if (junior) {
      const made = await juniorAdhocCard(tenantId, cardInput);
      cardInput = { ...made.cardInput, kind };
      juniorPhoto = made.photo;
    }
    // The player a hand-made player card is about (player sponsors): a senior
    // player of this club, on a senior player-centred card only.
    let subjectPlayerId: number | null = null;
    if (parsed.data.subjectPlayerId != null) {
      subjectPlayerId = draftSubjectPlayerId(
        kind,
        parsed.data.subjectPlayerId,
        cardInput.junior === true,
      );
      if (
        subjectPlayerId === null ||
        (await nonSeniorPlayerIds(tenantId, [subjectPlayerId])).length > 0
      ) {
        res.status(400).json({
          error: "A card's player must be one of the club's senior players, on a player card.",
        });
        return;
      }
    }
    // A hidden legacy pack (P9) from a stale page is saved as Club Kit.
    let packId = resolveActivePackId(parsed.data.packId ?? null);
    if ("weekendCarousel" in cardInput) {
      const selection = cardInput.weekendCarousel as { packId?: unknown } | null;
      if (
        (selection && selection.packId !== undefined && !isCarouselPackId(selection.packId)) ||
        (parsed.data.packId != null && !isCarouselPackId(parsed.data.packId))
      ) {
        res
          .status(400)
          .json({ error: "Unknown carousel design pack. Choose a registered built-in pack." });
        return;
      }
    }
    const carousel = readQueuedCarousel(cardInput);
    if (
      "weekendCarousel" in cardInput &&
      (!carousel ||
        cardInput.kind !== "matchDay" ||
        !parsed.data.caption?.trim() ||
        templateId !== undefined)
    ) {
      res
        .status(400)
        .json({ error: "A carousel needs 3–20 valid slides of the selected type and a caption." });
      return;
    }
    if (carousel) {
      if (!(await validJuniorStockSelection(tenantId, carousel))) {
        res.status(422).json({
          error:
            "A junior stock image is no longer available or does not belong to this club. Choose an approved stock image and try again.",
        });
        return;
      }
      // A junior set's cover and sponsors page: approved junior stock only (fails closed).
      const removed = await stripUnapprovedJuniorSetPhotos(tenantId, cardInput, carousel);
      if (removed)
        req.log.info({ tenantId, removed }, "junior set: removed photos that aren't junior stock");
      if (carousel.packId !== undefined && packId !== null && packId !== carousel.packId) {
        res
          .status(400)
          .json({ error: "The carousel design pack must match the saved composition." });
        return;
      }
      // Freeze new top-level choices too; absence on historical payloads stays Club Kit.
      // Set on the saved payload itself: a version 2 read returns a normalised copy.
      // A templated (version 3) carousel names a template, never a pack.
      if (carousel.version !== 3 && carousel.packId === undefined && packId !== null) {
        carousel.packId = packId;
        (cardInput.weekendCarousel as Record<string, unknown>).packId = packId;
      }
      packId = carouselPackId(carousel);
    }
    const sourceKey = carousel ? `weekend-carousel:${carousel.submissionId}` : null;
    if (sourceKey) {
      const [existing] = await db
        .select()
        .from(socialDraftsTable)
        .where(
          and(
            eq(socialDraftsTable.tenantId, tenantId),
            eq(socialDraftsTable.sourceKey, sourceKey),
            sql`${socialDraftsTable.status} != 'dismissed'`,
          ),
        );
      if (existing) {
        res.status(200).json(await presentSized(existing));
        return;
      }
    }
    if (
      templateRef !== undefined &&
      (carousel || templateId !== undefined || parsed.data.adjustments)
    ) {
      res.status(400).json({
        error: "A picked template can't be combined with a saved layout or a carousel payload.",
      });
      return;
    }
    // Stored as sent, as PATCH does: parsing keeps only the first editor's keys,
    // so a page-based design (a blank one starting on a white page) would lose
    // its pages. Validation above still checks the request's shape.
    let adjustments: unknown =
      parsed.data.adjustments == null
        ? null
        : ((req.body as { adjustments?: unknown }).adjustments ?? null);
    if (templateId !== undefined) {
      const template = await loadEditorTemplate(tenantId, templateId);
      if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
      }
      packId = resolveActivePackId(template.packId);
      adjustments = template.adjustments;
    }
    // With card kind templates on, a card started from the club's design
    // (not a blank canvas, a saved template or a supplied layout) copies the
    // kind's template (ADR-002).
    // A template picked for this one post (ADR-011) is copied as it is; the
    // club's default doesn't change. A templated (version 3) carousel stores
    // its assembled document.
    let templated: TemplatedDesign | null = null;
    try {
      if (templateRef !== undefined) {
        templated = await designFromRef(tenantId, kind, templateRef);
      } else if (carousel?.version === 3) {
        const assembled = await assembleCarouselDocument(tenantId, carousel, {
          templateRef: carousel.templateRef,
          packId: await resolveDraftPack(tenantId, setTemplateKind(carousel.setType)),
          // Every page draws the set's size, or the pick is refused (round 9 B13).
          size: carousel.size,
        });
        // The set may have fallen back to the pack look; the payload names what drew it.
        (cardInput.weekendCarousel as Record<string, unknown>).templateRef = assembled.templateRef;
        templated = {
          packId: BLANK_PACK_ID,
          adjustments: assembled.document,
          templateVersion: assembled.templateRef.version,
          templateRef: assembled.templateRef,
          ...layoutCheckOwed(),
        };
      } else if (
        !carousel &&
        templateId === undefined &&
        adjustments === null &&
        packId !== BLANK_PACK_ID
      ) {
        templated = await templatedDesignFor(tenantId, cardInput.kind, packId);
      }
    } catch (err) {
      if (err instanceof TemplateLibraryError) {
        res.status(err.status).json(err.body);
        return;
      }
      throw err;
    }
    // A junior card's or set's design keeps no club library photo but approved
    // junior stock, whichever template or layout it starts from (fails closed).
    const juniorRow = { sourceMatchIsJunior: junior, cardInput, photoUrl: juniorPhoto?.url };
    if (templated) {
      const safe = await juniorSafeDesign(tenantId, juniorRow, templated.adjustments);
      templated = { ...templated, adjustments: safe.design as typeof templated.adjustments };
    }
    adjustments = (await juniorSafeDesign(tenantId, juniorRow, adjustments)).design;
    // The size the design is started at (Stage 2): an older size only when the
    // new design has layers on it.
    const newDesign = {
      cardInput,
      adjustments: templated ? templated.adjustments : adjustments,
      templateVersion: templated ? templated.templateVersion : null,
    };
    if (parsed.data.designSize) {
      const refused = designSizeRefusal(newDesign, parsed.data.designSize);
      if (refused) {
        res.status(400).json({ error: refused });
        return;
      }
    }
    // Every new draft saves a size (round 9): Create's, else a carousel's own,
    // else Portrait, always one its design draws.
    const designSize = initialDesignSize(newDesign, parsed.data.designSize ?? null);
    const [row] = await db
      .insert(socialDraftsTable)
      .values({
        tenantId,
        engine: carousel ? "ondemand" : "adhoc",
        status: "awaiting_review",
        cardInput,
        caption: parsed.data.caption ?? null,
        sourceKey,
        ...(carousel ? { photoSource: "none" } : {}),
        family: familyOfKind(
          carousel?.setType === "teamList"
            ? "teamList"
            : carousel?.setType === "results" || carousel?.setType === "matchSummary"
              ? "matchSummary"
              : cardInput.kind,
        ),
        packId,
        adjustments,
        autoReadyAt: null,
        editedAt: carousel || adjustments ? new Date() : null,
        createdByAdminId: (req as RequestWithAdmin).admin?.id ?? null,
        subjectPlayerId,
        designSize,
        ...(junior
          ? { sourceMatchIsJunior: true, ...(await photoColumns(tenantId, juniorPhoto)) }
          : carousel && isJuniorCarousel(carousel)
            ? // A set made from junior data (Create → Juniors) is a junior draft: the
              // Queue's Juniors filter and the fail-closed publishing gate see it
              // (round 3 retest, #7). Its photos are already junior-safe (above).
              { sourceMatchIsJunior: true }
            : {}),
        ...(templated ?? {}),
      })
      .onConflictDoNothing()
      .returning();
    if (!row && sourceKey) {
      const [existing] = await db
        .select()
        .from(socialDraftsTable)
        .where(
          and(
            eq(socialDraftsTable.tenantId, tenantId),
            eq(socialDraftsTable.sourceKey, sourceKey),
            sql`${socialDraftsTable.status} != 'dismissed'`,
          ),
        );
      if (existing) {
        res.status(200).json(await presentSized(existing));
        return;
      }
    }
    if (!row) {
      res.status(409).json({ error: "Could not create draft. Please retry." });
      return;
    }
    // A single card's sourced photo layers pick their photos (a carousel has none). A
    // junior card's layers stay empty: only the junior pick above may show a child.
    const layerPhotos = carousel || junior ? null : await draftLayerPhotos(row);
    if (layerPhotos) {
      const [withPhotos] = await db
        .update(socialDraftsTable)
        .set({ layerPhotos })
        .where(and(eq(socialDraftsTable.id, row.id), eq(socialDraftsTable.tenantId, tenantId)))
        .returning();
      res.status(201).json(await presentSized(withPhotos ?? row));
      return;
    }
    res.status(201).json(await presentSized(row));
  },
);

function loadEditorTemplate(tenantId: number, id: number) {
  return db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.id, id),
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.source, "editor"),
      ),
    )
    .then((rows) => rows[0] ?? null);
}

const presentTemplate = (t: typeof cardTemplatesTable.$inferSelect) => ({
  id: t.id,
  name: t.name,
  baseKind: t.baseKind,
  packId: resolveActivePackId(t.packId),
  adjustments: t.adjustments,
  createdAt: t.createdAt,
});

/** Save a draft's pack and editor adjustments as a reusable template (U18). */
router.post(
  "/social-drafts/:id/save-template",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SaveDraftAsTemplateBody.safeParse(req.body);
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
    const kind = (draft.cardInput as { kind?: unknown }).kind;
    const baseKind = typeof kind === "string" ? kind : null;
    const [row] = await db
      .insert(cardTemplatesTable)
      .values({
        tenantId,
        name: parsed.data.name.trim(),
        source: "editor",
        baseKind,
        cardKinds: baseKind ? [baseKind] : [],
        packId: draft.packId,
        adjustments: draft.adjustments ?? {},
      })
      .returning();
    res.status(201).json(presentTemplate(row));
  },
);

router.get("/editor-templates", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, getTenantId(req)),
        eq(cardTemplatesTable.source, "editor"),
      ),
    )
    .orderBy(desc(cardTemplatesTable.createdAt));
  res.json(rows.map(presentTemplate));
});

router.delete(
  "/editor-templates/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db
      .delete(cardTemplatesTable)
      .where(
        and(
          eq(cardTemplatesTable.id, id),
          eq(cardTemplatesTable.tenantId, getTenantId(req)),
          eq(cardTemplatesTable.source, "editor"),
        ),
      )
      .returning({ id: cardTemplatesTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
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
    const { caption, photoUrl, photoPlayerId, playerOrder, designSize } = parsed.data;
    const cardInput = draft.cardInput as Record<string, unknown>;
    // A Team List design's own player order (build decision 16): this draft only.
    if (playerOrder !== undefined && cardInput.kind !== "teamList") {
      res.status(400).json({ error: "Only a Team List card has a player order." });
      return;
    }
    // A junior card's photo is the server's to pick (ADR-007): the admin can
    // clear it, never put a club library photo on it (fails closed).
    if (photoUrl != null && photoUrl !== draft.photoUrl && isJuniorDesignDraft(draft)) {
      res.status(400).json({
        error:
          "A junior card shows only a photo the club has cleared for it. Remove the photo instead.",
      });
      return;
    }
    // The design is stored exactly as sent. The generated schema lists only the
    // first editor's keys, and parsing drops every other one, which wiped a
    // templated draft's pages (format v2) on save. Validation above still
    // checks the request's shape.
    const adjustments = (req.body as { adjustments?: unknown }).adjustments as
      typeof parsed.data.adjustments | undefined;
    // The editor's Format (Stage 2): saved at the top level, never inside the
    // design. An older size only when the draft already has it, or its design
    // (as this edit leaves it) has layers on it.
    if (designSize !== undefined) {
      const refused = designSizeRefusal(
        adjustments !== undefined ? { ...draft, adjustments } : draft,
        designSize,
        draft.designSize,
        madeInOlderSizes(draft, (await revisionSizesByDraft([draft.id])).get(draft.id) ?? []),
      );
      if (refused) {
        res.status(400).json({ error: refused });
        return;
      }
    }
    // A queued carousel posts and downloads at its own size
    // (`weekendCarousel.size`): its Format keeps that size in step, so the set
    // reopens, downloads and posts at the size picked (round 10, set 1025).
    const carouselSized: Record<string, unknown> | null =
      designSize !== undefined && readQueuedCarousel(cardInput)
        ? {
            ...cardInput,
            weekendCarousel: {
              ...(cardInput.weekendCarousel as Record<string, unknown>),
              size: designSize,
            },
          }
        : null;
    // Switching Format alone is not an edit: the card draws the same, so it
    // keeps its revisions, its place in the queue and any auto-promotion.
    if (
      designSize !== undefined &&
      caption === undefined &&
      photoUrl === undefined &&
      playerOrder === undefined &&
      adjustments === undefined
    ) {
      const [row] = await db
        .update(socialDraftsTable)
        .set({ designSize, ...(carouselSized ? { cardInput: carouselSized } : {}) })
        .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)))
        .returning();
      res.json(await presentSized(row));
      return;
    }
    const patch: Partial<typeof socialDraftsTable.$inferInsert> = {
      // A manual action: stop any pending auto-promotion (KTD4).
      autoReadyAt: null,
      ...(designSize !== undefined ? { designSize } : {}),
      ...(carouselSized ? { cardInput: carouselSized } : {}),
    };
    if (caption !== undefined) {
      patch.caption = caption;
      // Marks the caption as the admin's: data refreshes keep it.
      patch.editedAt = new Date();
    }
    if (photoUrl !== undefined) {
      patch.photoUrl = photoUrl;
      // The admin's choice is never replaced by an automatic pick (KTD6).
      // Clearing is a choice too ("none"), so the missing-photo fill leaves it.
      patch.photoSource = photoUrl === null ? "none" : "manual";
      // A library photo the admin picked brings its focus box, or a tagged
      // player's area when the admin picked that player's tile (photo focus
      // areas); keeping the same photo with no tile choice keeps the snapshot.
      if (photoUrl !== draft.photoUrl || photoPlayerId !== undefined)
        patch.photoFocus = await draftPhotoFocus(tenantId, photoUrl, photoPlayerId ?? null);
      if (photoUrl === null) patch.editedAt = patch.editedAt ?? new Date();
    }
    if (playerOrder !== undefined) {
      // Stored on the card input, where the renderer reads it; null follows the
      // order the card was made with (the club's). Data refreshes keep it.
      const { playerOrderOverride: _previous, ...rest } = carouselSized ?? cardInput;
      void _previous;
      patch.cardInput = playerOrder === null ? rest : { ...rest, playerOrderOverride: playerOrder };
    }
    if (adjustments !== undefined) {
      // Editor overlay (U15): stored as-is; the web renderer applies it. A
      // junior design keeps no club library photo but approved junior stock.
      const safe = await juniorSafeDesign(tenantId, draft, adjustments);
      if (safe.removed)
        req.log.info(
          { tenantId, removed: safe.removed },
          "junior design: removed photos that aren't junior stock",
        );
      patch.adjustments = safe.design as typeof adjustments;
      if (draft.templateVersion !== null) {
        // A templated draft's design edit: `editedAt` stays the caption
        // marker, and the new layout owes a check (KTD10).
        patch.designEditedAt = new Date();
        Object.assign(patch, layoutCheckOwed());
      } else {
        patch.editedAt = patch.editedAt ?? new Date();
      }
      // A design with sourced photo layers picks their photos while the
      // draft's photo is automatic (photo layer sources).
      if (isAutoPhoto(patch.photoSource ?? draft.photoSource))
        patch.layerPhotos = await draftLayerPhotos({ ...draft, adjustments });
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
    res.json(await presentSized(updated));
  },
);

// A carousel set draft as one multi-page design (carousel set editor plan, part 3).
router.get("/social-drafts/:id/set-design", requireAdmin, async (req, res): Promise<void> => {
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
  try {
    const safe = redactDraftRow(draft, await loadWithheldJuniorNames(tenantId));
    res.json(await loadDraftSetDesign(tenantId, safe));
  } catch (err) {
    if (err instanceof TemplateLibraryError) {
      res.status(err.status).json(err.body);
      return;
    }
    throw err;
  }
});

router.put(
  "/social-drafts/:id/set-design",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SaveDraftSetDesignBody.safeParse(req.body);
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
    try {
      // A junior set's pages keep no club library photo but approved junior stock.
      const safe = await juniorSafeDesign(tenantId, draft, parsed.data.document);
      if (safe.removed)
        req.log.info(
          { tenantId, removed: safe.removed },
          "junior set: removed design photos that aren't junior stock",
        );
      const updated = await saveDraftSetDesign(tenantId, draft, {
        document: safe.design as typeof parsed.data.document,
        templateRef: parsed.data.templateRef ?? undefined,
        size: parsed.data.size,
      });
      res.json(await presentSized(updated));
    } catch (err) {
      if (err instanceof TemplateLibraryError) {
        res.status(err.status).json(err.body);
        return;
      }
      throw err;
    }
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
    res.json(await presentSized(updated));
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

    // The senior path reads the NATIVE match tables, which hold only tenant #1's
    // matches (they carry no tenant column). Any other tenant drafting from them
    // would get tenant #1's games under its own brand, so refuse; its past
    // matches are drafted through /social-drafts/backfill-matches instead.
    const hasTarget =
      (Array.isArray(matchIds) && matchIds.length > 0) ||
      (season != null && Number.isInteger(season));
    if (!junior && hasTarget && tenantId !== NATIVE_STATS_TENANT_ID) {
      res.status(409).json({
        error:
          "Senior match drafts for this club come from its own data: use POST /social-drafts/backfill-matches",
      });
      return;
    }

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

// ---------------------------------------------------------------------------
// Backfill: draft Match Result cards for the club's past matches, for every
// club type. Same engine and source keys as the sweep (re-runs add nothing);
// never touches the sweep watermark.
// ---------------------------------------------------------------------------
router.post(
  "/social-drafts/backfill-matches",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = BackfillMatchDraftsBody.safeParse(req.body);
    if (!parsed.success || !Number.isInteger(parsed.data.season)) {
      res.status(400).json({ error: "season required; at most 60 matchIds" });
      return;
    }
    const { season, grade, matchIds, include } = parsed.data;
    res.json(
      await backfillMatchDrafts(getTenantId(req), {
        season,
        grade,
        matchIds: matchIds?.filter(Number.isInteger),
        include,
      }),
    );
  },
);

// Recaption: rebuild queued drafts' captions from the current templates and
// variations (captions are otherwise fixed at creation). Edited captions stay.
router.post(
  "/social-drafts/recaption",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    res.json(await recaptionQueuedDrafts(getTenantId(req)));
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
