/**
 * Premiership boards — the flag list and the season × grade premiership grid.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  premiershipsTable,
  premiershipPlayersTable,
  matchesTable,
} from "@workspace/db";

import { linkPremiershipMatch, premiershipSeasons } from "../../routes/premierships";
import { composeSeasonGrid } from "./shared";
import { type BoardEntry, type GridColumnOptionOut, type HonourBoardOut } from "./types";

/** Map a flat premiership grade to the grade-filter parent key. */
export function premParentGrade(grade: string): string {
  switch (grade) {
    case "A Grade":
      return "A";
    case "B Grade":
      return "B";
    case "C Grade":
      return "C";
    case "D Grade":
      return "D";
    case "E Grade":
      return "E";
    case "F Grade":
      return "F";
    case "PPL":
      return "PPL";
    case "Colts":
      return "U21 Colts";
    case "Female A Grade":
      return "Female A";
    case "Female B Grade":
      return "Female B";
    default:
      return grade;
  }
}

/** Display grade label for the premiership card. */
export function premDisplayGrade(grade: string, competition: string): string {
  const parent = premParentGrade(grade);
  const isMidYearT20 = /MID-?YEAR/i.test(competition) && /T20/i.test(competition);
  if (grade.startsWith("Female")) return parent; // "Female A" / "Female B"
  if (grade === "Colts") return "U21 Colts";
  if (grade === "PPL") return "PPL";
  if (isMidYearT20) return `Mid-Year T20 ${parent}`;
  return parent; // "A".."F"
}

/** Title-case a SHOUTED competition string for the card sub-line. */
export function tidyCompetition(competition: string): string {
  return competition
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bT20\b/i, "T20")
    .replace(/Ppl/g, "PPL");
}

/** Cricket season label, e.g. 1992 (1991/92 win) -> "1991/92". */
export function seasonLabel(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export async function buildPremierships(
  tenantId: number,
  central: boolean,
): Promise<HonourBoardOut | null> {
  const prems = await db
    .select()
    .from(premiershipsTable)
    .where(eq(premiershipsTable.tenantId, tenantId))
    .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade));
  if (prems.length === 0) return null;

  const ids = prems.map((p) => p.id);
  const players = await db
    .select()
    .from(premiershipPlayersTable)
    .where(inArray(premiershipPlayersTable.premiershipId, ids))
    .orderBy(
      asc(premiershipPlayersTable.premiershipId),
      asc(premiershipPlayersTable.battingOrder),
      asc(premiershipPlayersTable.id),
    );
  const byPrem = new Map<number, typeof players>();
  for (const p of players) {
    if (!byPrem.has(p.premiershipId)) byPrem.set(p.premiershipId, []);
    byPrem.get(p.premiershipId)!.push(p);
  }

  // Grand-final match linking reads the NATIVE matches table (Halls Head's).
  // For a central tenant those ids belong to another club, so skip linking.
  type GfMatch = {
    id: number;
    grade: string;
    season: number;
    opponent: string | null;
    matchDate: string | null;
    result: string | null;
  };
  const gfByKey = new Map<string, GfMatch[]>();
  const finalsByKey = new Map<string, GfMatch[]>();
  if (!central) {
    const finalMatches = await db
      .select({
        id: matchesTable.id,
        grade: matchesTable.grade,
        season: matchesTable.season,
        opponent: matchesTable.opponent,
        matchDate: matchesTable.matchDate,
        result: matchesTable.result,
        stage: matchesTable.stage,
      })
      .from(matchesTable)
      .where(inArray(matchesTable.stage, ["Grand Final", "Finals"]));
    for (const m of finalMatches) {
      const { stage, ...rest } = m;
      const key = `${m.grade}|${m.season}`;
      const target = stage === "Grand Final" ? gfByKey : finalsByKey;
      if (!target.has(key)) target.set(key, []);
      target.get(key)!.push(rest);
    }
  }

  const entries: BoardEntry[] = prems.map((p) => {
    const squad = byPrem.get(p.id) ?? [];
    const captainRow = squad.find((s) => s.isCaptain) ?? null;
    const motmRow = squad.find((s) => s.isMotm) ?? null;
    const startYear = premiershipSeasons(p.year, p.matchDate)[0];
    const captainName = captainRow?.name ?? null;
    const motmName = motmRow?.name ?? p.mom ?? null;
    return {
      season: seasonLabel(startYear),
      primaryText: tidyCompetition(p.competition),
      detail: p.result ?? null,
      playerId: captainRow?.playerId ?? null,
      matchId: central ? null : linkPremiershipMatch(p, gfByKey, finalsByKey),
      meta: {
        venue: p.venue,
        date: p.matchDate,
        motm: motmName,
        captain: captainName,
        grade: premDisplayGrade(p.grade, p.competition),
        parentGrade: premParentGrade(p.grade),
        competition: tidyCompetition(p.competition),
      },
      squad: squad.map((s) => ({
        name: s.name,
        playerId: s.playerId,
        isCaptain: s.isCaptain,
      })),
    };
  });

  return {
    id: "premierships",
    category: "premierships",
    layout: "premiership",
    title: "Premierships",
    subtitle: "Grand Final winners",
    entries,
  };
}

/**
 * Opt-in premierships grid — season × grade matrix of grand-final wins. Emitted
 * ONLY when the admin configures columns; the premiership-layout board remains.
 */
export async function buildPremiershipsGrid(
  tenantId: number,
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  if (!gridColumns || gridColumns.length === 0) return null;
  const prems = await db
    .select()
    .from(premiershipsTable)
    .where(eq(premiershipsTable.tenantId, tenantId))
    .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade));
  if (prems.length === 0) return null;

  const columns: GridColumnOptionOut[] = gridColumns.map((k) => ({
    key: k,
    label: premParentGrade(k),
  }));
  const grid = composeSeasonGrid(
    "Season",
    columns,
    prems.map((p) => {
      const startYear = premiershipSeasons(p.year, p.matchDate)[0]!;
      return {
        seasonLabel: seasonLabel(startYear),
        startYear,
        colKey: p.grade,
        text: p.result || tidyCompetition(p.competition) || "Premiers",
        playerId: null,
      };
    }),
  );
  return {
    id: "premierships_grid",
    category: "premierships",
    layout: "grid",
    title: "Premierships",
    subtitle: "Grand Final wins by grade & season",
    entries: [],
    grid,
  };
}
