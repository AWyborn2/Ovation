import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCaps,
  useCreateCap,
  useUpdateCap,
  useDeleteCap,
  getListCapsQueryKey,
  useListPlayers,
  getListPlayersQueryKey,
} from "@workspace/api-client-react";
import type { CapEntry, CapCategory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

export default function AdminCaps() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading } = useListCaps();
  const createCap = useCreateCap();
  const updateCap = useUpdateCap();
  const deleteCap = useDeleteCap();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CapCategory>("male");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCapsQueryKey() });
  };

  const inCategory = useMemo(
    () => (caps ?? []).filter((c) => (c.category ?? "male") === category),
    [caps, category],
  );

  const nextCapNumber = useMemo(() => {
    if (inCategory.length === 0) return 1;
    return Math.max(...inCategory.map((c) => c.capNumber)) + 1;
  }, [inCategory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inCategory;
    return inCategory.filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.capNumber).includes(q),
    );
  }, [inCategory, search]);

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold">Admin · A Grade Caps</h1>
          <p className="text-muted-foreground mt-1">
            Manage the A Grade cap lists. Changes apply immediately to the public honour boards page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="admin-cap-category">List</Label>
          <select
            id="admin-cap-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as CapCategory);
              setEditingId(null);
            }}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
          >
            <option value="male">A Grade Male</option>
            <option value="female">A Grade Female</option>
          </select>
        </div>
      </div>

      <AddCapForm
        key={category}
        nextCapNumber={nextCapNumber}
        onCreate={(values) => {
          setError(null);
          createCap.mutate(
            { data: { ...values, category } },
            {
              onSuccess: invalidate,
              onError: onMutationError,
            },
          );
        }}
        pending={createCap.isPending}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {category === "female" ? "A Grade Female" : "A Grade Male"}{" "}
            <span className="text-muted-foreground text-sm font-normal">({inCategory.length} entries)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Filter by name or cap number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !filtered.length ? (
            <p className="text-sm text-muted-foreground italic">No cap entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4 w-20">Cap #</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Linked player</th>
                    <th className="py-2 pr-4 w-20">Games</th>
                    <th className="py-2 pr-4 w-24">Status</th>
                    <th className="py-2 pr-4 w-40 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cap) =>
                    editingId === cap.id ? (
                      <EditCapRow
                        key={cap.id}
                        cap={cap}
                        pending={updateCap.isPending}
                        onCancel={() => setEditingId(null)}
                        onSave={(values) => {
                          setError(null);
                          updateCap.mutate(
                            { id: cap.id, data: values },
                            {
                              onSuccess: () => {
                                setEditingId(null);
                                invalidate();
                              },
                              onError: onMutationError,
                            },
                          );
                        }}
                      />
                    ) : (
                      <tr key={cap.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono font-bold">{cap.capNumber}</td>
                        <td className="py-2 pr-4">
                          {cap.name}
                          {cap.deceased && <span className="ml-1 text-muted-foreground" title="Deceased">✝</span>}
                        </td>
                        <td className="py-2 pr-4">
                          {cap.playerId != null ? (
                            <LinkedPlayerLabel playerId={cap.playerId} />
                          ) : (
                            <span className="text-muted-foreground italic">— unmatched —</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 font-mono">{cap.inStats ? cap.gamesAGrade : "—"}</td>
                        <td className="py-2 pr-4">
                          {cap.playerId != null ? (
                            <span className="text-green-700 dark:text-green-400">✓ matched</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">○ no link</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(cap.id)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!confirm(`Delete cap #${cap.capNumber} (${cap.name})?`)) return;
                              setError(null);
                              deleteCap.mutate(
                                { id: cap.id },
                                { onSuccess: invalidate, onError: onMutationError },
                              );
                            }}
                            disabled={deleteCap.isPending}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinkedPlayerLabel({ playerId }: { playerId: number }) {
  const params = useMemo(() => ({ page: 1, limit: 1 }), []);
  const { data } = useListPlayers(params, {
    query: { enabled: false, queryKey: getListPlayersQueryKey(params) },
  });
  void data;
  return <span className="font-mono text-xs text-muted-foreground">player #{playerId}</span>;
}

type CapFormValues = {
  capNumber: number;
  name: string;
  deceased: boolean;
  playerId: number | null;
  gamesAGrade: number;
  inStats: boolean;
};

function AddCapForm({
  nextCapNumber,
  onCreate,
  pending,
}: {
  nextCapNumber: number;
  onCreate: (v: CapFormValues) => void;
  pending: boolean;
}) {
  const [capNumber, setCapNumber] = useState<number>(nextCapNumber);
  const [name, setName] = useState("");
  const [deceased, setDeceased] = useState(false);
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  const [gamesAGrade, setGamesAGrade] = useState<number>(0);
  const [inStats, setInStats] = useState(false);

  // Keep capNumber synced with computed next when user hasn't typed
  useMemo(() => setCapNumber(nextCapNumber), [nextCapNumber]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      capNumber,
      name: name.trim(),
      deceased,
      playerId: player?.id ?? null,
      gamesAGrade: Number.isFinite(gamesAGrade) ? gamesAGrade : 0,
      inStats,
    });
    setName("");
    setDeceased(false);
    setPlayer(null);
    setGamesAGrade(0);
    setInStats(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add cap entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[100px_1fr_1fr_120px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="cap-number">Cap #</Label>
            <Input
              id="cap-number"
              type="number"
              value={capNumber}
              onChange={(e) => setCapNumber(parseInt(e.target.value, 10))}
              min={1}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cap-name">Player name</Label>
            <Input id="cap-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Linked player (optional)</Label>
            <PlayerTypeahead value={player} onChange={setPlayer} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cap-games">Games</Label>
            <Input
              id="cap-games"
              type="number"
              value={gamesAGrade}
              onChange={(e) => setGamesAGrade(parseInt(e.target.value, 10))}
              min={0}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deceased}
                onChange={(e) => setDeceased(e.target.checked)}
              />
              Deceased
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={inStats}
                onChange={(e) => setInStats(e.target.checked)}
              />
              On record
            </label>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Adding…" : "Add cap"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EditCapRow({
  cap,
  pending,
  onCancel,
  onSave,
}: {
  cap: CapEntry;
  pending: boolean;
  onCancel: () => void;
  onSave: (v: CapFormValues) => void;
}) {
  const [capNumber, setCapNumber] = useState(cap.capNumber);
  const [name, setName] = useState(cap.name);
  const [deceased, setDeceased] = useState(cap.deceased);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    cap.playerId != null ? { id: cap.playerId, surname: "Linked", givenName: "player" } : null,
  );
  const [gamesAGrade, setGamesAGrade] = useState(cap.gamesAGrade);
  const [inStats, setInStats] = useState(cap.inStats);

  return (
    <tr className="border-b last:border-0 bg-muted/30">
      <td className="py-2 pr-4">
        <Input
          type="number"
          value={capNumber}
          onChange={(e) => setCapNumber(parseInt(e.target.value, 10))}
          className="w-20"
        />
      </td>
      <td className="py-2 pr-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="py-2 pr-4">
        <PlayerTypeahead value={player} onChange={setPlayer} />
      </td>
      <td className="py-2 pr-4">
        <Input
          type="number"
          value={gamesAGrade}
          onChange={(e) => setGamesAGrade(parseInt(e.target.value, 10))}
          min={0}
          className="w-20"
        />
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={deceased}
              onChange={(e) => setDeceased(e.target.checked)}
            />
            Deceased
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={inStats}
              onChange={(e) => setInStats(e.target.checked)}
            />
            On record
          </label>
        </div>
      </td>
      <td className="py-2 pr-4 text-right space-x-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              capNumber,
              name: name.trim(),
              deceased,
              playerId: player?.id ?? null,
              gamesAGrade: Number.isFinite(gamesAGrade) ? gamesAGrade : 0,
              inStats,
            })
          }
          disabled={pending || !name.trim()}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </td>
    </tr>
  );
}
