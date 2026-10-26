import { and, eq } from "drizzle-orm";
import { centralDb, centralFallOfWicketsTable, centralMatchBattingTable } from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows } from "./club-matches";
import { appGradeFromCentral, parseSeasonStartYear, seasonLabelFromStartYear } from "./grades";
import { canonicalGuid, mergesCacheArg, type CentralMerges } from "./merges";
import { centralPlayerNames } from "./privacy";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Partnership records (honours kiosk redesign C4): the club's highest
// partnership for each wicket in each senior grade, derived from fall-of-
// wickets. Only innings with fall-of-wicket data count, and only completed
// partnerships (the unbroken stand at the end of an innings has no fall of
// wicket to measure it by). Private players OMIT: a stand involving one is
// left out, like every other public record read.
// ---------------------------------------------------------------------------

/** One batting line, enough to know who came in when. */
export interface InningsBatter {
  participantId: string | null;
  batOrder: number | null;
}

/** One fall of wicket: wicket number, team total when it fell, who was out. */
export interface InningsWicket {
  wicket: number | null;
  runs: number | null;
  participantId: string | null;
}

export interface InningsPartnership {
  wicket: number;
  runs: number;
  /** The two batters, in batting order. */
  batters: [string, string];
}

/**
 * The completed partnerships of one innings. Openers are batting positions 1
 * and 2; each wicket brings in the next batter. A partnership is the team
 * total at its wicket less the total at the previous one. The walk stops at
 * the first wicket the batting card can't explain (a dismissed player not at
 * the crease, a gap in the wickets, a missing batter), so bad data never
 * pairs the wrong two players.
 */
export function partnershipsOfInnings(
  batting: readonly InningsBatter[],
  wickets: readonly InningsWicket[],
): InningsPartnership[] {
  const order = batting
    .filter((b): b is { participantId: string; batOrder: number } =>
      Boolean(b.participantId && b.batOrder != null),
    )
    .sort((a, b) => a.batOrder - b.batOrder)
    .map((b) => b.participantId);
  const fow = wickets
    .filter((w): w is { wicket: number; runs: number; participantId: string | null } =>
      Boolean(w.wicket != null && w.runs != null),
    )
    .sort((a, b) => a.wicket - b.wicket);
  if (order.length < 2) return [];

  const out: InningsPartnership[] = [];
  const crease = [order[0]!, order[1]!];
  let next = 2;
  let prevTotal = 0;
  for (const w of fow) {
    if (w.wicket !== out.length + 1) break;
    const out_ = w.participantId;
    const at = out_ ? crease.indexOf(out_) : -1;
    if (at === -1) break;
    const runs = w.runs - prevTotal;
    if (runs < 0) break;
    const pair: [string, string] =
      order.indexOf(crease[0]!) < order.indexOf(crease[1]!)
        ? [crease[0]!, crease[1]!]
        : [crease[1]!, crease[0]!];
    out.push({ wicket: w.wicket, runs, batters: pair });
    prevTotal = w.runs;
    if (next >= order.length) break;
    crease[at] = order[next++]!;
  }
  return out;
}

export interface CentralPartnershipRecord {
  /** App grade, e.g. "A Grade". */
  grade: string;
  wicket: number;
  runs: number;
  batters: { participantId: string; displayName: string | null }[];
  matchId: number;
  /** "YYYY/YY". */
  season: string;
}

/**
 * The club's highest completed partnership for each wicket in each senior
 * grade (ties go to the earlier one). Sorted by grade, then wicket.
 */
export async function centralPartnershipRecords(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralPartnershipRecord[]> {
  return withCentralCache(
    cacheKey("centralPartnershipRecords", [clubId, mergesCacheArg(merges)]),
    () => centralPartnershipRecordsImpl(clubId, merges),
  );
}

async function centralPartnershipRecordsImpl(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralPartnershipRecord[]> {
  const meta = new Map<number, { grade: string; season: number }>();
  for (const m of await getClubMatchRows(clubId)) {
    const grade = appGradeFromCentral(m.grade);
    const season = parseSeasonStartYear(m.season);
    if (grade && season !== null) meta.set(m.matchId, { grade, season });
  }
  const matchIds = [...meta.keys()];
  if (matchIds.length === 0) return [];

  const [batting, fow] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        innings: centralMatchBattingTable.innings,
        participantId: centralMatchBattingTable.participantId,
        batOrder: centralMatchBattingTable.batOrder,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralFallOfWicketsTable.matchId,
        innings: centralFallOfWicketsTable.innings,
        wicket: centralFallOfWicketsTable.wicket,
        runs: centralFallOfWicketsTable.runs,
        participantId: centralFallOfWicketsTable.participantId,
      })
      .from(centralFallOfWicketsTable)
      .where(inList(centralFallOfWicketsTable.matchId, matchIds)),
  ]);

  const key = (matchId: number, innings: number) => `${matchId}:${innings}`;
  const battersByInnings = new Map<string, InningsBatter[]>();
  for (const b of batting) {
    if (b.matchId === null || b.innings === null) continue;
    const k = key(b.matchId, b.innings);
    if (!battersByInnings.has(k)) battersByInnings.set(k, []);
    battersByInnings.get(k)!.push({ participantId: b.participantId, batOrder: b.batOrder });
  }
  const wicketsByInnings = new Map<string, InningsWicket[]>();
  for (const w of fow) {
    if (w.matchId === null || w.innings === null) continue;
    const k = key(w.matchId, w.innings);
    // Only the club's own innings: those it has batting lines for.
    if (!battersByInnings.has(k)) continue;
    if (!wicketsByInnings.has(k)) wicketsByInnings.set(k, []);
    wicketsByInnings.get(k)!.push(w);
  }

  // Every completed partnership, merged-away GUIDs folded into their keeper.
  const all: (Omit<CentralPartnershipRecord, "batters" | "season"> & {
    season: number;
    ids: string[];
  })[] = [];
  for (const [k, wickets] of wicketsByInnings) {
    const matchId = Number(k.split(":")[0]);
    const m = meta.get(matchId)!;
    for (const p of partnershipsOfInnings(battersByInnings.get(k)!, wickets)) {
      all.push({
        grade: m.grade,
        wicket: p.wicket,
        runs: p.runs,
        matchId,
        season: m.season,
        ids: p.batters.map((id) => canonicalGuid(id, merges)),
      });
    }
  }

  // Private players are left out before the best is picked, so a private
  // player's stand never hides the next-best public one.
  const names = await centralPlayerNames([...new Set(all.flatMap((r) => r.ids))], merges);
  const best = new Map<string, (typeof all)[number]>();
  for (const r of all) {
    if (r.ids.some((id) => names.get(id)?.isPrivate)) continue;
    const slot = `${r.grade}\u0000${r.wicket}`;
    const cur = best.get(slot);
    const better =
      !cur ||
      r.runs > cur.runs ||
      (r.runs === cur.runs &&
        (r.season < cur.season || (r.season === cur.season && r.matchId < cur.matchId)));
    if (better) best.set(slot, r);
  }

  const out: CentralPartnershipRecord[] = [...best.values()].map(({ ids, season, ...r }) => ({
    ...r,
    season: seasonLabelFromStartYear(season),
    batters: ids.map((id) => ({
      participantId: id,
      displayName: names.get(id)?.displayName ?? null,
    })),
  }));
  return out.sort((a, b) => a.grade.localeCompare(b.grade) || a.wicket - b.wicket);
}
