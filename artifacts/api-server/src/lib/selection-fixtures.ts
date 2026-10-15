import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  fixturesTable,
  juniorFixturesTable,
  type FixtureRow,
  type JuniorFixtureRow,
  type SelectionRow,
  type SquadSection,
} from "@workspace/db";
import { fixtureSection } from "./availability-grades";

/**
 * The fixture a Selection Hub side belongs to: a senior `fixtures` row, or a
 * `junior_fixtures` row from the junior PlayHQ sync. The Hub reads both through
 * this one shape. `grade` is the side's label: the app grade for a senior side,
 * the club's junior team ("Halls Head Year 7 Gold") for a junior one, since a
 * club can field several teams in one age group.
 */
export type SideFixture = {
  kind: "senior" | "junior";
  id: number;
  grade: string;
  opponentName: string;
  startAt: Date;
  venue: string | null;
  isHome: boolean;
  roundLabel: string | null;
  /** Junior only: the school-year band and PlayHQ grade name. */
  ageGroup: string | null;
  competition: string | null;
  /** The senior row, for senior-only reads (team-list publish, PlayHQ details). */
  senior: FixtureRow | null;
  junior: JuniorFixtureRow | null;
};

export function seniorSideFixture(f: FixtureRow): SideFixture {
  return {
    kind: "senior",
    id: f.id,
    grade: f.grade,
    opponentName: f.opponentName,
    startAt: f.startAt,
    venue: f.venue,
    isHome: f.isHome,
    roundLabel: f.roundLabel,
    ageGroup: null,
    competition: f.competitionName,
    senior: f,
    junior: null,
  };
}

/** The label a junior side goes by: its team, else its grade or age group. */
export function juniorSideLabel(
  f: Pick<JuniorFixtureRow, "teamName" | "grade" | "ageGroup">,
): string {
  return f.teamName?.trim() || f.grade?.trim() || f.ageGroup?.trim() || "Junior side";
}

export function juniorSideFixture(f: JuniorFixtureRow): SideFixture {
  return {
    kind: "junior",
    id: f.id,
    grade: juniorSideLabel(f),
    opponentName: f.opponentName?.trim() || "TBC",
    // Sides are only drafted for timed fixtures; a time PlayHQ later cleared
    // falls back to when the row was made rather than reading as "started".
    startAt: f.startAt ?? f.createdAt,
    venue: f.venue,
    isHome: f.isHome ?? true,
    roundLabel: null,
    ageGroup: f.ageGroup,
    competition: f.grade,
    senior: null,
    junior: f,
  };
}

/** Senior or junior section of a side. A junior grade in `fixtures` is a junior side too. */
export function sideSection(f: SideFixture): SquadSection {
  return f.kind === "junior" ? "junior" : fixtureSection(f.grade);
}

type SideRef = Pick<SelectionRow, "fixtureId" | "juniorFixtureId">;

/** The key a side's fixture is found under in `loadSideFixtures`'s map. */
export const sideFixtureKey = (s: SideRef): string =>
  s.juniorFixtureId != null ? `j:${s.juniorFixtureId}` : `s:${s.fixtureId}`;

/** The fixtures of the given sides, tenant-scoped, keyed by `sideFixtureKey`. */
export async function loadSideFixtures(
  reader: Pick<typeof db, "select">,
  tenantId: number,
  sides: readonly SideRef[],
): Promise<Map<string, SideFixture>> {
  const seniorIds = [...new Set(sides.flatMap((s) => (s.fixtureId != null ? [s.fixtureId] : [])))];
  const juniorIds = [
    ...new Set(sides.flatMap((s) => (s.juniorFixtureId != null ? [s.juniorFixtureId] : []))),
  ];
  const [seniors, juniors] = await Promise.all([
    seniorIds.length > 0
      ? reader
          .select()
          .from(fixturesTable)
          .where(and(eq(fixturesTable.tenantId, tenantId), inArray(fixturesTable.id, seniorIds)))
      : [],
    juniorIds.length > 0
      ? reader
          .select()
          .from(juniorFixturesTable)
          .where(
            and(
              eq(juniorFixturesTable.tenantId, tenantId),
              inArray(juniorFixturesTable.id, juniorIds),
            ),
          )
      : [],
  ]);
  const out = new Map<string, SideFixture>();
  for (const f of seniors) out.set(`s:${f.id}`, seniorSideFixture(f));
  for (const f of juniors) out.set(`j:${f.id}`, juniorSideFixture(f));
  return out;
}

/** One side's fixture, or null when it has gone or belongs to another tenant. */
export async function loadSideFixture(
  reader: Pick<typeof db, "select">,
  tenantId: number,
  side: SideRef,
): Promise<SideFixture | null> {
  return (await loadSideFixtures(reader, tenantId, [side])).get(sideFixtureKey(side)) ?? null;
}
