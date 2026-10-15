import { useMemo } from "react";
import { useGetSocialSettings, useListGrades } from "@workspace/api-client-react";
import { sortByGradeOrder } from "@workspace/scorecard";
import { LoadingState, QueryError } from "@/components/data-states";
import { PostingPlanEditor } from "@/components/posting-plan/posting-plan-editor";

/**
 * Social Media Studio "Posting Plan" tab (plan 2026-10-07-001): one place to
 * decide, per card kind, whether it drafts, for which grades, and whether it
 * posts on its own or as one round carousel.
 */
export default function AdminSocialPlan() {
  const bundle = useGetSocialSettings();
  const gradesQ = useListGrades();
  const grades = useMemo(
    () =>
      sortByGradeOrder(
        (gradesQ.data ?? []).map((g) => g.grade).filter((g) => g !== "CLUB TOTAL"),
        (g) => g,
      ),
    [gradesQ.data],
  );

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
