/**
 * Club leaderboard card inputs from a season's per-grade leaders — shared by
 * the Studio's prefill and the Posting Plan's round carousel (plan
 * 2026-10-07-001 U4), so both build the identical card.
 */

export type ClubLeaderboardCategory = "Runs" | "Wickets" | "Catches" | "Dismissals";
export const CLUB_LEADERBOARD_CATEGORIES: readonly ClubLeaderboardCategory[] = [
  "Runs",
  "Wickets",
  "Catches",
  "Dismissals",
];

type Leader = { playerName: string; value: number } | null;

/** One grade's season leaders (the central `centralClubTotalsBySeason` row). */
export interface ClubSeasonGradeLeadersRow {
  gradeLabel: string;
  topRunScorer: Leader;
  topWicketTaker: Leader;
  topCatches?: Leader;
  topDismissals?: Leader;
}

export interface ClubLeaderboardInput {
  kind: "clubLeaderboard";
  title: string;
  subtitle: string;
  season: string;
  category: ClubLeaderboardCategory;
  leaders: { gradeLabel: string; playerName: string; value: string }[];
}

const COPY: Record<ClubLeaderboardCategory, { title: string; subtitle: string }> = {
  Runs: { title: "CLUB RUN SCORERS", subtitle: "Leading run scorer in each grade" },
  Wickets: { title: "CLUB WICKET TAKERS", subtitle: "Leading wicket taker in each grade" },
  Catches: { title: "CLUB CATCHERS", subtitle: "Most catches in each grade" },
  Dismissals: { title: "SAFE HANDS", subtitle: "Most catches and stumpings in each grade" },
};

/** "2025" → "2025/26". */
export function seasonLabelFromYear(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

function leaderOf(g: ClubSeasonGradeLeadersRow, category: ClubLeaderboardCategory): Leader {
  switch (category) {
    case "Runs":
      return g.topRunScorer;
    case "Wickets":
      return g.topWicketTaker;
    case "Catches":
      return g.topCatches ?? null;
    case "Dismissals":
      return g.topDismissals ?? null;
  }
}

/** One category's card: every grade's leader (blank where a grade has none yet). */
export function clubLeaderboardInput(
  seasonYear: number,
  category: ClubLeaderboardCategory,
  grades: readonly ClubSeasonGradeLeadersRow[],
): ClubLeaderboardInput {
  return {
    kind: "clubLeaderboard",
    ...COPY[category],
    season: seasonLabelFromYear(seasonYear),
    category,
    leaders: grades.map((g) => {
      const leader = leaderOf(g, category);
      return {
        gradeLabel: g.gradeLabel.toUpperCase(),
        playerName: leader?.playerName ?? "",
        value: leader != null ? String(leader.value) : "",
      };
    }),
  };
}

/**
 * The round carousel: one card per category that has at least one leader,
 * in Runs, Wickets, Catches, Dismissals order. Null when no category does
 * (early season), so nothing drafts.
 */
export function clubLeaderboardCarousel(
  seasonYear: number,
  grades: readonly ClubSeasonGradeLeadersRow[],
): (ClubLeaderboardInput & { carousel: ClubLeaderboardInput[] }) | null {
  const slides = CLUB_LEADERBOARD_CATEGORIES.filter((c) =>
    grades.some((g) => leaderOf(g, c) != null),
  ).map((c) => clubLeaderboardInput(seasonYear, c, grades));
  const first = slides[0];
  return first ? { ...first, carousel: slides } : null;
}
