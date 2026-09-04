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
import { handleAdminMutationError } from "@/lib/admin-auth";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { LoadingState, QueryError } from "@/components/data-states";
import {
  DefaultSelect,
  OrderList,
  RadioCards,
  SaveSettingsButton,
  SettingsSection,
  mergeOrder,
  moveItem,
} from "@/components/display-settings";

type SeasonMode = MatchDisplaySettings["defaultSeasonMode"];
type RoundOrder = MatchDisplaySettings["roundOrder"];

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const SEASON_MODES: { value: SeasonMode; label: string }[] = [
  { value: "latest", label: "Latest available season" },
  { value: "specific", label: "A specific season" },
  { value: "all", label: "All seasons" },
];

const ROUND_ORDERS: { value: RoundOrder; label: string }[] = [
  { value: "desc", label: "Latest round first" },
  { value: "asc", label: "Round 1 first" },
];

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
          Control how the public Matches page behaves by default: which grade and season load first,
          the order grades appear in the dropdown, and the round order within a season. Visitors can
          still change the filters themselves after the page loads.
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
          onSaved={() => qc.invalidateQueries({ queryKey: getGetMatchDisplaySettingsQueryKey() })}
        />
      ) : (
        <QueryError onRetry={() => settingsQ.refetch()} />
      )}
    </div>
  );
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
    mergeOrder(settings.gradeOrder, allGrades),
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
    setGradeOrder(mergeOrder(settings.gradeOrder, allGrades));
  }, [settings, allGrades]);

  const move = (idx: number, dir: -1 | 1) => setGradeOrder((prev) => moveItem(prev, idx, dir));

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
        <SettingsSection
          title="Default grade"
          description="The grade pre-selected when the Matches page first opens."
        >
          <DefaultSelect
            value={defaultGrade}
            onChange={setDefaultGrade}
            options={allGrades}
            allLabel="All grades"
            testId="select-default-grade"
          />
        </SettingsSection>

        <SettingsSection
          title="Default season"
          description={
            <>
              Which season loads first. "Latest available" always tracks the newest season as new
              matches are imported.
            </>
          }
        >
          <RadioCards
            name="seasonMode"
            value={seasonMode}
            onChange={setSeasonMode}
            options={SEASON_MODES}
            className="space-y-2"
            extra={(m) =>
              m.value === "specific" && seasonMode === "specific" ? (
                <>
                  <Input
                    type="number"
                    value={specificSeason}
                    onChange={(e) => setSpecificSeason(e.target.value)}
                    placeholder="e.g. 2024"
                    className="ml-2 w-32"
                    data-testid="input-specific-season"
                  />
                  {specificSeason && !isNaN(parseInt(specificSeason, 10)) && (
                    <span className="text-xs text-muted-foreground">
                      ({fmtSeason(parseInt(specificSeason, 10))})
                    </span>
                  )}
                </>
              ) : null
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Grade menu order"
          description="The order grades appear in the grade dropdown on the Matches page."
        >
          <OrderList
            items={gradeOrder}
            onMove={move}
            emptyText="No grades available yet."
            testIds={(g) => ({
              row: `grade-order-row-${g}`,
              up: `button-grade-up-${g}`,
              down: `button-grade-down-${g}`,
            })}
          />
        </SettingsSection>

        <SettingsSection
          title="Round order"
          description="How matches are ordered within a season. Seasons always list newest first."
        >
          <RadioCards
            name="roundOrder"
            value={roundOrder}
            onChange={setRoundOrder}
            options={ROUND_ORDERS}
            className="space-y-2 max-w-md"
          />
        </SettingsSection>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <SaveSettingsButton onClick={save} pending={update.isPending} />
      </CardContent>
    </Card>
  );
}
