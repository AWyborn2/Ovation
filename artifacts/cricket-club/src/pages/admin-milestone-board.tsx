import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useGetMilestoneBoardSettings,
  useUpdateMilestoneBoardSettings,
  getGetMilestoneBoardSettingsQueryKey,
  type MilestoneBoardSettings,
  type MilestoneBoardSettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { SettingsSection } from "@/components/display-settings";
import { SaveBar, SettingsCard, SettingsRow } from "@/components/admin-ui";

type DisplayMode = MilestoneBoardSettings["displayMode"];

const MODES: { value: DisplayMode; label: string; desc: string }[] = [
  {
    value: "recent",
    label: "Recent achievers",
    desc: "Show players who have just reached a significant club. (Current behaviour.)",
  },
  {
    value: "approaching",
    label: "Approaching",
    desc: "Show players closing in on a significant club, with how many to go.",
  },
  {
    value: "both",
    label: "Both",
    desc: "Show recent achievers and approaching players in two clearly separated lists.",
  },
];

const THRESHOLDS: {
  key: "gamesThreshold" | "runsThreshold" | "wicketsThreshold";
  label: string;
  hint: string;
}[] = [
  { key: "gamesThreshold", label: "Games", hint: "Default 100" },
  { key: "runsThreshold", label: "Runs", hint: "Default 1,000" },
  { key: "wicketsThreshold", label: "Wickets", hint: "Default 100" },
];

const TIERS: {
  key: "gamesTiers" | "runsTiers" | "wicketsTiers";
  label: string;
  hint: string;
}[] = [
  { key: "gamesTiers", label: "Games tiers", hint: "e.g. 100, 150, 200, 250, 300" },
  { key: "runsTiers", label: "Runs tiers", hint: "e.g. 1000, 2500, 5000, 7500, 10000" },
  { key: "wicketsTiers", label: "Wickets tiers", hint: "e.g. 100, 150, 200, 250" },
];

function tiersToText(tiers: number[]): string {
  return tiers.join(", ");
}

function parseTiers(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (Number.isNaN(n) || n < 1) return null;
    nums.push(n);
  }
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] <= nums[i - 1]) return null;
  }
  return nums;
}

export default function AdminMilestoneBoard() {
  const qc = useQueryClient();
  const settingsQ = useGetMilestoneBoardSettings();

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Control what the Significant Milestones section on the public Honour Boards page shows.
        </p>
      </div>

      {settingsQ.isError ? (
        <QueryError onRetry={() => settingsQ.refetch()} />
      ) : settingsQ.isLoading ? (
        <LoadingState label="Loading milestone board settings…" />
      ) : settingsQ.data ? (
        <MilestoneBoardForm
          settings={settingsQ.data}
          onSaved={() => qc.invalidateQueries({ queryKey: getGetMilestoneBoardSettingsQueryKey() })}
        />
      ) : (
        <QueryError onRetry={() => settingsQ.refetch()} />
      )}
    </div>
  );
}

function MilestoneBoardForm({
  settings,
  onSaved,
}: {
  settings: MilestoneBoardSettings;
  onSaved: () => void;
}) {
  // The loaded values; Reset returns to them and the save bar compares against them.
  const seeded = useMemo(
    () => ({
      displayMode: settings.displayMode,
      games: String(settings.gamesThreshold),
      runs: String(settings.runsThreshold),
      wickets: String(settings.wicketsThreshold),
      recencyWeeks: String(settings.recencyWeeks),
      gamesTiers: tiersToText(settings.gamesTiers),
      runsTiers: tiersToText(settings.runsTiers),
      wicketsTiers: tiersToText(settings.wicketsTiers),
    }),
    [settings],
  );
  const [displayMode, setDisplayMode] = useState<DisplayMode>(seeded.displayMode);
  const [games, setGames] = useState(seeded.games);
  const [runs, setRuns] = useState(seeded.runs);
  const [wickets, setWickets] = useState(seeded.wickets);
  const [recencyWeeks, setRecencyWeeks] = useState(seeded.recencyWeeks);
  const [gamesTiers, setGamesTiers] = useState(seeded.gamesTiers);
  const [runsTiers, setRunsTiers] = useState(seeded.runsTiers);
  const [wicketsTiers, setWicketsTiers] = useState(seeded.wicketsTiers);
  const [error, setError] = useState<string | null>(null);

  const update = useUpdateMilestoneBoardSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  const reset = useCallback(() => {
    setDisplayMode(seeded.displayMode);
    setGames(seeded.games);
    setRuns(seeded.runs);
    setWickets(seeded.wickets);
    setRecencyWeeks(seeded.recencyWeeks);
    setGamesTiers(seeded.gamesTiers);
    setRunsTiers(seeded.runsTiers);
    setWicketsTiers(seeded.wicketsTiers);
    setError(null);
  }, [seeded]);
  useEffect(reset, [reset]);

  const dirty =
    JSON.stringify({
      displayMode,
      games,
      runs,
      wickets,
      recencyWeeks,
      gamesTiers,
      runsTiers,
      wicketsTiers,
    }) !== JSON.stringify(seeded);

  const values = { gamesThreshold: games, runsThreshold: runs, wicketsThreshold: wickets };
  const setters: Record<string, (v: string) => void> = {
    gamesThreshold: setGames,
    runsThreshold: setRuns,
    wicketsThreshold: setWickets,
  };

  const tierValues = { gamesTiers, runsTiers, wicketsTiers };
  const tierSetters: Record<string, (v: string) => void> = {
    gamesTiers: setGamesTiers,
    runsTiers: setRunsTiers,
    wicketsTiers: setWicketsTiers,
  };

  const save = () => {
    setError(null);
    const parsed: Record<string, number> = {};
    for (const t of THRESHOLDS) {
      const n = parseInt(values[t.key], 10);
      if (isNaN(n) || n < 1) {
        return setError(`${t.label} threshold must be a whole number of at least 1.`);
      }
      parsed[t.key] = n;
    }
    const weeks = parseInt(recencyWeeks, 10);
    if (isNaN(weeks) || weeks < 1) {
      return setError("Recency window must be a whole number of weeks (at least 1).");
    }
    const parsedTiers: Record<string, number[]> = {};
    for (const t of TIERS) {
      const tiers = parseTiers(tierValues[t.key]);
      if (!tiers) {
        return setError(
          `${t.label} must be a comma-separated list of ascending whole numbers (each at least 1).`,
        );
      }
      parsedTiers[t.key] = tiers;
    }
    const data: MilestoneBoardSettingsUpdate = {
      displayMode,
      gamesThreshold: parsed.gamesThreshold,
      runsThreshold: parsed.runsThreshold,
      wicketsThreshold: parsed.wicketsThreshold,
      recencyWeeks: weeks,
      gamesTiers: parsedTiers.gamesTiers,
      runsTiers: parsedTiers.runsTiers,
      wicketsTiers: parsedTiers.wicketsTiers,
    };
    update.mutate({ data });
  };

  return (
    <>
      <SettingsCard
        title="Display mode"
        description="What the Significant Milestones section on the Honour Boards page shows."
      >
        <div className="space-y-2 px-5 py-4">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer items-start gap-3 rounded border p-3 transition-colors ${
                displayMode === m.value ? "border-primary bg-primary/5" : "hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="displayMode"
                className="mt-1"
                checked={displayMode === m.value}
                onChange={() => setDisplayMode(m.value)}
              />
              <div>
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Thresholds and tiers">
        <SettingsSection
          title="Significant thresholds"
          description='A club counts as "significant" once it meets or exceeds these values. Used for both recent achievers and approaching players.'
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {THRESHOLDS.map((t) => (
              <div key={t.key} className="space-y-2">
                <Label htmlFor={t.key}>{t.label}</Label>
                <Input
                  id={t.key}
                  type="number"
                  min={1}
                  value={values[t.key]}
                  onChange={(e) => setters[t.key](e.target.value)}
                />
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsRow
          label="Recency window (weeks)"
          helper='How many weeks back (by real match date) an achievement counts as "recent" on the Milestones tab. Those within this window get a "Recent" badge. Default 4.'
          htmlFor="recencyWeeks"
        >
          <Input
            id="recencyWeeks"
            type="number"
            min={1}
            value={recencyWeeks}
            onChange={(e) => setRecencyWeeks(e.target.value)}
            className="w-28"
          />
        </SettingsRow>

        <SettingsSection
          title="Career tiers"
          description="Comma-separated milestone tiers for career games, runs and wickets. They drive how significant a career crossing is when ranking the Milestones tab (higher tiers rank first). List values in ascending order; the first value is the lowest tier."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TIERS.map((t) => (
              <div key={t.key} className="space-y-2">
                <Label htmlFor={t.key}>{t.label}</Label>
                <Input
                  id={t.key}
                  type="text"
                  value={tierValues[t.key]}
                  onChange={(e) => tierSetters[t.key](e.target.value)}
                />
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </div>
            ))}
          </div>
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
