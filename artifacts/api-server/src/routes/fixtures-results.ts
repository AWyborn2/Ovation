import { Router, type IRouter } from "express";
import {
  GetFixturesResultsLadderQueryParams,
  ListFixturesResultsQueryParams,
} from "@workspace/api-zod";
import { getTenantId } from "../middlewares/tenant-context";
import { getTenantPlayhqOrgId, tenantIsCentral } from "../lib/tenant";

const router: IRouter = Router();

/**
 * Public Fixtures & Results: the tenant's club as published on
 * play.cricket.com.au, read from the `playhq.*` landing schema through the
 * central-queries funnel. A tenant with no `playhq_org_id` gets
 * `linked: false` and empty lists — never another club's fixtures.
 */
router.get("/fixtures-results", async (req, res): Promise<void> => {
  const query = ListFixturesResultsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const orgId = await getTenantPlayhqOrgId(tenantId);
  if (!orgId) {
    res.json({ linked: false, seasons: [], latestSeason: null, grades: [], matches: [] });
    return;
  }
  const { playhqClubFixtures } = await import("@workspace/db/central-queries");
  // Scorecard links only make sense when the tenant's /matches/:id ARE central
  // match ids (the raw flag is enough: an unlinked native tenant gets no ids).
  const withScorecardIds = await tenantIsCentral(tenantId);
  const page = await playhqClubFixtures(orgId, {
    season: query.data.season || null,
    grade: query.data.grade || null,
    withScorecardIds,
  });
  res.json({ linked: true, ...page });
});

router.get("/fixtures-results/ladder", async (req, res): Promise<void> => {
  const query = GetFixturesResultsLadderQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const orgId = await getTenantPlayhqOrgId(getTenantId(req));
  if (!orgId) {
    res.status(404).json({ error: "PlayHQ is not linked for this club" });
    return;
  }
  const { playhqGradeLadder } = await import("@workspace/db/central-queries");
  const ladder = await playhqGradeLadder(query.data.gradeId, orgId);
  if (!ladder) {
    res.status(404).json({ error: "Grade not found" });
    return;
  }
  res.json(ladder);
});

export default router;
