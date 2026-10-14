import { Router, type IRouter } from "express";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorMatchDisplaySettingsTable,
  clubsTable,
} from "@workspace/db";
import {
  loadJuniorNaming,
  splitScores,
  opponentClubColumns,
  toOpponentClub,
  seasonYear,
  toMatchSummary,
  serializeJuniorMatchDisplaySettings,
} from "../lib/junior-helpers";
import {
  ListJuniorMatchesQueryParams,
  GetJuniorMatchParams,
  GetJuniorMatchQueryParams,
  UpdateJuniorMatchDisplaySettingsBody,
} from "@workspace/api-zod";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { overlayNativeOpponents } from "../lib/club-brand";
import { getOrCreateSettings } from "../lib/settings";
import { parseJuniorTeamPublishing } from "../lib/junior-names";

/**
 * Junior matches: filters, match list, scorecard detail, and the Matches
 * page display settings.
 *
 * JUNIORS read API — see routes/juniors.ts for the isolation and privacy
 * rules every handler here follows. Mounted by routes/juniors.ts.
 */
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /juniors/filters
// ---------------------------------------------------------------------------
router.get("/juniors/filters", async (req, res): Promise<void> => {
  const ofTenant = eq(juniorMatchesTable.tenantId, getTenantId(req));
  const seasonRows = await db
    .selectDistinct({ season: juniorMatchesTable.season })
    .from(juniorMatchesTable)
    .where(and(ofTenant, isNotNull(juniorMatchesTable.season)))
    .orderBy(desc(juniorMatchesTable.season));
  const ageRows = await db
    .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
    .from(juniorMatchesTable)
    .where(and(ofTenant, isNotNull(juniorMatchesTable.ageGroup)))
    .orderBy(juniorMatchesTable.ageGroup);

  res.json({
    seasons: seasonRows.map((r) => r.season).filter(Boolean),
    ageGroups: ageRows.map((r) => r.ageGroup).filter(Boolean),
  });
});

// ---------------------------------------------------------------------------
// GET /juniors/matches
// ---------------------------------------------------------------------------
router.get("/juniors/matches", async (req, res): Promise<void> => {
  const query = ListJuniorMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { season, ageGroup } = query.data;
  const conds = [eq(juniorMatchesTable.tenantId, getTenantId(req))];
  if (season) conds.push(eq(juniorMatchesTable.season, season));
  if (ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, ageGroup));

  const rows = await db
    .select({ match: juniorMatchesTable, ...opponentClubColumns })
    .from(juniorMatchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, juniorMatchesTable.opponentClubId))
    .where(and(...conds))
    .orderBy(desc(seasonYear), desc(juniorMatchesTable.id));

  const opps = await overlayNativeOpponents(rows.map(toOpponentClub));
  res.json(rows.map((r, i) => toMatchSummary(r.match, opps[i])));
});

// ---------------------------------------------------------------------------
// GET /juniors/matches/{id}
// ---------------------------------------------------------------------------
router.get("/juniors/matches/:id", async (req, res): Promise<void> => {
  const params = GetJuniorMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const matchId = params.data.id;

  const [matchRow] = await db
    .select({ match: juniorMatchesTable, ...opponentClubColumns })
    .from(juniorMatchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, juniorMatchesTable.opponentClubId))
    // Another club's junior match is "not found", never shown.
    .where(
      and(eq(juniorMatchesTable.id, matchId), eq(juniorMatchesTable.tenantId, getTenantId(req))),
    );
  if (!matchRow) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const match = matchRow.match;
  // Overlay the opponent's uploaded brand if that club is a tenant, so the
  // junior scorecard + junior match-summary share card show its crest/colours.
  const [opponentClub] = await overlayNativeOpponents([toOpponentClub(matchRow)]);

  const [battingRows, bowlingRows, rosterRows] = await Promise.all([
    db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.matchId, matchId))
      .orderBy(juniorMatchBattingTable.innings, juniorMatchBattingTable.batOrder),
    db
      .select()
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.matchId, matchId))
      .orderBy(juniorMatchBowlingTable.innings, juniorMatchBowlingTable.id),
    db
      .select()
      .from(juniorMatchRostersTable)
      .where(eq(juniorMatchRostersTable.matchId, matchId))
      .orderBy(juniorMatchRostersTable.id),
  ]);

  // One public namer for every line (KTD12): withheld private players, the club's
  // naming style for its own side, initials for the opposition — names derived
  // from the participant rows, never the stored line copies.
  // includePrivate (honoured only for a signed-in admin of this club) returns full
  // names and ids for the admin scorecard editor, as on the junior players admin.
  const query = GetJuniorMatchQueryParams.safeParse(req.query);
  const adminView =
    query.success && query.data.includePrivate === true && !!(await resolveAdmin(req));
  const naming = await loadJuniorNaming(getTenantId(req), [
    ...battingRows.map((r) => r.participantId),
    ...bowlingRows.map((r) => r.participantId),
    ...rosterRows.map((r) => r.participantId),
  ]);
  const nameLine = adminView ? naming.adminLine : naming.line;

  const battingLine = (b: typeof juniorMatchBattingTable.$inferSelect) => {
    return {
      id: b.id,
      ...nameLine(b),
      isHallsHead: b.isHallsHead,
      batOrder: b.batOrder,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.strikeRate,
      dismissal: b.dismissal,
    };
  };
  const bowlingLine = (b: typeof juniorMatchBowlingTable.$inferSelect) => {
    return {
      id: b.id,
      ...nameLine(b),
      isHallsHead: b.isHallsHead,
      overs: b.overs,
      maidens: b.maidens,
      runs: b.runs,
      wickets: b.wickets,
      economy: b.economy,
      wides: b.wides,
      noBalls: b.noBalls,
    };
  };

  const inningsNums = Array.from(
    new Set([...battingRows.map((b) => b.innings ?? 1), ...bowlingRows.map((b) => b.innings ?? 1)]),
  ).sort((a, b) => a - b);

  const innings = inningsNums.map((n) => {
    const bats = battingRows.filter((b) => (b.innings ?? 1) === n);
    const bowls = bowlingRows.filter((b) => (b.innings ?? 1) === n);
    return {
      innings: n,
      battingTeam: bats[0]?.battingTeam ?? null,
      isHallsHead: bats[0]?.isHallsHead ?? false,
      batting: bats.map(battingLine),
      bowling: bowls.map(bowlingLine),
    };
  });

  const rosters = rosterRows.map((r) => ({
    id: r.id,
    ...nameLine(r),
    teamName: r.teamName,
    isHallsHead: r.isHallsHead,
  }));

  const { hhScore, opponentScore } = splitScores(match);
  res.json({
    id: match.id,
    playhqMatchId: match.playhqMatchId,
    season: match.season,
    grade: match.grade,
    ageGroup: match.ageGroup,
    teamName: match.teamName,
    competition: match.competition,
    association: match.association,
    round: match.round,
    matchDate: match.matchDate,
    venue: match.venue,
    venueOval: match.venueOval,
    venueAddress: match.venueAddress,
    venueSuburb: match.venueSuburb,
    status: match.status,
    opponentName: match.opponentName,
    hhResult: match.hhResult,
    winner: match.winner,
    tossWinner: match.tossWinner,
    hhBattedFirst: match.hhBattedFirst,
    hhScore,
    opponentScore,
    // Raw team columns as stored (the admin scorecard editor patches these
    // directly rather than inverting the hh/opponent score mapping).
    team1: match.team1,
    team2: match.team2,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    opponentClub,
    innings,
    rosters,
  });
});

// ---------------------------------------------------------------------------
// Juniors Matches page display settings (admin-controlled defaults).
// One row per tenant; mirrors the senior match-display-settings pattern but
// keyed on age group (no roundOrder — junior rounds are free text).
// ---------------------------------------------------------------------------
router.get("/juniors/match-display-settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(juniorMatchDisplaySettingsTable, getTenantId(req));
  res.json(serializeJuniorMatchDisplaySettings(settings));
});

router.patch("/juniors/match-display-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateJuniorMatchDisplaySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const tenantId = getTenantId(req);
  await getOrCreateSettings(juniorMatchDisplaySettingsTable, tenantId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.defaultAgeGroup !== undefined)
    patch.defaultAgeGroup = parsed.data.defaultAgeGroup;
  if (parsed.data.defaultSeasonMode !== undefined)
    patch.defaultSeasonMode = parsed.data.defaultSeasonMode;
  if (parsed.data.defaultSeason !== undefined) patch.defaultSeason = parsed.data.defaultSeason;
  if (parsed.data.ageGroupOrder !== undefined) patch.ageGroupOrder = parsed.data.ageGroupOrder;
  // Naming style (KTD12) is enum-validated by the generated body schema.
  if (parsed.data.nameStyle !== undefined) patch.nameStyle = parsed.data.nameStyle;
  // Per-team publishing (KTD14): the body schema checks each mode is approval|auto;
  // the sanitiser also drops emptied age groups so the stored map stays tidy.
  if (parsed.data.teamPublishing !== undefined)
    patch.teamPublishing = parseJuniorTeamPublishing(parsed.data.teamPublishing);
  const [updated] = await db
    .update(juniorMatchDisplaySettingsTable)
    .set(patch)
    .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId))
    .returning();
  res.json(serializeJuniorMatchDisplaySettings(updated));
});

export default router;
