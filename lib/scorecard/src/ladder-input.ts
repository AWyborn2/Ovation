/**
 * Ladder card inputs for the Posting Plan's round carousel (plan
 * 2026-10-07-001 U5): one card per published ladder table, built from the
 * PlayHQ season ladder.
 */

export interface LadderTeamRow {
  rank: number | null;
  teamName: string;
  played: number | null;
  won: number | null;
  lost: number | null;
  points: number | null;
  isClub: boolean;
}

export interface LadderCardInput {
  kind: "ladder";
  competitionName: string;
  gradeLabel: string;
  asOfLabel: string;
  rows: {
    pos: number;
    team: string;
    played: number;
    won: number;
    lost: number;
    points: number | string;
    isClub?: boolean;
  }[];
}

/** The ladder card holds ten rows; the club's own team always makes the cut. */
export const LADDER_ROWS = 10;

export function ladderInput(opts: {
  grade: string;
  /** The ladder table's name when a grade publishes several (e.g. "One Day"). */
  tableName?: string | null;
  asOfLabel: string;
  teams: readonly LadderTeamRow[];
}): LadderCardInput {
  const gradeLabel = opts.grade.toUpperCase();
  const ranked = [...opts.teams].sort(
    (a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
  );
  let shown = ranked.slice(0, LADDER_ROWS);
  const club = ranked.find((t) => t.isClub);
  if (club && !shown.includes(club)) shown = [...shown.slice(0, LADDER_ROWS - 1), club];
  return {
    kind: "ladder",
    competitionName: opts.tableName ? `${gradeLabel} · ${opts.tableName.toUpperCase()}` : gradeLabel,
    gradeLabel,
    asOfLabel: opts.asOfLabel,
    rows: shown.map((t, i) => ({
      pos: t.rank ?? i + 1,
      team: t.teamName,
      played: t.played ?? 0,
      won: t.won ?? 0,
      lost: t.lost ?? 0,
      points: t.points ?? 0,
      ...(t.isClub ? { isClub: true } : {}),
    })),
  };
}

/** The round carousel: one card per (grade, table), in the order given. Null when empty. */
export function ladderCarousel(
  slides: readonly LadderCardInput[],
): (LadderCardInput & { carousel: LadderCardInput[] }) | null {
  const first = slides[0];
  return first ? { ...first, carousel: [...slides] } : null;
}
