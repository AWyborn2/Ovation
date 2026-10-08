import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  kindFields,
  rowsCapacity,
  type TemplateTextStyle,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { layersOf, type EditorDoc } from "./document";
import { setRows, setRowsCell, setVariantStyle } from "./template-ops";
import { TextStyleBar } from "./text-style-bar";

const input =
  "h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]";

const VARIANT_LABEL: Record<string, string> = {
  club: "Your club's row",
  junior: "Junior rows",
};

/**
 * The list element's settings (R8): the row height and gap, the cells across
 * the row (which field, where, how wide, styled), and per-variant styles such
 * as the club's own row on a ladder. One row is styled; it repeats per row.
 */
export function RowsPanel({
  doc,
  layer,
  kind,
  size,
  onEdit,
}: {
  doc: EditorDoc;
  layer: FreeLayer;
  kind: string;
  size: CardSize;
  onEdit: (next: EditorDoc) => void;
}) {
  const spec = layer.rows!;
  const repeat = kindFields(kind)?.repeats.find((r) => r.key === spec.repeat);
  const fields = repeat?.fields ?? [];
  const variants = repeat?.variants ?? [];
  const [cellIndex, setCellIndex] = useState(0);
  const [variant, setVariant] = useState<string | null>(null);
  const cell = spec.cells[cellIndex] ?? null;
  const live = layersOf(doc).find((l) => l.id === layer.id) ?? layer;
  const capacity = rowsCapacity(live, size);
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== "" ? n : fallback;
  };

  const variantStyle: TemplateTextStyle | undefined =
    variant && cell ? spec.variants?.[variant]?.[cell.field] : undefined;

  return (
    <section
      aria-label="List settings"
      className="mt-2 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{repeat?.label ?? spec.repeat}</span>
        <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
          Row height
          <input
            type="number"
            aria-label="Row height"
            min={2}
            max={40}
            step={0.5}
            value={spec.rowHeight}
            onChange={(e) =>
              onEdit(setRows(doc, layer.id, { rowHeight: Math.max(2, num(e.target.value, 7)) }))
            }
            className={cn(input, "w-16")}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
          Gap
          <input
            type="number"
            aria-label="Row gap"
            min={0}
            max={20}
            step={0.5}
            value={spec.gap ?? 0}
            onChange={(e) =>
              onEdit(setRows(doc, layer.id, { gap: Math.max(0, num(e.target.value, 0)) }))
            }
            className={cn(input, "w-16")}
          />
        </label>
        <span className="text-xs text-[var(--ed-ink2)]">
          {capacity} {capacity === 1 ? "row fits" : "rows fit"} on this size
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Row cells">
        {spec.cells.map((c, i) => (
          <button
            key={`${c.field}-${i}`}
            type="button"
            aria-pressed={i === cellIndex}
            onClick={() => setCellIndex(i)}
            className={cn(
              "rounded-full border border-[var(--ed-line)] px-3 py-1 text-xs font-semibold",
              i === cellIndex && "border-[var(--ed-accent)] bg-[var(--ed-card)]",
            )}
          >
            {fields.find((f) => f.key === c.field)?.label ?? c.field}
          </button>
        ))}
        <button
          type="button"
          aria-label="Add a cell"
          className="grid h-7 w-7 place-items-center rounded-full border border-[var(--ed-line)]"
          onClick={() => {
            const unused = fields.find((f) => !spec.cells.some((c) => c.field === f.key));
            const cells = [
              ...spec.cells,
              { field: (unused ?? fields[0])?.key ?? "", x: 80, w: 20, style: { fontSize: 3.6 } },
            ];
            onEdit(setRows(doc, layer.id, { cells }));
            setCellIndex(cells.length - 1);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {cell && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Cell field"
            value={cell.field}
            onChange={(e) =>
              onEdit(setRowsCell(doc, layer.id, cellIndex, { field: e.target.value }))
            }
            className={input}
          >
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
            From
            <input
              type="number"
              aria-label="Cell left"
              min={0}
              max={100}
              value={cell.x}
              onChange={(e) =>
                onEdit(setRowsCell(doc, layer.id, cellIndex, { x: num(e.target.value, cell.x) }))
              }
              className={cn(input, "w-16")}
            />
            %
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
            Width
            <input
              type="number"
              aria-label="Cell width"
              min={1}
              max={100}
              value={cell.w}
              onChange={(e) =>
                onEdit(setRowsCell(doc, layer.id, cellIndex, { w: num(e.target.value, cell.w) }))
              }
              className={cn(input, "w-16")}
            />
            %
          </label>
          <button
            type="button"
            aria-label="Remove this cell"
            disabled={spec.cells.length <= 1}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--ed-danger)] disabled:opacity-35"
            onClick={() => {
              onEdit(
                setRows(doc, layer.id, { cells: spec.cells.filter((_, i) => i !== cellIndex) }),
              );
              setCellIndex(0);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {variants.length > 0 && cell && (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Row style">
          <span className="text-xs text-[var(--ed-ink2)]">Style for</span>
          <button
            type="button"
            aria-pressed={variant === null}
            onClick={() => setVariant(null)}
            className={cn(
              "rounded-full border border-[var(--ed-line)] px-3 py-1 text-xs",
              variant === null && "border-[var(--ed-accent)]",
            )}
          >
            Every row
          </button>
          {variants.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={variant === v}
              onClick={() => setVariant(v)}
              className={cn(
                "rounded-full border border-[var(--ed-line)] px-3 py-1 text-xs",
                variant === v && "border-[var(--ed-accent)]",
              )}
            >
              {VARIANT_LABEL[v] ?? v}
            </button>
          ))}
        </div>
      )}

      {cell && (
        <TextStyleBar
          style={variant ? { ...cell.style, ...variantStyle } : cell.style}
          onStyle={(patch) =>
            onEdit(
              variant
                ? setVariantStyle(doc, layer.id, variant, cell.field, { ...variantStyle, ...patch })
                : setRowsCell(doc, layer.id, cellIndex, { style: { ...cell.style, ...patch } }),
            )
          }
        />
      )}
    </section>
  );
}
