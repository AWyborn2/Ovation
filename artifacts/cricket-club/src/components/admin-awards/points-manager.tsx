import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAwardPointsConfigs,
  useUpsertAwardPointsConfig,
  useUpdateAwardPointsConfig,
  useDeleteAwardPointsConfig,
  useGetPointsConfigLeaderboard,
  useFinalisePointsConfig,
  getListAwardPointsConfigsQueryKey,
  getGetPointsConfigLeaderboardQueryKey,
} from "@workspace/api-client-react";
import type {
  Award,
  AwardPointsConfig,
  PointsCategories,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { POINTS_CATEGORIES } from "./constants";
import { formatSeasonRange } from "./helpers";

export function PointsManager({
  award,
  onAwardChanged,
}: {
  award: Award;
  onAwardChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: configs, isLoading, isError, refetch } =
    useListAwardPointsConfigs(award.id);
  const upsert = useUpsertAwardPointsConfig();
  const [showNew, setShowNew] = useState(false);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  const invalidateConfigs = () =>
    queryClient.invalidateQueries({
      queryKey: getListAwardPointsConfigsQueryKey(award.id),
    });

  const sorted = [...(configs ?? [])].sort((a, b) => b.season - a.season);

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-primary">
          Points from stats{award.pointsGrade ? ` · ${award.pointsGrade}` : ""}
        </h4>
        <Button
          size="sm"
          variant={showNew ? "outline" : "secondary"}
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancel" : "Add a season"}
        </Button>
      </div>

      {!award.pointsGrade && (
        <p className="text-sm text-destructive">
          Set a grade for this award (Edit) before configuring points.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showNew && (
        <div className="flex items-end gap-3 rounded-md border border-border bg-background p-3">
          <div className="space-y-1">
            <Label className="text-xs">Season (start year)</Label>
            <Input
              type="number"
              className="w-32"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <Button
            size="sm"
            disabled={upsert.isPending}
            onClick={() => {
              setError(null);
              upsert.mutate(
                { id: award.id, data: { season } },
                {
                  onSuccess: () => {
                    setShowNew(false);
                    invalidateConfigs();
                    onAwardChanged();
                  },
                  onError: (e) => {
                    const msg = handleAdminMutationError(e);
                    if (msg) setError(msg);
                  },
                },
              );
            }}
          >
            {upsert.isPending ? "Adding…" : "Add season"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading points config…" className="py-4" />
      ) : isError ? (
        <QueryError
          message="We couldn’t load points config. Please try again."
          onRetry={() => refetch()}
        />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No seasons configured. Add a season to score players from their match
          stats.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((config) => (
            <PointsConfigCard
              key={config.id}
              award={award}
              config={config}
              onChanged={() => {
                invalidateConfigs();
                onAwardChanged();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PointsConfigCard({
  award,
  config,
  onChanged,
}: {
  award: Award;
  config: AwardPointsConfig;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateAwardPointsConfig();
  const remove = useDeleteAwardPointsConfig();
  const finalise = useFinalisePointsConfig();
  const confirm = useConfirm();
  const [cats, setCats] = useState<PointsCategories>(config.categories);
  const [showBoard, setShowBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalised = config.finalisedAt != null;

  const onError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const patch = (data: Parameters<typeof update.mutate>[0]["data"]) => {
    setError(null);
    update.mutate({ id: config.id, data }, { onSuccess: onChanged, onError });
  };

  const patchCats = (next: PointsCategories) => {
    setCats(next);
    patch({ categories: next });
  };

  return (
    <div className="rounded-md border border-border bg-background p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            {formatSeasonRange(config.season)}
            {finalised && (
              <span className="ml-2 text-xs font-normal rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                Finalised
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {config.leaderboardVisible ? "Leaderboard public" : "Leaderboard hidden"}
            {config.includeFinals ? " · finals counted" : ""}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={remove.isPending}
          onClick={async () => {
            if (
              !(await confirm({
                title: "Delete points config?",
                description: `Delete points config for ${formatSeasonRange(config.season)}?`,
                confirmText: "Delete",
                destructive: true,
              }))
            )
              return;
            setError(null);
            remove.mutate({ id: config.id }, { onSuccess: onChanged, onError });
          }}
        >
          Delete
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label className="text-xs">Scoring categories</Label>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS_CATEGORIES.map(({ key, label }) => {
            const cat = cats[key];
            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={cat.enabled}
                  disabled={update.isPending}
                  onChange={(e) =>
                    patchCats({
                      ...cats,
                      [key]: { ...cat, enabled: e.target.checked },
                    })
                  }
                />
                <span className="text-sm flex-1 min-w-0 truncate">{label}</span>
                <Input
                  type="number"
                  step="any"
                  className="w-16 h-8"
                  value={cat.value}
                  disabled={!cat.enabled || update.isPending}
                  onChange={(e) =>
                    setCats({
                      ...cats,
                      [key]: { ...cat, value: parseFloat(e.target.value) || 0 },
                    })
                  }
                  onBlur={() => patch({ categories: cats })}
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Each enabled category multiplies the player's season total by its
          points value.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.includeFinals}
            disabled={update.isPending}
            onChange={(e) => patch({ includeFinals: e.target.checked })}
          />
          Count finals matches
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.leaderboardVisible}
            disabled={update.isPending}
            onChange={(e) => patch({ leaderboardVisible: e.target.checked })}
          />
          Show live leaderboard publicly
        </label>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowBoard((v) => !v);
            if (!showBoard)
              queryClient.invalidateQueries({
                queryKey: getGetPointsConfigLeaderboardQueryKey(config.id),
              });
          }}
        >
          {showBoard ? "Hide leaderboard" : "View leaderboard"}
        </Button>
        <Button
          size="sm"
          disabled={finalise.isPending || !award.pointsGrade}
          onClick={async () => {
            if (
              !(await confirm({
                title: "Finalise points award?",
                description: `Finalise ${award.title} ${formatSeasonRange(config.season)}? The current leader(s) will be recorded as the winner(s).`,
                confirmText: "Finalise",
              }))
            )
              return;
            setError(null);
            finalise.mutate(
              { id: config.id },
              { onSuccess: onChanged, onError },
            );
          }}
        >
          {finalise.isPending
            ? "Finalising…"
            : finalised
              ? "Re-finalise"
              : "Finalise winner(s)"}
        </Button>
      </div>

      {showBoard && <PointsBoardView configId={config.id} />}
    </div>
  );
}

function PointsBoardView({ configId }: { configId: number }) {
  const { data, isLoading, isError, refetch } = useGetPointsConfigLeaderboard(configId);
  if (isLoading)
    return <LoadingState label="Loading leaderboard…" className="py-4" />;
  if (isError)
    return (
      <QueryError
        message="We couldn’t load the leaderboard. Please try again."
        onRetry={() => refetch()}
      />
    );
  if (!data || data.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No stats found for this grade and season yet.
      </p>
    );
  }
  const winners = new Set(data.winnerPlayerIds);
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Player</th>
            <th className="text-right px-3 py-2">Pts</th>
            <th className="text-right px-3 py-2">Runs</th>
            <th className="text-right px-3 py-2">Wkts</th>
            <th className="text-right px-3 py-2">Ct</th>
            <th className="text-right px-3 py-2">Gm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.entries.map((e) => (
            <tr key={e.playerId} className={winners.has(e.playerId) ? "bg-primary/10" : ""}>
              <td className="px-3 py-2 font-medium">
                {e.name}
                {winners.has(e.playerId) && (
                  <span className="ml-2 text-xs text-primary">● leader</span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-bold">{e.points}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.runs}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.wickets}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.catches}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
