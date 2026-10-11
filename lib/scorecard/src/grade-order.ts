/**
 * Grade seniority for lists of grades on cards (results, round sets): lettered men's grades
 * first (A Grade → H Grade), then numbered (1st Grade → 10th Grade), then women's (Female A,
 * Female B, Women's 1st…), then PPL and Colts, then anything else.
 */
export function gradeSeniorityRank(grade: string | null | undefined): number {
  const g = (grade ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const women = /\b(female|women'?s?|womens|ladies|girls?)\b/.test(g);
  const letter = /\b([a-h]) grade\b/.exec(g)?.[1];
  const nth = /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(g)?.[1];
  const base = women ? 100 : 0;
  if (letter) return base + (letter.charCodeAt(0) - 97);
  if (nth) return base + 10 + Number(nth);
  if (women) return base + 50;
  if (/\bppl\b/.test(g)) return 200;
  if (/\bcolts\b/.test(g)) return 201;
  return 300;
}

/**
 * `rows` in grade order: the club's own grade order first (its saved grade menu order,
 * compared case-insensitively), then seniority, then their original order.
 */
export function sortByGradeOrder<T>(
  rows: readonly T[],
  gradeOf: (row: T) => string | null | undefined,
  clubOrder: readonly string[] = [],
): T[] {
  const club = new Map(clubOrder.map((g, i) => [g.trim().toLowerCase(), i]));
  const key = (row: T): [number, number] => {
    const g = (gradeOf(row) ?? "").trim().toLowerCase();
    const i = club.get(g);
    return i !== undefined ? [0, i] : [1, gradeSeniorityRank(g)];
  };
  return rows
    .map((row, i) => ({ row, i, k: key(row) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
    .map((x) => x.row);
}
