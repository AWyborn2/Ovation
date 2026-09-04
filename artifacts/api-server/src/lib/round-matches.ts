import type { Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, matchesTable } from "@workspace/db";
import { dataSource, type DataSource } from "./tenant";
import { notEmptyFixture } from "./grades-helpers";

/**
 * The match ids in one (grade, season, round) group, from the correct data
 * source for a tenant. Used by the carousel-set generator (routes/social-cards)
 * to gather every match in a round. Empty placeholder fixtures are excluded
 * (native path via notEmptyFixture; central rows are always real games).
 *
 * Extracted from routes/matches.ts so routes never import routes.
 */
export async function listRoundMatchIdsForSource(
  source: DataSource,
  opts: { grade: string; season: number; round: number },
): Promise<number[]> {
  if (source.kind === "central") {
    const { centralClubMatches } = await import("@workspace/db/central-queries");
    const rows = await centralClubMatches(source.clubId, {
      grade: opts.grade,
      season: opts.season,
    });
    return rows.filter((r) => r.round === opts.round).map((r) => r.id);
  }
  const rows = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.grade, opts.grade),
        eq(matchesTable.season, opts.season),
        eq(matchesTable.round, opts.round),
        notEmptyFixture,
      ),
    )
    .orderBy(asc(matchesTable.id));
  return rows.map((r) => r.id);
}

/** Request-flavoured wrapper: resolves the tenant's data source first. */
export async function listRoundMatchIds(
  req: Request,
  opts: { grade: string; season: number; round: number },
): Promise<number[]> {
  return listRoundMatchIdsForSource(await dataSource(req), opts);
}
