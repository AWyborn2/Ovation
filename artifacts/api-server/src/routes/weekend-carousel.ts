import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, fixturesTable, clubPhotosTable } from "@workspace/db";
import { playhqMatchStatusesForClub } from "@workspace/db/central-queries";
import {
  GetWeekendCarouselSourcesQueryParams,
  GetWeekendCarouselSourcesResponse,
} from "@workspace/api-zod";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { CLUB_TIME_ZONE, clubTimeToUtc } from "../lib/round-schedules";
import { getTenantPlayhqOrgId } from "../lib/tenant";
import { nonSeniorPlayerIds, presentPhotos } from "../lib/club-photo-library";
import { carouselContent } from "../lib/carousel-content";
import { loadClubGradeOrder } from "../lib/club-grade-order";
import { sortByGradeOrder } from "@workspace/scorecard";

const router: IRouter = Router();

router.get(
  "/weekend-carousel/sources",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = GetWeekendCarouselSourcesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a valid start and end date." });
      return;
    }
    const { from, to, setType = "matchDay" } = parsed.data;
    const validDay = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s;
    if (!validDay(from) || !validDay(to) || from > to) {
      res.status(400).json({ error: "Choose a valid date range." });
      return;
    }
    const endDay = new Date(`${to}T12:00:00Z`);
    endDay.setUTCDate(endDay.getUTCDate() + 1);
    const start = clubTimeToUtc(`${from}T00:00`)!;
    const end = clubTimeToUtc(`${endDay.toISOString().slice(0, 10)}T00:00`)!;
    const tenantId = getTenantId(req);
    const rows = await db
      .select()
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.tenantId, tenantId),
          gte(fixturesTable.startAt, start),
          lt(fixturesTable.startAt, end),
        ),
      )
      .orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id));
    const ids =
      setType === "results" || setType === "matchSummary"
        ? []
        : rows.flatMap((f) => (f.source === "playhq" && f.playhqMatchId ? [f.playhqMatchId] : []));
    let status = new Map<string, string>();
    if (ids.length) {
      try {
        const orgId = await getTenantPlayhqOrgId(tenantId);
        if (!orgId) throw new Error("Missing club organisation mapping");
        status = await playhqMatchStatusesForClub(orgId, ids);
        if (ids.some((id) => !status.has(id))) throw new Error("Missing source fixture");
      } catch (error) {
        req.log.warn({ err: error, tenantId }, "Weekend carousel fixture status lookup failed");
        res
          .status(503)
          .json({ error: "Could not verify PlayHQ fixture status. Retry before exporting." });
        return;
      }
    }
    const eligibleFixtures = rows.filter(
      (f) =>
        !/^bye$/i.test(f.opponentName.trim()) &&
        !/cancelled|canceled|abandoned|^bye$/i.test(status.get(f.playhqMatchId ?? "") ?? "") &&
        !/\b(cancelled|canceled|abandoned)\b/i.test(f.notes ?? ""),
    );
    let sources;
    try {
      sources = await carouselContent(req, tenantId, setType, eligibleFixtures, from, to);
    } catch (error) {
      req.log.warn({ err: error, tenantId }, "Carousel source lookup failed");
      res
        .status(503)
        .json({ error: "Could not load team lists or scorecards. Retry before generating." });
      return;
    }
    const fixtures = sortByGradeOrder(
      sources.fixtures,
      (f) => f.grade,
      await loadClubGradeOrder(tenantId),
    );
    const grades = [
      ...new Set(
        fixtures
          .filter((f) => sources.content[f.id]?.junior !== true)
          .map((f) => f.grade)
          .filter((g) => !isJuniorGradeLabel(g)),
      ),
    ];
    const photoRows = grades.length
      ? await db
          .select()
          .from(clubPhotosTable)
          .where(
            and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.grade, grades)),
          )
      : [];
    const eligible = photoRows.filter((p) =>
      p.photoTypes.some((t) => ["batting", "bowling", "fielding"].includes(t)),
    );
    // Club-wide is represented by a NULL grade, not all grade folders.
    const coverRows = await db
      .select()
      .from(clubPhotosTable)
      .where(
        and(
          eq(clubPhotosTable.tenantId, tenantId),
          isNull(clubPhotosTable.grade),
          eq(clubPhotosTable.season, 2026),
        ),
      )
      .orderBy(asc(clubPhotosTable.id));
    const coverPhotos = await presentPhotos(tenantId, coverRows);
    const teamPhotos = await presentPhotos(tenantId, eligible);
    const unsafePlayerIds = new Set(
      await nonSeniorPlayerIds(
        tenantId,
        [...coverPhotos, ...teamPhotos].flatMap((p) => p.playerIds),
      ),
    );
    res.json(
      GetWeekendCarouselSourcesResponse.parse({
        timeZone: CLUB_TIME_ZONE,
        fixtures: fixtures.map((f) => ({
          ...f,
          startAt: f.startAt.toISOString(),
          createdAt: f.createdAt.toISOString(),
        })),
        photos: teamPhotos.filter((p) => !p.playerIds.some((id) => unsafePlayerIds.has(id))),
        coverPhotos: coverPhotos.filter((p) => !p.playerIds.some((id) => unsafePlayerIds.has(id))),
        // Keep the structured roundLabel beside each card input, independent of
        // its display title. The opaque source payload also accepts legacy inputs.
        content: sources.content,
        warnings: [
          ...(eligibleFixtures.length < rows.length
            ? [
                `Excluded ${rows.length - eligibleFixtures.length} bye or cancelled/abandoned fixture(s).`,
              ]
            : []),
          ...sources.warnings,
        ],
      }),
    );
  },
);

export default router;
