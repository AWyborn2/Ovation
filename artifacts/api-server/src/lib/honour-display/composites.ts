/**
 * Admin-defined boards: composite "columns" boards over the base set and custom season grids.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  premiershipsTable,
  awardsTable,
  awardWinnersTable,
  clubRolesTable,
  type CompositeDefJson,
  type CustomGridDefJson,
} from "@workspace/db";

import { premiershipSeasons } from "../../routes/premierships";
import { seasonLabel, tidyCompetition } from "./premierships";
import {
  type BoardColumnOut,
  type BoardEntry,
  type BoardGridOut,
  type GridCellEntryOut,
  type GridColumnOptionOut,
  type GridRowOut,
  type HonourBoardOut,
} from "./types";

/** Parse the leading start-year from a season label ("2024/25" -> 2024). */
export function seasonStartYearFromLabel(label: string): number {
  const m = label.match(/(\d{4})/);
  return m ? parseInt(m[1]!, 10) : -1;
}

// Refs that can never be a composite column source.
export const NON_COMPOSITE_REFS = new Set(["approaching"]);

/**
 * Build admin-defined composite "columns" boards from settings.composites.
 * Free columns are the core mechanism (each list board becomes a column).
 * seasonAligned is a guarded transform: only applied when EVERY referenced
 * column has a non-empty season on every entry; otherwise we fall back to the
 * free-columns layout so a board without seasons never collapses to empty.
 */
export function buildComposites(
  defs: CompositeDefJson[],
  baseBoards: HonourBoardOut[],
): HonourBoardOut[] {
  const byId = new Map(baseBoards.map((b) => [b.id, b]));
  const out: HonourBoardOut[] = [];
  for (const def of defs) {
    if (typeof def?.id !== "string" || !def.id.startsWith("composite:")) continue;
    const cols: BoardColumnOut[] = [];
    for (const ref of def.columns ?? []) {
      if (!ref || NON_COMPOSITE_REFS.has(ref.boardId)) continue;
      if (ref.boardId.startsWith("composite:")) continue; // no nesting
      const src = byId.get(ref.boardId);
      if (!src || src.layout !== "list") continue; // only list boards
      cols.push({
        heading: (ref.heading ?? "").trim() || src.title,
        entries: src.entries,
      });
    }
    if (cols.length === 0) continue;

    const canAlign =
      def.seasonAligned &&
      cols.every((c) => c.entries.length > 0 && c.entries.every((e) => (e.season ?? "") !== ""));

    let columns: BoardColumnOut[];
    if (canAlign) {
      // Union of all seasons across the columns, newest first.
      const yearByLabel = new Map<string, number>();
      for (const c of cols)
        for (const e of c.entries) yearByLabel.set(e.season, seasonStartYearFromLabel(e.season));
      const seasons = [...yearByLabel.entries()]
        .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
        .map(([label]) => label);
      const seasonCol: BoardColumnOut = {
        heading: "Season",
        entries: seasons.map((s) => ({ season: s, primaryText: s })),
      };
      const aligned = cols.map((c) => {
        const bySeason = new Map<string, BoardEntry[]>();
        for (const e of c.entries) {
          if (!bySeason.has(e.season)) bySeason.set(e.season, []);
          bySeason.get(e.season)!.push(e);
        }
        return {
          heading: c.heading,
          entries: seasons.map((s): BoardEntry => {
            const hits = bySeason.get(s) ?? [];
            if (hits.length === 0) return { season: s, primaryText: "" };
            if (hits.length === 1) {
              const h = hits[0]!;
              return {
                season: s,
                primaryText: h.primaryText,
                detail: h.detail ?? null,
                playerId: h.playerId ?? null,
                matchId: h.matchId ?? null,
              };
            }
            return {
              season: s,
              primaryText: hits.map((h) => h.primaryText).join(", "),
              detail:
                hits
                  .map((h) => h.detail)
                  .filter((d): d is string => !!d)
                  .join(" · ") || null,
            };
          }),
        };
      });
      columns = [seasonCol, ...aligned];
    } else {
      columns = cols;
    }

    out.push({
      id: def.id,
      category: "composite",
      layout: "columns",
      title: def.title,
      subtitle: def.subtitle ?? null,
      entries: [],
      columns,
    });
  }
  return out;
}

/**
 * Season-grid composer for admin-built custom grids. Like composeSeasonGrid but
 * (a) carries per-cell notes and (b) can span an explicit season range so the
 * board pre-lists blank future seasons (rows always run newest → oldest).
 */
export function composeCustomGrid(
  columns: GridColumnOptionOut[],
  records: {
    seasonLabel: string;
    startYear: number;
    colKey: string;
    text: string;
    note?: string | null;
    playerId?: number | null;
  }[],
  range: { from?: number | null; to?: number | null },
): BoardGridOut {
  const bySeasonCol = new Map<string, Map<string, GridCellEntryOut[]>>();
  const yearByLabel = new Map<string, number>();
  for (const r of records) {
    if (!r.text) continue;
    yearByLabel.set(r.seasonLabel, r.startYear);
    let m = bySeasonCol.get(r.seasonLabel);
    if (!m) {
      m = new Map();
      bySeasonCol.set(r.seasonLabel, m);
    }
    let arr = m.get(r.colKey);
    if (!arr) {
      arr = [];
      m.set(r.colKey, arr);
    }
    arr.push({ text: r.text, playerId: r.playerId ?? null, note: r.note ?? null });
  }

  const dataYears = [...yearByLabel.values()];
  const from = range.from ?? (dataYears.length ? Math.min(...dataYears) : null);
  const to = range.to ?? (dataYears.length ? Math.max(...dataYears) : null);
  let startYears: number[];
  if (from != null && to != null && to >= from && to - from < 300) {
    startYears = [];
    for (let y = to; y >= from; y--) startYears.push(y);
  } else {
    startYears = [...new Set(dataYears)].sort((a, b) => b - a);
  }

  const rows: GridRowOut[] = startYears.map((y) => {
    const label = seasonLabel(y);
    const m = bySeasonCol.get(label) ?? new Map<string, GridCellEntryOut[]>();
    return { heading: label, cells: columns.map((c) => ({ entries: m.get(c.key) ?? [] })) };
  });
  return { rowHeading: "Season", columnHeadings: columns.map((c) => c.label), rows };
}

/**
 * Build admin-defined custom grid boards from settings.customGrids. Each column
 * draws from any data source (office / award / grade captains / premierships /
 * manual entry) and the board spans an optional season range (pre-listing blank
 * future seasons). Carries its own skin / fill mode / footnote.
 */
export async function buildCustomGrids(
  tenantId: number,
  defs: CustomGridDefJson[],
): Promise<HonourBoardOut[]> {
  const valid = (defs ?? []).filter(
    (d) =>
      typeof d?.id === "string" &&
      d.id.startsWith("grid:") &&
      Array.isArray(d.columns) &&
      d.columns.length > 0,
  );
  if (valid.length === 0) return [];

  // Preload every potential source once (custom grids share these tables).
  const [roleRows, awards, premiers] = await Promise.all([
    db
      .select({
        role: clubRolesTable.role,
        grade: clubRolesTable.grade,
        season: clubRolesTable.season,
        name: clubRolesTable.name,
        playerId: clubRolesTable.playerId,
      })
      .from(clubRolesTable)
      .where(and(eq(clubRolesTable.tenantId, tenantId), eq(clubRolesTable.published, true))),
    db
      .select()
      .from(awardsTable)
      .where(and(eq(awardsTable.tenantId, tenantId), eq(awardsTable.published, true))),
    db.select().from(premiershipsTable).where(eq(premiershipsTable.tenantId, tenantId)),
  ]);
  const awardByKey = new Map(awards.map((a) => [a.key, a]));
  const awardIds = awards.map((a) => a.id);
  const winners = awardIds.length
    ? await db
        .select()
        .from(awardWinnersTable)
        .where(
          and(inArray(awardWinnersTable.awardId, awardIds), eq(awardWinnersTable.published, true)),
        )
    : [];
  const winnersByAward = new Map<number, typeof winners>();
  for (const w of winners) {
    if (!winnersByAward.has(w.awardId)) winnersByAward.set(w.awardId, []);
    winnersByAward.get(w.awardId)!.push(w);
  }

  type Rec = {
    seasonLabel: string;
    startYear: number;
    colKey: string;
    text: string;
    note?: string | null;
    playerId?: number | null;
  };

  const out: HonourBoardOut[] = [];
  for (const def of valid) {
    const columns: GridColumnOptionOut[] = def.columns.map((c) => ({
      key: c.key,
      label: c.label || c.sourceKey || c.key,
    }));
    const records: Rec[] = [];
    for (const col of def.columns) {
      const key = col.key;
      if (col.source === "office") {
        for (const r of roleRows)
          if (r.grade == null && r.role === col.sourceKey)
            records.push({
              seasonLabel: seasonLabel(r.season),
              startYear: r.season,
              colKey: key,
              text: r.name,
              playerId: r.playerId ?? null,
            });
      } else if (col.source === "grade") {
        for (const r of roleRows)
          if (r.role === "Grade Captain" && r.grade === col.sourceKey)
            records.push({
              seasonLabel: seasonLabel(r.season),
              startYear: r.season,
              colKey: key,
              text: r.name,
              playerId: r.playerId ?? null,
            });
      } else if (col.source === "award") {
        const a = col.sourceKey ? awardByKey.get(col.sourceKey) : undefined;
        if (a)
          for (const w of winnersByAward.get(a.id) ?? [])
            records.push({
              seasonLabel: seasonLabel(w.season),
              startYear: w.season,
              colKey: key,
              text: w.name,
              playerId: w.playerId ?? null,
            });
      } else if (col.source === "premiership") {
        for (const p of premiers)
          if (p.grade === col.sourceKey) {
            const sy = premiershipSeasons(p.year, p.matchDate)[0]!;
            records.push({
              seasonLabel: seasonLabel(sy),
              startYear: sy,
              colKey: key,
              text: p.result || tidyCompetition(p.competition) || "Premiers",
              note: "Premiers",
            });
          }
      } else if (col.source === "manual") {
        for (const [label, text] of Object.entries(col.manualValues ?? {})) {
          const sy = seasonStartYearFromLabel(label);
          if (sy < 0 || !text) continue;
          records.push({ seasonLabel: label, startYear: sy, colKey: key, text });
        }
      }
    }
    const grid = composeCustomGrid(columns, records, {
      from: def.seasonFrom ?? null,
      to: def.seasonTo ?? null,
    });
    out.push({
      id: def.id,
      category: "custom_grid",
      layout: "grid",
      title: def.title || "Honour Board",
      subtitle: def.subtitle ?? null,
      entries: [],
      grid,
      skin: def.skin ?? null,
      footnote: def.footnote ?? null,
    });
  }
  return out;
}
