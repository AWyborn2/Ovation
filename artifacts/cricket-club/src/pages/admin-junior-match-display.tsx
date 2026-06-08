import { useEffect, useMemo, useState } from "react";
import {
  useGetJuniorMatchDisplaySettings,
  useUpdateJuniorMatchDisplaySettings,
  useGetJuniorsFilters,
  getGetJuniorMatchDisplaySettingsQueryKey,
  type JuniorMatchDisplaySettings,
  type JuniorMatchDisplaySettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

type SeasonMode = JuniorMatchDisplaySettings["defaultSeasonMode"];

export default function AdminJuniorMatchDisplay() {
  const qc = useQueryClient();
  const settingsQ = useGetJuniorMatchDisplaySettings();
  const filtersQ = useGetJuniorsFilters();

  const allAgeGroups = useMemo(() => filtersQ.data?.ageGroups ?? [], [filtersQ.data]);
  const allSeasons = useMemo(() => filtersQ.data?.seasons ?? [], [filtersQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Junior Matches page display</h1>
        <p className="text-muted-foreground mt-1">
          Control how the public Junior Matches page behaves by default: which age group and
          season load first, and the order age groups appear in the dropdown. Visitors can
          still change the filters themselves after the page loads.
        </p>
      </div>

      {settingsQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : settingsQ.data ? (
        <SettingsCard
          settings={settingsQ.data}
          allAgeGroups={allAgeGroups}
          allSeasons={allSeasons}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetJuniorMatchDisplaySettingsQueryKey() })
          }
        />
      ) : (
        <div className="text-sm text-destructive">Failed to load settings.</div>
      )}
    </div>
  );
}

/**
 * Merge the saved age-group order with the live list: configured age groups in
 * their saved order first (only if they still exist), then any remaining groups
 * in natural order.
 */
function mergeAgeOrder(saved: string[], all: string[]): string[] {
  const present = saved.filter((a) => all.includes(a));
  const rest = all.filter((a) => !present.includes(a));
  return [...present, ...rest];
}

function SettingsCard({
  settings,
  allAgeGroups,
  allSeasons,
  onSaved,
}: {
  settings: JuniorMatchDisplaySettings;
  allAgeGroups: string[];
  allSeasons: string[];
  onSaved: () => void;
}) {
  const [defaultAgeGroup, setDefaultAgeGroup] = useState(settings.defaultAgeGroup);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(settings.defaultSeasonMode);
  const [specificSeason, setSpecificSeason] = useState(settings.defaultSeason ?? "");
  const [ageOrder, setAgeOrder] = useState<string[]>(
    mergeAgeOrder(settings.ageGroupOrder, allAgeGroups),
  );
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateJuniorMatchDisplaySettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  useEffect(() => {
    setDefaultAgeGroup(settings.defaultAgeGroup);
    setSeasonMode(settings.defaultSeasonMode);
    setSpecificSeason(settings.defaultSeason ?? "");
    setAgeOrder(mergeAgeOrder(settings.ageGroupOrder, allAgeGroups));
  }, [settings, allAgeGroups]);

  const move = (idx: number, dir: -1 | 1) => {
    setAgeOrder((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = () => {
    setError(null);
    if (defaultAgeGroup && !allAgeGroups.includes(defaultAgeGroup)) {
      return setError("Default age group is no longer a valid age group.");
    }
    let defaultSeason: string | null = null;
    if (seasonMode === "specific") {
      if (!specificSeason || !allSeasons.includes(specificSeason)) {
        return setError("Choose a valid season for the specific-season default.");
      }
      defaultSeason = specificSeason;
    }
    const data: JuniorMatchDisplaySettingsUpdate = {
      defaultAgeGroup,
      defaultSeasonMode: seasonMode,
      defaultSeason,
      ageGroupOrder: ageOrder,
    };
    update.mutate({ data });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default filters &amp; ordering</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Default age group */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Default age group
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The age group pre-selected when the Junior Matches page first opens.
          </p>
          <select
            value={defaultAgeGroup}
            onChange={(e) => setDefaultAgeGroup(e.target.value)}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[14rem]"
            data-testid="select-default-age-group"
          >
            <option value="">All age groups</option>
            {allAgeGroups.map((a) => (
              <option key={a} value={a}>
                {a}
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
                  <select
                    value={specificSeason}
                    onChange={(e) => setSpecificSeason(e.target.value)}
                    className="ml-2 px-2 py-1 rounded border border-input bg-card text-foreground text-sm"
                    data-testid="select-specific-season"
                  >
                    <option value="">Choose…</option>
                    {allSeasons.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Age-group menu order */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Age-group menu order
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            The order age groups appear in the dropdown on the Junior Matches page.
          </p>
          <ul className="space-y-1 max-w-md">
            {ageOrder.map((a, idx) => (
              <li
                key={a}
                className="flex items-center gap-2 border rounded px-3 py-2 bg-card"
                data-testid={`age-order-row-${a}`}
              >
                <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                <span className="flex-1 text-sm font-medium">{a}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  data-testid={`button-age-up-${a}`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === ageOrder.length - 1}
                  onClick={() => move(idx, 1)}
                  data-testid={`button-age-down-${a}`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {ageOrder.length === 0 && (
              <li className="text-xs text-muted-foreground italic">No age groups available yet.</li>
            )}
          </ul>
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
