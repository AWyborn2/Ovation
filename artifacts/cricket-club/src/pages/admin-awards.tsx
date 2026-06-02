import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAwards,
  useCreateAward,
  useUpdateAward,
  useDeleteAward,
  useCreateAwardWinner,
  useUpdateAwardWinner,
  useDeleteAwardWinner,
  getListAwardsQueryKey,
} from "@workspace/api-client-react";
import type { Award, AwardWinner } from "@workspace/api-client-react";
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
};

type WinnerFormValues = {
  season: number;
  playerId: number | null;
  name: string;
  displayOrder: number;
};

export default function AdminAwards() {
  const queryClient = useQueryClient();
  const { data: awards, isLoading } = useListAwards();
  const createAward = useCreateAward();
  const updateAward = useUpdateAward();
  const deleteAward = useDeleteAward();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAwardsQueryKey() });
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
          <h1 className="text-3xl font-serif font-bold">Admin · Awards</h1>
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
                  {award.votingEnabled && (
                    <span className="ml-2 align-middle text-xs font-normal rounded bg-primary/15 text-primary px-2 py-0.5">
                      Voting on
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
            </CardContent>
          </Card>
        ))
      )}
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
  const [votingEnabled, setVotingEnabled] = useState(initial.votingEnabled);

  const effectiveKey = autoKey && !keyTouched ? slugify(title) : key;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveKey.trim()) return;
    onSubmit({
      key: effectiveKey.trim(),
      title: title.trim(),
      description: description.trim(),
      displayOrder,
      votingEnabled,
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
          <Label>Voting</Label>
          <label className="flex items-center gap-2 text-sm pt-2">
            <input
              type="checkbox"
              checked={votingEnabled}
              onChange={(e) => setVotingEnabled(e.target.checked)}
            />
            Voting enabled (3-2-1 voting can attach to this award)
          </label>
        </div>
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
