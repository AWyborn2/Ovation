/**
 * Award boards: per-award winner lists, the award-winners grid, award points ladders and team-of-the-decade.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  awardsTable,
  awardWinnersTable,
  awardPointsConfigTable,
  teamOfDecadeBoardsTable,
  teamOfDecadeMembersTable,
} from "@workspace/db";

import { computeLeaderboard } from "../points";
import { seasonLabel } from "./premierships";
import { composeSeasonGrid } from "./shared";
import { type GridColumnOptionOut, type HonourBoardOut } from "./types";

/**
 * NEW merged "Award Winners" grid — season × award matrix across all published
 * awards (the admin can narrow the columns). Distinct from the per-award list
 * boards, which remain. Always emitted when there are published award winners.
 */
export async function buildAwardWinnersGrid(
  tenantId: number,
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  const awards = await db
    .select()
    .from(awardsTable)
    .where(and(eq(awardsTable.tenantId, tenantId), eq(awardsTable.published, true)))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  if (awards.length === 0) return null;

  const awardIds = awards.map((a) => a.id);
  const winners = await db
    .select()
    .from(awardWinnersTable)
    .where(
      and(inArray(awardWinnersTable.awardId, awardIds), eq(awardWinnersTable.published, true)),
    );
  if (winners.length === 0) return null;

  const awardById = new Map(awards.map((a) => [a.id, a]));
  // Default to every published award; narrow to the admin's chosen keys (in
  // their order) when set.
  const selectedKeys =
    gridColumns && gridColumns.length > 0
      ? gridColumns.filter((k) => awards.some((a) => a.key === k))
      : awards.map((a) => a.key);
  if (selectedKeys.length === 0) return null;
  const columns: GridColumnOptionOut[] = selectedKeys.map((k) => ({
    key: k,
    label: awards.find((a) => a.key === k)!.title,
  }));

  const grid = composeSeasonGrid(
    "Season",
    columns,
    winners.map((w) => ({
      seasonLabel: seasonLabel(w.season),
      startYear: w.season,
      colKey: awardById.get(w.awardId)?.key ?? "",
      text: w.name,
      playerId: w.playerId ?? null,
    })),
  );
  return {
    id: "award_winners",
    category: "award_winners",
    layout: "grid",
    title: "Award Winners",
    subtitle: "Season-by-season honour roll",
    entries: [],
    grid,
  };
}

/** Award points leaderboards (published, visible configs only). */
export async function buildAwardPoints(tenantId: number): Promise<HonourBoardOut[]> {
  const configs = await db
    .select()
    .from(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.leaderboardVisible, true))
    .orderBy(desc(awardPointsConfigTable.season));
  if (configs.length === 0) return [];
  // award_points_config has no tenant_id — scope via the parent award.
  const awards = await db.select().from(awardsTable).where(eq(awardsTable.tenantId, tenantId));
  const awardById = new Map(awards.map((a) => [a.id, a]));

  // Filter to eligible configs first (same guard as the old `for` loop's
  // `continue`), then run computeLeaderboard for all of them concurrently —
  // each is an independent join, and this function is called by
  // assembleBoards (already Promise.all'd across board builders, but that
  // doesn't help the sequential awaits *within* this one loop). `configs` is
  // already ordered by `desc(season)`; `.map` over the eligible list preserves
  // that order in `out` exactly like the original push-in-order `for` loop.
  type AwardConfig = typeof awardPointsConfigTable.$inferSelect;
  type Award = typeof awardsTable.$inferSelect;

  const eligible: { config: AwardConfig; award: Award }[] = [];
  for (const config of configs) {
    const award = awardById.get(config.awardId);
    if (!award || !award.published || !award.pointsGrade) continue;
    eligible.push({ config, award });
  }

  const results = await Promise.all(
    eligible.map(async ({ config, award }) => {
      const { entries } = await computeLeaderboard(config, award.pointsGrade!);
      return { config, award, entries };
    }),
  );

  const out: HonourBoardOut[] = [];
  for (const { config, award, entries } of results) {
    if (entries.length === 0) continue;
    out.push({
      id: `award_points:${config.id}`,
      category: "award_points",
      layout: "list",
      title: `${award.title} — Points`,
      subtitle: `${award.pointsGrade} · ${seasonLabel(config.season)}`,
      entries: entries.map((e, i) => ({
        season: "",
        primaryText: e.name,
        detail: `${e.points} pts`,
        playerId: e.playerId,
        meta: { rank: i + 1 },
      })),
    });
  }
  return out;
}

/** Team of the Decade — published boards only, full XI lineup. */
export async function buildTeamOfDecade(tenantId: number): Promise<HonourBoardOut[]> {
  const boards = await db
    .select()
    .from(teamOfDecadeBoardsTable)
    .where(
      and(
        eq(teamOfDecadeBoardsTable.tenantId, tenantId),
        eq(teamOfDecadeBoardsTable.published, true),
      ),
    )
    .orderBy(asc(teamOfDecadeBoardsTable.displayOrder), asc(teamOfDecadeBoardsTable.id));
  if (boards.length === 0) return [];
  const boardIds = boards.map((b) => b.id);
  const members = await db
    .select()
    .from(teamOfDecadeMembersTable)
    .where(inArray(teamOfDecadeMembersTable.boardId, boardIds))
    .orderBy(
      asc(teamOfDecadeMembersTable.battingOrder),
      asc(teamOfDecadeMembersTable.displayOrder),
      asc(teamOfDecadeMembersTable.id),
    );
  const byBoard = new Map<number, typeof members>();
  for (const m of members) {
    if (!byBoard.has(m.boardId)) byBoard.set(m.boardId, []);
    byBoard.get(m.boardId)!.push(m);
  }

  return boards
    .filter((b) => (byBoard.get(b.id) ?? []).length > 0)
    .map((b) => ({
      id: `team_of_decade:${b.key}`,
      category: "team_of_decade",
      layout: "teamOfDecade" as const,
      title: b.title,
      subtitle: [b.teamLabel, b.periodLabel, b.subtitle].filter(Boolean).join(" · ") || null,
      entries: (byBoard.get(b.id) ?? []).map((m) => {
        const marks = [
          m.isCaptain ? "(c)" : "",
          m.isViceCaptain ? "(vc)" : "",
          m.isWicketkeeper ? "(wk)" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return {
          season: "",
          primaryText: marks ? `${m.name} ${marks}` : m.name,
          detail: m.role || null,
          playerId: m.playerId ?? null,
        };
      }),
    }));
}

/** Per-published-award honour boards, each under its REAL award title. */
export async function buildAwardBoards(tenantId: number): Promise<HonourBoardOut[]> {
  const awards = await db
    .select()
    .from(awardsTable)
    .where(and(eq(awardsTable.tenantId, tenantId), eq(awardsTable.published, true)))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  if (awards.length === 0) return [];

  const awardIds = awards.map((a) => a.id);
  const winners = await db
    .select()
    .from(awardWinnersTable)
    .where(and(inArray(awardWinnersTable.awardId, awardIds), eq(awardWinnersTable.published, true)))
    .orderBy(desc(awardWinnersTable.season), asc(awardWinnersTable.displayOrder));
  const byAward = new Map<number, typeof winners>();
  for (const w of winners) {
    if (!byAward.has(w.awardId)) byAward.set(w.awardId, []);
    byAward.get(w.awardId)!.push(w);
  }

  const boards: HonourBoardOut[] = [];
  for (const a of awards) {
    const winRows = byAward.get(a.id) ?? [];
    if (winRows.length === 0) continue;
    boards.push({
      id: `award:${a.key}`,
      category: "awards",
      layout: "list",
      title: a.title,
      subtitle: a.description || null,
      entries: winRows.map((w) => ({
        season: seasonLabel(w.season),
        primaryText: w.name,
        detail: null,
        playerId: w.playerId ?? null,
      })),
    });
  }
  return boards;
}
