import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/confirm-dialog";
import { GRADES, SEASON_OPTIONS, seasonLabel } from "./resolution";

/** Destructive card: roll back every per-match scorecard for one grade + season. */
export function UndoSeasonCard({
  disabled,
  onUndo,
}: {
  disabled: boolean;
  onUndo: (grade: string, season: number) => Promise<string>;
}) {
  const confirm = useConfirm();
  const [grade, setGrade] = useState<string>(GRADES[0]);
  const [season, setSeason] = useState<number>(new Date().getFullYear());
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setResult(null);
    setErr(null);
    if (
      !(await confirm({
        title: "Undo season's matches",
        description:
          `Undo every match imported for ${grade} ${seasonLabel(season)}? ` +
          "This removes those matches, rolls back the season totals, any auto-created caps, " +
          "and players who no longer have any games.",
        confirmText: "Undo",
        destructive: true,
      }))
    )
      return;
    onUndo(grade, season)
      .then(setResult)
      .catch((e: Error) => setErr(e.message));
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Undo a season's matches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Deletes all per-match scorecards imported for one grade and season, then rebuilds the
          season totals from what's left. Whole-season CSV imports are not affected.
        </p>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="undo-grade">Grade</Label>
            <select
              id="undo-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="undo-season">Season</Label>
            <select
              id="undo-season"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10))}
              className="block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SEASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="destructive" onClick={run} disabled={disabled}>
            {disabled ? "Working…" : "Undo season"}
          </Button>
        </div>
        {result && <p className="text-sm text-green-700 dark:text-green-400">{result}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}
