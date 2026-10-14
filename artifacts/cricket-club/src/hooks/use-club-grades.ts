import { useMemo } from "react";
import { useListGrades } from "@workspace/api-client-react";
import { sortByGradeOrder } from "@workspace/scorecard";

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

/**
 * Last-resort options for a club that has no grades yet (brand-new tenant, or
 * the grades request failed). Never the primary source: a picker built on
 * {@link useGradeOptions} lists the grades the club actually plays, so a grade
 * the sync discovers (Over 40s, G Grade, …) appears without a code change.
 */
export const FALLBACK_GRADES: readonly string[] = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

/**
 * Grade options for an admin picker, most senior first.
 *
 * - `include`: values that must stay selectable even if the club has no matches
 *   in them (the record being edited already holds that grade).
 * - `addFallback`: ALSO offer {@link FALLBACK_GRADES}. For pickers that CREATE
 *   data for a grade (a new fixture, an import) where the grade may not have
 *   any matches yet; pickers over existing data leave it off.
 *
 * With no club grades at all the fallback list is returned, so a picker is
 * never empty.
 */
export function useGradeOptions(opts?: {
  include?: readonly (string | null | undefined)[];
  addFallback?: boolean;
}): { grades: string[]; isLoading: boolean } {
  const { grades: clubGrades, isLoading } = useClubGrades();
  const include = opts?.include;
  const addFallback = opts?.addFallback ?? false;
  const grades = useMemo(() => {
    const out = new Set<string>(clubGrades);
    if (addFallback || out.size === 0) for (const g of FALLBACK_GRADES) out.add(g);
    for (const g of include ?? []) if (g) out.add(g);
    return sortByGradeOrder([...out], (g) => g);
  }, [clubGrades, include, addFallback]);
  return { grades, isLoading };
}
