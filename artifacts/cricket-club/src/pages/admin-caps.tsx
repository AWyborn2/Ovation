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
import type { CapEntry } from "@workspace/api-client-react";
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCapsQueryKey() });
  };

  const nextCapNumber = useMemo(() => {
    if (!caps || caps.length === 0) return 1;
    return Math.max(...caps.map((c) => c.capNumber)) + 1;
  }, [caps]);

  const filtered = useMemo(() => {
    if (!caps) return [];
    const q = search.trim().toLowerCase();
    if (!q) return caps;
    return caps.filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.capNumber).includes(q),
    );
  }, [caps, search]);

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Admin · Cap Register</h1>
        <p className="text-muted-foreground mt-1">
          Manage the A Grade Cap Register. Changes apply immediately to the public honour boards page.
        </p>
      </div>

      <AddCapForm
        nextCapNumber={nextCapNumber}
        onCreate={(values) => {
          setError(null);
          createCap.mutate(
            { data: values },
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
          <CardTitle>Cap Register {caps && <span className="text-muted-foreground text-sm font-normal">({caps.length} entries)</span>}</CardTitle>
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

function AddCapForm({
  nextCapNumber,
  onCreate,
  pending,
}: {
  nextCapNumber: number;
  onCreate: (v: { capNumber: number; name: string; deceased: boolean; playerId: number | null }) => void;
  pending: boolean;
}) {
  const [capNumber, setCapNumber] = useState<number>(nextCapNumber);
  const [name, setName] = useState("");
  const [deceased, setDeceased] = useState(false);
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);

  // Keep capNumber synced with computed next when user hasn't typed
  useMemo(() => setCapNumber(nextCapNumber), [nextCapNumber]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ capNumber, name: name.trim(), deceased, playerId: player?.id ?? null });
    setName("");
    setDeceased(false);
    setPlayer(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add cap entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[100px_1fr_1fr_auto] md:items-end">
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
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deceased}
                onChange={(e) => setDeceased(e.target.checked)}
              />
              Deceased
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
  onSave: (v: { capNumber: number; name: string; deceased: boolean; playerId: number | null }) => void;
}) {
  const [capNumber, setCapNumber] = useState(cap.capNumber);
  const [name, setName] = useState(cap.name);
  const [deceased, setDeceased] = useState(cap.deceased);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    cap.playerId != null ? { id: cap.playerId, surname: "Linked", givenName: "player" } : null,
  );

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
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={deceased}
            onChange={(e) => setDeceased(e.target.checked)}
          />
          Deceased
        </label>
      </td>
      <td className="py-2 pr-4 text-right space-x-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({ capNumber, name: name.trim(), deceased, playerId: player?.id ?? null })
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
