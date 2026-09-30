import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, clubCorrectionsTable, clubHistoryBoundariesTable } from "@workspace/db";
import {
  CreateClubCorrectionBody,
  GetClubCorrectionMatchParams,
  RemoveClubCorrectionParams,
  SearchClubCorrectionMatchesQueryParams,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import { getTenantCentralClubId, TenantNotFoundError } from "../lib/tenant";
import { loadClubIdentity } from "../lib/club-overlay";
import {
  checkNewCorrection,
  correctionActor,
  CorrectionsStoreMissingError,
  describeCorrections,
  lineFigures,
  withCorrectionsStore,
} from "../lib/club-corrections";

/**
 * Club corrections admin (hybrid stats plan U16; R15, KTD7, KTD8).
 *
 * A club admin corrects a central figure for their OWN club: the tenant always
 * comes from request context, and every read and write is scoped to it and to
 * its central club. Central is never written — a correction is a row in the
 * tenant's journal, applied on read by the club overlay (U10). Removal is soft
 * (the row keeps who removed it and when) and reverts the figure on read.
 *
 * Nothing here drafts social cards or touches the sweep (KTD8).
 */
const router: IRouter = Router();

const NO_CENTRAL_CLUB =
  "This club has no association data, so there are no association figures to correct.";

/** The tenant's central club, or null (answered 409) when it has none. */
async function centralClubOf(tenantId: number, res: Response): Promise<number | null> {
  try {
    return await getTenantCentralClubId(tenantId);
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      res.status(409).json({ error: NO_CENTRAL_CLUB });
      return null;
    }
    throw err;
  }
}

/** Answer a missing store with its 503; rethrow anything else. */
function storeMissing(err: unknown, res: Response): boolean {
  if (err instanceof CorrectionsStoreMissingError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

const loadBoundaries = (tenantId: number) =>
  withCorrectionsStore(() =>
    db
      .select({
        grade: clubHistoryBoundariesTable.grade,
        startSeason: clubHistoryBoundariesTable.startSeason,
      })
      .from(clubHistoryBoundariesTable)
      .where(eq(clubHistoryBoundariesTable.tenantId, tenantId)),
  );

const loadActive = (tenantId: number) =>
  withCorrectionsStore(() =>
    db
      .select()
      .from(clubCorrectionsTable)
      .where(
        and(eq(clubCorrectionsTable.tenantId, tenantId), isNull(clubCorrectionsTable.removedAt)),
      )
      .orderBy(desc(clubCorrectionsTable.id)),
  );

/** Names for a set of GUIDs: the club's curated name, else central's; privacy from central. */
async function playerNames(tenantId: number, guids: readonly string[]) {
  const central = await import("@workspace/db/central-queries");
  const [names, identity] = await Promise.all([
    central.centralPlayerNames([...new Set(guids)]),
    loadClubIdentity(tenantId),
  ]);
  const out = new Map<string, { displayName: string | null; isPrivate: boolean }>();
  for (const g of new Set(guids)) {
    const c = names.get(g);
    out.set(g, {
      displayName: identity.nameFor(g, c?.displayName ?? null),
      isPrivate: c?.isPrivate ?? false,
    });
  }
  return out;
}

/** The corrections in force, active or stale. */
async function listCorrections(tenantId: number, clubId: number) {
  const central = await import("@workspace/db/central-queries");
  const [rows, boundaries] = await Promise.all([loadActive(tenantId), loadBoundaries(tenantId)]);
  if (rows.length === 0) return [];
  const guids = rows.map((r) => r.participantId);
  const [lines, matches, players] = await Promise.all([
    central.centralParticipantMatchLines(clubId, guids),
    central.centralCorrectionMatchesByPlayhqIds(
      clubId,
      rows.map((r) => r.playhqMatchId),
    ),
    playerNames(tenantId, guids),
  ]);
  return describeCorrections(rows, { lines, boundaries, matches, players });
}

router.get("/club-corrections", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const clubId = await centralClubOf(tenantId, res);
  if (clubId === null) return;
  try {
    res.json(await listCorrections(tenantId, clubId));
  } catch (err) {
    if (!storeMissing(err, res)) throw err;
  }
});

router.get("/club-corrections/matches", requireAdmin, async (req, res): Promise<void> => {
  const query = SearchClubCorrectionMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const clubId = await centralClubOf(getTenantId(req), res);
  if (clubId === null) return;
  const central = await import("@workspace/db/central-queries");
  const matches = await central.centralCorrectionMatchSearch(clubId, {
    q: query.data.q,
    limit: query.data.limit,
  });
  res.json(matches);
});

router.get("/club-corrections/matches/:matchId", requireAdmin, async (req, res): Promise<void> => {
  const params = GetClubCorrectionMatchParams.safeParse(req.params);
  if (!params.success || !Number.isInteger(params.data.matchId)) {
    res.status(400).json({ error: "Invalid match id" });
    return;
  }
  const tenantId = getTenantId(req);
  const clubId = await centralClubOf(tenantId, res);
  if (clubId === null) return;
  const central = await import("@workspace/db/central-queries");
  const match = await central.centralCorrectionMatch(clubId, params.data.matchId);
  // Only the club's own SENIOR matches (juniors isolation).
  if (!match || match.grade === null) {
    res.status(404).json({ error: "That match isn't one of this club's senior matches." });
    return;
  }
  try {
    const guids = await central.centralClubMatchParticipantIds(clubId, match.matchId);
    const [allLines, active, players] = await Promise.all([
      central.centralParticipantMatchLines(clubId, guids),
      loadActive(tenantId),
      playerNames(tenantId, guids),
    ]);
    const lines = allLines.filter((l) => l.matchId === match.matchId);
    const inForce = new Map(
      active
        .filter((c) => c.playhqMatchId === match.playhqMatchId)
        .map((c) => [`${c.participantId}\u0000${c.field}`, c]),
    );
    res.json({
      match: { ...match, grade: match.grade },
      lines: lines
        .map((l) => {
          const p = players.get(l.participantId);
          return {
            participantId: l.participantId,
            displayName: p?.isPrivate ? null : (p?.displayName ?? null),
            isPrivate: p?.isPrivate ?? false,
            figures: lineFigures(l).map((f) => {
              const c = inForce.get(`${l.participantId}\u0000${f.field}`);
              return {
                ...f,
                correction: c
                  ? { id: c.id, previousValue: c.previousValue, newValue: c.newValue }
                  : null,
              };
            }),
          };
        })
        .sort((x, y) => (x.displayName ?? "~").localeCompare(y.displayName ?? "~")),
    });
  } catch (err) {
    if (!storeMissing(err, res)) throw err;
  }
});

router.post(
  "/club-corrections",
  requireAdmin,
  adminWriteRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const parsed = CreateClubCorrectionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const body = parsed.data;
    const tenantId = getTenantId(req);
    const clubId = await centralClubOf(tenantId, res);
    if (clubId === null) return;
    const central = await import("@workspace/db/central-queries");
    try {
      const [matches, lines, boundaries] = await Promise.all([
        central.centralCorrectionMatchesByPlayhqIds(clubId, [body.playhqMatchId]),
        central.centralParticipantMatchLines(clubId, [body.participantId]),
        loadBoundaries(tenantId),
      ]);
      const check = checkNewCorrection({
        match: matches[0] ?? null,
        line:
          lines.find(
            (l) => l.participantId === body.participantId && l.playhqMatchId === body.playhqMatchId,
          ) ?? null,
        boundaries,
        field: body.field,
        previousValue: body.previousValue,
        newValue: body.newValue,
      });
      if (!check.ok) {
        res.status(check.status).json({
          error: check.error,
          ...(check.centralValue !== undefined ? { centralValue: check.centralValue } : {}),
        });
        return;
      }

      const actor = correctionActor(req.admin!);
      const note = body.note?.trim() || null;
      // One correction in force per (match, participant, field): a
      // re-correction retires the current one first, in the same transaction.
      await withCorrectionsStore(() =>
        db.transaction(async (tx) => {
          await tx
            .update(clubCorrectionsTable)
            .set({ removedAt: new Date(), removedBy: actor })
            .where(
              and(
                eq(clubCorrectionsTable.tenantId, tenantId),
                eq(clubCorrectionsTable.playhqMatchId, body.playhqMatchId),
                eq(clubCorrectionsTable.participantId, body.participantId),
                eq(clubCorrectionsTable.field, check.field),
                isNull(clubCorrectionsTable.removedAt),
              ),
            );
          await tx.insert(clubCorrectionsTable).values({
            tenantId,
            playhqMatchId: body.playhqMatchId,
            participantId: body.participantId,
            field: check.field,
            previousValue: body.previousValue,
            newValue: body.newValue,
            note,
            createdBy: actor,
          });
        }),
      );
      const list = await listCorrections(tenantId, clubId);
      const created = list.find(
        (c) =>
          c.playhqMatchId === body.playhqMatchId &&
          c.participantId === body.participantId &&
          c.field === check.field,
      );
      res.status(201).json(created);
    } catch (err) {
      if (storeMissing(err, res)) return;
      // A concurrent correction of the same figure won the unique index.
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "That figure was just corrected by someone else. Reload." });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/club-corrections/:id",
  requireAdmin,
  adminWriteRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = RemoveClubCorrectionParams.safeParse(req.params);
    if (!params.success || !Number.isInteger(params.data.id)) {
      res.status(400).json({ error: "Invalid correction id" });
      return;
    }
    const tenantId = getTenantId(req);
    try {
      const removed = await withCorrectionsStore(() =>
        db
          .update(clubCorrectionsTable)
          .set({ removedAt: new Date(), removedBy: correctionActor(req.admin!) })
          .where(
            and(
              eq(clubCorrectionsTable.id, params.data.id),
              eq(clubCorrectionsTable.tenantId, tenantId),
              isNull(clubCorrectionsTable.removedAt),
            ),
          )
          .returning({ id: clubCorrectionsTable.id }),
      );
      if (removed.length === 0) {
        res.status(404).json({ error: "No correction in force with that id." });
        return;
      }
      res.status(204).end();
    } catch (err) {
      if (!storeMissing(err, res)) throw err;
    }
  },
);

export default router;
