import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useListGrades,
  useGetMilestoneBoardSettings,
  getGetGradeLeaderboardQueryOptions,
} from "@workspace/api-client-react";
import {
  aggregateCareer,
  getApproachingMilestones,
  DEFAULT_MILESTONE_THRESHOLDS,
  type MilestoneThresholds,
} from "@/lib/honour-boards";
import type { DisplayBoard } from "./types";

/**
 * Build the "Approaching milestones" board client-side (it has no route — the
 * public /honour-boards page derives it the same way). Reuses the career
 * aggregation + admin-configured thresholds, then shapes it as a DisplayBoard so
 * the honour-display + kiosk can inject it alongside the server boards. Returns
 * null while loading, when disabled by the milestone mode, or when empty.
 */
export function useApproachingBoard(): DisplayBoard | null {
  const { data: gradesList } = useListGrades();
  const { data: milestoneSettings } = useGetMilestoneBoardSettings();

  const grades = useMemo(
    () => (gradesList ?? []).map((g) => g.grade),
    [gradesList],
  );

  const leaderboardQueries = useQueries({
    queries: grades.map((g) => ({ ...getGetGradeLeaderboardQueryOptions(g) })),
  });

  const allStats = useMemo(
    () => leaderboardQueries.flatMap((q) => q.data ?? []),
    [leaderboardQueries],
  );

  const thresholds: MilestoneThresholds = useMemo(
    () => ({
      games: milestoneSettings?.gamesThreshold ?? DEFAULT_MILESTONE_THRESHOLDS.games,
      runs: milestoneSettings?.runsThreshold ?? DEFAULT_MILESTONE_THRESHOLDS.runs,
      wickets: milestoneSettings?.wicketsThreshold ?? DEFAULT_MILESTONE_THRESHOLDS.wickets,
    }),
    [milestoneSettings],
  );

  const mode = milestoneSettings?.displayMode ?? "recent";
  const showApproaching = mode === "approaching" || mode === "both";

  return useMemo(() => {
    if (!showApproaching || allStats.length === 0) return null;
    const players = aggregateCareer(allStats);
    const approaching = getApproachingMilestones(players, 10, thresholds);
    if (approaching.length === 0) return null;
    return {
      id: "approaching",
      category: "approaching_milestones",
      layout: "list",
      title: "Approaching Milestones",
      subtitle: "Players closing in on a club milestone",
      entries: approaching.map((a) => ({
        season: "",
        primaryText: `${a.givenName} ${a.surname}`.trim(),
        detail: `${a.gap} to go — ${a.tierLabel}`,
        playerId: a.playerId,
        meta: { grade: a.boardLabel },
      })),
    } satisfies DisplayBoard;
  }, [showApproaching, allStats, thresholds]);
}
