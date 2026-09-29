import { sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPlayersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows } from "./club-matches";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { isPrivateRow } from "./privacy";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Identity evidence for duplicate-player suggestions (hybrid stats plan U7).
//
// PlayHQ sometimes mints two participant GUIDs for one person, splitting their
// career. The app's suggestion engine (api-server/src/lib/duplicate-
// suggestions.ts) looks for pairs of GUIDs that played for the same club, were
// NEVER in the same match, and share an "Initial Surname". This read supplies
// the per-GUID facts it needs, keyed by raw GUID (no merges applied — the
// engine folds confirmed merges itself, and the review screen shows each GUID
// as PlayHQ has it).
//
// Rules:
//   - Only GUIDs with at least one SENIOR club-side appearance are returned
//     (juniors isolation: junior-only GUIDs never enter the senior identity
//     review, and junior matches never add seasons, grades or games).
//   - `allMatchIds` is every one of the club's matches (any grade, either
//     side) the GUID appears in, so "never in the same match" also rules out a
//     pair who once played AGAINST each other.
//   - Read-only, club-filtered and cached like every central read.
// ---------------------------------------------------------------------------

/** One GUID's club-side appearance facts, for the duplicate engine and review screen. */
export interface CentralIdentityEvidence {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  /** Distinct senior club-side matches. */
  games: number;
  /** Season start years of those matches, ascending. */
  seasons: number[];
  /** App grades of those matches, sorted. */
  grades: string[];
  /** Every club match (any grade, either side) this GUID appears in. */
  allMatchIds: number[];
}

/** Per-GUID appearance evidence for every senior player a club fielded. */
export async function centralClubIdentityEvidence(
  clubId: number,
): Promise<CentralIdentityEvidence[]> {
  return withCentralCache(cacheKey("centralClubIdentityEvidence", [clubId]), () =>
    centralClubIdentityEvidenceImpl(clubId),
  );
}

async function centralClubIdentityEvidenceImpl(clubId: number): Promise<CentralIdentityEvidence[]> {
  const matchRows = await getClubMatchRows(clubId);
  if (matchRows.length === 0) return [];
  const matchIds = matchRows.map((m) => m.matchId);
  const matchById = new Map(matchRows.map((m) => [m.matchId, m]));

  // Every (participant, match, side) appearance across the club's matches:
  // roster ∪ batting ∪ bowling, both sides. Grouped per participant, keeping
  // only GUIDs who appeared for the club at least once.
  const res = await centralDb.execute(sql`
    with apps as (
      select ${centralMatchBattingTable.participantId} as participant_id,
             ${centralMatchBattingTable.matchId} as match_id,
             ${centralMatchBattingTable.clubId} as club_id
      from ${centralMatchBattingTable}
      where ${inList(centralMatchBattingTable.matchId, matchIds)}
        and ${centralMatchBattingTable.participantId} is not null
        and ${centralMatchBattingTable.participantId} <> ''
      union
      select ${centralMatchBowlingTable.participantId},
             ${centralMatchBowlingTable.matchId},
             ${centralMatchBowlingTable.clubId}
      from ${centralMatchBowlingTable}
      where ${inList(centralMatchBowlingTable.matchId, matchIds)}
        and ${centralMatchBowlingTable.participantId} is not null
        and ${centralMatchBowlingTable.participantId} <> ''
      union
      select ${centralMatchRostersTable.participantId},
             ${centralMatchRostersTable.matchId},
             ${centralMatchRostersTable.clubId}
      from ${centralMatchRostersTable}
      where ${inList(centralMatchRostersTable.matchId, matchIds)}
        and ${centralMatchRostersTable.participantId} is not null
        and ${centralMatchRostersTable.participantId} <> ''
    )
    select
      participant_id as "participantId",
      array_agg(distinct match_id) as "allMatchIds",
      array_agg(distinct match_id) filter (where club_id = ${clubId}) as "clubMatchIds"
    from apps
    group by participant_id
    having bool_or(club_id = ${clubId})
  `);
  const rows = res.rows as Array<{
    participantId: string;
    allMatchIds: (number | string)[] | null;
    clubMatchIds: (number | string)[] | null;
  }>;

  const facts: Omit<CentralIdentityEvidence, "displayName" | "isPrivate">[] = [];
  for (const r of rows) {
    const seasons = new Set<number>();
    const grades = new Set<string>();
    let games = 0;
    for (const raw of r.clubMatchIds ?? []) {
      const m = matchById.get(Number(raw));
      const grade = m ? appGradeFromCentral(m.grade) : null;
      if (!m || !grade) continue; // junior / unmapped grades never count
      games++;
      grades.add(grade);
      const year = parseSeasonStartYear(m.season);
      if (year !== null) seasons.add(year);
    }
    if (games === 0) continue;
    facts.push({
      participantId: r.participantId,
      games,
      seasons: [...seasons].sort((a, b) => a - b),
      grades: [...grades].sort((a, b) => a.localeCompare(b)),
      allMatchIds: (r.allMatchIds ?? []).map(Number).sort((a, b) => a - b),
    });
  }
  if (facts.length === 0) return [];

  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(
      inList(
        centralPlayersTable.participantId,
        facts.map((f) => f.participantId),
      ),
    );
  const byId = new Map(players.map((p) => [p.participantId, p]));

  return facts.map((f) => {
    const p = byId.get(f.participantId);
    return { ...f, displayName: p?.displayName ?? null, isPrivate: isPrivateRow(p) };
  });
}
