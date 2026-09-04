import { useState } from "react";
import {
  useCreateJuniorBowlingLine,
  useUpdateJuniorBowlingLine,
  useDeleteJuniorBowlingLine,
  type JuniorBowlingLine,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { useClubShortName } from "@/lib/brand-context";
import { intOrNull, numOrNull, str } from "./parse";
import { InningsTable, type InningsColumn } from "./innings-table";

export type BowlingPatch = {
  overs?: number | null;
  maidens?: number | null;
  runs?: number | null;
  wickets?: number | null;
  wides?: number | null;
  noBalls?: number | null;
  participantId?: string;
};

export type BowlingAddValues = {
  overs?: number | null;
  maidens?: number | null;
  runs?: number | null;
  wickets?: number | null;
  wides?: number | null;
  noBalls?: number | null;
};

const right = "px-2 py-1.5 text-right";
const mono = "px-2 py-1.5 text-right font-mono";

const BOWLING_COLUMNS: InningsColumn<JuniorBowlingLine>[] = [
  { key: "overs", header: "Overs", headerClassName: right, cellClassName: mono, render: (l) => l.overs ?? "—" },
  { key: "maidens", header: "Mdns", headerClassName: right, cellClassName: mono, render: (l) => l.maidens ?? "—" },
  { key: "runs", header: "Runs", headerClassName: right, cellClassName: mono, render: (l) => l.runs ?? "—" },
  { key: "wickets", header: "Wkts", headerClassName: right, cellClassName: mono, render: (l) => l.wickets ?? "—" },
  { key: "wides", header: "Wides", headerClassName: right, cellClassName: mono, render: (l) => l.wides ?? "—" },
  { key: "noBalls", header: "NBs", headerClassName: right, cellClassName: mono, render: (l) => l.noBalls ?? "—" },
];

export function BowlingTable({
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
  lines: JuniorBowlingLine[];
  canAdd: boolean;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const create = useCreateJuniorBowlingLine();
  const update = useUpdateJuniorBowlingLine();
  const del = useDeleteJuniorBowlingLine();
  const pending = create.isPending || update.isPending || del.isPending;

  return (
    <InningsTable<JuniorBowlingLine, BowlingPatch, BowlingAddValues>
      title="Bowling"
      playerHeader="Bowler"
      addLabel="Add bowling line"
      emptyText="No bowling lines."
      columns={BOWLING_COLUMNS}
      lines={lines}
      canAdd={canAdd}
      pending={pending}
      createPending={create.isPending}
      deleteTitle="Delete bowling line?"
      deleteDescription={(l) =>
        `Remove ${l.playerName}'s bowling line from this innings? The change is journalled and can be reverted.`
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
      AddForm={AddBowlingForm}
      EditRow={BowlingEditRow}
    />
  );
}

export function BowlingEditRow({
  line,
  pending,
  onSave,
  onCancel,
}: {
  line: JuniorBowlingLine;
  pending: boolean;
  onSave: (patch: BowlingPatch) => void;
  onCancel: () => void;
}) {
  const [overs, setOvers] = useState(str(line.overs));
  const [maidens, setMaidens] = useState(str(line.maidens));
  const [runs, setRuns] = useState(str(line.runs));
  const [wickets, setWickets] = useState(str(line.wickets));
  const [wides, setWides] = useState(str(line.wides));
  const [noBalls, setNoBalls] = useState(str(line.noBalls));
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
        <Input
          value={overs}
          onChange={(e) => setOvers(e.target.value)}
          className="w-16 text-right"
          title="Ball notation, e.g. 3.4 = 3 overs 4 balls"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={maidens} onChange={(e) => setMaidens(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-16 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={wickets} onChange={(e) => setWickets(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={wides} onChange={(e) => setWides(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={noBalls} onChange={(e) => setNoBalls(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex gap-1">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              onSave({
                overs: numOrNull(overs),
                maidens: intOrNull(maidens),
                runs: intOrNull(runs),
                wickets: intOrNull(wickets),
                wides: intOrNull(wides),
                noBalls: intOrNull(noBalls),
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

export function AddBowlingForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (participantId: string, values: BowlingAddValues) => void;
}) {
  const clubShort = useClubShortName();
  const [player, setPlayer] = useState<SelectedJuniorPlayer | null>(null);
  const [overs, setOvers] = useState("");
  const [runs, setRuns] = useState("");
  const [wickets, setWickets] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="space-y-1 min-w-64">
        <Label>{clubShort} junior</Label>
        <JuniorPlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="space-y-1">
        <Label>Overs</Label>
        <Input
          value={overs}
          onChange={(e) => setOvers(e.target.value)}
          className="w-20"
          title="Ball notation, e.g. 3.4 = 3 overs 4 balls"
        />
      </div>
      <div className="space-y-1">
        <Label>Runs</Label>
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-20" />
      </div>
      <div className="space-y-1">
        <Label>Wickets</Label>
        <Input value={wickets} onChange={(e) => setWickets(e.target.value)} className="w-20" />
      </div>
      <Button
        disabled={pending || !player}
        onClick={() =>
          player &&
          onSubmit(player.participantId, {
            overs: numOrNull(overs),
            runs: intOrNull(runs),
            wickets: intOrNull(wickets),
          })
        }
      >
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}
