import { useEffect, useState } from "react";
import {
  useGetTradingCardSettings,
  useUpdateTradingCardSettings,
  useListAwards,
  getGetTradingCardSettingsQueryKey,
  type TradingCardSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { STAT_CATALOG } from "@/lib/trading-card";

export default function AdminTradingCards() {
  const qc = useQueryClient();
  const settingsQ = useGetTradingCardSettings();
  const awardsQ = useListAwards();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Trading card contents</h1>
        <p className="text-muted-foreground mt-1">
          Choose which statistics and awards appear on every player's trading card. This is a
          single global setting — it applies to all cards. Leave the stats empty to fall back to
          smart per-role defaults, and leave the awards empty to show every award a player has won.
        </p>
      </div>

      {settingsQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : settingsQ.data ? (
        <SettingsCard
          settings={settingsQ.data}
          awards={(awardsQ.data ?? [])
            .filter((a) => a.published)
            .map((a) => ({ key: a.key, title: a.title }))}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetTradingCardSettingsQueryKey() })
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
  awards,
  onSaved,
}: {
  settings: TradingCardSettings;
  awards: { key: string; title: string }[];
  onSaved: () => void;
}) {
  const [statKeys, setStatKeys] = useState<string[]>(settings.statKeys);
  const [awardKeys, setAwardKeys] = useState<string[]>(settings.awardKeys);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatKeys(settings.statKeys);
    setAwardKeys(settings.awardKeys);
  }, [settings]);

  const update = useUpdateTradingCardSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  // Toggle a stat key, preserving the order in which the admin selected them
  // (selection order drives the order tiles appear on the card).
  const toggleStat = (key: string) =>
    setStatKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const toggleAward = (key: string) =>
    setAwardKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const save = () => {
    setError(null);
    update.mutate({ data: { statKeys, awardKeys } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card statistics &amp; awards</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Stats */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Statistics shown on cards
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Selected stats appear on every card in the order you pick them. Leave all unticked to
            use the automatic per-role default selection.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STAT_CATALOG.map((stat) => {
              const order = statKeys.indexOf(stat.key);
              const selected = order >= 0;
              return (
                <label
                  key={stat.key}
                  className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer transition-colors ${
                    selected ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                  data-testid={`stat-${stat.key}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleStat(stat.key)}
                  />
                  <span className="font-medium text-sm flex-1">{stat.label}</span>
                  {selected && (
                    <span className="text-xs font-bold text-primary">{order + 1}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Awards */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Awards eligible for cards
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Each player's card shows the selected awards they have actually won. Leave all unticked
            to show every published award.
          </p>
          {awards.length === 0 ? (
            <div className="text-sm text-muted-foreground">No published awards available.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {awards.map((award) => {
                const selected = awardKeys.includes(award.key);
                return (
                  <label
                    key={award.key}
                    className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer transition-colors ${
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted"
                    }`}
                    data-testid={`award-${award.key}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAward(award.key)}
                    />
                    <span className="font-medium text-sm">{award.title}</span>
                  </label>
                );
              })}
            </div>
          )}
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
