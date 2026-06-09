import { useEffect, useMemo, useState } from "react";
import {
  useGetRecordsDisplaySettings,
  useUpdateRecordsDisplaySettings,
  useListGrades,
  getGetRecordsDisplaySettingsQueryKey,
  type RecordsDisplaySettings,
  type RecordsDisplaySettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { sortGradesBySeniority } from "@/components/grade-badge";

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
        <h1 className="text-3xl font-serif font-bold">Records page display</h1>
        <p className="text-muted-foreground mt-1">
          Control how the public Records page behaves by default: which tab opens first, the
          default grade for the By Grade and Partnerships tabs, and the default sort order for
          the Centuries and 5-Wicket Hauls tables. Visitors can still change every control
          themselves after the page loads.
        </p>
      </div>

      {settingsQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : settingsQ.data ? (
        <SettingsCard
          settings={settingsQ.data}
          allGrades={allGrades}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetRecordsDisplaySettingsQueryKey() })
          }
        />
      ) : (
        <div className="text-sm text-destructive">Failed to load settings.</div>
      )}
    </div>
  );
}

function SettingsCard({
  settings,
  allGrades,
  onSaved,
}: {
  settings: RecordsDisplaySettings;
  allGrades: string[];
  onSaved: () => void;
}) {
  const [defaultTab, setDefaultTab] = useState<DefaultTab>(settings.defaultTab);
  const [byGradeDefaultGrade, setByGradeDefaultGrade] = useState(settings.byGradeDefaultGrade);
  const [partnershipsDefaultGrade, setPartnershipsDefaultGrade] = useState(
    settings.partnershipsDefaultGrade,
  );
  const [centuries, setCenturies] = useState(splitSort(settings.centuriesSort));
  const [fiveFor, setFiveFor] = useState(splitSort(settings.fiveForSort));
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

  useEffect(() => {
    setDefaultTab(settings.defaultTab);
    setByGradeDefaultGrade(settings.byGradeDefaultGrade);
    setPartnershipsDefaultGrade(settings.partnershipsDefaultGrade);
    setCenturies(splitSort(settings.centuriesSort));
    setFiveFor(splitSort(settings.fiveForSort));
  }, [settings]);

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
    "px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default tab, grades &amp; sorting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Default tab */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Default tab
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The tab pre-selected when the Records page first opens.
          </p>
          <div className="space-y-2 max-w-md">
            {TABS.map((t) => (
              <label
                key={t.value}
                className={`flex items-center gap-3 border rounded p-3 cursor-pointer transition-colors ${
                  defaultTab === t.value ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="defaultTab"
                  checked={defaultTab === t.value}
                  onChange={() => setDefaultTab(t.value)}
                />
                <span className="font-medium text-sm">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* By Grade default grade */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            By Grade default grade
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The grade pre-selected on the By Grade tab.
          </p>
          <select
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
        </div>

        {/* Partnerships default grade */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Partnerships default grade
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The grade filter pre-selected on the Partnerships tab. "All grades" shows the
            highest stand for each wicket across every grade.
          </p>
          <select
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
        </div>

        {/* Centuries default sort */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Centuries default sort
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <select
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Direction</Label>
              <select
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
          </div>
        </div>

        {/* 5-Wicket Hauls default sort */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            5-Wicket Hauls default sort
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <select
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Direction</Label>
              <select
                value={fiveFor.dir}
                onChange={(e) =>
                  setFiveFor((p) => ({ ...p, dir: e.target.value as "asc" | "desc" }))
                }
                className={selectClass}
                data-testid="select-five-for-dir"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
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
