import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPremierships,
  useCreatePremiership,
  useUpdatePremiership,
  useDeletePremiership,
  getListPremiershipsQueryKey,
  type Premiership,
  type PremiershipPlayer,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

type FormPlayer = {
  playerId: number | null;
  name: string;
  isCaptain: boolean;
  battingOrder: number | null;
};

type FormValues = {
  year: number;
  grade: string;
  competition: string;
  venue: string;
  result: string;
  mom: string;
  notes: string;
  players: FormPlayer[];
};

const emptyForm = (): FormValues => ({
  year: new Date().getFullYear(),
  grade: "A Grade",
  competition: "Grand Final",
  venue: "",
  result: "",
  mom: "",
  notes: "",
  players: [],
});

export default function AdminPremierships() {
  const qc = useQueryClient();
  const { data, isLoading } = useListPremierships();
  const create = useCreatePremiership();
  const update = useUpdatePremiership();
  const del = useDeletePremiership();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListPremiershipsQueryKey() });
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-serif font-bold">Premierships</h1>
        <Button onClick={() => setShowNew((v) => !v)}>{showNew ? "Close" : "Add premiership"}</Button>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNew && (
        <PremForm
          initial={emptyForm()}
          pending={create.isPending}
          onSubmit={(v) => {
            setError(null);
            create.mutate(
              { data: toPayload(v) },
              {
                onSuccess: () => {
                  setShowNew(false);
                  invalidate();
                },
                onError: onErr,
              },
            );
          }}
          onCancel={() => setShowNew(false)}
          submitLabel="Create"
        />
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        data?.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row justify-between items-start gap-3">
              <CardTitle>
                {p.year} · {p.grade} · {p.competition}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                >
                  {editingId === p.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm(`Delete the ${p.year} ${p.grade} premiership?`)) return;
                    setError(null);
                    del.mutate({ id: p.id }, { onSuccess: invalidate, onError: onErr });
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {editingId === p.id ? (
                <PremForm
                  initial={toForm(p)}
                  pending={update.isPending}
                  onSubmit={(v) => {
                    setError(null);
                    update.mutate(
                      { id: p.id, data: toPayload(v) },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          invalidate();
                        },
                        onError: onErr,
                      },
                    );
                  }}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save"
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {p.venue && <div>{p.venue}</div>}
                  {p.result && <div>Result: {p.result}</div>}
                  {p.mom && <div>MOM: {p.mom}</div>}
                  <div className="mt-2">
                    Squad: {p.players.length}{" "}
                    {p.players.some((pp) => pp.isCaptain) && (
                      <>· Captain: {p.players.find((pp) => pp.isCaptain)?.name}</>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function toForm(p: Premiership): FormValues {
  return {
    year: p.year,
    grade: p.grade,
    competition: p.competition,
    venue: p.venue ?? "",
    result: p.result ?? "",
    mom: p.mom ?? "",
    notes: p.notes ?? "",
    players: p.players.map((pp: PremiershipPlayer) => ({
      playerId: pp.playerId ?? null,
      name: pp.name,
      isCaptain: pp.isCaptain,
      battingOrder: pp.battingOrder ?? null,
    })),
  };
}

function toPayload(v: FormValues) {
  return {
    year: v.year,
    grade: v.grade,
    competition: v.competition,
    venue: v.venue || null,
    result: v.result || null,
    mom: v.mom || null,
    notes: v.notes || null,
    players: v.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      isCaptain: p.isCaptain,
      battingOrder: p.battingOrder,
    })),
  };
}

function PremForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormValues;
  pending: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const setF = <K extends keyof FormValues>(k: K, val: FormValues[K]) =>
    setV((x) => ({ ...x, [k]: val }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Year</Label>
          <Input
            type="number"
            value={v.year}
            onChange={(e) => setF("year", parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label>Grade</Label>
          <Input value={v.grade} onChange={(e) => setF("grade", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Competition</Label>
          <Input value={v.competition} onChange={(e) => setF("competition", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Venue</Label>
          <Input value={v.venue} onChange={(e) => setF("venue", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Result</Label>
          <Input value={v.result} onChange={(e) => setF("result", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>MOM</Label>
          <Input value={v.mom} onChange={(e) => setF("mom", e.target.value)} />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Squad</Label>
          <AddSquadPlayer
            onAdd={(p) =>
              setF("players", [
                ...v.players,
                { playerId: p?.id ?? null, name: p ? `${p.givenName} ${p.surname}`.trim() : "", isCaptain: false, battingOrder: null },
              ])
            }
          />
        </div>
        <div className="space-y-2">
          {v.players.map((pp, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-2 border-b pb-2 last:border-0">
              <div className="space-y-1 flex-1 min-w-40">
                <Label className="text-xs">Name</Label>
                <Input
                  value={pp.name}
                  onChange={(e) => {
                    const next = [...v.players];
                    next[idx] = { ...pp, name: e.target.value };
                    setF("players", next);
                  }}
                />
              </div>
              <div className="space-y-1 w-24">
                <Label className="text-xs">Bat #</Label>
                <Input
                  type="number"
                  value={pp.battingOrder ?? ""}
                  onChange={(e) => {
                    const next = [...v.players];
                    next[idx] = {
                      ...pp,
                      battingOrder: e.target.value ? parseInt(e.target.value, 10) : null,
                    };
                    setF("players", next);
                  }}
                />
              </div>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={pp.isCaptain}
                  onChange={(e) => {
                    const next = [...v.players];
                    next[idx] = { ...pp, isCaptain: e.target.checked };
                    setF("players", next);
                  }}
                />
                Captain
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setF("players", v.players.filter((_, i) => i !== idx))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onSubmit(v)} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AddSquadPlayer({ onAdd }: { onAdd: (p: SelectedPlayer | null) => void }) {
  const [picker, setPicker] = useState<SelectedPlayer | null>(null);
  return (
    <div className="flex gap-2 items-end">
      <div className="w-64">
        <PlayerTypeahead value={picker} onChange={setPicker} />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          onAdd(picker);
          setPicker(null);
        }}
      >
        + Add
      </Button>
    </div>
  );
}
