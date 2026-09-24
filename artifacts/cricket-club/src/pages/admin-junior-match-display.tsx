import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useGetJuniorMatchDisplaySettings,
  useUpdateJuniorMatchDisplaySettings,
  useGetJuniorsFilters,
  getGetJuniorMatchDisplaySettingsQueryKey,
  type JuniorMatchDisplaySettings,
  type JuniorMatchDisplaySettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import {
  DefaultSelect,
  OrderList,
  RadioCards,
  SettingsSection,
  mergeOrder,
  moveItem,
} from "@/components/display-settings";
import { SaveBar, SettingsCard, SettingsRow } from "@/components/admin-ui";

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
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Control how the public Junior Matches page behaves by default: which age group and season
          load first, and the order age groups appear in the dropdown. Visitors can still change the
          filters themselves after the page loads.
        </p>
      </div>

      {settingsQ.isError ? (
        <QueryError onRetry={() => settingsQ.refetch()} />
      ) : settingsQ.isLoading ? (
        <LoadingState label="Loading junior match display settings…" />
      ) : settingsQ.data ? (
        <JuniorMatchDisplayForm
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

function JuniorMatchDisplayForm({
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
  // The loaded values; Reset returns to them and the save bar compares against them.
  const seeded = useMemo(
    () => ({
      defaultAgeGroup: settings.defaultAgeGroup,
      seasonMode: settings.defaultSeasonMode,
      specificSeason: settings.defaultSeason ?? "",
      ageOrder: mergeOrder(settings.ageGroupOrder, allAgeGroups),
    }),
    [settings, allAgeGroups],
  );
  const [defaultAgeGroup, setDefaultAgeGroup] = useState(seeded.defaultAgeGroup);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(seeded.seasonMode);
  const [specificSeason, setSpecificSeason] = useState(seeded.specificSeason);
  const [ageOrder, setAgeOrder] = useState<string[]>(seeded.ageOrder);
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

  const reset = useCallback(() => {
    setDefaultAgeGroup(seeded.defaultAgeGroup);
    setSeasonMode(seeded.seasonMode);
    setSpecificSeason(seeded.specificSeason);
    setAgeOrder(seeded.ageOrder);
    setError(null);
  }, [seeded]);
  useEffect(reset, [reset]);

  const dirty =
    JSON.stringify({ defaultAgeGroup, seasonMode, specificSeason, ageOrder }) !==
    JSON.stringify(seeded);

  const move = (idx: number, dir: -1 | 1) => setAgeOrder((prev) => moveItem(prev, idx, dir));

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
    <>
      <SettingsCard
        title="Default filters"
        description="What the Junior Matches page shows when it first opens."
      >
        <SettingsRow
          label="Default age group"
          helper="The age group pre-selected when the Junior Matches page first opens."
        >
          <DefaultSelect
            value={defaultAgeGroup}
            onChange={setDefaultAgeGroup}
            options={allAgeGroups}
            allLabel="All age groups"
            testId="select-default-age-group"
          />
        </SettingsRow>

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
            className="max-w-md space-y-2"
            extra={(m) =>
              m.value === "specific" && seasonMode === "specific" ? (
                <select
                  value={specificSeason}
                  onChange={(e) => setSpecificSeason(e.target.value)}
                  className="ml-2 rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
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
      </SettingsCard>

      <SettingsCard title="Ordering">
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
