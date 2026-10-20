import { and, gte, eq } from "drizzle-orm";
import { db, fixturesTable, juniorFixturesTable } from "@workspace/db";
import { sortByGradeOrder } from "@workspace/scorecard";
import {
  DEFAULT_SIDE_SIZE,
  MAX_SIDE_SIZE,
  resolveSideSize,
} from "@workspace/scorecard/selection-shape";
import { loadClubGradeOrder } from "./club-grade-order";
import { juniorSideLabel } from "./selection-fixtures";

/**
 * Players per side by grade (ADR-009): `availability_settings.side_sizes`,
 * keyed by the side's grade label — the app grade for a senior side, the team
 * for a junior one (`juniorSideLabel`). A grade with no key picks 12. A draft
 * fixes its size when it is created (`selections.side_size`), so changing the
 * map never reshapes an existing side.
 */

/** The size a new draft of `grade` gets: its key in the map (trimmed), else 12. */
export function gradeSideSize(
  sideSizes: Readonly<Record<string, number>> | null | undefined,
  grade: string,
): number {
  const map = sideSizes ?? {};
  const key = grade.trim();
  return resolveSideSize(map[key] ?? map[grade]);
}

/** A club's side settings by grade: sizes, and the grades whose side of 12 all play. */
export type SideSettings = {
  sideSizes: Readonly<Record<string, number>> | null | undefined;
  allPlayGrades: readonly string[] | null | undefined;
};

/** Whether `grade`'s side of 12 all play (numbered 1–12, no "12th"). Only read at 12. */
export function gradeAllPlay(
  allPlayGrades: readonly string[] | null | undefined,
  grade: string,
): boolean {
  const key = grade.trim();
  return (allPlayGrades ?? []).some((g) => g.trim() === key);
}

/** The size and format a new draft of `grade` gets. */
export function gradeSideSpec(
  settings: SideSettings,
  grade: string,
): { sideSize: number; allPlay: boolean } {
  const sideSize = gradeSideSize(settings.sideSizes, grade);
  return {
    sideSize,
    allPlay: sideSize === DEFAULT_SIDE_SIZE && gradeAllPlay(settings.allPlayGrades, grade),
  };
}

/** A submitted all-play list, cleaned for storage: trimmed, blanks and repeats dropped. */
export function cleanAllPlayGrades(raw: readonly string[]): string[] {
  return [...new Set(raw.map((g) => g.trim()).filter(Boolean))];
}

/**
 * A submitted map, cleaned for storage: keys trimmed, a blank key refused, a
 * size of 12 dropped (12 is what a missing key means). Returns the error to
 * show for a size that isn't a whole number from 12 to 14.
 */
export function cleanSideSizes(
  raw: Readonly<Record<string, number>>,
): { sideSizes: Record<string, number> } | { error: string } {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const grade = k.trim();
    if (!grade) return { error: "Each side size needs a grade." };
    if (!Number.isInteger(v) || v < DEFAULT_SIDE_SIZE || v > MAX_SIDE_SIZE) {
      return {
        error: `${grade}: a side has ${DEFAULT_SIDE_SIZE} to ${MAX_SIDE_SIZE} players.`,
      };
    }
    if (v !== DEFAULT_SIDE_SIZE) out[grade] = v;
  }
  return { sideSizes: out };
}

const YEAR_MS = 365 * 24 * 3_600_000;

/**
 * The grade labels the club's sides go by, for the per-grade settings: every
 * senior app grade and junior team with a fixture from the last year on, in
 * the club's grade order. A settings key matching none of them is a grade that
 * was renamed or no longer plays.
 */
export async function loadSideGrades(tenantId: number, now: Date = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - YEAR_MS);
  const [senior, junior, order] = await Promise.all([
    db
      .selectDistinct({ grade: fixturesTable.grade })
      .from(fixturesTable)
      .where(and(eq(fixturesTable.tenantId, tenantId), gte(fixturesTable.startAt, since))),
    db
      .selectDistinct({
        teamName: juniorFixturesTable.teamName,
        grade: juniorFixturesTable.grade,
        ageGroup: juniorFixturesTable.ageGroup,
      })
      .from(juniorFixturesTable)
      .where(
        and(eq(juniorFixturesTable.tenantId, tenantId), gte(juniorFixturesTable.startAt, since)),
      ),
    loadClubGradeOrder(tenantId),
  ]);
  const seniorGrades = [...new Set(senior.map((r) => r.grade.trim()).filter(Boolean))];
  const juniorGrades = [...new Set(junior.map(juniorSideLabel))].filter(
    (g) => !seniorGrades.includes(g),
  );
  return [
    ...sortByGradeOrder(seniorGrades, (g) => g, order),
    ...juniorGrades.sort((a, b) => a.localeCompare(b)),
  ];
}
