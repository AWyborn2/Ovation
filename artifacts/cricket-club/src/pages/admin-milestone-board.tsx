import { useEffect, useState } from "react";
import {
  useGetMilestoneBoardSettings,
  useUpdateMilestoneBoardSettings,
  getGetMilestoneBoardSettingsQueryKey,
  type MilestoneBoardSettings,
  type MilestoneBoardSettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

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

const THRESHOLDS: { key: "gamesThreshold" | "runsThreshold" | "wicketsThreshold"; label: string; hint: string }[] = [
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
        <h1 className="text-3xl font-serif font-bold">Significant milestones board</h1>
        <p className="text-muted-foreground mt-1">
          Control what the Significant Milestones section on the public Honour Boards page shows.
        </p>
      </div>

      {settingsQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : settingsQ.data ? (
        <SettingsCard
          settings={settingsQ.data}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetMilestoneBoardSettingsQueryKey() })
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
  onSaved,
}: {
  settings: MilestoneBoardSettings;
  onSaved: () => void;
}) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>(settings.displayMode);
  const [games, setGames] = useState(String(settings.gamesThreshold));
  const [runs, setRuns] = useState(String(settings.runsThreshold));
  const [wickets, setWickets] = useState(String(settings.wicketsThreshold));
  const [recencyWeeks, setRecencyWeeks] = useState(String(settings.recencyWeeks));
  const [gamesTiers, setGamesTiers] = useState(tiersToText(settings.gamesTiers));
  const [runsTiers, setRunsTiers] = useState(tiersToText(settings.runsTiers));
  const [wicketsTiers, setWicketsTiers] = useState(tiersToText(settings.wicketsTiers));
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

  useEffect(() => {
    setDisplayMode(settings.displayMode);
    setGames(String(settings.gamesThreshold));
    setRuns(String(settings.runsThreshold));
    setWickets(String(settings.wicketsThreshold));
    setRecencyWeeks(String(settings.recencyWeeks));
    setGamesTiers(tiersToText(settings.gamesTiers));
    setRunsTiers(tiersToText(settings.runsTiers));
    setWicketsTiers(tiersToText(settings.wicketsTiers));
  }, [settings]);

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
    <Card>
      <CardHeader>
        <CardTitle>Display mode &amp; thresholds</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            What to show
          </h3>
          <div className="space-y-2">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`flex items-start gap-3 border rounded p-3 cursor-pointer transition-colors ${
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
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Significant thresholds
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            A club counts as "significant" once it meets or exceeds these values. Used for both
            recent achievers and approaching players.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Recency window
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            How many weeks back (by real match date) an achievement counts as "recent" on the
            Milestones tab. The board always lists the most recently achieved milestones first;
            those within this window get a "Recent" highlight badge.
          </p>
          <div className="max-w-[12rem] space-y-2">
            <Label htmlFor="recencyWeeks">Weeks</Label>
            <Input
              id="recencyWeeks"
              type="number"
              min={1}
              value={recencyWeeks}
              onChange={(e) => setRecencyWeeks(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">Default 4</div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Career tiers
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Comma-separated milestone tiers for career games, runs and wickets. They drive how
            significant a career crossing is when ranking the Milestones tab (higher tiers rank
            first). List values in ascending order; the first value is the lowest tier.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
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
