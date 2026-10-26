import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPremierships,
  useCreatePremiership,
  useUpdatePremiership,
  useDeletePremiership,
  useLinkPremiershipDecider,
  useListMatches,
  getListPremiershipsQueryKey,
  type MatchSummary,
  type Premiership,
  type PremiershipPlayer,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

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
  matchDate: string;
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
  matchDate: "",
  result: "",
  mom: "",
  notes: "",
  players: [],
});

export default function AdminPremierships() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useListPremierships();
  const create = useCreatePremiership();
  const update = useUpdatePremiership();
  const del = useDeletePremiership();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListPremiershipsQueryKey() });
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  const rows = [...(data ?? [])].sort((a, b) => b.year - a.year || a.grade.localeCompare(b.grade));
  const editing = rows.find((p) => p.id === editingId) ?? null;

  const remove = async (p: Premiership) => {
    if (
      !(await confirm({
        title: "Delete premiership",
        description: `Delete the ${p.year} ${p.grade} premiership?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    del.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const columns: DataTableColumn<Premiership>[] = [
    {
      key: "year",
      header: "Year",
      className: "w-20",
      cell: (p) => <span className="font-semibold tabular-nums">{p.year}</span>,
    },
    { key: "grade", header: "Grade", cell: (p) => p.grade },
    { key: "competition", header: "Competition", cell: (p) => p.competition },
    {
      key: "captain",
      header: "Captain",
      cell: (p) => p.players.find((pp) => pp.isCaptain)?.name ?? "—",
    },
    {
      key: "squad",
      header: "Squad",
      className: "w-20",
      cell: (p) => <span className="tabular-nums">{p.players.length}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : (
        <DataTable
          label="Premierships"
          rows={rows}
          columns={columns}
          getRowId={(p) => p.id}
          searchText={(p) =>
            `${p.year} ${p.grade} ${p.competition} ${p.players.map((pp) => pp.name).join(" ")}`
          }
          searchPlaceholder="Search year, grade or player"
          onRowClick={(p) => setEditingId(p.id)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add premiership
            </Button>
          }
          emptyState={
            <EmptyState
              title="No premierships yet"
              message="Add a premiership to record the club's flags."
            />
          }
          minWidth={600}
        />
      )}

      <EditDrawer wide open={showNew} onOpenChange={setShowNew} title="Add premiership">
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
      </EditDrawer>

      <EditDrawer
        wide
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `${editing.year} · ${editing.grade}` : ""}
        description={editing?.competition}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={del.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <GrandFinalLink prem={editing} onLinked={invalidate} onError={(msg) => setError(msg)} />
        )}
        {editing && (
          <PremForm
            // Remount when a link fills the row, so the form shows what it filled.
            key={`${editing.id}:${editing.matchId ?? ""}:${editing.players.length}`}
            initial={toForm(editing)}
            pending={update.isPending}
            onSubmit={(v) => {
              setError(null);
              update.mutate(
                { id: editing.id, data: toPayload(v) },
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
        )}
      </EditDrawer>
    </div>
  );
}

/** "Grand Final · A Grade · v Mandurah · 15 Mar 2025". */
function matchLabel(m: MatchSummary): string {
  const when = m.matchDate ? ` · ${m.matchDate}` : "";
  const stage = m.stage ?? (m.round != null ? `Round ${m.round}` : "Match");
  return `${stage} · ${m.grade} · v ${m.opponent ?? "?"}${when}`;
}

/**
 * Link the premiership to its grand final (kiosk redesign C5): pick the match
 * from the club's matches that season and fill what the row is missing —
 * venue, date, result and team — without touching what's been entered.
 * Clubs reading from the central database only (the server says otherwise).
 */
function GrandFinalLink({
  prem,
  onLinked,
  onError,
}: {
  prem: Premiership;
  onLinked: () => void;
  onError: (msg: string) => void;
}) {
  // A premiership year is its season's end year; finals can fall either side.
  const before = useListMatches({ season: prem.year - 1 });
  const during = useListMatches({ season: prem.year });
  const link = useLinkPremiershipDecider();
  const [pick, setPick] = useState("");
  const matches = [...(before.data ?? []), ...(during.data ?? [])]
    .filter((m) => !m.abandoned)
    .sort(
      (a, b) =>
        Number(b.stage != null) - Number(a.stage != null) ||
        Number(b.grade === prem.grade) - Number(a.grade === prem.grade) ||
        (b.matchDate ?? "").localeCompare(a.matchDate ?? ""),
    );

  return (
    <section className="mb-6 space-y-2 rounded-lg border bg-muted/30 p-3" aria-label="Grand final">
      <div className="text-sm font-medium">Grand final</div>
      <p className="text-xs text-muted-foreground">
        {prem.matchId != null
          ? "Linked to the grand final scorecard. Pick another match to change it."
          : "Pick the grand final to link its scorecard and fill the venue, date, result and team you haven't entered."}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Grand final match"
          data-testid="select-gf-match"
        >
          <option value="">
            {before.isLoading || during.isLoading ? "Loading matches…" : "Choose a match…"}
          </option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {matchLabel(m)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pick || link.isPending}
          onClick={() =>
            link.mutate(
              { id: prem.id, data: { matchId: Number(pick) } },
              {
                onSuccess: () => {
                  setPick("");
                  onLinked();
                },
                onError: (e) => {
                  const msg = handleAdminMutationError(e);
                  if (msg) onError(msg);
                },
              },
            )
          }
          data-testid="button-link-gf"
        >
          {link.isPending ? "Linking…" : "Link and fill"}
        </Button>
      </div>
    </section>
  );
}

function toForm(p: Premiership): FormValues {
  return {
    year: p.year,
    grade: p.grade,
    competition: p.competition,
    venue: p.venue ?? "",
    matchDate: p.matchDate ?? "",
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
    matchDate: v.matchDate || null,
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
          <Label>Venue (ground)</Label>
          <Input
            value={v.venue}
            placeholder="e.g. Lark Hill Sportsplex"
            onChange={(e) => setF("venue", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Match date</Label>
          <Input
            type="date"
            value={v.matchDate}
            onChange={(e) => setF("matchDate", e.target.value)}
          />
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
                {
                  playerId: p?.id ?? null,
                  name: p ? `${p.givenName} ${p.surname}`.trim() : "",
                  isCaptain: false,
                  battingOrder: null,
                },
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
                onClick={() =>
                  setF(
                    "players",
                    v.players.filter((_, i) => i !== idx),
                  )
                }
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
