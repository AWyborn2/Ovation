/**
 * Each grade's most recent match by match date — the home overview's
 * "latest results" (ticker + card). Date beats round: finals carry no round
 * number and catch-up games can be played after a later round, so a round sort
 * would surface the wrong game. Central dates are ISO `YYYY-MM-DD…`, so a
 * string compare is chronological. Undated matches lose to dated ones; among
 * equals the input order (round desc, id desc) decides, so undated history
 * keeps its old behaviour.
 */
export function latestPerGradeByDate<T extends { grade: string; matchDate: string | null }>(
  matches: T[],
): T[] {
  const best = new Map<string, T>();
  for (const m of matches) {
    const cur = best.get(m.grade);
    if (!cur || dateKey(m) > dateKey(cur)) best.set(m.grade, m);
  }
  return [...best.values()];
}

function dateKey(m: { matchDate: string | null }): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(m.matchDate ?? "")?.[0] ?? "";
}
