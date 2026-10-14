/**
 * Platform decisions about PlayHQ competitions Ovation can't place in a grade (see
 * schema/playhq_grade_decisions.ts): the key a competition name is stored under, which grades a
 * decision may map to, validation, and the lookup that finds a competition's matches so a new
 * decision can be projected straight away.
 */
import { classifyCentralGrade } from "../central/grades";
import type { Queryable } from "./load";
import type { UnclassifiedGrade } from "./unclassified-grades";

/**
 * The key a PlayHQ grade name is stored under: lowercased, season tokens ("2025/26", "2025-26",
 * "2025") removed, whitespace collapsed — the same normalisation as the SQL function
 * `central.playhq_grade_key()`, so one decision serves every season. The projector matches
 * decisions in SQL by that function; this copy only keys and de-duplicates rows and filters the
 * club notice, so a divergence can at worst leave a name listed, never mis-map a match.
 */
export function playhqGradeKey(name: string | null | undefined): string {
  return (
    (name ?? "")
      .toLowerCase()
      // The 4-digit end year is tried before the 2-digit one: Postgres takes the longest match,
      // JavaScript the first alternative that fits, so "2024/2025" would otherwise leave "25".
      .replace(/(19|20)\d{2}\s*[-/]\s*((19|20)\d{2}|\d{2})|\b(19|20)\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** The app grades a competition may be mapped to. Each classifies to itself (checked below). */
export const MAPPABLE_APP_GRADES: readonly string[] = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "G Grade",
  "H Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
  "Over 40s",
  "Over 45s",
  "Over 50s",
  "Over 55s",
  "Over 60s",
  "Over 65s",
  "Over 70s",
  "Masters",
];

export type GradeDecisionAction = "map" | "ignore";

export interface GradeDecisionInput {
  gradeName: string;
  action: GradeDecisionAction;
  centralGrade?: string | null;
  reason?: string | null;
}

export type GradeDecisionValidation =
  | { ok: true; gradeKey: string; gradeName: string; centralGrade: string | null }
  | { ok: false; error: string };

/**
 * A decision is valid when it names a competition, and either maps to one of the mappable app
 * grades (the label is stored so the central history and the classifier both read it back as
 * that grade) or ignores it with no grade.
 */
export function validateGradeDecision(input: GradeDecisionInput): GradeDecisionValidation {
  const gradeName = (input.gradeName ?? "").trim();
  const gradeKey = playhqGradeKey(gradeName);
  if (!gradeKey) return { ok: false, error: "A competition name is required" };
  if (input.action === "ignore") {
    if (input.centralGrade) return { ok: false, error: "An ignored competition has no grade" };
    return { ok: true, gradeKey, gradeName, centralGrade: null };
  }
  if (input.action !== "map") return { ok: false, error: "action must be 'map' or 'ignore'" };
  const grade = (input.centralGrade ?? "").trim();
  if (!grade) return { ok: false, error: "Choose the grade to map this competition to" };
  if (!MAPPABLE_APP_GRADES.includes(grade) || classifyCentralGrade(grade).appGrade !== grade) {
    return { ok: false, error: `"${grade}" isn't a grade a competition can be mapped to` };
  }
  return { ok: true, gradeKey, gradeName, centralGrade: grade };
}

/** PlayHQ match ids in the senior competition(s) whose name normalises to `gradeKey`. */
export async function loadMatchIdsForGradeKey(c: Queryable, gradeKey: string): Promise<string[]> {
  const res = await c.query<{ id: string }>(
    `select m.id::text as id
       from playhq.matches m
       join playhq.grades g on g.id = m.grade_id
      where g.is_junior = false
        and central.playhq_grade_key(g.name) = $1`,
    [gradeKey],
  );
  return res.rows.map((r) => r.id);
}

export interface PendingCompetition {
  gradeKey: string;
  gradeName: string;
  matches: number;
  seasons: string[];
  tenants: { id: number; name: string }[];
  reason: string;
}

/**
 * One row per competition (seasons merged under its key) across every synced club: its match
 * count, the seasons it appears in, which clubs play in it, and why Ovation can't place it.
 * Decided competitions are dropped. Busiest first.
 */
export function groupPending(
  perOrg: { tenants: { id: number; name: string }[]; grades: UnclassifiedGrade[] }[],
  decided: ReadonlySet<string>,
): PendingCompetition[] {
  const byKey = new Map<string, PendingCompetition>();
  for (const org of perOrg) {
    for (const g of org.grades) {
      const key = playhqGradeKey(g.gradeName);
      if (!key || decided.has(key)) continue;
      const row = byKey.get(key) ?? {
        gradeKey: key,
        gradeName: g.gradeName,
        matches: 0,
        seasons: [],
        tenants: [],
        reason: g.reason,
      };
      row.matches += g.matches;
      if (g.seasonName && !row.seasons.includes(g.seasonName)) row.seasons.push(g.seasonName);
      for (const t of org.tenants) if (!row.tenants.some((x) => x.id === t.id)) row.tenants.push(t);
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.matches - a.matches || a.gradeName.localeCompare(b.gradeName),
  );
}
