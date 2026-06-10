import { useEffect, useMemo, useState } from "react";
import {
  useGetMatchDisplaySettings,
  useUpdateMatchDisplaySettings,
  useListGrades,
  getGetMatchDisplaySettingsQueryKey,
  type MatchDisplaySettings,
  type MatchDisplaySettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { LoadingState, QueryError } from "@/components/data-states";

type SeasonMode = MatchDisplaySettings["defaultSeasonMode"];
type RoundOrder = MatchDisplaySettings["roundOrder"];

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

export default function AdminMatchDisplay() {
  const qc = useQueryClient();
  const settingsQ = useGetMatchDisplaySettings();
  const gradesQ = useListGrades();

  const allGrades = useMemo(
    () =>
      sortGradesBySeniority(
        (gradesQ.data ?? []).map((g) => g.grade).filter((g) => g !== "CLUB TOTAL"),
      ),
    [gradesQ.data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Matches page display</h1>
        <p className="text-muted-foreground mt-1">
          Control how the public Matches page behaves by default: which grade and season
          load first, the order grades appear in the dropdown, and the round order within a
          season. Visitors can still change the filters themselves after the page loads.
        </p>
      </div>

      {settingsQ.isError ? (
        <QueryError onRetry={() => settingsQ.refetch()} />
      ) : settingsQ.isLoading ? (
        <LoadingState label="Loading match display settings…" />
      ) : settingsQ.data ? (
        <SettingsCard
          settings={settingsQ.data}
          allGrades={allGrades}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetMatchDisplaySettingsQueryKey() })
          }
        />
      ) : (
        <QueryError onRetry={() => settingsQ.refetch()} />
      )}
    </div>
  );
}

/**
 * Merge the saved grade order with the live grade list: configured grades in
 * their saved order first (only if they still exist), then any remaining grades
 * in seniority order.
 */
function mergeGradeOrder(saved: string[], all: string[]): string[] {
  const present = saved.filter((g) => all.includes(g));
  const rest = all.filter((g) => !present.includes(g));
  return [...present, ...rest];
}

function SettingsCard({
  settings,
  allGrades,
  onSaved,
}: {
  settings: MatchDisplaySettings;
  allGrades: string[];
  onSaved: () => void;
}) {
  const [defaultGrade, setDefaultGrade] = useState(settings.defaultGrade);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(settings.defaultSeasonMode);
  const [specificSeason, setSpecificSeason] = useState(
    settings.defaultSeason != null ? String(settings.defaultSeason) : "",
  );
  const [roundOrder, setRoundOrder] = useState<RoundOrder>(settings.roundOrder);
  const [gradeOrder, setGradeOrder] = useState<string[]>(
    mergeGradeOrder(settings.gradeOrder, allGrades),
  );
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateMatchDisplaySettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  useEffect(() => {
    setDefaultGrade(settings.defaultGrade);
    setSeasonMode(settings.defaultSeasonMode);
    setSpecificSeason(settings.defaultSeason != null ? String(settings.defaultSeason) : "");
    setRoundOrder(settings.roundOrder);
    setGradeOrder(mergeGradeOrder(settings.gradeOrder, allGrades));
  }, [settings, allGrades]);

  const move = (idx: number, dir: -1 | 1) => {
    setGradeOrder((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = () => {
    setError(null);
    if (defaultGrade && !allGrades.includes(defaultGrade)) {
      return setError("Default grade is no longer a valid grade.");
    }
    let defaultSeason: number | null = null;
    if (seasonMode === "specific") {
      const n = parseInt(specificSeason, 10);
      if (isNaN(n) || n < 1900 || n > 2200) {
        return setError("Enter a valid season start year (e.g. 2024) for a specific season.");
      }
      defaultSeason = n;
    }
    const data: MatchDisplaySettingsUpdate = {
      defaultGrade,
      defaultSeasonMode: seasonMode,
      defaultSeason,
      gradeOrder,
      roundOrder,
    };
    update.mutate({ data });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default filters &amp; ordering</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Default grade */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Default grade
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The grade pre-selected when the Matches page first opens.
          </p>
          <select
            value={defaultGrade}
            onChange={(e) => setDefaultGrade(e.target.value)}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[14rem]"
            data-testid="select-default-grade"
          >
            <option value="">All grades</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Default season */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Default season
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Which season loads first. "Latest available" always tracks the newest season as
            new matches are imported.
          </p>
          <div className="space-y-2">
            {([
              { value: "latest", label: "Latest available season" },
              { value: "specific", label: "A specific season" },
              { value: "all", label: "All seasons" },
            ] as { value: SeasonMode; label: string }[]).map((m) => (
              <label
                key={m.value}
                className={`flex items-center gap-3 border rounded p-3 cursor-pointer transition-colors ${
                  seasonMode === m.value ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="seasonMode"
                  checked={seasonMode === m.value}
                  onChange={() => setSeasonMode(m.value)}
                />
                <span className="font-medium text-sm">{m.label}</span>
                {m.value === "specific" && seasonMode === "specific" && (
                  <Input
                    type="number"
                    value={specificSeason}
                    onChange={(e) => setSpecificSeason(e.target.value)}
                    placeholder="e.g. 2024"
                    className="ml-2 w-32"
                    data-testid="input-specific-season"
                  />
                )}
                {m.value === "specific" &&
                  seasonMode === "specific" &&
                  specificSeason &&
                  !isNaN(parseInt(specificSeason, 10)) && (
                    <span className="text-xs text-muted-foreground">
                      ({fmtSeason(parseInt(specificSeason, 10))})
                    </span>
                  )}
              </label>
            ))}
          </div>
        </div>

        {/* Grade menu order */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Grade menu order
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The order grades appear in the grade dropdown on the Matches page.
          </p>
          <ul className="space-y-1 max-w-md">
            {gradeOrder.map((g, idx) => (
              <li
                key={g}
                className="flex items-center gap-2 border rounded px-3 py-2 bg-card"
                data-testid={`grade-order-row-${g}`}
              >
                <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                <span className="flex-1 text-sm font-medium">{g}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  data-testid={`button-grade-up-${g}`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === gradeOrder.length - 1}
                  onClick={() => move(idx, 1)}
                  data-testid={`button-grade-down-${g}`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {gradeOrder.length === 0 && (
              <li className="text-xs text-muted-foreground italic">No grades available yet.</li>
            )}
          </ul>
        </div>

        {/* Round order */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Round order
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            How matches are ordered within a season. Seasons always list newest first.
          </p>
          <div className="space-y-2 max-w-md">
            {([
              { value: "desc", label: "Latest round first" },
              { value: "asc", label: "Round 1 first" },
            ] as { value: RoundOrder; label: string }[]).map((m) => (
              <label
                key={m.value}
                className={`flex items-center gap-3 border rounded p-3 cursor-pointer transition-colors ${
                  roundOrder === m.value ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="roundOrder"
                  checked={roundOrder === m.value}
                  onChange={() => setRoundOrder(m.value)}
                />
                <span className="font-medium text-sm">{m.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending} data-testid="button-save-settings">
            {update.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
