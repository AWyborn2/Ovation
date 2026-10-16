import { useMemo } from "react";
import {
  useGetSocialSettings,
  useListGrades,
  useGetJuniorsFilters,
  useGetJuniorMatchDisplaySettings,
  useListJuniorFixtures,
} from "@workspace/api-client-react";
import { sortByGradeOrder } from "@workspace/scorecard";
import { LoadingState, QueryError } from "@/components/data-states";
import { PostingPlanEditor } from "@/components/posting-plan/posting-plan-editor";

/**
 * The club's junior age groups, in the order the junior pages use (the admin's saved
 * order first, then the rest as found): every group with a played match plus every
 * group with a fixture, so a new season's teams are offered before they have played.
 */
function juniorAgeGroups(
  saved: readonly string[],
  played: readonly string[],
  fixtures: readonly (string | null | undefined)[],
): string[] {
  const all = new Set<string>();
  for (const g of played) if (g) all.add(g);
  for (const g of fixtures) if (g) all.add(g);
  const ordered = saved.filter((g) => all.has(g));
  const rest = [...all].filter((g) => !saved.includes(g)).sort();
  return [...ordered, ...rest];
}

/**
 * Social Media Studio "Posting Plan" tab (plan 2026-10-07-001; version 2, plan
 * 2026-10-15-001): one place to decide, per card kind, whether it drafts, for which
 * grades — senior grades and junior age groups — and whether it posts on its own or as
 * one round carousel.
 */
export default function AdminSocialPlan() {
  const bundle = useGetSocialSettings();
  const gradesQ = useListGrades();
  const juniorFilters = useGetJuniorsFilters();
  const juniorDisplay = useGetJuniorMatchDisplaySettings();
  const juniorFixtures = useListJuniorFixtures();
  const grades = useMemo(() => {
    const seniors = sortByGradeOrder(
      (gradesQ.data ?? []).map((g) => g.grade).filter((g) => g !== "CLUB TOTAL"),
      (g) => g,
    );
    const juniors = juniorAgeGroups(
      juniorDisplay.data?.ageGroupOrder ?? [],
      juniorFilters.data?.ageGroups ?? [],
      (juniorFixtures.data ?? []).map((f) => f.ageGroup),
    );
    return [...seniors, ...juniors.filter((g) => !seniors.includes(g))];
  }, [gradesQ.data, juniorDisplay.data, juniorFilters.data, juniorFixtures.data]);

  return (
    <div className="space-y-6">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Which cards draft themselves, for which grades, and whether each posts on its own or as one
        club-wide carousel per round.
      </p>
      {bundle.isError ? (
        <QueryError onRetry={() => bundle.refetch()} />
      ) : bundle.isLoading || !bundle.data ? (
        <LoadingState label="Loading the Posting Plan…" />
      ) : bundle.data.settings.postingPlan ? (
        <PostingPlanEditor settings={bundle.data.settings} grades={grades} />
      ) : (
        <QueryError onRetry={() => bundle.refetch()} />
      )}
    </div>
  );
}
