import { and, eq, gte, lt } from "drizzle-orm";
import { db, juniorFixturesTable, type JuniorFixtureRow } from "@workspace/db";
import { resolveCardCompetition, type CardNames } from "@workspace/scorecard/card-names";

/**
 * Junior card headings (round 3 retest, Ash's junior Team List headings).
 *
 * Built like the senior cards: a big heading that is just the grade, and a
 * small line naming the competition and round. Before, both read
 * "YEAR 9 — HALLS HEAD YEAR 9": the grade, then the team name, which repeats
 * the grade and the club.
 *
 * - Heading: the grade's display name (the age group the club's Junior
 *   competitions grouping holds, through the club's junior competition label),
 *   "YEAR 9". When the club has more than one team in that grade the same
 *   round, the team's own suffix with the club and grade taken out is added,
 *   "YEAR 9 GOLD". The club's name is never in the heading.
 * - Eyebrow (the small line and the chip line): the competition name, then the
 *   round when it is known, "YEAR 9 BOYS SOUTH WEST — ROUND 5". Junior fixtures
 *   carry no round today, so it is the competition alone.
 *
 * Junior tables only (juniors isolation).
 */

export type JuniorHeading = { heading: string; eyebrow: string };

type HeadingFixture = Pick<JuniorFixtureRow, "ageGroup" | "grade" | "teamName">;

const words = (s: string | null | undefined) =>
  (s ?? "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** Remove every run of `phrase`'s words from `list` (compared upper-case; kept as written). */
function without(list: string[], phrase: string[]): string[] {
  if (!phrase.length) return list;
  const out: string[] = [];
  for (let i = 0; i < list.length;) {
    if (phrase.every((w, k) => list[i + k]?.toUpperCase() === w)) i += phrase.length;
    else out.push(list[i++]!);
  }
  return out;
}

/**
 * The club's names to take out of a team name: the full name, the name
 * without "Cricket Club" / "CC" / "Junior Cricket Club", and the short name.
 */
export function clubNameVariants(...names: Array<string | null | undefined>): string[][] {
  const out: string[][] = [];
  for (const name of names) {
    const w = words(name);
    if (!w.length) continue;
    out.push(w);
    const trimmed = [...w];
    while (
      trimmed.length > 1 &&
      ["CRICKET", "CLUB", "CC", "JUNIOR", "JUNIORS", "JCC", "INC"].includes(trimmed.at(-1)!)
    )
      trimmed.pop();
    if (trimmed.length < w.length) out.push(trimmed);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** The team's own suffix: its name with the club and the grade taken out ("Gold"). */
export function juniorTeamSuffix(
  teamName: string | null | undefined,
  grade: string,
  clubNames: string[][],
): string {
  // Matched upper-case, kept as the club wrote it ("Gold").
  let rest = (teamName ?? "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  for (const club of clubNames) rest = without(rest, club);
  rest = without(rest, words(grade));
  return rest.join(" ");
}

/** A junior fixture's heading and eyebrow. Pure. */
export function juniorHeading(
  f: HeadingFixture,
  opts: {
    clubNames?: string[][];
    teamsInGrade?: number;
    names?: CardNames | null;
    round?: string | null;
  } = {},
): JuniorHeading {
  const base = (f.ageGroup || f.grade || "Juniors").trim();
  const shown = resolveCardCompetition(opts.names ?? null, base) || base;
  const suffix =
    (opts.teamsInGrade ?? 1) > 1 ? juniorTeamSuffix(f.teamName, base, opts.clubNames ?? []) : "";
  const competition = (f.grade || base).trim();
  return {
    heading: [shown, suffix].filter(Boolean).join(" "),
    eyebrow: [competition.toUpperCase(), (opts.round ?? "").trim().toUpperCase()]
      .filter(Boolean)
      .join(" — "),
  };
}

const DAY = 24 * 60 * 60 * 1000;
/** Fixtures of one grade this close together are the same round. */
const ROUND_WINDOW = 3 * DAY;

/**
 * Each fixture's heading, keyed by junior fixture id: how many of the club's
 * teams play that grade the same round decides whether the team's suffix shows.
 */
export async function loadJuniorHeadings(
  tenantId: number,
  fixtures: readonly Pick<
    JuniorFixtureRow,
    "id" | "ageGroup" | "grade" | "teamName" | "startAt" | "seasonStartYear"
  >[],
  opts: { clubNames?: string[][]; names?: CardNames | null } = {},
): Promise<Map<number, JuniorHeading>> {
  const out = new Map<number, JuniorHeading>();
  if (!fixtures.length) return out;
  const times = fixtures.map((f) => f.startAt?.getTime()).filter((t): t is number => !!t);
  const rows = times.length
    ? await db
        .select({
          ageGroup: juniorFixturesTable.ageGroup,
          grade: juniorFixturesTable.grade,
          teamName: juniorFixturesTable.teamName,
          startAt: juniorFixturesTable.startAt,
          seasonStartYear: juniorFixturesTable.seasonStartYear,
        })
        .from(juniorFixturesTable)
        .where(
          and(
            eq(juniorFixturesTable.tenantId, tenantId),
            gte(juniorFixturesTable.startAt, new Date(Math.min(...times) - ROUND_WINDOW)),
            lt(juniorFixturesTable.startAt, new Date(Math.max(...times) + ROUND_WINDOW)),
          ),
        )
    : [];
  const gradeOf = (r: { ageGroup: string | null; grade: string | null }) =>
    (r.ageGroup || r.grade || "").trim().toUpperCase();
  for (const f of fixtures) {
    const at = f.startAt?.getTime();
    const teams = new Set(
      rows
        .filter(
          (r) =>
            at !== undefined &&
            r.startAt &&
            r.seasonStartYear === f.seasonStartYear &&
            gradeOf(r) === gradeOf(f) &&
            Math.abs(r.startAt.getTime() - at) <= ROUND_WINDOW,
        )
        .map((r) => (r.teamName ?? "").trim().toUpperCase()),
    );
    teams.add((f.teamName ?? "").trim().toUpperCase());
    out.set(
      f.id,
      juniorHeading(f, { clubNames: opts.clubNames, names: opts.names, teamsInGrade: teams.size }),
    );
  }
  return out;
}
