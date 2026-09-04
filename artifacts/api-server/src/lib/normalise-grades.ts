/**
 * Tidy an admin-supplied grade list: trim each entry, drop blanks, dedupe.
 * Shared by captain grade permissions (routes/captains.ts) and award voting
 * configs (routes/award-voting.ts), which both persist grade lists.
 */
export function normaliseGrades(grades: string[]): string[] {
  return [...new Set(grades.map((g) => g.trim()).filter((g) => g.length > 0))];
}
