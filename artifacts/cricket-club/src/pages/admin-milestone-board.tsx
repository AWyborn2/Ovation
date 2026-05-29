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
  }, [settings]);

  const values = { gamesThreshold: games, runsThreshold: runs, wicketsThreshold: wickets };
  const setters: Record<string, (v: string) => void> = {
    gamesThreshold: setGames,
    runsThreshold: setRuns,
    wicketsThreshold: setWickets,
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
    const data: MilestoneBoardSettingsUpdate = {
      displayMode,
      gamesThreshold: parsed.gamesThreshold,
      runsThreshold: parsed.runsThreshold,
      wicketsThreshold: parsed.wicketsThreshold,
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
