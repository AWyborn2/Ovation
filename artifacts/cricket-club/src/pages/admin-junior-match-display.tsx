import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useGetJuniorMatchDisplaySettings,
  useUpdateJuniorMatchDisplaySettings,
  useGetJuniorsFilters,
  useListJuniorMatches,
  getGetJuniorMatchDisplaySettingsQueryKey,
  getListJuniorMatchesQueryKey,
  type JuniorMatchDisplaySettings,
  type JuniorMatchDisplaySettingsUpdate,
  type JuniorNameStyle,
  type JuniorTeamPublishing,
  type JuniorTeamPublishMode,
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

const NAME_STYLES: { value: JuniorNameStyle; label: string }[] = [
  { value: "full", label: "Full name" },
  { value: "first_initial", label: "First name and surname initial" },
  { value: "first", label: "First name only" },
];

const PREVIEW_NAME = "Ollie Gallash";

/** Mirrors the API's `formatJuniorName` (api-server lib/junior-names.ts) for the preview. */
function previewJuniorName(name: string, style: JuniorNameStyle): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (style === "first") return parts[0]!;
  if (style === "first_initial") {
    if (parts.length === 1) return parts[0]!;
    return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}`;
  }
  return parts.join(" ");
}

type TeamKey = { ageGroup: string; teamName: string };

/** One row per (age group, team): teams seen in the latest season plus any already configured. */
function publishingTeams(
  matches: { ageGroup?: string | null; teamName?: string | null }[],
  configured: JuniorTeamPublishing,
  ageOrder: string[],
): TeamKey[] {
  const seen = new Map<string, TeamKey>();
  const add = (ageGroup: string, teamName: string) =>
    seen.set(JSON.stringify([ageGroup, teamName]), { ageGroup, teamName });
  for (const m of matches) if (m.ageGroup && m.teamName) add(m.ageGroup, m.teamName);
  for (const [ageGroup, teams] of Object.entries(configured))
    for (const teamName of Object.keys(teams)) add(ageGroup, teamName);
  const rank = (a: string) => {
    const i = ageOrder.indexOf(a);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...seen.values()].sort(
    (a, b) =>
      rank(a.ageGroup) - rank(b.ageGroup) ||
      a.ageGroup.localeCompare(b.ageGroup) ||
      a.teamName.localeCompare(b.teamName),
  );
}

const modeOf = (map: JuniorTeamPublishing, t: TeamKey): JuniorTeamPublishMode =>
  map[t.ageGroup]?.[t.teamName] ?? "approval";

/** Junior matches page defaults — reads/writes only `/api/juniors/*` settings. */
export default function AdminJuniorMatchDisplay() {
  const qc = useQueryClient();
  const settingsQ = useGetJuniorMatchDisplaySettings();
  const filtersQ = useGetJuniorsFilters();

  const allAgeGroups = useMemo(() => filtersQ.data?.ageGroups ?? [], [filtersQ.data]);
  const allSeasons = useMemo(() => filtersQ.data?.seasons ?? [], [filtersQ.data]);
  // Teams for the publishing table come from the newest season's matches.
  const latestSeason = allSeasons[0];
  const teamParams = { season: latestSeason };
  const teamsQ = useListJuniorMatches(teamParams, {
    query: { enabled: !!latestSeason, queryKey: getListJuniorMatchesQueryKey(teamParams) },
  });
  const teamMatches = useMemo(() => teamsQ.data ?? [], [teamsQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Control how the public Junior Matches page behaves by default: which age group and season
          load first, and the order age groups appear in the dropdown. Visitors can still change the
          filters themselves after the page loads. Below that, choose how junior players are named
          publicly and which teams' cards post without approval.
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
          teamMatches={teamMatches}
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
  teamMatches,
  onSaved,
}: {
  settings: JuniorMatchDisplaySettings;
  allAgeGroups: string[];
  allSeasons: string[];
  teamMatches: { ageGroup?: string | null; teamName?: string | null }[];
  onSaved: () => void;
}) {
  // The loaded values; Reset returns to them and the save bar compares against them.
  const seeded = useMemo(
    () => ({
      defaultAgeGroup: settings.defaultAgeGroup,
      seasonMode: settings.defaultSeasonMode,
      specificSeason: settings.defaultSeason ?? "",
      ageOrder: mergeOrder(settings.ageGroupOrder, allAgeGroups),
      nameStyle: settings.nameStyle ?? "full",
      teamPublishing: settings.teamPublishing ?? {},
    }),
    [settings, allAgeGroups],
  );
  const [defaultAgeGroup, setDefaultAgeGroup] = useState(seeded.defaultAgeGroup);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(seeded.seasonMode);
  const [specificSeason, setSpecificSeason] = useState(seeded.specificSeason);
  const [ageOrder, setAgeOrder] = useState<string[]>(seeded.ageOrder);
  const [nameStyle, setNameStyle] = useState<JuniorNameStyle>(seeded.nameStyle);
  const [teamPublishing, setTeamPublishing] = useState<JuniorTeamPublishing>(seeded.teamPublishing);
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
    setNameStyle(seeded.nameStyle);
    setTeamPublishing(seeded.teamPublishing);
    setError(null);
  }, [seeded]);
  useEffect(reset, [reset]);

  const dirty =
    JSON.stringify({
      defaultAgeGroup,
      seasonMode,
      specificSeason,
      ageOrder,
      nameStyle,
      teamPublishing,
    }) !== JSON.stringify(seeded);

  const teams = useMemo(
    () => publishingTeams(teamMatches, teamPublishing, ageOrder),
    [teamMatches, teamPublishing, ageOrder],
  );
  const setMode = (t: TeamKey, mode: JuniorTeamPublishMode) =>
    setTeamPublishing((prev) => ({
      ...prev,
      [t.ageGroup]: { ...(prev[t.ageGroup] ?? {}), [t.teamName]: mode },
    }));

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
      nameStyle,
      teamPublishing,
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

      <SettingsCard
        title="Player names"
        description="How junior players are named on public pages and social cards. Admin screens always show full names."
      >
        <SettingsRow
          label="Naming style"
          helper="Private players stay hidden whatever the style, and opposition players always show as initials."
        >
          <div className="space-y-2">
            <select
              value={nameStyle}
              onChange={(e) => setNameStyle(e.target.value as JuniorNameStyle)}
              className="rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
              data-testid="select-name-style"
              aria-label="Naming style"
            >
              {NAME_STYLES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground" data-testid="name-style-preview">
              {PREVIEW_NAME} shows as{" "}
              <strong className="text-foreground">
                {previewJuniorName(PREVIEW_NAME, nameStyle)}
              </strong>
            </p>
          </div>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard
        title="Social publishing"
        description="Whether each junior team's cards wait for approval or post themselves. A team not set here waits for approval."
      >
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No junior teams in the latest season yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Age group</th>
                <th className="py-1 pr-3 font-medium">Team</th>
                <th className="py-1 font-medium">Cards</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr
                  key={JSON.stringify([t.ageGroup, t.teamName])}
                  className="border-t border-border"
                >
                  <td className="py-1.5 pr-3">{t.ageGroup}</td>
                  <td className="py-1.5 pr-3">{t.teamName}</td>
                  <td className="py-1.5">
                    <select
                      value={modeOf(teamPublishing, t)}
                      onChange={(e) => setMode(t, e.target.value as JuniorTeamPublishMode)}
                      className="rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
                      data-testid={`select-publish-${t.ageGroup}-${t.teamName}`}
                      aria-label={`${t.teamName} (${t.ageGroup}) card publishing`}
                    >
                      <option value="approval">Needs approval</option>
                      <option value="auto">Post automatically</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
