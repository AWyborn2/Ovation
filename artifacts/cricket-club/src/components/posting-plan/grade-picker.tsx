import { useId, useState } from "react";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import type { PostingRow } from "@workspace/scorecard/posting-plan";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { applyQuickChoice, gradeOn, quickChoiceOf, type QuickChoice } from "./plan-text";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

const isWomen = (g: string) => /\b(female|women'?s?|girls?)\b/i.test(g);

/**
 * Which grades a Posting Plan row drafts for (decision 2): a quick choice —
 * all senior grades, A Grade only, or choose grades — and, for "choose",
 * tick-boxes grouped Seniors / Women / Juniors plus the "new senior grades"
 * switch (the row's `others`).
 */
export function GradePicker({
  label,
  row,
  grades,
  juniorsUnavailable,
  onChange,
}: {
  label: string;
  row: PostingRow;
  /** The club's grades, in its order. */
  grades: readonly string[];
  /** Junior grades can't draft for this row (shown, disabled, with the reason). */
  juniorsUnavailable?: boolean;
  onChange: (row: PostingRow) => void;
}) {
  const id = useId();
  const choice = quickChoiceOf(row, grades);
  const [choosing, setChoosing] = useState(choice === "custom");
  const [extra, setExtra] = useState("");
  const shown = choosing ? "custom" : choice;

  const all = [...new Set([...grades, ...Object.keys(row.grades)])];
  // "All senior and junior grades" only where the row can draft juniors and the club has any.
  const offerAllGrades = !juniorsUnavailable && grades.some((g) => isJuniorGradeLabel(g));
  const groups: { title: string; grades: string[] }[] = [
    { title: "Seniors", grades: all.filter((g) => !isJuniorGradeLabel(g) && !isWomen(g)) },
    { title: "Women", grades: all.filter((g) => !isJuniorGradeLabel(g) && isWomen(g)) },
    { title: "Juniors", grades: all.filter((g) => isJuniorGradeLabel(g)) },
  ].filter((group) => group.grades.length > 0);

  const pick = (value: QuickChoice) => {
    setChoosing(value === "custom");
    if (value !== "custom") onChange(applyQuickChoice(row, value, grades));
  };
  const toggle = (grade: string, on: boolean) =>
    onChange({ ...row, grades: { ...row.grades, [grade]: on } });

  return (
    <div className="space-y-3">
      <select
        id={`${id}-choice`}
        className={selectClass}
        value={shown}
        onChange={(e) => pick(e.target.value as QuickChoice)}
        aria-label={`${label}: grades`}
      >
        <option value="allSenior">All senior grades</option>
        {offerAllGrades && <option value="allGrades">All senior and junior grades</option>}
        <option value="aGradeOnly">A Grade only</option>
        <option value="custom">Choose grades…</option>
      </select>
      {shown === "custom" && (
        <div className="space-y-3 rounded-md border border-border p-3">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No grades yet. They appear once the club has played a match; you can add one below.
            </p>
          )}
          {groups.map((group) => (
            <fieldset key={group.title} className="space-y-1">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {group.grades.map((g) => {
                  const junior = isJuniorGradeLabel(g);
                  const disabled = junior && !!juniorsUnavailable;
                  return (
                    <label key={g} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!disabled && gradeOn(row, g)}
                        disabled={disabled}
                        aria-describedby={disabled ? `${id}-junior-reason` : undefined}
                        onChange={(e) => toggle(g, e.target.checked)}
                      />
                      {g}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {juniorsUnavailable && groups.some((g) => g.title === "Juniors") && (
            <p id={`${id}-junior-reason`} className="text-xs text-muted-foreground">
              Junior grades aren&rsquo;t available for this card: milestones, debuts, ladders and
              leaderboards come from senior results only.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.others === "seniors"}
              onChange={(e) => onChange({ ...row, others: e.target.checked ? "seniors" : "off" })}
            />
            Include new senior grades automatically
          </label>
          <div className="flex gap-2">
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Add a grade, e.g. Under 16s"
              aria-label={`${label}: add a grade`}
              className="h-9 max-w-56"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!extra.trim()}
              onClick={() => {
                toggle(extra.trim(), true);
                setExtra("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
