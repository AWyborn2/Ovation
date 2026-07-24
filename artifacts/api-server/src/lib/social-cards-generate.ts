/**
 * Pure (DB-free) helpers for server-side batch carousel-set generation
 * (POST /card-sets/generate). Kept side-effect-free so they unit-test without a
 * database: the route does the I/O (gather source rows) and delegates the
 * mapping + slide assembly here.
 *
 * The `gradeLeader` mapper mirrors the client's inline builder in
 * `admin-social-sets.tsx` (GradeLeaderSource.toInput / statValue) so a
 * server-generated leaderboard slide is byte-identical to one an admin adds by
 * hand in the carousel editor. The `matchSummary` path reuses the shared
 * `matchToSummaryInput` builder directly (from @workspace/scorecard) and only
 * needs the assembly/clamp step here.
 */

import type { CardSetSlide, PlayerGradeStat } from "@workspace/db";

// The app's fixed grade list (mirrors the client `GRADES` in admin-social-sets).
// Used as the default set of grades a `gradeLeader` carousel spans when the
// request names none.
export const GENERATE_GRADES = [
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
] as const;

export type LeaderCategory = "Runs" | "Wickets";

/** The ranked value for a leaderboard row in the chosen category. */
export function leaderValue(row: PlayerGradeStat, category: LeaderCategory): number {
  return category === "Runs" ? row.runs ?? 0 : row.wickets ?? 0;
}

/**
 * Top leaderboard row for a grade in the chosen category (value > 0), or null
 * when the grade has no qualifying player. Mirrors the client's ranking:
 * filter to a positive value, then sort descending by that value.
 */
export function topLeaderRow(
  rows: PlayerGradeStat[],
  category: LeaderCategory,
): PlayerGradeStat | null {
  const ranked = [...rows]
    .filter((r) => leaderValue(r, category) > 0)
    .sort((a, b) => leaderValue(b, category) - leaderValue(a, category));
  return ranked[0] ?? null;
}

/**
 * Build a `gradeLeader` ShareCardInput from a leaderboard row — the exact shape
 * the client's GradeLeaderSource.toInput produces. Returned as opaque jsonb
 * (`CardSetSlide["input"]`) since the ShareCardInput union lives in the frontend.
 */
export function gradeLeaderInput(
  row: PlayerGradeStat,
  grade: string,
  category: LeaderCategory,
): CardSetSlide["input"] {
  return {
    kind: "gradeLeader",
    grade,
    category,
    playerName: `${row.givenName} ${row.surname}`.trim(),
    value: leaderValue(row, category),
  };
}

/**
 * Assemble ordered slides from mapped card inputs, clamped to `max`. Extra
 * inputs beyond the cap are dropped (reported via the returned `truncated`
 * count) — the same silent-clamp behaviour as the client's batch "add all"
 * action, but here we also surface how many were cut so the route can log it.
 *
 * Slide ids are deterministic (`gen-1`, `gen-2`, …) so regenerating the same
 * group produces stable ids rather than churning them on every run.
 */
export function assembleSlides(
  inputs: CardSetSlide["input"][],
  max: number,
): { slides: CardSetSlide[]; truncated: number } {
  const capped = inputs.slice(0, max);
  return {
    slides: capped.map((input, i) => ({
      id: `gen-${i + 1}`,
      input,
      themeId: null,
      motionPreset: "none",
    })),
    truncated: Math.max(0, inputs.length - capped.length),
  };
}
