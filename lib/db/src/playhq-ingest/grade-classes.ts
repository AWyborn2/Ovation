/**
 * One grade classifier for the PlayHQ sync (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md,
 * U4; KTD3, KTD4, R5, R6).
 *
 * A grade is
 *   - `junior` when its name matches the junior / pathway pattern the harness and ingest
 *     have always used ({@link JUNIOR_RE}), or carries an age group the loader's banding
 *     recognises (`juniors/age-groups.ts`, which adds e.g. "Peel Girls League");
 *   - `senior` when the central grade classifier maps it to an app grade;
 *   - `unclassified` otherwise. Unclassified grades are never guessed: senior handling stays
 *     exactly as before (they are not junior, so `is_junior = false`) and they are kept out of
 *     the junior pipeline. They reach the platform admin through the senior "can't place this
 *     competition" report (`unclassified-grades.ts`, which uses this classifier) and are
 *     resolved there by a platform grade decision (`playhq_grade_decisions`: map or ignore).
 *
 * Junior wins over senior: "Female Youth League Under 14s" is junior even though it carries
 * "League". Pure; no database access.
 */
import { classifyCentralGrade } from "../central/grades";
import { normaliseJuniorAge } from "../juniors/age-groups";

/** Junior / pathway grade labels (PCA "Year N", WA "Under 17s", "U15", …) — kept out of senior surfaces. */
export const JUNIOR_RE =
  /\b(year\s?\d{1,2}|u\s?\d{1,2}s?\b|under\s?\d{1,2}s?\b|junior|primary|stage\s?\d|blast|woolworths|pathway|school)\b/i;

export type GradeClass = "junior" | "senior" | "unclassified";

export function classifyGrade(name: string | null | undefined): GradeClass {
  const n = (name ?? "").trim();
  if (!n) return "unclassified";
  if (JUNIOR_RE.test(n) || normaliseJuniorAge(n) !== null) return "junior";
  if (classifyCentralGrade(n).appGrade !== null) return "senior";
  return "unclassified";
}

/**
 * Stored grades (`playhq.grades`) marked senior (`is_junior = false`) that the classifier now
 * calls junior, e.g. "Peel Girls League", stored before the classifier learned the loader's
 * age banding. The ingest flips them to junior so the senior projections stop reading them,
 * and reports what was already projected from them. Only ever senior → junior: a junior
 * grade is never reclassified back, and an unclassified one is never guessed (KTD4).
 */
export function juniorReclassifications<T extends { name: string | null; isJunior: boolean }>(
  stored: readonly T[],
): T[] {
  return stored.filter((g) => !g.isJunior && classifyGrade(g.name) === "junior");
}
