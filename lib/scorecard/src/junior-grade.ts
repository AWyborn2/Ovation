/**
 * True when a free-text grade label names a junior grade ("Under 15",
 * "U13s", "U-17 Girls", "Juniors") or one of the junior sync's school-year age
 * bands ("Year 9", "Year 10-11"). The photo library is senior-only, so a
 * photo tagged with a junior grade is never offered for, or used on, a card
 * (juniors isolation). Colts is a senior grade and is not matched.
 */
export function isJuniorGradeLabel(grade: string | null | undefined): boolean {
  if (!grade) return false;
  return /\bunder[\s-]?\d{1,2}\b|\bu[\s-]?\d{1,2}s?\b|\bjuniors?\b|\byear[\s-]?\d{1,2}(?:-\d{1,2})?\b/i.test(
    grade,
  );
}
