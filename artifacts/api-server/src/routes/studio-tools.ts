import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, fixturesTable } from "@workspace/db";
import { GetFixtureForecastQueryParams, RemovePhotoBackgroundBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { presentPhotos } from "../lib/club-photo-library";
import {
  backgroundRemovalEnabled,
  cutOutLibraryPhoto,
} from "../lib/integrations/background-removal";
import { ForecastError, getForecast } from "../lib/integrations/forecast";

/**
 * `/studio-tools` — the Studio editor's external-service tools (Social Studio
 * U19; KTD14). Admin-only and tenant-scoped. A tool that is not configured
 * (no provider key, or no venue coordinates for a forecast) answers 404, and
 * the editor hides it.
 */
const router: IRouter = Router();

router.get("/studio-tools/background-removal", requireAdmin, (_req, res): void => {
  if (!backgroundRemovalEnabled()) {
    res.status(404).json({ error: "Background removal is not configured." });
    return;
  }
  res.json({ available: true });
});

router.post("/studio-tools/background-removal", requireAdmin, async (req, res): Promise<void> => {
  if (!backgroundRemovalEnabled()) {
    res.status(404).json({ error: "Background removal is not configured." });
    return;
  }
  const parsed = RemovePhotoBackgroundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const result = await cutOutLibraryPhoto(tenantId, parsed.data.photoId);
  if (!result.ok) {
    const status =
      result.reason === "not_senior"
        ? 422
        : result.reason === "provider"
          ? 502
          : 404; /* disabled, not_found */
    if (result.reason === "provider") {
      req.log.warn(
        { photoId: parsed.data.photoId },
        `background removal failed: ${result.message}`,
      );
    }
    res.status(status).json({ error: result.message });
    return;
  }
  const [photo] = await presentPhotos(tenantId, [result.photo]);
  res.json(photo);
});

router.get("/studio-tools/forecast", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GetFixtureForecastQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const [fixture] = await db
    .select({
      id: fixturesTable.id,
      venue: fixturesTable.venue,
      startAt: fixturesTable.startAt,
      latitude: fixturesTable.venueLatitude,
      longitude: fixturesTable.venueLongitude,
    })
    .from(fixturesTable)
    .where(and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.id, parsed.data.fixtureId)));
  if (!fixture) {
    res.status(404).json({ error: "fixture not found" });
    return;
  }
  if (fixture.latitude == null || fixture.longitude == null) {
    res.status(404).json({ error: "This fixture's venue has no coordinates." });
    return;
  }
  try {
    const forecast = await getForecast(fixture.latitude, fixture.longitude, fixture.startAt);
    if (!forecast) {
      res.status(404).json({ error: "No forecast is available for this fixture's start time." });
      return;
    }
    res.json({
      fixtureId: fixture.id,
      venue: fixture.venue,
      hour: forecast.hour,
      temperatureC: forecast.temperatureC,
      weatherCode: forecast.weatherCode,
      conditions: forecast.conditions,
      attribution: forecast.attribution,
    });
  } catch (err) {
    if (!(err instanceof ForecastError)) throw err;
    req.log.warn({ fixtureId: fixture.id }, `forecast failed: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

export default router;
