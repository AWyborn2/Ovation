import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, shirtNumberSettingsTable } from "@workspace/db";
import { getShirtNumberSettings, isValidShirtNumber } from "@workspace/db/shirt-numbers";
import { seasonStartYearFor } from "@workspace/db/seasons";
import {
  AddSquadToShirtNumberSeasonParams,
  CommitShirtNumberUploadBody,
  CommitShirtNumberUploadParams,
  CreateShirtNumberBody,
  DeleteShirtNumberParams,
  DiscardShirtNumberUploadParams,
  ListShirtNumbersQueryParams,
  StartShirtNumberSeasonParams,
  UpdateShirtNumberBody,
  UpdateShirtNumberParams,
  UpdateShirtNumberSettingsBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { adminWriteRateLimiter, registerEditRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import { getOrCreateSettings } from "../lib/settings";
import { assertPlayerInTenantSpace } from "../lib/curated-player-space";
import {
  createSeniorEntry,
  deleteSeniorEntry,
  fillInLinkError,
  listSeniorEntries,
  loadSeasonEntries,
  seniorRegisterSeasons,
  startSeniorSeason,
  updateSeniorEntry,
} from "../lib/shirt-numbers";
import { enabledSettings, sendOutcome, validSeason } from "../lib/shirt-number-route-helpers";
import { shirtNumberFileUpload, type MulterRequest } from "../lib/import-upload";
import { addSquadToSeniorRegister } from "../lib/shirt-number-squad";
import {
  buildPreviewRows,
  commitSeniorUpload,
  createUpload,
  discardUpload,
  loadSeniorUploadRoster,
  parseShirtNumberUpload,
  UploadParseError,
} from "../lib/shirt-number-upload";

/**
 * Season shirt numbers — the senior register (plan U3). Tenant-curated content:
 * every read and write is scoped to `getTenantId(req)`, and the routes are
 * deliberately NOT behind `requireNativeStatsTenant` (central-read clubs keep a
 * register too). Writes need an admin with the curation entitlement; with the
 * feature off they refuse with 400, except the settings PATCH that turns it on.
 * Bulk uploads (U4) preview first and write only on commit; "Add squad to
 * register" adds the club's senior squad (`squad_members`) to a season. The
 * juniors register (U10) lives under /juniors only.
 */

const router: IRouter = Router();

// ── Settings ────────────────────────────────────────────────────────────────

router.get("/shirt-numbers/settings", requireAdmin, async (req, res): Promise<void> => {
  // Read-only: a tenant that never saved settings gets the defaults (off).
  res.json(await getShirtNumberSettings(db, getTenantId(req)));
});

router.patch(
  "/shirt-numbers/settings",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = UpdateShirtNumberSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    await getOrCreateSettings(shirtNumberSettingsTable, tenantId);
    await db
      .update(shirtNumberSettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(shirtNumberSettingsTable.tenantId, tenantId));
    res.json(await getShirtNumberSettings(db, tenantId));
  },
);

// ── Register ────────────────────────────────────────────────────────────────

router.get("/shirt-numbers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListShirtNumbersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const season = parsed.data.season ?? seasonStartYearFor(new Date());
  if (!validSeason(season)) {
    res.status(400).json({ error: "Invalid season" });
    return;
  }
  const tenantId = getTenantId(req);
  const [entries, seasons] = await Promise.all([
    listSeniorEntries(tenantId, season),
    seniorRegisterSeasons(tenantId),
  ]);
  res.json({ season, seasons, entries });
});

router.post(
  "/shirt-numbers",
  requireAdmin,
  requireEntitlement("curation"),
  registerEditRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = CreateShirtNumberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    if (!validSeason(body.season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    if (body.name.trim() === "") {
      res.status(400).json({ error: "A name is required" });
      return;
    }
    if (body.number != null && !isValidShirtNumber(body.number)) {
      res.status(400).json({ error: "A shirt number is 1 to 3 digits" });
      return;
    }
    const fillIn = fillInLinkError(body.playerId);
    if (fillIn) {
      res.status(400).json({ error: fillIn });
      return;
    }
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    const tenantId = getTenantId(req);
    await assertPlayerInTenantSpace(tenantId, body.playerId);
    const outcome = await createSeniorEntry(
      tenantId,
      {
        season: body.season,
        name: body.name,
        participantId: body.participantId,
        playerId: body.playerId,
        number: body.number,
        source: "admin",
      },
      settings,
    );
    sendOutcome(res, outcome, 201);
  },
);

router.patch(
  "/shirt-numbers/:id",
  requireAdmin,
  requireEntitlement("curation"),
  registerEditRateLimiter,
  async (req, res): Promise<void> => {
    const params = UpdateShirtNumberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateShirtNumberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    if (body.name !== undefined && body.name.trim() === "") {
      res.status(400).json({ error: "A name is required" });
      return;
    }
    if (body.number != null && !isValidShirtNumber(body.number)) {
      res.status(400).json({ error: "A shirt number is 1 to 3 digits" });
      return;
    }
    const fillIn = fillInLinkError(body.playerId);
    if (fillIn) {
      res.status(400).json({ error: fillIn });
      return;
    }
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    const tenantId = getTenantId(req);
    await assertPlayerInTenantSpace(tenantId, body.playerId);
    const outcome = await updateSeniorEntry(
      tenantId,
      params.data.id,
      {
        name: body.name,
        // `nullish` in the contract: undefined leaves the field, null clears it.
        participantId: body.participantId,
        playerId: body.playerId,
        number: body.number,
      },
      settings,
    );
    sendOutcome(res, outcome, 200);
  },
);

router.delete(
  "/shirt-numbers/:id",
  requireAdmin,
  requireEntitlement("curation"),
  registerEditRateLimiter,
  async (req, res): Promise<void> => {
    const params = DeleteShirtNumberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await enabledSettings(req, res))) return;
    if (!(await deleteSeniorEntry(getTenantId(req), params.data.id))) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/shirt-numbers/seasons/:season/start",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = StartShirtNumberSeasonParams.safeParse(req.params);
    if (!params.success || !validSeason(params.data.season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    res.json(await startSeniorSeason(getTenantId(req), params.data.season, settings));
  },
);

// "Add squad to register" (R5): the active senior members of the club's squad
// register, the one PlayHQ import. Only `section = 'senior'` members are read,
// and only the senior register is written.
router.post(
  "/shirt-numbers/seasons/:season/from-squad",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = AddSquadToShirtNumberSeasonParams.safeParse(req.params);
    if (!params.success || !validSeason(params.data.season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    res.json(await addSquadToSeniorRegister(getTenantId(req), params.data.season, settings));
  },
);

// ── Uploads (U4) ────────────────────────────────────────────────────────────

router.post(
  "/shirt-numbers/uploads",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  shirtNumberFileUpload,
  async (req: Request, res): Promise<void> => {
    const file = (req as MulterRequest).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }
    const kind = req.body?.kind;
    if (kind !== "numbers") {
      res.status(400).json({ error: 'kind must be "numbers"' });
      return;
    }
    const seasonRaw = String(req.body?.season ?? "");
    const season = /^\d+$/.test(seasonRaw) ? Number(seasonRaw) : NaN;
    if (!validSeason(season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    if (!(await enabledSettings(req, res))) return;

    let parsed;
    try {
      parsed = await parseShirtNumberUpload(file.buffer, file.originalname);
    } catch (e) {
      if (e instanceof UploadParseError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }

    const tenantId = getTenantId(req);
    let rows: ReturnType<typeof buildPreviewRows> = [];
    if (parsed.errors.length === 0 && parsed.rows.length > 0) {
      const [roster, entries] = await Promise.all([
        loadSeniorUploadRoster(tenantId),
        loadSeasonEntries(db, "senior", tenantId, season),
      ]);
      rows = buildPreviewRows(parsed.rows, roster, entries);
    }
    const preview = await createUpload({
      tenantId,
      side: "senior",
      kind,
      season,
      payload: {
        fileName: file.originalname.slice(0, 255),
        rows,
        unrecognisedHeaders: parsed.unrecognisedHeaders,
        errors: parsed.errors,
      },
    });
    res.json(preview);
  },
);

router.post(
  "/shirt-numbers/uploads/:id/commit",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = CommitShirtNumberUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CommitShirtNumberUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    const outcome = await commitSeniorUpload(
      getTenantId(req),
      params.data.id,
      parsed.data.resolutions,
      settings,
    );
    if (outcome.ok) {
      res.json(outcome.result);
      return;
    }
    res.status(outcome.status).json(outcome.body);
  },
);

router.delete(
  "/shirt-numbers/uploads/:id",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = DiscardShirtNumberUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Discarding only clears a preview, so it works with the feature off too.
    if (!(await discardUpload(getTenantId(req), "senior", params.data.id))) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
