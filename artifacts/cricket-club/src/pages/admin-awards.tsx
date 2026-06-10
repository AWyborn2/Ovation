import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAwards,
  useCreateAward,
  useUpdateAward,
  useDeleteAward,
  useCreateAwardWinner,
  useUpdateAwardWinner,
  useDeleteAwardWinner,
  useListAwardVotingConfigs,
  useUpsertAwardVotingConfig,
  useUpdateAwardVotingConfig,
  useDeleteAwardVotingConfig,
  useGetVotingConfigTally,
  useListVotingConfigBallots,
  useUpdateConfigBallot,
  useDeleteConfigBallot,
  useFinaliseVotingConfig,
  useListAwardPointsConfigs,
  useUpsertAwardPointsConfig,
  useUpdateAwardPointsConfig,
  useDeleteAwardPointsConfig,
  useGetPointsConfigLeaderboard,
  useFinalisePointsConfig,
  getListAdminAwardsQueryKey,
  getListAwardVotingConfigsQueryKey,
  getGetVotingConfigTallyQueryKey,
  getListVotingConfigBallotsQueryKey,
  getListAwardPointsConfigsQueryKey,
  getGetPointsConfigLeaderboardQueryKey,
} from "@workspace/api-client-react";
import type {
  Award,
  AwardWinner,
  AwardVotingConfig,
  AwardMechanism,
  AwardPointsConfig,
  PointsCategories,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type AwardFormValues = {
  key: string;
  title: string;
  description: string;
  displayOrder: number;
  votingEnabled: boolean;
  mechanism: AwardMechanism;
  published: boolean;
  pointsGrade: string | null;
};

type WinnerFormValues = {
  season: number;
  playerId: number | null;
  name: string;
  displayOrder: number;
  published: boolean;
};

export default function AdminAwards() {
  const queryClient = useQueryClient();
  const { data: awards, isLoading } = useListAdminAwards();
  const createAward = useCreateAward();
  const updateAward = useUpdateAward();
  const deleteAward = useDeleteAward();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminAwardsQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = useMemo(() => {
    if (!awards) return [];
    return [...awards].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    );
  }, [awards]);

  const moveAward = (index: number, dir: -1 | 1) => {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    setError(null);
    updateAward.mutate(
      { id: a.id, data: { displayOrder: b.displayOrder } },
      {
        onError: onMutationError,
        onSuccess: () => {
          updateAward.mutate(
            { id: b.id, data: { displayOrder: a.displayOrder } },
            { onSuccess: invalidate, onError: onMutationError },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">
            Create club awards and record their past winners. Each award appears
            as its own honour board on the website and mobile app.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} variant={showNew ? "outline" : "default"}>
          {showNew ? "Close form" : "New award"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle>New award</CardTitle>
          </CardHeader>
          <CardContent>
            <AwardForm
              initial={{
                key: "",
                title: "",
                description: "",
                displayOrder: (sorted[sorted.length - 1]?.displayOrder ?? -1) + 1,
                votingEnabled: false,
                mechanism: "manual",
                published: false,
                pointsGrade: null,
              }}
              autoKey
              pending={createAward.isPending}
              onSubmit={(values) => {
                setError(null);
                createAward.mutate(
                  { data: values },
                  {
                    onSuccess: () => {
                      setShowNew(false);
                      invalidate();
                    },
                    onError: onMutationError,
                  },
                );
              }}
              onCancel={() => setShowNew(false)}
              submitLabel="Create award"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            No awards yet.
          </CardContent>
        </Card>
      ) : (
        sorted.map((award, index) => (
          <Card key={award.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-xl">
                  {award.title}
                  <span
                    className={`ml-2 align-middle text-xs font-normal rounded px-2 py-0.5 ${
                      award.published
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {award.published ? "Published" : "Draft"}
                  </span>
                  <span className="ml-2 align-middle text-xs font-normal rounded bg-secondary text-secondary-foreground px-2 py-0.5 capitalize">
                    {MECHANISM_LABEL[award.mechanism]}
                  </span>
                  {award.mechanism === "points" && award.pointsGrade && (
                    <span className="ml-2 align-middle text-xs font-normal rounded bg-primary/15 text-primary px-2 py-0.5">
                      {award.pointsGrade}
                    </span>
                  )}
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  slug: <code>{award.key}</code> · order {award.displayOrder} ·{" "}
                  {award.winners.length}{" "}
                  {award.winners.length === 1 ? "winner" : "winners"}
                </div>
              </div>
              <div className="space-x-2 shrink-0">
                <Button
                  size="sm"
                  variant={award.published ? "outline" : "default"}
                  disabled={updateAward.isPending}
                  onClick={() => {
                    setError(null);
                    updateAward.mutate(
                      { id: award.id, data: { published: !award.published } },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                >
                  {award.published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === 0 || updateAward.isPending}
                  onClick={() => moveAward(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === sorted.length - 1 || updateAward.isPending}
                  onClick={() => moveAward(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(editingId === award.id ? null : award.id)}
                >
                  {editingId === award.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      !confirm(
                        `Delete award "${award.title}" and all its winners?`,
                      )
                    )
                      return;
                    setError(null);
                    deleteAward.mutate(
                      { id: award.id },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                  disabled={deleteAward.isPending}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {editingId === award.id && (
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <AwardForm
                    initial={{
                      key: award.key,
                      title: award.title,
                      description: award.description,
                      displayOrder: award.displayOrder,
                      votingEnabled: award.votingEnabled,
                      mechanism: award.mechanism,
                      published: award.published,
                      pointsGrade: award.pointsGrade ?? null,
                    }}
                    pending={updateAward.isPending}
                    onSubmit={(values) => {
                      setError(null);
                      updateAward.mutate(
                        { id: award.id, data: values },
                        {
                          onSuccess: () => {
                            setEditingId(null);
                            invalidate();
                          },
                          onError: onMutationError,
                        },
                      );
                    }}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Save changes"
                  />
                </div>
              )}

              {award.description && (
                <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">
                  {award.description}
                </p>
              )}

              <WinnersManager
                award={award}
                onError={onMutationError}
                onChanged={invalidate}
              />

              {award.mechanism === "voted" && (
                <VotingManager award={award} onAwardChanged={invalidate} />
              )}
              {award.mechanism === "points" && (
                <PointsManager award={award} onAwardChanged={invalidate} />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

const MECHANISM_LABEL: Record<AwardMechanism, string> = {
  manual: "Manual",
  voted: "Voted (3-2-1)",
  points: "Points from stats",
};

const POINTS_CATEGORIES: { key: keyof PointsCategories; label: string }[] = [
  { key: "runs", label: "Runs" },
  { key: "wickets", label: "Wickets" },
  { key: "catches", label: "Catches" },
  { key: "stumpings", label: "Stumpings" },
  { key: "runOuts", label: "Run outs" },
  { key: "games", label: "Games" },
  { key: "fifties", label: "Fifties (50–99)" },
  { key: "hundreds", label: "Hundreds (100+)" },
  { key: "fiveWickets", label: "Five-wicket hauls" },
];

function VotingManager({
  award,
  onAwardChanged,
}: {
  award: Award;
  onAwardChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: configs, isLoading } = useListAwardVotingConfigs(award.id);
  const upsert = useUpsertAwardVotingConfig();
  const [showNew, setShowNew] = useState(false);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  const invalidateConfigs = () =>
    queryClient.invalidateQueries({
      queryKey: getListAwardVotingConfigsQueryKey(award.id),
    });

  const sorted = [...(configs ?? [])].sort((a, b) => b.season - a.season);

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-primary">
          3-2-1 voting
        </h4>
        <Button
          size="sm"
          variant={showNew ? "outline" : "secondary"}
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancel" : "Add a season"}
        </Button>
      </div>

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
                {
                  id: award.id,
                  data: { season, grades: [], votingEnabled: true, votingOpen: true },
                },
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
        <p className="text-sm text-muted-foreground">Loading voting…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No voting seasons configured. Add a season to let captains vote 3-2-1
          each round.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((config) => (
            <VotingConfigCard
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

function formatSeasonRange(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

function VotingConfigCard({
  award,
  config,
  onChanged,
}: {
  award: Award;
  config: AwardVotingConfig;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateAwardVotingConfig();
  const remove = useDeleteAwardVotingConfig();
  const finalise = useFinaliseVotingConfig();
  const [grades, setGrades] = useState<string[]>(config.grades);
  const [autoHide, setAutoHide] = useState<string>(
    config.autoHideAfterRounds != null ? String(config.autoHideAfterRounds) : "",
  );
  const [showTally, setShowTally] = useState(false);
  const [showBallots, setShowBallots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalised = config.finalisedAt != null;

  const onError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const patch = (data: Parameters<typeof update.mutate>[0]["data"]) => {
    setError(null);
    update.mutate(
      { id: config.id, data },
      { onSuccess: onChanged, onError },
    );
  };

  const toggleGrade = (g: string) => {
    const next = grades.includes(g) ? grades.filter((x) => x !== g) : [...grades, g];
    setGrades(next);
    patch({ grades: next });
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
            {config.votingOpen ? "Voting open" : "Voting closed"} ·{" "}
            {config.tallyVisible ? "Tally public" : "Tally hidden"}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={remove.isPending}
          onClick={() => {
            if (
              !confirm(
                `Delete voting for ${formatSeasonRange(config.season)}? All ballots will be removed.`,
              )
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
        <Label className="text-xs">Grades tracked for this award</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {GRADES.map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={grades.includes(g)}
                onChange={() => toggleGrade(g)}
                disabled={update.isPending}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.votingOpen}
            onChange={(e) => patch({ votingOpen: e.target.checked })}
            disabled={update.isPending}
          />
          Voting open
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.tallyVisible}
            onChange={(e) => patch({ tallyVisible: e.target.checked })}
            disabled={update.isPending}
          />
          Show live tally publicly
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span>Auto-hide after</span>
          <Input
            type="number"
            className="w-20 h-8"
            value={autoHide}
            placeholder="—"
            onChange={(e) => setAutoHide(e.target.value)}
            onBlur={() =>
              patch({
                autoHideAfterRounds: autoHide === "" ? null : parseInt(autoHide, 10) || null,
              })
            }
          />
          <span>rounds</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowTally((v) => !v);
            if (!showTally)
              queryClient.invalidateQueries({
                queryKey: getGetVotingConfigTallyQueryKey(config.id),
              });
          }}
        >
          {showTally ? "Hide tally" : "View live tally"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowBallots((v) => !v);
            if (!showBallots)
              queryClient.invalidateQueries({
                queryKey: getListVotingConfigBallotsQueryKey(config.id),
              });
          }}
        >
          {showBallots ? "Hide ballots" : "Review ballots"}
        </Button>
        <Button
          size="sm"
          disabled={finalise.isPending}
          onClick={() => {
            if (
              !confirm(
                `Finalise ${award.title} ${formatSeasonRange(config.season)}? The current leader(s) will be recorded as the winner(s) and voting will close.`,
              )
            )
              return;
            setError(null);
            finalise.mutate(
              { id: config.id },
              { onSuccess: onChanged, onError },
            );
          }}
        >
          {finalise.isPending ? "Finalising…" : finalised ? "Re-finalise" : "Finalise winner(s)"}
        </Button>
      </div>

      {showTally && <TallyView configId={config.id} />}
      {showBallots && <BallotsView configId={config.id} finalised={finalised} />}
    </div>
  );
}

function TallyView({ configId }: { configId: number }) {
  const { data, isLoading } = useGetVotingConfigTally(configId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tally…</p>;
  if (!data || data.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No votes submitted yet.
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
            <th className="text-right px-3 py-2">3s</th>
            <th className="text-right px-3 py-2">2s</th>
            <th className="text-right px-3 py-2">1s</th>
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
              <td className="px-3 py-2 text-right text-muted-foreground">{e.firstPlaces}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.secondPlaces}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.thirdPlaces}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitName(id: number, fullName: string): SelectedPlayer {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { id, givenName: fullName.trim(), surname: "" };
  const surname = parts[parts.length - 1];
  const givenName = parts.slice(0, -1).join(" ");
  return { id, givenName, surname };
}

function BallotsView({ configId, finalised }: { configId: number; finalised: boolean }) {
  const { data, isLoading } = useListVotingConfigBallots(configId);
  const [editingId, setEditingId] = useState<number | null>(null);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading ballots…</p>;
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No ballots submitted yet.</p>;
  }
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Captain</th>
            <th className="text-left px-3 py-2">Grade</th>
            <th className="text-right px-3 py-2">Rd</th>
            <th className="text-left px-3 py-2">3 / 2 / 1</th>
            {!finalised && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((b) =>
            editingId === b.id ? (
              <BallotEditRow
                key={b.id}
                configId={configId}
                ballot={b}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <tr key={b.id}>
                <td className="px-3 py-2">{b.captainName}</td>
                <td className="px-3 py-2">{b.grade}</td>
                <td className="px-3 py-2 text-right">{b.round}</td>
                <td className="px-3 py-2">
                  {b.pick1Name} / {b.pick2Name} / {b.pick3Name}
                </td>
                {!finalised && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => setEditingId(b.id)}
                    >
                      Edit
                    </Button>
                    <ClearBallotButton configId={configId} ballotId={b.id} />
                  </td>
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function invalidateBallotsAndTally(
  queryClient: ReturnType<typeof useQueryClient>,
  configId: number,
) {
  queryClient.invalidateQueries({
    queryKey: getListVotingConfigBallotsQueryKey(configId),
  });
  queryClient.invalidateQueries({
    queryKey: getGetVotingConfigTallyQueryKey(configId),
  });
}

function ClearBallotButton({
  configId,
  ballotId,
}: {
  configId: number;
  ballotId: number;
}) {
  const queryClient = useQueryClient();
  const remove = useDeleteConfigBallot();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={remove.isPending}
      onClick={() => {
        if (!confirm("Clear this captain's ballot for this round?")) return;
        remove.mutate(
          { id: configId, ballotId },
          {
            onSuccess: () => invalidateBallotsAndTally(queryClient, configId),
            onError: (e) => {
              const msg = handleAdminMutationError(e);
              if (msg) alert(msg);
            },
          },
        );
      }}
    >
      Clear
    </Button>
  );
}

function BallotEditRow({
  configId,
  ballot,
  onClose,
}: {
  configId: number;
  ballot: {
    id: number;
    captainName: string;
    grade: string;
    round: number;
    pick1PlayerId: number;
    pick2PlayerId: number;
    pick3PlayerId: number;
    pick1Name: string;
    pick2Name: string;
    pick3Name: string;
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateConfigBallot();
  const [pick1, setPick1] = useState<SelectedPlayer | null>(
    splitName(ballot.pick1PlayerId, ballot.pick1Name),
  );
  const [pick2, setPick2] = useState<SelectedPlayer | null>(
    splitName(ballot.pick2PlayerId, ballot.pick2Name),
  );
  const [pick3, setPick3] = useState<SelectedPlayer | null>(
    splitName(ballot.pick3PlayerId, ballot.pick3Name),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (!pick1 || !pick2 || !pick3) {
      setError("Pick three players.");
      return;
    }
    if (new Set([pick1.id, pick2.id, pick3.id]).size !== 3) {
      setError("The three picks must be different players.");
      return;
    }
    update.mutate(
      {
        id: configId,
        ballotId: ballot.id,
        data: {
          pick1PlayerId: pick1.id,
          pick2PlayerId: pick2.id,
          pick3PlayerId: pick3.id,
        },
      },
      {
        onSuccess: () => {
          invalidateBallotsAndTally(queryClient, configId);
          onClose();
        },
        onError: (e) => {
          const msg = handleAdminMutationError(e);
          if (msg) setError(msg);
        },
      },
    );
  };

  return (
    <tr>
      <td className="px-3 py-2 align-top">{ballot.captainName}</td>
      <td className="px-3 py-2 align-top">{ballot.grade}</td>
      <td className="px-3 py-2 text-right align-top">{ballot.round}</td>
      <td className="px-3 py-2" colSpan={2}>
        <div className="space-y-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">3 votes</Label>
              <PlayerTypeahead value={pick1} onChange={setPick1} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">2 votes</Label>
              <PlayerTypeahead value={pick2} onChange={setPick2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">1 vote</Label>
              <PlayerTypeahead value={pick3} onChange={setPick3} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Picks must be players who played that match.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={save}>
              {update.isPending ? "Saving…" : "Save ballot"}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function PointsManager({
  award,
  onAwardChanged,
}: {
  award: Award;
  onAwardChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: configs, isLoading } = useListAwardPointsConfigs(award.id);
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
        <p className="text-sm text-muted-foreground">Loading points config…</p>
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
          onClick={() => {
            if (
              !confirm(
                `Delete points config for ${formatSeasonRange(config.season)}?`,
              )
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
          onClick={() => {
            if (
              !confirm(
                `Finalise ${award.title} ${formatSeasonRange(config.season)}? The current leader(s) will be recorded as the winner(s).`,
              )
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
  const { data, isLoading } = useGetPointsConfigLeaderboard(configId);
  if (isLoading)
    return <p className="text-sm text-muted-foreground">Loading leaderboard…</p>;
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

function WinnersManager({
  award,
  onError,
  onChanged,
}: {
  award: Award;
  onError: (e: unknown) => void;
  onChanged: () => void;
}) {
  const createWinner = useCreateAwardWinner();
  const updateWinner = useUpdateAwardWinner();
  const deleteWinner = useDeleteAwardWinner();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const winners = award.winners;

  const moveWinner = (index: number, dir: -1 | 1) => {
    const a = winners[index];
    const b = winners[index + dir];
    if (!a || !b) return;
    updateWinner.mutate(
      { id: a.id, data: { displayOrder: b.displayOrder } },
      {
        onError,
        onSuccess: () => {
          updateWinner.mutate(
            { id: b.id, data: { displayOrder: a.displayOrder } },
            { onSuccess: onChanged, onError },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Past winners
        </h4>
        <Button
          size="sm"
          variant={showNew ? "outline" : "secondary"}
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancel" : "Add winner"}
        </Button>
      </div>

      {showNew && (
        <div className="rounded-md border border-border bg-background p-4">
          <WinnerForm
            initial={{
              season: new Date().getFullYear(),
              playerId: null,
              name: "",
              displayOrder: (winners[winners.length - 1]?.displayOrder ?? -1) + 1,
              published: true,
            }}
            pending={createWinner.isPending}
            onSubmit={(values) => {
              createWinner.mutate(
                { id: award.id, data: values },
                {
                  onSuccess: () => {
                    setShowNew(false);
                    onChanged();
                  },
                  onError,
                },
              );
            }}
            onCancel={() => setShowNew(false)}
            submitLabel="Add winner"
          />
        </div>
      )}

      {winners.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No winners recorded yet.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {winners.map((w, index) =>
            editingId === w.id ? (
              <div key={w.id} className="p-4 bg-muted/30">
                <WinnerForm
                  initial={{
                    season: w.season,
                    playerId: w.playerId ?? null,
                    name: w.name,
                    displayOrder: w.displayOrder,
                    published: w.published,
                  }}
                  knownName={w.name}
                  pending={updateWinner.isPending}
                  onSubmit={(values) => {
                    updateWinner.mutate(
                      { id: w.id, data: values },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          onChanged();
                        },
                        onError,
                      },
                    );
                  }}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save winner"
                />
              </div>
            ) : (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <span className="font-mono font-bold text-primary">
                    {formatSeason(w.season)}
                  </span>
                  <span className="ml-3 font-semibold">{w.name}</span>
                  {w.playerId != null ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      linked #{w.playerId}
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground italic">
                      free text
                    </span>
                  )}
                  {!w.published && (
                    <span className="ml-2 text-xs rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                      Draft
                    </span>
                  )}
                </div>
                <div className="space-x-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === 0 || updateWinner.isPending}
                    onClick={() => moveWinner(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === winners.length - 1 || updateWinner.isPending}
                    onClick={() => moveWinner(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(w.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deleteWinner.isPending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Remove ${w.name} (${formatSeason(w.season)}) from this award?`,
                        )
                      )
                        return;
                      deleteWinner.mutate(
                        { id: w.id },
                        { onSuccess: onChanged, onError },
                      );
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

function AwardForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  autoKey,
}: {
  initial: AwardFormValues;
  pending: boolean;
  onSubmit: (v: AwardFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  autoKey?: boolean;
}) {
  const [key, setKey] = useState(initial.key);
  const [keyTouched, setKeyTouched] = useState(!autoKey);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [displayOrder, setDisplayOrder] = useState(initial.displayOrder);
  const [mechanism, setMechanism] = useState<AwardMechanism>(initial.mechanism);
  const [published, setPublished] = useState(initial.published);
  const [pointsGrade, setPointsGrade] = useState<string>(
    initial.pointsGrade ?? GRADES[0],
  );

  const effectiveKey = autoKey && !keyTouched ? slugify(title) : key;
  // 3-2-1 voting attaches only to voted awards.
  const votingEnabled = mechanism === "voted";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveKey.trim()) return;
    onSubmit({
      key: effectiveKey.trim(),
      title: title.trim(),
      description: description.trim(),
      displayOrder,
      votingEnabled,
      mechanism,
      published,
      pointsGrade: mechanism === "points" ? pointsGrade : null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Peter Wyllie Medal"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            placeholder="peter-wyllie-medal"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Display order</Label>
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>How is the winner decided?</Label>
          <select
            value={mechanism}
            onChange={(e) => setMechanism(e.target.value as AwardMechanism)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="manual">Manual — admin records the winner</option>
            <option value="voted">Voted — captains vote 3-2-1</option>
            <option value="points">Points — ranked from match stats</option>
          </select>
        </div>
      </div>

      {mechanism === "points" && (
        <div className="space-y-2">
          <Label>Grade scored for points</Label>
          <select
            value={pointsGrade}
            onChange={(e) => setPointsGrade(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm md:w-64"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Leaderboards are computed from this grade's match stats per season.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Visibility</Label>
        <label className="flex items-center gap-2 text-sm pt-1">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published (visible on the website and mobile app)
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !title.trim() || !effectiveKey.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function WinnerForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  knownName,
}: {
  initial: WinnerFormValues;
  pending: boolean;
  onSubmit: (v: WinnerFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  knownName?: string;
}) {
  const [season, setSeason] = useState(initial.season);
  const [name, setName] = useState(initial.name);
  const [published, setPublished] = useState(initial.published);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    initial.playerId != null
      ? { id: initial.playerId, surname: knownName ?? "Linked", givenName: "" }
      : null,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      season,
      playerId: player?.id ?? null,
      name: name.trim(),
      displayOrder: initial.displayOrder,
      published,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="space-y-2">
          <Label>Season (start year)</Label>
          <Input
            type="number"
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value, 10) || 0)}
            min={1900}
            max={2100}
            required
          />
          <p className="text-xs text-muted-foreground">
            Shown as {formatSeason(season || 0)}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Linked player (optional)</Label>
          <PlayerTypeahead
            value={player}
            onChange={(p) => {
              setPlayer(p);
              if (p) setName(`${p.givenName} ${p.surname}`.trim());
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Winner name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type a name (auto-filled when a player is linked)"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        Published (visible publicly)
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
