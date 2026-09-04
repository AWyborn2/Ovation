import { useMemo } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type {
  CompositeColumnRef,
  CompositeDef,
  DisplayBoard,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Editor for a composite (side-by-side columns) board definition. */
export function CompositeEditor({
  composite,
  sourceBoards,
  onPatch,
  onRemove,
}: {
  composite: CompositeDef;
  sourceBoards: DisplayBoard[];
  onPatch: (patch: Partial<CompositeDef>) => void;
  onRemove: () => void;
}) {
  const sourceById = useMemo(
    () => new Map(sourceBoards.map((b) => [b.id, b])),
    [sourceBoards],
  );

  // Season-aligned needs every chosen column to be a season-based list board.
  const seasonEligible =
    composite.columns.length >= 2 &&
    composite.columns.every((col) => {
      const b = sourceById.get(col.boardId);
      return (
        !!b &&
        b.entries.length > 0 &&
        b.entries.every((e) => (e.season ?? "").trim() !== "")
      );
    });

  const setCol = (i: number, patch: Partial<CompositeColumnRef>) =>
    onPatch({
      columns: composite.columns.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c,
      ),
    });
  const addCol = () =>
    onPatch({ columns: [...composite.columns, { boardId: "", heading: "" }] });
  const removeCol = (i: number) =>
    onPatch({ columns: composite.columns.filter((_, idx) => idx !== i) });
  const moveCol = (i: number, dir: -1 | 1) => {
    const next = composite.columns.slice();
    const t = i + dir;
    if (t < 0 || t >= next.length) return;
    [next[i], next[t]] = [next[t]!, next[i]!];
    onPatch({ columns: next });
  };

  return (
    <div
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
      data-testid={`composite-${composite.id}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">Title</span>
          <Input
            value={composite.title}
            placeholder="e.g. Club Captains"
            onChange={(e) => onPatch({ title: e.target.value })}
            data-testid={`composite-title-${composite.id}`}
          />
        </label>
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">
            Subtitle (optional)
          </span>
          <Input
            value={composite.subtitle ?? ""}
            onChange={(e) => onPatch({ subtitle: e.target.value })}
            data-testid={`composite-subtitle-${composite.id}`}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onRemove}
          data-testid={`composite-remove-${composite.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={composite.seasonAligned}
            onChange={(e) => onPatch({ seasonAligned: e.target.checked })}
            data-testid={`composite-seasonaligned-${composite.id}`}
          />
          <span className="text-muted-foreground">Season-aligned</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Transition</span>
          <select
            className="px-2 py-1 rounded border bg-background text-sm"
            value={composite.transition ?? "slide"}
            onChange={(e) =>
              onPatch({ transition: e.target.value as "scroll" | "slide" })
            }
            data-testid={`composite-transition-${composite.id}`}
          >
            <option value="scroll">Scroll</option>
            <option value="slide">Slide</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={composite.fit ?? true}
            onChange={(e) => onPatch({ fit: e.target.checked })}
            data-testid={`composite-fit-${composite.id}`}
          />
          <span className="text-muted-foreground">Full width</span>
        </label>
      </div>

      {composite.seasonAligned && !seasonEligible && (
        <p className="text-xs text-amber-600">
          Season-aligned won't apply until every column is a season-based list
          board — it will fall back to plain side-by-side columns.
        </p>
      )}

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Columns</span>
        {composite.columns.map((col, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground w-5">
              {i + 1}
            </span>
            <select
              className="px-2 py-1.5 rounded border bg-background text-sm min-w-[12rem]"
              value={col.boardId}
              onChange={(e) => {
                const board = sourceById.get(e.target.value);
                setCol(i, {
                  boardId: e.target.value,
                  heading: col.heading || board?.title || "",
                });
              }}
              data-testid={`composite-col-board-${composite.id}-${i}`}
            >
              <option value="">Select a list board…</option>
              {sourceBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <Input
              className="flex-1 min-w-[10rem]"
              value={col.heading}
              placeholder="Column heading"
              onChange={(e) => setCol(i, { heading: e.target.value })}
              data-testid={`composite-col-heading-${composite.id}-${i}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={i === 0}
              onClick={() => moveCol(i, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={i === composite.columns.length - 1}
              onClick={() => moveCol(i, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => removeCol(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCol}
          data-testid={`composite-add-col-${composite.id}`}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add column
        </Button>
      </div>
    </div>
  );
}
