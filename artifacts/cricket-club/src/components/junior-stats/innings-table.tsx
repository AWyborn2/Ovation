import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

/** The fields every scorecard line exposes that the generic table needs. */
export type InningsLine = { id: number; playerName: string; isHallsHead: boolean };

/** One data column of an innings table (player + actions columns are fixed). */
export type InningsColumn<L> = {
  key: string;
  header: string;
  headerClassName: string;
  cellClassName: string;
  render: (line: L) => React.ReactNode;
};

/**
 * Generic batting / bowling line table (plan.md §5.6 `InningsTable<T>`): a
 * titled section with an add toggle, an inline add form, and rows that flip
 * into an edit row. Mutations stay with the caller — this component only
 * owns the editing/adding UI state and the delete confirmation.
 */
export function InningsTable<L extends InningsLine, P, A>({
  title,
  playerHeader,
  addLabel,
  emptyText,
  columns,
  lines,
  canAdd,
  pending,
  createPending,
  deleteTitle,
  deleteDescription,
  onCreate,
  onUpdate,
  onDelete,
  AddForm,
  EditRow,
}: {
  title: string;
  playerHeader: string;
  addLabel: string;
  emptyText: string;
  columns: InningsColumn<L>[];
  lines: L[];
  canAdd: boolean;
  pending: boolean;
  createPending: boolean;
  deleteTitle: string;
  deleteDescription: (line: L) => string;
  onCreate: (participantId: string, values: A, done: () => void) => void;
  onUpdate: (lineId: number, patch: P, done: () => void) => void;
  onDelete: (lineId: number) => void;
  AddForm: React.ComponentType<{
    pending: boolean;
    onSubmit: (participantId: string, values: A) => void;
  }>;
  EditRow: React.ComponentType<{
    line: L;
    pending: boolean;
    onSave: (patch: P) => void;
    onCancel: () => void;
  }>;
}) {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">{title}</h3>
        {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : addLabel}
          </Button>
        )}
      </div>

      {adding && (
        <AddForm
          pending={createPending}
          onSubmit={(participantId, values) =>
            onCreate(participantId, values, () => setAdding(false))
          }
        />
      )}

      {lines.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-1.5">{playerHeader}</th>
                {columns.map((c) => (
                  <th key={c.key} className={c.headerClassName}>
                    {c.header}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) =>
                editingId === l.id ? (
                  <EditRow
                    key={l.id}
                    line={l}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => onUpdate(l.id, patch, () => setEditingId(null))}
                  />
                ) : (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      {l.playerName}
                      {!l.isHallsHead && (
                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">opposition</span>
                      )}
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.cellClassName}>
                        {c.render(l)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditingId(l.id)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: deleteTitle,
                                description: deleteDescription(l),
                                confirmText: "Delete",
                                destructive: true,
                              }))
                            )
                              return;
                            onDelete(l.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
