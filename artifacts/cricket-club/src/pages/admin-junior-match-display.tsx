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
import { handleAdminMutationError } from "@/lib/admin-auth";
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

type SeasonMode = JuniorMatchDisplaySettings["defaultSeasonMode"];

const SEASON_MODES: { value: SeasonMode; label: string }[] = [
  { value: "latest", label: "Latest available season" },
  { value: "specific", label: "A specific season" },
  { value: "all", label: "All seasons" },
];

/** Junior matches page defaults — reads/writes only `/api/juniors/*` settings. */
export default function AdminJuniorMatchDisplay() {
  const qc = useQueryClient();
  const settingsQ = useGetJuniorMatchDisplaySettings();
  const filtersQ = useGetJuniorsFilters();

  const allAgeGroups = useMemo(() => filtersQ.data?.ageGroups ?? [], [filtersQ.data]);
  const allSeasons = useMemo(() => filtersQ.data?.seasons ?? [], [filtersQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Control how the public Junior Matches page behaves by default: which age group and
          season load first, and the order age groups appear in the dropdown. Visitors can
          still change the filters themselves after the page loads.
        </p>
      </div>

      {settingsQ.isError ? (
        <QueryError onRetry={() => settingsQ.refetch()} />
      ) : settingsQ.isLoading ? (
        <LoadingState label="Loading junior match display settings…" />
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
        <QueryError onRetry={() => settingsQ.refetch()} />
      )}
    </div>
  );
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
    mergeOrder(settings.ageGroupOrder, allAgeGroups),
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
    setAgeOrder(mergeOrder(settings.ageGroupOrder, allAgeGroups));
  }, [settings, allAgeGroups]);

  const move = (idx: number, dir: -1 | 1) =>
    setAgeOrder((prev) => moveItem(prev, idx, dir));

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
        <SettingsSection
          title="Default age group"
          description="The age group pre-selected when the Junior Matches page first opens."
        >
          <DefaultSelect
            value={defaultAgeGroup}
            onChange={setDefaultAgeGroup}
            options={allAgeGroups}
            allLabel="All age groups"
            testId="select-default-age-group"
          />
        </SettingsSection>

        <SettingsSection
          title="Default season"
          description={
            <>
              Which season loads first. "Latest available" always tracks the newest season as
              new matches are imported.
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
              ) : null
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Age-group menu order"
          description="The order age groups appear in the dropdown on the Junior Matches page."
        >
          <OrderList
            items={ageOrder}
            onMove={move}
            emptyText="No age groups available yet."
            testIds={(a) => ({
              row: `age-order-row-${a}`,
              up: `button-age-up-${a}`,
              down: `button-age-down-${a}`,
            })}
          />
        </SettingsSection>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <SaveSettingsButton onClick={save} pending={update.isPending} />
      </CardContent>
    </Card>
  );
}
