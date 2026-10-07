import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { isValidShirtNumber } from "@workspace/db/shirt-numbers";
import { seasonStartYearFor } from "@workspace/db/seasons";
import {
  AddSquadToJuniorShirtNumberSeasonParams,
  CommitJuniorShirtNumberUploadBody,
  CommitJuniorShirtNumberUploadParams,
  CreateJuniorShirtNumberBody,
  DeleteJuniorShirtNumberParams,
  DiscardJuniorShirtNumberUploadParams,
  ListJuniorShirtNumbersQueryParams,
  StartJuniorShirtNumberSeasonParams,
  UpdateJuniorShirtNumberBody,
  UpdateJuniorShirtNumberParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { adminWriteRateLimiter, registerEditRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import { isCentralTenant } from "../lib/tenant";
import { loadSeasonEntries } from "../lib/shirt-numbers";
import { shirtNumberFileUpload, type MulterRequest } from "../lib/import-upload";
import {
  createUpload,
  discardUpload,
  parseShirtNumberUpload,
  UploadParseError,
  type PreviewRow,
} from "../lib/shirt-number-upload";
import {
  buildJuniorPreviewRows,
  commitJuniorUpload,
  createJuniorEntry,
  deleteJuniorEntry,
  juniorRegisterSeasons,
  listJuniorEntries,
  loadJuniorIdentity,
  resolveJuniorParticipant,
  startJuniorSeason,
  updateJuniorEntry,
} from "../lib/junior-shirt-numbers";
import { enabledSettings, sendOutcome, validSeason } from "../lib/shirt-number-route-helpers";
import { addSquadToJuniorRegister } from "../lib/shirt-number-squad";

/**
 * Season shirt numbers — the juniors register (plan U10; R17). Kept apart from
 * the senior register in every way: its own table (`junior_shirt_numbers`),
 * routes under /api/juniors only, entries keyed on the tenant's junior
 * participants and never a senior player. Settings are shared with the senior
 * register (one switch and one set of policies per club, read from
 * /api/shirt-numbers/settings).
 *
 * Juniors gating: a central-read tenant has no native junior data, so the
 * register reads empty and every write 404s, exactly like the other juniors
 * routes. Writes need an admin with the curation entitlement and, with the
 * feature off, refuse with 400.
 */

const router: IRouter = Router();

const NO_JUNIORS = "Juniors are not available for this club.";

/** True (and a 404 sent) when the tenant has no native junior data. */
async function refuseCentral(req: Request, res: Response): Promise<boolean> {
  if (!(await isCentralTenant(req))) return false;
  res.status(404).json({ error: NO_JUNIORS });
  return true;
}

// ── Register ────────────────────────────────────────────────────────────────

router.get("/juniors/shirt-numbers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListJuniorShirtNumbersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const season = parsed.data.season ?? seasonStartYearFor(new Date());
  if (!validSeason(season)) {
    res.status(400).json({ error: "Invalid season" });
    return;
  }
  // Central tenants have no native junior participants — an empty register, no leak.
  if (await isCentralTenant(req)) {
    res.json({ season, seasons: [], entries: [] });
    return;
  }
  const tenantId = getTenantId(req);
  const [entries, seasons] = await Promise.all([
    listJuniorEntries(tenantId, season),
    juniorRegisterSeasons(tenantId),
  ]);
  res.json({ season, seasons, entries });
});

router.post(
  "/juniors/shirt-numbers",
  requireAdmin,
  requireEntitlement("curation"),
  registerEditRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = CreateJuniorShirtNumberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    if (!validSeason(body.season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    if (body.number != null && !isValidShirtNumber(body.number)) {
      res.status(400).json({ error: "A shirt number is 1 to 3 digits" });
      return;
    }
    if (await refuseCentral(req, res)) return;
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    const tenantId = getTenantId(req);
    const participant = await resolveJuniorParticipant(db, tenantId, body.participantId);
    if (!participant) {
      res.status(400).json({ error: "That is not one of this club's junior participants." });
      return;
    }
    const name = (body.name ?? "").trim() || (participant.displayName ?? "").trim();
    if (name === "") {
      res.status(400).json({ error: "A name is required" });
      return;
    }
    const outcome = await createJuniorEntry(
      tenantId,
      {
        season: body.season,
        participantId: participant.participantId,
        name,
        number: body.number,
        source: "admin",
      },
      settings,
    );
    sendOutcome(res, outcome, 201);
  },
);

router.patch(
  "/juniors/shirt-numbers/:id",
  requireAdmin,
  requireEntitlement("curation"),
  registerEditRateLimiter,
  async (req, res): Promise<void> => {
    const params = UpdateJuniorShirtNumberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateJuniorShirtNumberBody.safeParse(req.body);
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
    if (await refuseCentral(req, res)) return;
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    const outcome = await updateJuniorEntry(
      getTenantId(req),
      params.data.id,
      { name: body.name, number: body.number },
      settings,
    );
    sendOutcome(res, outcome, 200);
  },
);

router.delete(
  "/juniors/shirt-numbers/:id",
  requireAdmin,
  requireEntitlement("curation"),
  registerEditRateLimiter,
  async (req, res): Promise<void> => {
    const params = DeleteJuniorShirtNumberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await refuseCentral(req, res)) return;
    if (!(await enabledSettings(req, res))) return;
    if (!(await deleteJuniorEntry(getTenantId(req), params.data.id))) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/juniors/shirt-numbers/seasons/:season/start",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = StartJuniorShirtNumberSeasonParams.safeParse(req.params);
    if (!params.success || !validSeason(params.data.season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    if (await refuseCentral(req, res)) return;
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    res.json(await startJuniorSeason(getTenantId(req), params.data.season, settings));
  },
);

// "Add squad to register" for juniors: the active junior members of the club's
// squad register, each matched to one of the club's junior participants. Only
// `section = 'junior'` members are read, and only the juniors register is
// written (juniors isolation).
router.post(
  "/juniors/shirt-numbers/seasons/:season/from-squad",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = AddSquadToJuniorShirtNumberSeasonParams.safeParse(req.params);
    if (!params.success || !validSeason(params.data.season)) {
      res.status(400).json({ error: "Invalid season" });
      return;
    }
    if (await refuseCentral(req, res)) return;
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    res.json(await addSquadToJuniorRegister(getTenantId(req), params.data.season, settings));
  },
);

// ── Uploads ─────────────────────────────────────────────────────────────────

router.post(
  "/juniors/shirt-numbers/uploads",
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
    if (await refuseCentral(req, res)) return;
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
    let rows: PreviewRow[] = [];
    if (parsed.errors.length === 0 && parsed.rows.length > 0) {
      const [identity, entries] = await Promise.all([
        loadJuniorIdentity(db, tenantId),
        loadSeasonEntries(db, "junior", tenantId, season),
      ]);
      rows = buildJuniorPreviewRows(parsed.rows, identity.participants, identity.merges, entries);
    }
    const preview = await createUpload({
      tenantId,
      side: "junior",
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
  "/juniors/shirt-numbers/uploads/:id/commit",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = CommitJuniorShirtNumberUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CommitJuniorShirtNumberUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (await refuseCentral(req, res)) return;
    const settings = await enabledSettings(req, res);
    if (!settings) return;
    const outcome = await commitJuniorUpload(
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
  "/juniors/shirt-numbers/uploads/:id",
  requireAdmin,
  requireEntitlement("curation"),
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const params = DiscardJuniorShirtNumberUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await refuseCentral(req, res)) return;
    // Discarding only clears a preview, so it works with the feature off too.
    if (!(await discardUpload(getTenantId(req), "junior", params.data.id))) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
