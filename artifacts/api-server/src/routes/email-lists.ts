import { Router, type IRouter, type Response } from "express";
import {
  CreateEmailListBody,
  DeleteEmailListParams,
  EmailTeamSheetParams,
  ListEmailSendsQueryParams,
  ResendEmailSendParams,
  UpdateEmailListBody,
  UpdateEmailListParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireAdminOrCaptain } from "../middlewares/require-admin-or-captain";
import { getTenantId } from "../middlewares/tenant-context";
import { deleteEmailList, listEmailLists, saveEmailList } from "../lib/email-lists";
import {
  EmailOutboxError,
  enqueueTeamSheetManual,
  kickOutbox,
  listSends,
  requeueSend,
} from "../lib/email-outbox";
import { TeamSheetError, loadTeamSheetPreview } from "../lib/team-sheet";
import { harnessOriginFromHeaders } from "../lib/card-video-renderer";

/**
 * Email distribution lists (.10x/decisions/architect/email-distribution-lists.md):
 * admin CRUD for the club's lists, the send log, resend, and "Email team
 * sheet" from the Selection Hub. Addresses appear in admin list payloads only;
 * logs carry ids and counts.
 */
const router: IRouter = Router();

function refuse(res: Response, err: unknown): boolean {
  if (err instanceof EmailOutboxError || err instanceof TeamSheetError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

router.get("/admin/email-lists", requireAdmin, async (req, res): Promise<void> => {
  res.json(await listEmailLists(getTenantId(req)));
});

router.post("/admin/email-lists", requireAdmin, async (req, res): Promise<void> => {
  const body = CreateEmailListBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Check the list's name, grades and email addresses." });
    return;
  }
  res.status(201).json(await saveEmailList(getTenantId(req), null, body.data));
});

router.put("/admin/email-lists/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateEmailListParams.safeParse(req.params);
  const body = UpdateEmailListBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Check the list's name, grades and email addresses." });
    return;
  }
  const saved = await saveEmailList(getTenantId(req), params.data.id, body.data);
  if (!saved) {
    res.status(404).json({ error: "List not found" });
    return;
  }
  res.json(saved);
});

router.delete("/admin/email-lists/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteEmailListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid list id" });
    return;
  }
  if (!(await deleteEmailList(getTenantId(req), params.data.id))) {
    res.status(404).json({ error: "List not found" });
    return;
  }
  res.status(204).end();
});

router.get("/admin/email-sends", requireAdmin, async (req, res): Promise<void> => {
  const query = ListEmailSendsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid list id" });
    return;
  }
  res.json(await listSends(getTenantId(req), { listId: query.data.listId }));
});

router.post("/admin/email-sends/:id/resend", requireAdmin, async (req, res): Promise<void> => {
  const params = ResendEmailSendParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid send id" });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    const row = await requeueSend(tenantId, params.data.id);
    kickOutbox(tenantId, req.log);
    const [view] = (await listSends(tenantId, { listId: row.listId })).filter(
      (s) => s.id === row.id,
    );
    res.json(view);
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

router.post("/selection/:id/email", requireAdminOrCaptain, async (req, res): Promise<void> => {
  const params = EmailTeamSheetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid side id" });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    // Refused until the side is finalised; junior sides have no club lists.
    const preview = await loadTeamSheetPreview(tenantId, params.data.id);
    if (preview.section !== "senior") {
      res.status(409).json({ error: "Junior team sheets aren't emailed to club lists." });
      return;
    }
    const queued = await enqueueTeamSheetManual({
      tenantId,
      selectionId: params.data.id,
      grade: preview.grade,
      origin: harnessOriginFromHeaders(req.headers),
    });
    kickOutbox(tenantId, req.log);
    req.log?.info({ tenantId, selectionId: params.data.id, queued }, "team sheet email queued");
    res.json({ queued });
  } catch (err) {
    if (!refuse(res, err)) throw err;
  }
});

export default router;
