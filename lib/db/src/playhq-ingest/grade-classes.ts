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
 *     exactly as before (they are not junior, so `is_junior = false`), they are kept out of
 *     the junior pipeline, and an enabled organisation's are reported to the platform admin.
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

/** One unclassified grade as the platform admin sees it: names and seasons, never players. */
export interface UnclassifiedGrade {
  grade: string;
  season: string | null;
}

/**
 * The unclassified grades among a dump's `grades` rows, per enabled organisation (lower-cased
 * id). A grade belongs to its source organisation (the club it was discovered through) when
 * that one is enabled, else to its owner organisation when that one is. Deduplicated by name
 * and season; organisations that aren't enabled report nothing.
 */
export function unclassifiedGradesByOrg(
  grades: readonly Record<string, unknown>[],
  enabledOrgIds: ReadonlySet<string>,
): Map<string, UnclassifiedGrade[]> {
  const enabled = new Set([...enabledOrgIds].map((o) => o.toLowerCase()));
  const out = new Map<string, UnclassifiedGrade[]>();
  const seen = new Set<string>();
  for (const g of grades) {
    const name = typeof g.name === "string" ? g.name.trim() : "";
    if (classifyGrade(name) !== "unclassified" || !name) continue;
    const org = [g.source_org_id, g.owner_org_id]
      .map((o) => (typeof o === "string" ? o.toLowerCase() : null))
      .find((o): o is string => o !== null && enabled.has(o));
    if (!org) continue;
    const season = typeof g.season_name === "string" ? g.season_name : null;
    const key = `${org}|${name}|${season ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = out.get(org) ?? [];
    list.push({ grade: name, season });
    out.set(org, list);
  }
  return out;
}

/**
 * Add newly seen unclassified grades to an organisation's stored list (an open
 * `unclassified_grades` incident's `detail.grades`): each grade and season once, in the
 * order first seen. `changed` says whether anything was added.
 */
export function mergeUnclassifiedGrades(
  stored: unknown,
  incoming: readonly UnclassifiedGrade[],
): { grades: UnclassifiedGrade[]; changed: boolean } {
  const grades: UnclassifiedGrade[] = [];
  const seen = new Set<string>();
  const key = (g: UnclassifiedGrade) => `${g.grade}|${g.season ?? ""}`;
  for (const g of Array.isArray(stored) ? stored : []) {
    if (!g || typeof g !== "object" || typeof (g as UnclassifiedGrade).grade !== "string") continue;
    const s = g as UnclassifiedGrade;
    const entry = { grade: s.grade, season: typeof s.season === "string" ? s.season : null };
    if (seen.has(key(entry))) continue;
    seen.add(key(entry));
    grades.push(entry);
  }
  let changed = false;
  for (const g of incoming) {
    if (seen.has(key(g))) continue;
    seen.add(key(g));
    grades.push({ grade: g.grade, season: g.season });
    changed = true;
  }
  return { grades, changed };
}
