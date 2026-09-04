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
  playerIdMapTable,
} from "@workspace/db";
import { getTenantBrand } from "./tenant-brand";
import { dataSource, type DataSource } from "./tenant";
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
export function splitCentralName(displayName: string | null): { givenName: string; surname: string } {
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
  const { tenantId, clubId } = source;
  const card = await centralMatchScorecard(clubId, matchId);
  if (!card) return null;
  const mapRows = await db
    .select({
      participantId: playerIdMapTable.participantId,
      playerId: playerIdMapTable.playerId,
    })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));

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
  }
  return {
    ...summary,
    clubBattedFirst: card.battedFirst,
    club: await getTenantBrand(tenantId),
    lines: card.lines.map((l, i) => {
      const name = l.isPrivate
        ? { givenName: "Private", surname: "Player" }
        : splitCentralName(l.displayName);
      return {
        id: i,
        // Private players are masked (no link); otherwise the mapped int id.
        playerId:
          l.isPrivate || !l.participantId
            ? 0
            : intByGuid.get(l.participantId) ?? 0,
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
    return loadCentralMatchDetail(source, matchId);
  }
  return loadMatchDetail(matchId, source.tenantId);
}

/** Request-flavoured wrapper: resolves the tenant's data source first. */
export async function loadMatchDetailForRequest(req: Request, matchId: number) {
  return loadMatchDetailForSource(await dataSource(req), matchId);
}
