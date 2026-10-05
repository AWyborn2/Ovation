import type { Request } from "express";
import { eq, asc } from "drizzle-orm";
import {
  db,
  matchesTable,
  matchPlayerLinesTable,
  matchOppositionLinesTable,
  matchHatTricksTable,
  playersTable,
  clubsTable,
} from "@workspace/db";
import type { CentralMatchScorecard } from "@workspace/db/central-queries";
import { getTenantBrand } from "./tenant-brand";
import {
  beforeBoundary,
  loadClubIdentity,
  loadClubOverlay,
  resolveClubCorrections,
  type ClubIdentity,
} from "./club-overlay";
import { overlayScorecardLines } from "./club-overlay-surfaces";
import { dataSource, getTenantPlayhqOrgId, type DataSource } from "./tenant";
import {
  getOpponentBrandsByAppClubId,
  getOpponentBrandsByCentralClubId,
  mergeOpponentBrand,
} from "./club-brand";
import { opponentClubColumns, toOpponentClub } from "./grades-helpers";

/**
 * The full match-detail DTO (the `GET /matches/:id` body) from either data
 * source. Extracted from routes/matches.ts so batch consumers — the carousel-set
 * generator in routes/social-cards.ts, the match-summary drafter — can build the
 * same DTO the route serves without importing a route module.
 *
 * Only depends on the db layer, tenant resolution and branding helpers — never
 * on a route — so importing it back into routes/matches.ts cannot form a cycle.
 */

/** Split a central display name into given/surname (surname = last token). */
export function splitCentralName(displayName: string | null): {
  givenName: string;
  surname: string;
} {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0], surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

/**
 * Native-path match detail (tenant #1's own `matches` tables). Returns null
 * when the match doesn't exist.
 */
export async function loadMatchDetail(matchId: number, tenantId: number) {
  const [match] = await db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
      stage: matchesTable.stage,
      competition: matchesTable.competition,
      matchDate: matchesTable.matchDate,
      venue: matchesTable.venue,
      result: matchesTable.result,
      opponent: matchesTable.opponent,
      clubScore: matchesTable.hhccScore,
      opponentScore: matchesTable.opponentScore,
      clubBattedFirst: matchesTable.hhccBattedFirst,
      abandoned: matchesTable.abandoned,
      ...opponentClubColumns,
    })
    .from(matchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, matchesTable.opponentClubId))
    .where(eq(matchesTable.id, matchId));
  if (!match) return null;

  const lines = await db
    .select({
      id: matchPlayerLinesTable.id,
      playerId: matchPlayerLinesTable.playerId,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
      batted: matchPlayerLinesTable.batted,
      battingPos: matchPlayerLinesTable.battingPos,
      runs: matchPlayerLinesTable.runs,
      balls: matchPlayerLinesTable.balls,
      fours: matchPlayerLinesTable.fours,
      sixes: matchPlayerLinesTable.sixes,
      notOut: matchPlayerLinesTable.notOut,
      dismissal: matchPlayerLinesTable.dismissal,
      bowled: matchPlayerLinesTable.bowled,
      overs: matchPlayerLinesTable.overs,
      maidens: matchPlayerLinesTable.maidens,
      runsConceded: matchPlayerLinesTable.runsConceded,
      wickets: matchPlayerLinesTable.wickets,
      wides: matchPlayerLinesTable.wides,
      noBalls: matchPlayerLinesTable.noBalls,
      catches: matchPlayerLinesTable.catches,
      stumpings: matchPlayerLinesTable.stumpings,
      runOuts: matchPlayerLinesTable.runOuts,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(playersTable, eq(playersTable.id, matchPlayerLinesTable.playerId))
    .where(eq(matchPlayerLinesTable.matchId, matchId))
    .orderBy(asc(matchPlayerLinesTable.battingPos), asc(playersTable.surname));

  // Display-only opposition lines (plain-text names, no player link).
  const oppositionLines = await db
    .select({
      id: matchOppositionLinesTable.id,
      name: matchOppositionLinesTable.name,
      batted: matchOppositionLinesTable.batted,
      battingPos: matchOppositionLinesTable.battingPos,
      runs: matchOppositionLinesTable.runs,
      balls: matchOppositionLinesTable.balls,
      fours: matchOppositionLinesTable.fours,
      sixes: matchOppositionLinesTable.sixes,
      notOut: matchOppositionLinesTable.notOut,
      dismissal: matchOppositionLinesTable.dismissal,
      bowled: matchOppositionLinesTable.bowled,
      overs: matchOppositionLinesTable.overs,
      maidens: matchOppositionLinesTable.maidens,
      runsConceded: matchOppositionLinesTable.runsConceded,
      wickets: matchOppositionLinesTable.wickets,
      wides: matchOppositionLinesTable.wides,
      noBalls: matchOppositionLinesTable.noBalls,
      catches: matchOppositionLinesTable.catches,
      stumpings: matchOppositionLinesTable.stumpings,
      runOuts: matchOppositionLinesTable.runOuts,
    })
    .from(matchOppositionLinesTable)
    .where(eq(matchOppositionLinesTable.matchId, matchId))
    .orderBy(asc(matchOppositionLinesTable.battingPos), asc(matchOppositionLinesTable.id));

  const hatTricks = await db
    .select({ playerId: matchHatTricksTable.playerId })
    .from(matchHatTricksTable)
    .where(eq(matchHatTricksTable.matchId, matchId));

  // Brand the DTO with the REQUEST's tenant, not a hard-coded demo tenant. The
  // DTO field stays `hallsHead` for now (renaming it ripples through the OpenAPI
  // spec + generated types).
  const hallsHead = await getTenantBrand(tenantId);

  // If the opponent club is itself a tenant that uploaded its own brand, show
  // that (its crest/colours) instead of the PlayHQ-scraped register default.
  let opponentClub = toOpponentClub(match);
  if (opponentClub) {
    const overlays = await getOpponentBrandsByAppClubId([opponentClub.id]);
    opponentClub = mergeOpponentBrand(opponentClub, overlays.get(opponentClub.id));
  }

  return {
    id: match.id,
    grade: match.grade,
    season: match.season,
    round: match.round,
    stage: match.stage,
    competition: match.competition,
    matchDate: match.matchDate,
    venue: match.venue,
    result: match.result,
    opponent: match.opponent,
    clubScore: match.clubScore,
    opponentScore: match.opponentScore,
    clubBattedFirst: match.clubBattedFirst,
    abandoned: match.abandoned,
    opponentClub,
    club: hallsHead,
    lines,
    oppositionLines,
    hatTrickPlayerIds: hatTricks.map((h) => h.playerId),
  };
}

/**
 * Central-path match detail: the two-innings scorecard from the central
 * scorecard tables — own side mapped to int ids via player_id_map (private
 * players masked), opposition side plain text — with the OWN-club brand
 * resolved from THIS tenant. Returns null when the match doesn't exist.
 */
export async function loadCentralMatchDetail(
  source: { tenantId: number; clubId: number },
  matchId: number,
) {
  const { centralMatchScorecard } = await import("@workspace/db/central-queries");
  const card = await centralMatchScorecard(source.clubId, matchId);
  if (!card) return null;
  return centralMatchDetailDto(source.tenantId, card, await loadClubIdentity(source.tenantId));
}

/**
 * The PUBLIC match page's central detail, with the tenant's club overlay
 * applied (hybrid stats plan U10 follow-up): the club's corrections show on
 * the corrected lines, and a match in a season before the grade's boundary is
 * not served from central at all (club history supplies that season — KTD5).
 * A tenant with no club layer gets exactly {@link loadCentralMatchDetail}.
 *
 * Deliberately a separate entry point: the Social Studio drafters call
 * `loadCentralMatchDetail` and must never see the club layer (KTD8).
 */
export async function loadCentralMatchDetailWithOverlay(
  source: { tenantId: number; clubId: number },
  matchId: number,
) {
  const { tenantId, clubId } = source;
  const overlay = await loadClubOverlay(tenantId);
  const { centralMatchScorecard } = await import("@workspace/db/central-queries");
  const card = await centralMatchScorecard(clubId, matchId);
  if (!card) return null;
  if (!overlay.active) return centralMatchDetailDto(tenantId, card, overlay.identity);
  if (
    card.appGrade !== null &&
    beforeBoundary(overlay.data.boundaries, card.appGrade, card.seasonStartYear)
  ) {
    return null;
  }
  const resolved = await resolveClubCorrections(overlay, tenantId, clubId);
  return centralMatchDetailDto(
    tenantId,
    { ...card, lines: overlayScorecardLines(card.lines, resolved.lines, matchId) },
    overlay.identity,
  );
}

/**
 * The opposition's PlayHQ organisation logo for a match: the side that isn't
 * the tenant's own PlayHQ organisation. Null when the tenant has no PlayHQ
 * organisation, the match isn't loaded, or the side has no logo. Never fails
 * the scorecard.
 */
export async function playhqOpponentLogo(
  tenantId: number,
  playhqMatchId: string,
): Promise<string | null> {
  try {
    const orgId = await getTenantPlayhqOrgId(tenantId);
    if (!orgId) return null;
    const { playhqMatchSides } = await import("@workspace/db/central-queries");
    const sides = await playhqMatchSides(playhqMatchId);
    if (!sides) return null;
    if (sides.home.orgId === orgId) return sides.away.logoUrl;
    if (sides.away.orgId === orgId) return sides.home.logoUrl;
    return null;
  } catch {
    return null;
  }
}

/** Shape a central scorecard as the match-detail DTO for one tenant. */
async function centralMatchDetailDto(
  tenantId: number,
  card: CentralMatchScorecard,
  identity: ClubIdentity,
) {
  const { mergedPrivateKeepers } = await import("@workspace/db/central-queries");
  // A merged-away GUID links to its keeper, and a line is masked when anyone in
  // its merged group is private (confirmed merges, KTD2).
  const intByGuid = identity.intByGuid;
  const privateKeepers = await mergedPrivateKeepers(identity.merges);
  const isPrivateLine = (l: { isPrivate: boolean; participantId: string | null }) =>
    l.isPrivate ||
    (l.participantId !== null && privateKeepers.has(identity.canonicalOf(l.participantId)));

  const { playerCount, ...summary } = card.summary;
  void playerCount;
  // Overlay the opponent's own uploaded brand (crest/colours) if that club is
  // a tenant — central.clubs carries no logo, so this is where it comes from.
  if (summary.opponentClub) {
    const overlays = await getOpponentBrandsByCentralClubId([summary.opponentClub.id]);
    summary.opponentClub = mergeOpponentBrand(
      summary.opponentClub,
      overlays.get(summary.opponentClub.id),
    );
    // Central clubs carry no crest. A club that hasn't uploaded one gets the
    // PlayHQ organisation logo the fixtures page shows, via the match's
    // PlayHQ id.
    if (!summary.opponentClub.logoUrl && card.playhqMatchId) {
      const logo = await playhqOpponentLogo(tenantId, card.playhqMatchId);
      if (logo) summary.opponentClub = { ...summary.opponentClub, logoUrl: logo, logoUrl128: logo };
    }
  }
  return {
    ...summary,
    clubBattedFirst: card.battedFirst,
    clubWon: card.clubWon,
    club: await getTenantBrand(tenantId),
    lines: card.lines.map((l, i) => {
      const masked = isPrivateLine(l);
      const name = masked
        ? { givenName: "Private", surname: "Player" }
        : splitCentralName(l.displayName);
      return {
        id: i,
        // Private players are masked (no link); otherwise the mapped int id.
        playerId: masked || !l.participantId ? 0 : (intByGuid.get(l.participantId) ?? 0),
        surname: name.surname,
        givenName: name.givenName,
        batted: l.batted,
        battingPos: l.battingPos,
        runs: l.runs,
        balls: l.balls,
        fours: l.fours,
        sixes: l.sixes,
        notOut: l.notOut,
        dismissal: l.dismissal,
        bowled: l.bowled,
        overs: l.overs,
        maidens: l.maidens,
        runsConceded: l.runsConceded,
        wickets: l.wickets,
        wides: l.wides,
        noBalls: l.noBalls,
        catches: null,
        stumpings: null,
        runOuts: null,
      };
    }),
    oppositionLines: card.oppositionLines.map((l, i) => ({
      id: i,
      name: l.name,
      batted: l.batted,
      battingPos: l.battingPos,
      runs: l.runs,
      balls: l.balls,
      fours: l.fours,
      sixes: l.sixes,
      notOut: l.notOut,
      dismissal: l.dismissal,
      bowled: l.bowled,
      overs: l.overs,
      maidens: l.maidens,
      runsConceded: l.runsConceded,
      wickets: l.wickets,
      wides: l.wides,
      noBalls: l.noBalls,
      catches: null,
      stumpings: null,
      runOuts: null,
    })),
    hatTrickPlayerIds: [] as number[],
  };
}

// Resolve one match's full detail DTO from the correct data source for this

/**
 * Resolve one match's full detail DTO from the given data source (central or
 * native). Returns null when the match is missing.
 */
export async function loadMatchDetailForSource(source: DataSource, matchId: number) {
  if (source.kind === "central") {
    return loadCentralMatchDetailWithOverlay(source, matchId);
  }
  return loadMatchDetail(matchId, source.tenantId);
}

/** Request-flavoured wrapper: resolves the tenant's data source first. */
export async function loadMatchDetailForRequest(req: Request, matchId: number) {
  return loadMatchDetailForSource(await dataSource(req), matchId);
}
