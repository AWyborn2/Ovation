import { useMemo } from "react";
import { useListGrades } from "@workspace/api-client-react";

/**
 * The club's own grade names, in the grade list's order. Served per club — a
 * central-data club's grades come from its central matches (senior grades
 * only), the native club's from its own grade table — so a picker built on this
 * never offers a grade the club doesn't play.
 */
export function useClubGrades(): { grades: string[]; isLoading: boolean } {
  const gradesQ = useListGrades();
  const grades = useMemo(
    () => [...new Set((gradesQ.data ?? []).map((g) => g.grade).filter(Boolean))],
    [gradesQ.data],
  );
  return { grades, isLoading: gradesQ.isLoading };
}
