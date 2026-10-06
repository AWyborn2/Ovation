import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { loadClubIdentity } from "../lib/club-overlay";
import { getRequestCentralClubId } from "../lib/tenant";
import { inClubGradeOrder } from "../lib/club-grade-order";

/**
 * Social Studio prefill reads for the fixture/stats-driven Pack A cards
 * (Ladder A7, Club Runs/Wickets leaderboard A19/A20, Weekend Wrap A6). All
 * reads funnel through `@workspace/db/central-queries` (repo invariant) and are
 * gated to socialStudio admins. central-queries is imported lazily so the
 * tenant-only server path never loads the central pool. The leader and
 * performer picks fold the tenant's confirmed player merges (club overlay), so
 * a merged pair is one player here as everywhere else.
 */
const router: IRouter = Router();

function firstValue(v: unknown): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
}

function parseIntParam(v: unknown): number | undefined {
  const raw = firstValue(v);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

router.get(
  "/social-prefill/ladder",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const grade = firstValue(req.query.grade);
    if (grade === undefined) {
      res.status(400).json({ error: "grade is required" });
      return;
    }
    const season = parseIntParam(req.query.season) ?? null;
    const clubId = await getRequestCentralClubId(req);
    const { centralLadder } = await import("@workspace/db/central-queries");
    res.json(await centralLadder(clubId, season, grade));
  },
);

router.get(
  "/social-prefill/club-season-totals",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const season = parseIntParam(req.query.season);
    if (season === undefined) {
      res.status(400).json({ error: "season is required" });
      return;
    }
    const clubId = await getRequestCentralClubId(req);
    const { merges } = await loadClubIdentity(getTenantId(req));
    const { centralClubTotalsBySeason } = await import("@workspace/db/central-queries");
    res.json(await centralClubTotalsBySeason(clubId, season, merges));
  },
);

router.get(
  "/social-prefill/weekend-wrap",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const season = parseIntParam(req.query.season);
    const round = parseIntParam(req.query.round);
    if (season === undefined || round === undefined) {
      res.status(400).json({ error: "season and round are required" });
      return;
    }
    const clubId = await getRequestCentralClubId(req);
    const tenantId = getTenantId(req);
    const { merges } = await loadClubIdentity(tenantId);
    const { centralWeekendWrap } = await import("@workspace/db/central-queries");
    const wrap = await centralWeekendWrap(clubId, season, round, merges);
    res.json({ ...wrap, matches: await inClubGradeOrder(tenantId, wrap.matches) });
  },
);

export default router;
