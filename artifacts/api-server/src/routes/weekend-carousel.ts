import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db, fixturesTable, clubPhotosTable } from "@workspace/db";
import { centralDb, playhqMatchesTable } from "@workspace/db/central";
import { GetWeekendCarouselSourcesQueryParams, GetWeekendCarouselSourcesResponse } from "@workspace/api-zod";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { CLUB_TIME_ZONE, clubTimeToUtc } from "../lib/round-schedules";
import { getTenantPlayhqOrgId } from "../lib/tenant";
import { nonSeniorPlayerIds, presentPhotos } from "../lib/club-photo-library";

const router: IRouter = Router();

router.get("/weekend-carousel/sources", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = GetWeekendCarouselSourcesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid start and end date." });
    return;
  }
  const { from, to } = parsed.data;
  const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s))
    && new Date(s).toISOString().slice(0, 10) === s;
  if (!validDay(from) || !validDay(to) || from > to) {
    res.status(400).json({ error: "Choose a valid date range." });
    return;
  }
  const endDay = new Date(`${to}T12:00:00Z`);
  endDay.setUTCDate(endDay.getUTCDate() + 1);
  const start = clubTimeToUtc(`${from}T00:00`)!;
  const end = clubTimeToUtc(`${endDay.toISOString().slice(0, 10)}T00:00`)!;
  const tenantId = getTenantId(req);
  const rows = await db.select().from(fixturesTable).where(and(
    eq(fixturesTable.tenantId, tenantId), gte(fixturesTable.startAt, start), lt(fixturesTable.startAt, end),
  )).orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id));
  const ids = rows.flatMap(f => f.source === "playhq" && f.playhqMatchId ? [f.playhqMatchId] : []);
  const status = new Map<string, string>();
  if (ids.length) {
    try {
      const orgId = await getTenantPlayhqOrgId(tenantId);
      if (!orgId) throw new Error("Missing club organisation mapping");
      const matches = await centralDb.select({ id: playhqMatchesTable.id, status: playhqMatchesTable.status })
        .from(playhqMatchesTable).where(and(inArray(playhqMatchesTable.id, ids),
          or(eq(playhqMatchesTable.homeOrgId, orgId), eq(playhqMatchesTable.awayOrgId, orgId))));
      for (const match of matches) status.set(match.id, match.status ?? "UNKNOWN");
      if (ids.some(id => !status.has(id))) throw new Error("Missing source fixture");
    } catch (error) {
      req.log.warn({ err: error, tenantId }, "Weekend carousel fixture status lookup failed");
      res.status(503).json({ error: "Could not verify PlayHQ fixture status. Retry before exporting." });
      return;
    }
  }
  const fixtures = rows.filter(f =>
    !/^bye$/i.test(f.opponentName.trim()) &&
    !/cancelled|canceled|abandoned|^bye$/i.test(status.get(f.playhqMatchId ?? "") ?? "") &&
    !/\b(cancelled|canceled|abandoned)\b/i.test(f.notes ?? ""),
  );
  const grades = [...new Set(fixtures.map(f => f.grade).filter(g => !isJuniorGradeLabel(g)))];
  const photoRows = grades.length ? await db.select().from(clubPhotosTable).where(and(
    eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.grade, grades),
  )) : [];
  const eligible = photoRows.filter(p => p.photoTypes.some(t => ["batting", "bowling", "fielding"].includes(t)));
  // Club-wide is represented by a NULL grade, not all grade folders.
  const coverRows = await db.select().from(clubPhotosTable).where(and(
    eq(clubPhotosTable.tenantId, tenantId), isNull(clubPhotosTable.grade),
    eq(clubPhotosTable.season, 2026),
  )).orderBy(asc(clubPhotosTable.id));
  const coverPhotos = await presentPhotos(tenantId, coverRows);
  const unsafePlayerIds = new Set(await nonSeniorPlayerIds(tenantId, coverPhotos.flatMap(p => p.playerIds)));
  res.json(GetWeekendCarouselSourcesResponse.parse({
    timeZone: CLUB_TIME_ZONE,
    fixtures: fixtures.map(f => ({ ...f, startAt: f.startAt.toISOString(), createdAt: f.createdAt.toISOString() })),
    photos: await presentPhotos(tenantId, eligible),
    coverPhotos: coverPhotos.filter(p => !p.playerIds.some(id => unsafePlayerIds.has(id))),
    warnings: fixtures.length < rows.length ? [`Excluded ${rows.length - fixtures.length} bye or cancelled/abandoned fixture(s).`] : [],
  }));
});

export default router;
