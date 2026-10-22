/**
 * The element library API (editable-elements plan, Stream D1).
 *
 * Admin-only. Every listed element is shared with every club; a club also sees
 * the elements it saved. Saving and unlisting need the `socialStudio`
 * entitlement. Mounted before the template library router, whose
 * `/template-library/:id` would otherwise take `/template-library/elements`.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ListLibraryElementsQueryParams,
  ReportLibraryElementBody,
  SaveLibraryElementBody,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import {
  getLibraryElement,
  listLibraryElements,
  reportElement,
  saveClubElement,
  unlistOwnElement,
} from "../lib/template-library/elements";
import { TemplateLibraryError } from "../lib/template-library/errors";

const router: IRouter = Router();

const writes = [requireAdmin, requireEntitlement("socialStudio")] as const;

/** Answer a known library error, or rethrow. */
function fail(res: Response, err: unknown): void {
  if (err instanceof TemplateLibraryError) {
    res.status(err.status).json(err.body);
    return;
  }
  throw err;
}

/** A positive integer path id, or null after answering 404. */
function idParam(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Not in the library." });
    return null;
  }
  return id;
}

const adminId = (req: Request) => (req as RequestWithAdmin).admin?.id ?? null;

router.get("/template-library/elements", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListLibraryElementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // `mine=false` would coerce to true, so read the flag as written.
  const mine = req.query.mine === "true";
  res.json(await listLibraryElements(getTenantId(req), { ...parsed.data, mine }));
});

router.post("/template-library/elements", ...writes, async (req, res): Promise<void> => {
  const parsed = SaveLibraryElementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await saveClubElement(getTenantId(req), adminId(req), parsed.data));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/template-library/elements/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    res.json(await getLibraryElement(getTenantId(req), id));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/template-library/elements/:id/unlist", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    res.json(await unlistOwnElement(getTenantId(req), id));
  } catch (err) {
    fail(res, err);
  }
});

router.post(
  "/template-library/elements/:id/report",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    const parsed = ReportLibraryElementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Say what's wrong with it." });
      return;
    }
    try {
      await reportElement(getTenantId(req), adminId(req), id, parsed.data.reason);
      res.status(204).end();
    } catch (err) {
      fail(res, err);
    }
  },
);

export default router;
