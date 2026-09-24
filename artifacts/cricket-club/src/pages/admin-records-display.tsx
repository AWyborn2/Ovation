import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useGetRecordsDisplaySettings,
  useUpdateRecordsDisplaySettings,
  useListGrades,
  getGetRecordsDisplaySettingsQueryKey,
  type RecordsDisplaySettings,
  type RecordsDisplaySettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { LoadingState, QueryError } from "@/components/data-states";
import { RadioCards, SettingsSection } from "@/components/display-settings";
import { SaveBar, SettingsCard, SettingsRow } from "@/components/admin-ui";

type DefaultTab = RecordsDisplaySettings["defaultTab"];

const TABS: { value: DefaultTab; label: string }[] = [
  { value: "total", label: "Total Club Records" },
  { value: "by-grade", label: "By Grade" },
  { value: "partnerships", label: "Partnerships" },
  { value: "centuries", label: "Centuries" },
  { value: "five-for", label: "5-Wicket Hauls" },
];

const CENTURIES_COLUMNS = [
  { value: "season", label: "Season" },
  { value: "score", label: "Score" },
  { value: "grade", label: "Grade" },
  { value: "batsman", label: "Batsman" },
];
const FIVE_FOR_COLUMNS = [
  { value: "season", label: "Season" },
  { value: "figures", label: "Figures" },
  { value: "grade", label: "Grade" },
  { value: "bowler", label: "Bowler" },
];

const splitSort = (s: string): { col: string; dir: "asc" | "desc" } => {
  const i = s.lastIndexOf("-");
  if (i < 0) return { col: s, dir: "desc" };
  const dir = s.slice(i + 1);
  return { col: s.slice(0, i), dir: dir === "asc" ? "asc" : "desc" };
};

export default function AdminRecordsDisplay() {
  const qc = useQueryClient();
  const settingsQ = useGetRecordsDisplaySettings();
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
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Control how the public Records page behaves by default: which tab opens first, the default
          grade for the By Grade and Partnerships tabs, and the default sort order for the Centuries
          and 5-Wicket Hauls tables. Visitors can still change every control themselves after the
          page loads.
        </p>
      </div>

      {settingsQ.isError ? (
        <QueryError onRetry={() => settingsQ.refetch()} />
      ) : settingsQ.isLoading ? (
        <LoadingState label="Loading records display settings…" />
      ) : settingsQ.data ? (
        <RecordsDisplayForm
          settings={settingsQ.data}
          allGrades={allGrades}
          onSaved={() => qc.invalidateQueries({ queryKey: getGetRecordsDisplaySettingsQueryKey() })}
        />
      ) : (
        <QueryError onRetry={() => settingsQ.refetch()} />
      )}
    </div>
  );
}

function RecordsDisplayForm({
  settings,
  allGrades,
  onSaved,
}: {
  settings: RecordsDisplaySettings;
  allGrades: string[];
  onSaved: () => void;
}) {
  // The loaded values; Reset returns to them and the save bar compares against them.
  const seeded = useMemo(
    () => ({
      defaultTab: settings.defaultTab,
      byGradeDefaultGrade: settings.byGradeDefaultGrade,
      partnershipsDefaultGrade: settings.partnershipsDefaultGrade,
      centuries: splitSort(settings.centuriesSort),
      fiveFor: splitSort(settings.fiveForSort),
    }),
    [settings],
  );
  const [defaultTab, setDefaultTab] = useState<DefaultTab>(seeded.defaultTab);
  const [byGradeDefaultGrade, setByGradeDefaultGrade] = useState(seeded.byGradeDefaultGrade);
  const [partnershipsDefaultGrade, setPartnershipsDefaultGrade] = useState(
    seeded.partnershipsDefaultGrade,
  );
  const [centuries, setCenturies] = useState(seeded.centuries);
  const [fiveFor, setFiveFor] = useState(seeded.fiveFor);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateRecordsDisplaySettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  const reset = useCallback(() => {
    setDefaultTab(seeded.defaultTab);
    setByGradeDefaultGrade(seeded.byGradeDefaultGrade);
    setPartnershipsDefaultGrade(seeded.partnershipsDefaultGrade);
    setCenturies(seeded.centuries);
    setFiveFor(seeded.fiveFor);
    setError(null);
  }, [seeded]);
  useEffect(reset, [reset]);

  const dirty =
    JSON.stringify({
      defaultTab,
      byGradeDefaultGrade,
      partnershipsDefaultGrade,
      centuries,
      fiveFor,
    }) !== JSON.stringify(seeded);

  const save = () => {
    setError(null);
    if (byGradeDefaultGrade && !allGrades.includes(byGradeDefaultGrade)) {
      return setError("By Grade default grade is no longer a valid grade.");
    }
    if (partnershipsDefaultGrade && !allGrades.includes(partnershipsDefaultGrade)) {
      return setError("Partnerships default grade is no longer a valid grade.");
    }
    const data: RecordsDisplaySettingsUpdate = {
      defaultTab,
      byGradeDefaultGrade,
      partnershipsDefaultGrade,
      centuriesSort: `${centuries.col}-${centuries.dir}`,
      fiveForSort: `${fiveFor.col}-${fiveFor.dir}`,
    };
    update.mutate({ data });
  };

  const selectClass =
    "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground";

  return (
    <>
      <SettingsCard
        title="Default tab and grades"
        description="What the Records page shows when it first opens."
      >
        <SettingsSection
          title="Default tab"
          description="The tab pre-selected when the Records page first opens."
        >
          <RadioCards
            name="defaultTab"
            value={defaultTab}
            onChange={setDefaultTab}
            options={TABS}
            className="max-w-md space-y-2"
          />
        </SettingsSection>

        <SettingsRow
          label="By Grade default grade"
          helper="The grade pre-selected on the By Grade tab."
          htmlFor="records-by-grade-default"
        >
          <select
            id="records-by-grade-default"
            value={byGradeDefaultGrade}
            onChange={(e) => setByGradeDefaultGrade(e.target.value)}
            className={selectClass}
            data-testid="select-by-grade-default"
          >
            <option value="">First available grade</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </SettingsRow>

        <SettingsRow
          label="Partnerships default grade"
          helper='The grade filter pre-selected on the Partnerships tab. "All grades" shows the highest stand for each wicket across every grade.'
          htmlFor="records-partnerships-default"
        >
          <select
            id="records-partnerships-default"
            value={partnershipsDefaultGrade}
            onChange={(e) => setPartnershipsDefaultGrade(e.target.value)}
            className={selectClass}
            data-testid="select-partnerships-default"
          >
            <option value="">All grades</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Default sorting" description="How the record tables are first sorted.">
        <SettingsRow label="Centuries" helper="Column and direction for the Centuries table.">
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Centuries sort column"
              value={centuries.col}
              onChange={(e) => setCenturies((p) => ({ ...p, col: e.target.value }))}
              className={selectClass}
              data-testid="select-centuries-column"
            >
              {CENTURIES_COLUMNS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Centuries sort direction"
              value={centuries.dir}
              onChange={(e) =>
                setCenturies((p) => ({ ...p, dir: e.target.value as "asc" | "desc" }))
              }
              className={selectClass}
              data-testid="select-centuries-dir"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </SettingsRow>

        <SettingsRow
          label="5-Wicket Hauls"
          helper="Column and direction for the 5-Wicket Hauls table."
        >
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="5-Wicket Hauls sort column"
              value={fiveFor.col}
              onChange={(e) => setFiveFor((p) => ({ ...p, col: e.target.value }))}
              className={selectClass}
              data-testid="select-five-for-column"
            >
              {FIVE_FOR_COLUMNS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              aria-label="5-Wicket Hauls sort direction"
              value={fiveFor.dir}
              onChange={(e) => setFiveFor((p) => ({ ...p, dir: e.target.value as "asc" | "desc" }))}
              className={selectClass}
              data-testid="select-five-for-dir"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </SettingsRow>
      </SettingsCard>

      {error && <div className="text-sm text-destructive">{error}</div>}
      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        onSave={save}
        onReset={reset}
        message={error ?? undefined}
      />
    </>
  );
}
