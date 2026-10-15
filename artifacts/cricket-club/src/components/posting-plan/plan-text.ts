import { isJuniorGradeLabel } from "@workspace/scorecard";
import {
  PACKAGING_LABELS,
  POSTING_ROW_DEFS,
  type PostingRow,
  type PostingRowId,
} from "@workspace/scorecard/posting-plan";

/** The grade picker's quick choices (decision 2, plan 2026-10-07-001 U6). */
export type QuickChoice = "allSenior" | "aGradeOnly" | "custom";

export const A_GRADES = ["A Grade", "Female A Grade"];

export function quickChoiceOf(row: PostingRow): QuickChoice {
  const listed = Object.entries(row.grades);
  // Every listed grade just restates the default (seniors on, juniors off).
  if (row.others === "seniors" && listed.every(([g, on]) => on === !isJuniorGradeLabel(g))) {
    return "allSenior";
  }
  if (
    row.others === "off" &&
    listed.length > 0 &&
    listed.every(([g, on]) => on === A_GRADES.includes(g)) &&
    listed.some(([, on]) => on)
  ) {
    return "aGradeOnly";
  }
  return "custom";
}

export function applyQuickChoice(row: PostingRow, choice: QuickChoice): PostingRow {
  if (choice === "allSenior") return { ...row, grades: {}, others: "seniors" };
  if (choice === "aGradeOnly") {
    return { ...row, grades: Object.fromEntries(A_GRADES.map((g) => [g, true])), others: "off" };
  }
  return row;
}

/** Does the row draft for this grade? (Same rule as the server, KTD4.) */
export function gradeOn(row: PostingRow, grade: string): boolean {
  const explicit = row.grades[grade];
  if (explicit !== undefined) return explicit;
  return row.others === "seniors" && !isJuniorGradeLabel(grade);
}

/** "all senior grades", "A Grade only", "senior grades except B Grade", "A Grade, B Grade". */
export function gradeSummary(row: PostingRow, knownGrades: readonly string[]): string {
  const choice = quickChoiceOf(row);
  if (choice === "allSenior") return "all senior grades";
  if (choice === "aGradeOnly") return "A Grade only";
  const juniorsOn = Object.entries(row.grades)
    .filter(([g, on]) => on && isJuniorGradeLabel(g))
    .map(([g]) => g);
  if (row.others === "seniors") {
    const off = Object.entries(row.grades)
      .filter(([g, on]) => !on && !isJuniorGradeLabel(g))
      .map(([g]) => g);
    const base = off.length ? `senior grades except ${off.join(", ")}` : "all senior grades";
    return juniorsOn.length ? `${base}, plus ${juniorsOn.join(", ")}` : base;
  }
  const on = [...new Set([...knownGrades, ...Object.keys(row.grades)])].filter((g) =>
    gradeOn(row, g),
  );
  return on.length ? on.join(", ") : "no grades";
}

const PACKAGING_SENTENCE: Record<PostingRow["packaging"], string> = {
  individual: "each on its own",
  round: "one round carousel",
};

/** "Results: A–C Grade · one round carousel". */
export function rowSentence(
  id: PostingRowId,
  row: PostingRow,
  knownGrades: readonly string[],
): string {
  const label = POSTING_ROW_DEFS[id].label;
  if (!row.enabled) return `${label}: off`;
  // Leaderboards and ladders are always one round carousel; grades only matter for ladders.
  if (id === "clubLeaderboards") return `${label}: one round carousel, every senior grade`;
  return `${label}: ${gradeSummary(row, knownGrades)} · ${PACKAGING_SENTENCE[row.packaging]}`;
}

/** The sentence without its row label: "A Grade only · each on its own". */
export function rowSummary(
  id: PostingRowId,
  row: PostingRow,
  knownGrades: readonly string[],
): string {
  return rowSentence(id, row, knownGrades).slice(POSTING_ROW_DEFS[id].label.length + 2);
}

export { PACKAGING_LABELS };

/** Whether a row offers a grade picker at all. */
export function hasGradePicker(id: PostingRowId): boolean {
  return id !== "clubLeaderboards";
}

/** Rows with no junior data at all (KTD6): milestones, debuts, ladders, club leaderboards. */
export function juniorsUnavailable(id: PostingRowId, _row: PostingRow): boolean {
  return !POSTING_ROW_DEFS[id].juniors;
}
