import { useState } from "react";
import {
  useCreateJuniorBattingLine,
  useUpdateJuniorBattingLine,
  useDeleteJuniorBattingLine,
  type JuniorBattingLine,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { useClubShortName } from "@/lib/brand-context";
import { intOrNull, str } from "./parse";
import { InningsTable, type InningsColumn } from "./innings-table";

export type BattingPatch = {
  runs?: number | null;
  balls?: number | null;
  fours?: number | null;
  sixes?: number | null;
  dismissal?: string | null;
  batOrder?: number | null;
  participantId?: string;
};

export type BattingAddValues = {
  runs?: number | null;
  balls?: number | null;
  fours?: number | null;
  sixes?: number | null;
  dismissal?: string | null;
  batOrder?: number | null;
};

const right = "px-2 py-1.5 text-right";
const mono = "px-2 py-1.5 text-right font-mono";

const BATTING_COLUMNS: InningsColumn<JuniorBattingLine>[] = [
  { key: "runs", header: "Runs", headerClassName: right, cellClassName: mono, render: (l) => l.runs ?? "—" },
  { key: "balls", header: "Balls", headerClassName: right, cellClassName: mono, render: (l) => l.balls ?? "—" },
  { key: "fours", header: "4s", headerClassName: right, cellClassName: mono, render: (l) => l.fours ?? "—" },
  { key: "sixes", header: "6s", headerClassName: right, cellClassName: mono, render: (l) => l.sixes ?? "—" },
  {
    key: "dismissal",
    header: "Dismissal",
    headerClassName: "px-2 py-1.5",
    cellClassName: "px-2 py-1.5",
    render: (l) => l.dismissal ?? "—",
  },
  { key: "batOrder", header: "Order", headerClassName: right, cellClassName: mono, render: (l) => l.batOrder ?? "—" },
];

export function BattingTable({
  matchId,
  innings,
  lines,
  canAdd,
  onSaved,
  onError,
  clearError,
}: {
  matchId: number;
  innings: number;
  lines: JuniorBattingLine[];
  canAdd: boolean;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const create = useCreateJuniorBattingLine();
  const update = useUpdateJuniorBattingLine();
  const del = useDeleteJuniorBattingLine();
  const pending = create.isPending || update.isPending || del.isPending;

  return (
    <InningsTable<JuniorBattingLine, BattingPatch, BattingAddValues>
      title="Batting"
      playerHeader="Batter"
      addLabel="Add batting line"
      emptyText="No batting lines."
      columns={BATTING_COLUMNS}
      lines={lines}
      canAdd={canAdd}
      pending={pending}
      createPending={create.isPending}
      deleteTitle="Delete batting line?"
      deleteDescription={(l) =>
        `Remove ${l.playerName}'s batting line from this innings? The change is journalled and can be reverted.`
      }
      onCreate={(participantId, values, done) => {
        clearError();
        create.mutate(
          { matchId, data: { innings, participantId, ...values } },
          {
            onSuccess: () => {
              done();
              onSaved();
            },
            onError,
          },
        );
      }}
      onUpdate={(lineId, patch, done) => {
        clearError();
        update.mutate(
          { matchId, lineId, data: patch },
          {
            onSuccess: () => {
              done();
              onSaved();
            },
            onError,
          },
        );
      }}
      onDelete={(lineId) => {
        clearError();
        del.mutate({ matchId, lineId }, { onSuccess: onSaved, onError });
      }}
      AddForm={AddBattingForm}
      EditRow={BattingEditRow}
    />
  );
}

export function BattingEditRow({
  line,
  pending,
  onSave,
  onCancel,
}: {
  line: JuniorBattingLine;
  pending: boolean;
  onSave: (patch: BattingPatch) => void;
  onCancel: () => void;
}) {
  const [runs, setRuns] = useState(str(line.runs));
  const [balls, setBalls] = useState(str(line.balls));
  const [fours, setFours] = useState(str(line.fours));
  const [sixes, setSixes] = useState(str(line.sixes));
  const [dismissal, setDismissal] = useState(line.dismissal ?? "");
  const [batOrder, setBatOrder] = useState(str(line.batOrder));
  const [reattribute, setReattribute] = useState<SelectedJuniorPlayer | null>(null);

  return (
    <tr className="border-b last:border-0 bg-muted/30">
      <td className="px-2 py-1.5">
        {line.isHallsHead && !line.isPrivate ? (
          <div className="min-w-56">
            <JuniorPlayerTypeahead
              value={reattribute}
              onChange={setReattribute}
              placeholder={`${line.playerName} — search to re-attribute`}
            />
          </div>
        ) : (
          line.playerName
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-16 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={balls} onChange={(e) => setBalls(e.target.value)} className="w-16 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={fours} onChange={(e) => setFours(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={sixes} onChange={(e) => setSixes(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={dismissal} onChange={(e) => setDismissal(e.target.value)} className="w-40" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={batOrder} onChange={(e) => setBatOrder(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex gap-1">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              onSave({
                runs: intOrNull(runs),
                balls: intOrNull(balls),
                fours: intOrNull(fours),
                sixes: intOrNull(sixes),
                dismissal: dismissal.trim() === "" ? null : dismissal,
                batOrder: intOrNull(batOrder),
                ...(reattribute ? { participantId: reattribute.participantId } : {}),
              })
            }
          >
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function AddBattingForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (participantId: string, values: BattingAddValues) => void;
}) {
  const clubShort = useClubShortName();
  const [player, setPlayer] = useState<SelectedJuniorPlayer | null>(null);
  const [runs, setRuns] = useState("");
  const [balls, setBalls] = useState("");
  const [dismissal, setDismissal] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="space-y-1 min-w-64">
        <Label>{clubShort} junior</Label>
        <JuniorPlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="space-y-1">
        <Label>Runs</Label>
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-20" />
      </div>
      <div className="space-y-1">
        <Label>Balls</Label>
        <Input value={balls} onChange={(e) => setBalls(e.target.value)} className="w-20" />
      </div>
      <div className="space-y-1">
        <Label>Dismissal</Label>
        <Input value={dismissal} onChange={(e) => setDismissal(e.target.value)} className="w-40" />
      </div>
      <Button
        disabled={pending || !player}
        onClick={() =>
          player &&
          onSubmit(player.participantId, {
            runs: intOrNull(runs),
            balls: intOrNull(balls),
            dismissal: dismissal.trim() === "" ? null : dismissal,
          })
        }
      >
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}
