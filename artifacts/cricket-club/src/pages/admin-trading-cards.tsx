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
import { STAT_CATALOG, CARD_ROLES, type CardRole } from "@/lib/trading-card";

export default function AdminTradingCards() {
  const qc = useQueryClient();
  const settingsQ = useGetTradingCardSettings();
  const awardsQ = useListAwards();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Choose which statistics and awards appear on player trading cards. Set a default that
          applies to every card, then optionally override the stats per player role (Batsman,
          Bowler, All-Rounder, Wicket-Keeper). Leave a section empty to fall back: a role with no
          stats uses the default, and an empty default uses smart per-role defaults. Leave the
          awards empty to show every award a player has won.
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
  const [statKeysByRole, setStatKeysByRole] = useState<Record<string, string[]>>(
    settings.statKeysByRole ?? {},
  );
  const [awardKeys, setAwardKeys] = useState<string[]>(settings.awardKeys);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatKeys(settings.statKeys);
    setStatKeysByRole(settings.statKeysByRole ?? {});
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

  // Toggle a stat key for one role's override list (independent ordered lists).
  const toggleRoleStat = (role: CardRole, key: string) =>
    setStatKeysByRole((prev) => {
      const current = prev[role] ?? [];
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      return { ...prev, [role]: next };
    });

  const toggleAward = (key: string) =>
    setAwardKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const save = () => {
    setError(null);
    // Drop empty role lists so the payload stays clean (empty = use default).
    const cleanedByRole = Object.fromEntries(
      Object.entries(statKeysByRole).filter(([, keys]) => keys.length > 0),
    );
    update.mutate({ data: { statKeys, statKeysByRole: cleanedByRole, awardKeys } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card statistics &amp; awards</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Default stats (apply to every role unless overridden) */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Default statistics (all roles)
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Selected stats appear on every card in the order you pick them. Leave all unticked to
            use the automatic per-role default selection.
          </p>
          <StatPicker
            selected={statKeys}
            onToggle={toggleStat}
            testIdPrefix="stat"
          />
        </div>

        {/* Per-role stat overrides */}
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Statistics by role
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Override the stats for players of a specific role. Leave a role unticked to use the
            default selection above.
          </p>
          <div className="space-y-6">
            {CARD_ROLES.map((role) => (
              <div key={role}>
                <h4 className="font-semibold text-sm mb-2">{role}</h4>
                <StatPicker
                  selected={statKeysByRole[role] ?? []}
                  onToggle={(key) => toggleRoleStat(role, key)}
                  testIdPrefix={`stat-${role}`}
                />
              </div>
            ))}
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

// A grid of the full stat catalog as ordered toggles. The selection order
// (shown as a numeric badge) drives the order tiles appear on the card.
function StatPicker({
  selected,
  onToggle,
  testIdPrefix,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {STAT_CATALOG.map((stat) => {
        const order = selected.indexOf(stat.key);
        const isSelected = order >= 0;
        return (
          <label
            key={stat.key}
            className={`flex items-center gap-2 border rounded p-2.5 cursor-pointer transition-colors ${
              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"
            }`}
            data-testid={`${testIdPrefix}-${stat.key}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(stat.key)}
            />
            <span className="font-medium text-sm flex-1">{stat.label}</span>
            {isSelected && (
              <span className="text-xs font-bold text-primary">{order + 1}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
