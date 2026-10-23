import { Router, type IRouter, type Response } from "express";
import {
  FinaliseSelectionBody,
  FinaliseSelectionParams,
  GetSelectionBoardQueryParams,
  GetTeamSheetPreviewParams,
  MatchSelectionSlotBody,
  MatchSelectionSlotParams,
  PrintTeamSheetBody,
  PrintTeamSheetParams,
  ReopenSelectionParams,
  SyncSelectionFromPlayhqBody,
  SyncSelectionFromPlayhqParams,
  RemindSelectionNonRespondersBody,
  SaveSelectionBoardBody,
  SetSelectionMemberStatusBody,
  SetSelectionMemberStatusParams,
  UnmatchSquadMemberParticipantParams,
} from "@workspace/api-zod";
import { requireAdminOrCaptain, selectionActorOf } from "../middlewares/require-admin-or-captain";
import { getTenantId } from "../middlewares/tenant-context";
import {
  SelectionError,
  buildBoard,
  canRemind,
  finaliseSelection,
  loadCurrentRound,
  reopenSelection,
  saveBoard,
  selectionWeekend,
  syncSideFromPlayhq,
} from "../lib/selection-board";
import { loadAvailabilitySettings, runReminder } from "../lib/availability-schedule";
import { matchSelectionSlot, unmatchParticipant } from "../lib/selection-match";
import { setMemberStatus } from "../lib/selection-member-status";
import {
  TeamSheetError,
  absoluteLogoUrl,
  buildTeamSheet,
  loadTeamSheetPreview,
  normaliseOvers,
  renderTeamSheetHtml,
} from "../lib/team-sheet";
import { harnessOriginFromHeaders, renderHtmlToPdf } from "../lib/card-video-renderer";
import { PlayhqFetchError, requestPlayhqFetch } from "../lib/playhq-fetch-request";

/**
 * The Selection Hub API: the
 * section board, versioned whole-side saves, finalise and re-open, and the
 * no-reply reminder. Admins and captains only; edit rights follow the club's
 * selection rule (see `lib/selection-board.ts`). Payloads never carry a contact
 * value, and logs carry ids and counts only.
 */
const router: IRouter = Router();

/** Send a refused board action as its status; anything else is a 500. */
function refuse(res: Response, err: unknown): boolean {
  if (err instanceof SelectionError && err.code) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return true;
  }
  if (err instanceof SelectionError || err instanceof TeamSheetError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

/** A `YYYY-MM-DD` that is a real Saturday, or null. */
function saturday(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value) && d.getUTCDay() === 6
    ? value
    : null;
}

router.get("/selection/board", requireAdminOrCaptain, async (req, res): Promise<void> => {
  // The weekend arrives as a string; the generated schema types it as a Date.
  const query = GetSelectionBoardQueryParams.safeParse({ section: req.query.section });
  if (!query.success) {
    res.status(400).json({ error: "Section must be senior or junior" });
    return;
  }
  const weekend = req.query.weekend == null ? undefined : saturday(req.query.weekend);
  if (weekend === null) {
    res.status(400).json({ error: "The weekend must be its Saturday, as YYYY-MM-DD." });
    return;
  }
  const board = await buildBoard(
    getTenantId(req),
    selectionActorOf(req),
    query.data.section ?? "senior",
    new Date(),
    weekend,
  );
  res.json(board);
});

router.put("/selection/board", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const body = SaveSelectionBoardBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid board change", issues: body.error.issues });
    return;
  }
  const tenantId = getTenantId(req);
  const actor = selectionActorOf(req);
  try {
    const saved = await saveBoard(tenantId, actor, body.data.changes);
    req.log?.info(
      { tenantId, actorKind: actor.kind, actorId: actor.id, selectionIds: saved.selectionIds },
      "selection board saved",
    );
    const weekend = await selectionWeekend(tenantId, saved.selectionIds[0]!);
    res.json(await buildBoard(tenantId, actor, saved.section, new Date(), weekend));
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

router.post("/selection/:id/finalise", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const params = FinaliseSelectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid side id" });
    return;
  }
  const body = FinaliseSelectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send the side's version to finalise it." });
    return;
  }
  const tenantId = getTenantId(req);
  const actor = selectionActorOf(req);
  try {
    const result = await finaliseSelection(tenantId, actor, params.data.id, body.data.version, {
      req,
      logger: req.log,
    });
    req.log?.info(
      { tenantId, selectionId: params.data.id, actorKind: actor.kind, ...result.messaged },
      "selection finalised",
    );
    const weekend = await selectionWeekend(tenantId, params.data.id);
    const board = await buildBoard(tenantId, actor, result.section, new Date(), weekend);
    const selection = board.selections.find((s) => s.id === params.data.id);
    res.json({ selection, messaged: result.messaged, unlisted: result.unlisted });
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

// The printable team sheet of a finalised side. Any admin or captain who can
// see the board may print it; the overs sent are remembered for the grade.
router.get("/selection/:id/team-sheet", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const params = GetTeamSheetPreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid side id" });
    return;
  }
  try {
    res.json(await loadTeamSheetPreview(getTenantId(req), params.data.id));
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

router.post("/selection/:id/team-sheet", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const params = PrintTeamSheetParams.safeParse(req.params);
  const body = PrintTeamSheetBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid side id or overs" });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    const sheet = await buildTeamSheet(tenantId, params.data.id, {
      overs: normaliseOvers(body.data.overs),
    });
    const html = renderTeamSheetHtml(
      sheet,
      absoluteLogoUrl(sheet.logoUrl, harnessOriginFromHeaders(req.headers)),
    );
    const pdf = await renderHtmlToPdf(html);
    req.log?.info(
      { tenantId, selectionId: params.data.id, players: sheet.players.length },
      "team sheet printed",
    );
    const name = `team-sheet-${sheet.grade}-${sheet.round ?? ""}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    res
      .status(200)
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
        "Cache-Control": "no-store",
      })
      .send(pdf);
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

router.post(
  "/selection/:id/playhq-sync",
  requireAdminOrCaptain,
  async (req, res): Promise<void> => {
    const params = SyncSelectionFromPlayhqParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid side id" });
      return;
    }
    const body = SyncSelectionFromPlayhqBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Send the side's version to sync it." });
      return;
    }
    const tenantId = getTenantId(req);
    const actor = selectionActorOf(req);
    try {
      const result = await syncSideFromPlayhq(tenantId, actor, params.data.id, body.data.version);
      req.log?.info(
        { tenantId, selectionId: params.data.id, actorKind: actor.kind, matched: result.matched },
        "selection synced from PlayHQ",
      );
      const weekend = await selectionWeekend(tenantId, params.data.id);
      const board = await buildBoard(tenantId, actor, result.section, new Date(), weekend);
      res.json(board.selections.find((s) => s.id === params.data.id));
    } catch (err) {
      if (!refuse(res, err)) throw err;
    }
  },
);

router.post("/selection/:id/reopen", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const params = ReopenSelectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid side id" });
    return;
  }
  const tenantId = getTenantId(req);
  const actor = selectionActorOf(req);
  try {
    const result = await reopenSelection(tenantId, actor, params.data.id);
    req.log?.info(
      { tenantId, selectionId: params.data.id, actorKind: actor.kind },
      "selection reopened",
    );
    const weekend = await selectionWeekend(tenantId, params.data.id);
    const board = await buildBoard(tenantId, actor, result.section, new Date(), weekend);
    res.json(board.selections.find((s) => s.id === params.data.id));
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

router.post(
  "/selection/rounds/current/remind",
  requireAdminOrCaptain,
  async (req, res): Promise<void> => {
    const body = RemindSelectionNonRespondersBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Section must be senior or junior" });
      return;
    }
    const tenantId = getTenantId(req);
    const actor = selectionActorOf(req);
    const settings = await loadAvailabilitySettings(tenantId);
    if (!canRemind(actor, settings?.selectionRule ?? "captains_own_grade")) {
      res.status(403).json({ error: "Only those who pick sides can send reminders." });
      return;
    }
    const now = new Date();
    const round = await loadCurrentRound(tenantId, now);
    if (!round || round.sendStartedAt == null) {
      res.status(409).json({ error: "The requests for this round haven't gone out yet." });
      return;
    }
    // The scheduler's reminder, throttled per recipient to once every 12 hours.
    const result = await runReminder(tenantId, round, settings?.smsEnabled ?? true, now, {
      manual: true,
      section: body.data.section,
      logger: req.log,
    });
    req.log?.info(
      {
        tenantId,
        roundId: round.id,
        section: body.data.section,
        actorKind: actor.kind,
        actorId: actor.id,
        messaged: result.messaged,
        throttled: result.throttled,
      },
      "selection reminder sent",
    );
    res.json({ ...result, step: "remind", roundId: round.id });
  },
);

// "Match to squad member" on a gap PlayHQ named only "Private Player" (or any row not on
// the register): fills the slot and remembers the PlayHQ participant for the club (ADR-008).
router.post("/selection/:id/match", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const params = MatchSelectionSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid side id" });
    return;
  }
  const body = MatchSelectionSlotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send the slot, the member and the side's version." });
    return;
  }
  const tenantId = getTenantId(req);
  const actor = selectionActorOf(req);
  try {
    const result = await matchSelectionSlot(tenantId, actor, params.data.id, body.data);
    req.log?.info(
      {
        tenantId,
        selectionId: params.data.id,
        slot: body.data.slot,
        memberId: body.data.memberId,
        remembered: result.remembered,
        actorKind: actor.kind,
      },
      "selection slot matched",
    );
    const weekend = await selectionWeekend(tenantId, params.data.id);
    res.json(await buildBoard(tenantId, actor, result.section, new Date(), weekend));
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

// "Unmatch": forget a remembered PlayHQ participant match. Only later matching changes.
router.delete(
  "/squad/:id/participants/:participantId",
  requireAdminOrCaptain,
  async (req, res): Promise<void> => {
    const params = UnmatchSquadMemberParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid member or participant id" });
      return;
    }
    const tenantId = getTenantId(req);
    const actor = selectionActorOf(req);
    try {
      await unmatchParticipant(tenantId, actor, params.data.id, params.data.participantId);
      req.log?.info(
        { tenantId, memberId: params.data.id, actorKind: actor.kind },
        "squad participant match forgotten",
      );
      res.status(204).end();
    } catch (err) {
      if (!refuse(res, err)) throw err;
    }
  },
);

// An answer a member gave in person or by phone, recorded for the weekend's round
// (ADR-008 §3). Answers with the member's section board.
router.put(
  "/selection/members/:id/status",
  requireAdminOrCaptain,
  async (req, res): Promise<void> => {
    const params = SetSelectionMemberStatusParams.safeParse(req.params);
    const body = SetSelectionMemberStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Send the weekend and Yes, Maybe or No." });
      return;
    }
    const tenantId = getTenantId(req);
    const actor = selectionActorOf(req);
    try {
      const weekend = body.data.weekend.toISOString().slice(0, 10);
      const result = await setMemberStatus(tenantId, actor, params.data.id, {
        ...body.data,
        weekend,
      });
      req.log?.info(
        {
          tenantId,
          memberId: params.data.id,
          roundId: result.roundId,
          dates: result.dates.length,
          actorKind: actor.kind,
          actorId: actor.id,
        },
        "selection status set",
      );
      res.json(await buildBoard(tenantId, actor, result.section, new Date(), weekend));
    } catch (err) {
      if (!refuse(res, err)) throw err;
    }
  },
);

// "Fetch latest from PlayHQ": admins only. Records the request (the sync's next run collects
// the club's named sides) and wakes the sync workflow; it changes no draft.
router.post("/selection/playhq-fetch", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const actor = selectionActorOf(req);
  if (actor.kind !== "admin") {
    res.status(403).json({ error: "Only a club admin can fetch from PlayHQ." });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    const { status, wake } = await requestPlayhqFetch(tenantId, actor.name);
    req.log?.info({ tenantId, actorId: actor.id, wake }, "playhq fetch requested");
    res.status(202).json({ fetch: { ...status, canRequest: true }, wake });
  } catch (err) {
    if (err instanceof PlayhqFetchError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
