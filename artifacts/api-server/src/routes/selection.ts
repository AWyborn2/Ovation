import { Router, type IRouter, type Response } from "express";
import {
  FinaliseSelectionBody,
  FinaliseSelectionParams,
  GetSelectionBoardQueryParams,
  ReopenSelectionParams,
  RemindSelectionNonRespondersBody,
  SaveSelectionBoardBody,
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
} from "../lib/selection-board";
import { loadAvailabilitySettings, runReminder } from "../lib/availability-schedule";

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
  if (err instanceof SelectionError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

router.get("/selection/board", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const query = GetSelectionBoardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Section must be senior or junior" });
    return;
  }
  const board = await buildBoard(
    getTenantId(req),
    selectionActorOf(req),
    query.data.section ?? "senior",
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
    res.json(await buildBoard(tenantId, actor, saved.section));
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
    const board = await buildBoard(tenantId, actor, result.section);
    const selection = board.selections.find((s) => s.id === params.data.id);
    res.json({ selection, messaged: result.messaged });
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

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
    const board = await buildBoard(tenantId, actor, result.section);
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

export default router;
