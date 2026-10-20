import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, fixturesTable } from "@workspace/db";
import { playhqMatchStatusesForClub } from "@workspace/db/central-queries";
import {
  GetWeekendCarouselSourcesQueryParams,
  GetWeekendCarouselSourcesResponse,
} from "@workspace/api-zod";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { isMatchDayDataField, type MatchDayDataField } from "@workspace/scorecard/card-content";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { CLUB_TIME_ZONE, clubTimeToUtc } from "../lib/round-schedules";
import { getTenantPlayhqOrgId } from "../lib/tenant";
import { carouselContent } from "../lib/carousel-content";
import { loadClubGradeOrder } from "../lib/club-grade-order";
import { sortByGradeOrder } from "@workspace/scorecard";
import {
  OPTIONAL_FIELD_WARNING,
  buildMatchDayContent,
  contentNames,
} from "../lib/card-content/match-day";
import { buildMatchDayPhotos, loadCarouselPhotos } from "../lib/card-content/photos";
import { loadSponsorsPageSources } from "../lib/card-content/sponsors-page";

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
    const { from, to, setType = "matchDay", audience = "all" } = parsed.data;
    // The visible optional data fields (ADR-010 P5): only these are loaded.
    const dataFields = new Set<MatchDayDataField>(
      (parsed.data.fields ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(isMatchDayDataField),
    );
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
    const rows =
      audience === "junior"
        ? []
        : await db
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
      sources = await carouselContent(req, tenantId, setType, eligibleFixtures, from, to, audience);
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
    // Match Day slides come from the same builder as the 48-hour sweep (ADR-010).
    const names =
      setType === "matchDay"
        ? await contentNames(tenantId, (err) =>
            req.log.warn({ err, tenantId }, "card names: read failed"),
          )
        : {};
    const optionalWarnings: string[] = [];
    const matchDayContent =
      setType === "matchDay"
        ? await buildMatchDayContent(tenantId, fixtures, {
            junior: sources.junior,
            names,
            fields: dataFields,
            onOptionalError: (field, err) => {
              req.log.warn({ err, tenantId, field }, "match day optional data: read failed");
              optionalWarnings.push(OPTIONAL_FIELD_WARNING[field]);
            },
          })
        : null;
    // The sponsors page's optional blocks (ADR-010 P6), each best effort.
    const sponsorsPage =
      setType === "matchDay"
        ? await loadSponsorsPageSources(tenantId, {
            from: start,
            juniorOnly: audience === "junior",
            names,
            onError: (block, err) =>
              req.log.warn({ err, tenantId, block }, "sponsors page: read failed"),
          })
        : null;
    const isJunior = (id: number) =>
      sources.content[id]?.junior === true || matchDayContent?.get(id)?.junior === true;
    const grades = [
      ...new Set(
        fixtures
          .filter((f) => !isJunior(f.id))
          .map((f) => f.grade)
          .filter((g) => !isJuniorGradeLabel(g)),
      ),
    ];
    const libraryPhotos = await loadCarouselPhotos(tenantId, grades);
    // The automatic photos (ADR-010 P4), from the same pools the admin picks from.
    const photoPicks = matchDayContent
      ? await buildMatchDayPhotos(tenantId, [...matchDayContent.values()], {
          photos: libraryPhotos,
        })
      : null;
    res.json(
      GetWeekendCarouselSourcesResponse.parse({
        timeZone: CLUB_TIME_ZONE,
        fixtures: fixtures.map((f) => ({
          ...f,
          startAt: f.startAt.toISOString(),
          createdAt: f.createdAt.toISOString(),
        })),
        photos: libraryPhotos.photos,
        coverPhotos: libraryPhotos.coverPhotos,
        juniorStockPhotos: libraryPhotos.juniorStockPhotos,
        ...(photoPicks ? { photoPicks } : {}),
        // Keep the structured roundLabel beside each card input, independent of
        // its display title. The opaque source payload also accepts legacy inputs.
        content: sources.content,
        ...(matchDayContent ? { matchDayContent: Object.fromEntries(matchDayContent) } : {}),
        ...(sponsorsPage ? { sponsorsPage } : {}),
        warnings: [
          ...(eligibleFixtures.length < rows.length
            ? [
                `Excluded ${rows.length - eligibleFixtures.length} bye or cancelled/abandoned fixture(s).`,
              ]
            : []),
          ...sources.warnings,
          ...optionalWarnings,
        ],
      }),
    );
  },
);

export default router;
