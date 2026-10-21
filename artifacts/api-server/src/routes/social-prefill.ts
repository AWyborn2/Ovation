import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { loadClubIdentity } from "../lib/club-overlay";
import { getRequestCentralClubId } from "../lib/tenant";
import { inClubGradeOrder, loadClubGradeOrder } from "../lib/club-grade-order";
import { sortByGradeOrder } from "@workspace/scorecard";
import { taggedPlayerPhotoUrls } from "../lib/club-photo-library";
import {
  db,
  fixturesTable,
  playerIdMapTable,
  playerImagesTable,
  teamListsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  GetSocialMatchSummaryPrefillParams,
  GetSocialMatchSummaryPrefillResponse,
  GetSocialTeamListPrefillParams,
  GetSocialTeamListPrefillResponse,
  type MatchDetail,
} from "@workspace/api-zod";
import { resultDraftInput, teamListDraftInput } from "@workspace/scorecard/card-content";
import { dataSource } from "../lib/tenant";
import { loadCentralMatchDetail, loadMatchDetail } from "../lib/match-detail";
import { buildMatchSummaryContent } from "../lib/card-content/results";
import { buildTeamListContent } from "../lib/card-content/team-list";
import { contentVisibleFields } from "../lib/card-content/visible-fields";

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

/**
 * Results summary + team of the week prefill: a round's results per grade with
 * both scores and the best two batters and bowlers, and the round's standout
 * performers with their library photo or headshot where the club has one.
 * Seniors only (central data); private players are never named.
 */
router.get(
  "/social-prefill/round-results",
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
    const { centralRoundResults } = await import("@workspace/db/central-queries");
    const round_ = await centralRoundResults(clubId, season, round, merges);
    const order = await loadClubGradeOrder(tenantId);
    const results = sortByGradeOrder(round_.results, (r) => r.grade, order);
    const photos = await teamOfWeekPhotos(
      tenantId,
      round_.teamOfWeek.map((p) => p.participantId),
    );
    res.json({
      roundLabel: round_.roundLabel,
      dateLabel: round_.dateLabel,
      results,
      teamOfWeek: round_.teamOfWeek.map(({ participantId, ...p }) => ({
        ...p,
        photoUrl: photos.get(participantId) ?? null,
      })),
    });
  },
);

/**
 * Create a Card's match result prefill (ADR-010 P7): the card the results
 * sweep drafts for this match, from the same scorecard loader, content builder
 * and content choices, so a card made by hand matches the auto-queued one.
 */
router.get(
  "/social-prefill/match-summary/:matchId",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = GetSocialMatchSummaryPrefillParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Choose a valid match." });
      return;
    }
    const tenantId = getTenantId(req);
    const source = await dataSource(req);
    const matchId = params.data.matchId;
    const detail =
      source.kind === "central"
        ? await loadCentralMatchDetail({ tenantId, clubId: source.clubId }, matchId)
        : await loadMatchDetail(matchId, tenantId);
    if (!detail) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const [content] = await buildMatchSummaryContent(tenantId, [
      { matchId, detail: detail as MatchDetail },
    ]);
    const visible = await contentVisibleFields(tenantId, "matchSummary");
    res.json(
      GetSocialMatchSummaryPrefillResponse.parse({
        input: resultDraftInput(content!, visible),
        warnings: [],
      }),
    );
  },
);

/**
 * Create a Card's team list prefill (ADR-010 P7): the card the team list sweep
 * drafts for this fixture, from the same builder and content choices. The
 * saved list is used whether or not it is published yet (the admin is making
 * the card by hand); a fixture without one gets its heading and no players.
 */
router.get(
  "/social-prefill/team-list/:fixtureId",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = GetSocialTeamListPrefillParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Choose a valid fixture." });
      return;
    }
    const tenantId = getTenantId(req);
    const [fixture] = await db
      .select()
      .from(fixturesTable)
      .where(
        and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.id, params.data.fixtureId)),
      );
    if (!fixture) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fixture.id)));
    const warnings: string[] = [];
    const [content] = await buildTeamListContent(
      tenantId,
      [
        {
          fixture,
          list: list ?? {
            tenantId,
            fixtureId: fixture.id,
            source: "admin",
            isPublished: false,
            players: [],
          },
        },
      ],
      { onWarning: (_fixture, warning) => warnings.push(warning) },
    );
    if (!list?.players.length) warnings.push("This fixture has no saved team list yet.");
    const visible = await contentVisibleFields(tenantId, "teamList");
    res.json(
      GetSocialTeamListPrefillResponse.parse({
        input: teamListDraftInput(content!, visible),
        warnings,
      }),
    );
  },
);

/** Each player's library photo, else their headshot, by central participant id. */
async function teamOfWeekPhotos(
  tenantId: number,
  participantIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (participantIds.length === 0) return out;
  const mapped = await db
    .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(
      and(
        eq(playerIdMapTable.tenantId, tenantId),
        inArray(playerIdMapTable.participantId, participantIds),
      ),
    );
  const playerIds = mapped.map((m) => m.playerId);
  const [library, headshots] = await Promise.all([
    taggedPlayerPhotoUrls(tenantId, playerIds),
    playerIds.length
      ? db
          .select({ playerId: playerImagesTable.playerId, url: playerImagesTable.imageUrl })
          .from(playerImagesTable)
          .where(
            and(
              eq(playerImagesTable.tenantId, tenantId),
              inArray(playerImagesTable.playerId, playerIds),
              eq(playerImagesTable.isDefault, true),
            ),
          )
      : Promise.resolve([]),
  ]);
  const headshotOf = new Map(headshots.map((h) => [h.playerId, h.url]));
  for (const m of mapped) {
    const url = library.get(m.playerId) ?? headshotOf.get(m.playerId);
    if (url) out.set(m.participantId, url);
  }
  return out;
}

export default router;
