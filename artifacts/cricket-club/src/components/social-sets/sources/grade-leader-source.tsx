import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  getGetGradeLeaderboardQueryOptions,
  type Stat,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { LoadingState } from "@/components/data-states";
import type { ShareCardInput } from "@/lib/share-card";
import { GRADES, selectClass } from "../model";

/** Grade leaderboard leaders (runs / wickets), singly or one per grade. */
export function GradeLeaderSource({
  onAdd,
  onAddMany,
}: {
  onAdd: (i: ShareCardInput) => void;
  onAddMany: (inputs: ShareCardInput[]) => void;
}) {
  const qc = useQueryClient();
  const [grade, setGrade] = useState(GRADES[0]);
  const [category, setCategory] = useState<"Runs" | "Wickets">("Runs");
  const [batching, setBatching] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const statsQ = useGetGradeLeaderboard(grade, undefined, {
    query: { queryKey: getGetGradeLeaderboardQueryKey(grade) },
  });
  const stats = (statsQ.data ?? []) as Stat[];
  const statValue = (s: Stat, cat: "Runs" | "Wickets") =>
    cat === "Runs" ? (s.runs ?? 0) : (s.wickets ?? 0);
  const ranked = useMemo(() => {
    return [...stats]
      .filter((s) => statValue(s, category) > 0)
      .sort((a, b) => statValue(b, category) - statValue(a, category))
      .slice(0, 12);
  }, [stats, category]);

  const toInput = (s: Stat, g: string): ShareCardInput => ({
    kind: "gradeLeader",
    grade: g,
    category,
    playerName: `${s.givenName} ${s.surname}`.trim(),
    value: statValue(s, category),
  });

  // One leaderboard card per grade: fetch every grade's leaderboard (shared
  // query cache), take its top-ranked player in the selected category, and
  // batch-append. Grades with no stats are skipped.
  const addAllGrades = async () => {
    setBatching(true);
    setBatchError(null);
    try {
      const boards = await Promise.all(
        GRADES.map((g) => qc.fetchQuery(getGetGradeLeaderboardQueryOptions(g)) as Promise<Stat[]>),
      );
      const inputs: ShareCardInput[] = [];
      GRADES.forEach((g, i) => {
        const top = [...(boards[i] ?? [])]
          .filter((s) => statValue(s, category) > 0)
          .sort((a, b) => statValue(b, category) - statValue(a, category))[0];
        if (top) inputs.push(toInput(top, g));
      });
      onAddMany(inputs);
    } catch (e) {
      console.error("Batch add (grade leaderboards) failed", e);
      setBatchError(e instanceof Error ? e.message : "Could not load every grade leaderboard.");
    } finally {
      setBatching(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select className={selectClass} value={grade} onChange={(e) => setGrade(e.target.value)}>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as "Runs" | "Wickets")}
        >
          <option value="Runs">Most runs</option>
          <option value="Wickets">Most wickets</option>
        </select>
      </div>
      <div className="flex justify-end border-b pb-3">
        <Button size="sm" variant="outline" onClick={addAllGrades} disabled={batching}>
          {batching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add all grade leaderboards
        </Button>
      </div>
      {batchError && <p className="text-sm text-destructive">{batchError}</p>}
      {statsQ.isLoading ? (
        <LoadingState label="Loading leaderboard…" />
      ) : ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stats for this grade.</p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {ranked.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAdd(toInput(s, grade))}
              className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:border-primary"
            >
              <span>
                {s.givenName} {s.surname}
              </span>
              <span className="font-mono text-muted-foreground">
                {category === "Runs" ? (s.runs ?? 0) : (s.wickets ?? 0)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
