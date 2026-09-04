/**
 * Board assembly for one tenant/data source, plus the grid catalog and brand block the display page renders.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  premiershipsTable,
  awardsTable,
  clubRolesTable,
  type HonourDisplaySettingsRow,
} from "@workspace/db";
import { getTenantBrand } from "../tenant-brand";
import type { DataSource } from "../tenant";
import {
  buildAwardBoards,
  buildAwardPoints,
  buildAwardWinnersGrid,
  buildTeamOfDecade,
} from "./awards";
import { buildComposites, buildCustomGrids } from "./composites";
import { buildCaptains, buildCaptainsGrid, buildCommittee, buildLifeMembers } from "./people";
import { buildPremierships, buildPremiershipsGrid, premParentGrade } from "./premierships";
import {
  buildCenturies,
  buildClubRecords,
  buildFiveWicketHauls,
  buildMilestoneBoard,
  buildMostGames,
  buildPartnerships,
  buildRecordsByGrade,
  buildRecordsLeaderboards,
  roleRank,
} from "./records";
import { clampWrapBlocks, gradeRank, resolveDisplay } from "./shared";
import { type GridCatalogEntryOut, type HonourBoardOut } from "./types";

export async function assembleBoards(
  settings: HonourDisplaySettingsRow,
  source: DataSource,
): Promise<HonourBoardOut[]> {
  // Every curated board is scoped to the requesting tenant so a kiosk/admin
  // never renders another club's premierships, life members, awards, etc.
  const { tenantId } = source;
  const central = source.kind === "central";
  const boardConfigsAll = settings.boardConfigs ?? {};
  const gridCols = (id: string): string[] | undefined => boardConfigsAll[id]?.gridColumns;
  const [
    premierships,
    premiershipsGrid,
    awards,
    awardWinnersGrid,
    centuries,
    fiveFor,
    lifeMembers,
    captains,
    captainsGrid,
    committee,
    partnerships,
    milestones,
    awardPoints,
    recordsLeaderboards,
    recordsByGrade,
    teamOfDecade,
    clubRecords,
    mostGames,
  ] = await Promise.all([
    buildPremierships(tenantId, central),
    buildPremiershipsGrid(tenantId, gridCols("premierships_grid")),
    buildAwardBoards(tenantId),
    buildAwardWinnersGrid(tenantId, gridCols("award_winners")),
    buildCenturies(tenantId),
    buildFiveWicketHauls(tenantId),
    buildLifeMembers(tenantId),
    buildCaptains(tenantId),
    buildCaptainsGrid(tenantId, gridCols("captains_grid")),
    buildCommittee(tenantId, gridCols("committee")),
    buildPartnerships(tenantId),
    buildMilestoneBoard(source),
    buildAwardPoints(tenantId),
    buildRecordsLeaderboards(tenantId),
    buildRecordsByGrade(),
    buildTeamOfDecade(tenantId),
    buildClubRecords(tenantId),
    buildMostGames(),
  ]);

  const boards: HonourBoardOut[] = [];
  if (premierships) boards.push(premierships);
  if (premiershipsGrid) boards.push(premiershipsGrid);
  boards.push(...awards);
  if (awardWinnersGrid) boards.push(awardWinnersGrid);
  boards.push(...teamOfDecade);
  if (clubRecords) boards.push(clubRecords);
  boards.push(...recordsByGrade);
  if (partnerships) boards.push(partnerships);
  if (centuries) boards.push(centuries);
  if (fiveFor) boards.push(fiveFor);
  if (mostGames) boards.push(mostGames);
  if (milestones) boards.push(milestones);
  boards.push(...awardPoints);
  boards.push(...recordsLeaderboards);
  boards.push(...captains);
  if (captainsGrid) boards.push(captainsGrid);
  if (committee) boards.push(committee);
  if (lifeMembers) boards.push(lifeMembers);

  // Composite "columns" boards reference the base boards above, so build them
  // last (after Most Games) and append.
  boards.push(...buildComposites(settings.composites ?? [], boards));

  // Admin-built custom grid boards (independent of the base boards).
  boards.push(...(await buildCustomGrids(tenantId, settings.customGrids ?? [])));

  // Stamp the resolved display config + per-board skin/footnote onto every board.
  const boardConfigs = settings.boardConfigs ?? {};
  const customDefById = new Map((settings.customGrids ?? []).map((d) => [d.id, d]));
  for (const b of boards) {
    const cfg = boardConfigs[b.id];
    if (b.layout === "columns") {
      const def = (settings.composites ?? []).find((d) => d.id === b.id);
      b.display = {
        columns: 1,
        transition: def?.transition ?? "scroll",
        fit: def?.fit ?? true,
        wrapBlocks: 2,
      };
    } else if (customDefById.has(b.id)) {
      const def = customDefById.get(b.id)!;
      const transition = def.fillMode ?? "scroll";
      b.display = {
        columns: 1,
        transition,
        fit: true,
        wrapBlocks: clampWrapBlocks(def.wrapBlocks),
      };
    } else {
      b.display = resolveDisplay(b.layout, cfg);
    }
    // Per-board skin/footnote fall back to the board config when not already
    // set by a custom-grid definition.
    if (b.skin == null) b.skin = cfg?.skin ?? null;
    if (b.footnote == null) b.footnote = cfg?.footnote ?? null;
    // Season row order for grid boards. Builders emit newest-first (desc); an
    // admin "asc" choice flips it to oldest-first by reversing the rows.
    if (cfg?.sort === "asc" && b.grid) {
      b.grid = { ...b.grid, rows: [...b.grid.rows].reverse() };
    }
  }
  return boards;
}

export function deriveMonogram(name: string, shortName: string | null): string {
  const source = (name || shortName || "").trim();
  const initials = source
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (initials.length >= 2) return initials;
  return (shortName || source || "HH").slice(0, 2).toUpperCase();
}

/**
 * Grid-capable boards + their selectable columns, driving the admin column
 * pickers. Covers committee (offices), award_winners (awards), captains_grid
 * and premierships_grid (grades).
 */
export async function buildGridCatalog(tenantId: number): Promise<GridCatalogEntryOut[]> {
  const [roleRows, awards, prems] = await Promise.all([
    db
      .select({
        role: clubRolesTable.role,
        grade: clubRolesTable.grade,
        displayOrder: clubRolesTable.displayOrder,
      })
      .from(clubRolesTable)
      .where(and(eq(clubRolesTable.tenantId, tenantId), eq(clubRolesTable.published, true))),
    db
      .select()
      .from(awardsTable)
      .where(and(eq(awardsTable.tenantId, tenantId), eq(awardsTable.published, true)))
      .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id)),
    db
      .select({ grade: premiershipsTable.grade })
      .from(premiershipsTable)
      .where(eq(premiershipsTable.tenantId, tenantId)),
  ]);

  // Distinct offices (grade-null roles), ranked by the office order.
  const officeSet = new Map<string, number>();
  for (const r of roleRows) {
    if (r.grade != null) continue;
    if (!officeSet.has(r.role)) officeSet.set(r.role, r.displayOrder ?? 0);
  }
  const offices = [...officeSet.keys()].sort(
    (a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b),
  );

  // Distinct grades with published grade captains, in seniority order.
  const capGradeSet = new Set<string>();
  for (const r of roleRows) {
    if (r.role === "Grade Captain" && r.grade) capGradeSet.add(r.grade);
  }
  const capGrades = [...capGradeSet].sort(
    (a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b),
  );

  // Distinct premiership grades, in seniority order.
  const premGradeSet = new Set<string>();
  for (const p of prems) if (p.grade) premGradeSet.add(p.grade);
  const premGrades = [...premGradeSet].sort(
    (a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b),
  );

  return [
    {
      id: "committee",
      title: "Committee & Office Bearers",
      options: offices.map((o) => ({ key: o, label: o })),
    },
    {
      id: "award_winners",
      title: "Award Winners",
      options: awards.map((a) => ({ key: a.key, label: a.title })),
    },
    {
      id: "captains_grid",
      title: "Grade Captains (grid)",
      options: capGrades.map((g) => ({ key: g, label: g })),
    },
    {
      id: "premierships_grid",
      title: "Premierships (grid)",
      options: premGrades.map((g) => ({ key: g, label: premParentGrade(g) })),
    },
  ];
}

export async function buildBrand(tenantId: number) {
  // Brand the display with the request's tenant, not a hard-coded demo tenant.
  const b = await getTenantBrand(tenantId);
  return {
    name: b.name,
    shortName: b.shortName ?? b.name,
    monogram: deriveMonogram(b.name, b.shortName ?? null),
    logoUrl: b.logoUrl128 ?? b.logoUrl ?? null,
    backgroundColour: b.backgroundColour ?? "#333F48",
    primaryColour: b.primaryColour ?? "#FBAC27",
    juniorsColour: b.juniorsColour ?? b.backgroundColour ?? "#4A5A66",
  };
}

// ---------------------------------------------------------------------------
// Routes (admin-only: the display + kiosk are clubroom/admin tools)
// ---------------------------------------------------------------------------
