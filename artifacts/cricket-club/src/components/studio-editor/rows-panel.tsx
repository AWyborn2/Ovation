import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  effectivePick,
  isPerformanceRepeat,
  kindFields,
  MAX_PICK_COUNT,
  MAX_PICK_MIN_RUNS,
  MAX_PICK_MIN_WICKETS,
  pageRepeat,
  pickStat,
  rowsCapacity,
  rowsColumns,
  type PageKey,
  type RowsPick,
  type TemplateTextStyle,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { layersOf, type EditorDoc } from "./document";
import { setRows, setRowsCell, setRowsPick, setVariantStyle } from "./template-ops";
import { TextStyleBar } from "./text-style-bar";

const input =
  "h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]";

/** Row fields that hold an image address (a player's photo), so a cell can show the image. */
export const isImageRowField = (key: string): boolean => /photo$/i.test(key);

const VARIANT_LABEL: Record<string, string> = {
  club: "Your club's row",
  opposition: "Opposition rows",
  junior: "Junior rows",
};

/** How many rows a result's batting or bowling list keeps: the presets, else a number. */
const COUNT_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0, label: "All" },
  { value: 1, label: "Best" },
  { value: 3, label: "Top 3" },
  { value: 5, label: "Top 5" },
];

const chip = (on: boolean) =>
  cn(
    "rounded-full border border-[var(--ed-line)] px-3 py-1 text-xs",
    on && "border-[var(--ed-accent)] bg-[var(--ed-card)] font-semibold",
  );

type Sort = NonNullable<RowsPick["sort"]>;

/** Each stat's sorts, best first; "Scorecard order" is no sort. */
const SORTS: Record<"batting" | "bowling", Array<{ value: Sort; label: string }>> = {
  batting: [
    { value: "runs", label: "Runs" },
    { value: "balls", label: "Balls faced" },
    { value: "strikeRate", label: "Strike rate" },
  ],
  bowling: [
    { value: "wickets", label: "Wickets" },
    { value: "economy", label: "Economy" },
  ],
};

/**
 * The sort a list's menu shows: its own, figures as wickets (the same order),
 * and stage 4's other-stat sort as the list's first (a list orders by its own
 * stat whatever it is set to).
 */
function shownSort(stat: "batting" | "bowling", sort: Sort | undefined): Sort | "" {
  if (!sort) return "";
  if (sort === "figures") return "wickets";
  return SORTS[stat].some((o) => o.value === sort) ? sort : SORTS[stat][0]!.value;
}

/**
 * Which rows a result's batting or bowling list draws (full draft editor
 * plan, stages 4 and 5): whose (a performance list only; an innings list is
 * one side's), how many, sorted how, and which count (at least so many runs
 * or wickets, not outs only). Without a choice a list shows every row in
 * scorecard order (D4). The list settings and the add chooser share these.
 */
export function PickControls({
  repeat,
  pick,
  clubLabel,
  onPick,
}: {
  repeat: string;
  pick: RowsPick | undefined;
  /** The club's short name for "Whose"; "Club" without one. */
  clubLabel?: string;
  onPick: (patch: Partial<RowsPick>) => void;
}) {
  const stat = pickStat(repeat);
  const shown = effectivePick(repeat, pick) ?? {};
  const count = shown.count ?? 0;
  const preset = COUNT_PRESETS.some((p) => p.value === count);
  const [custom, setCustom] = useState(!preset);
  const sides: Array<{ value: NonNullable<RowsPick["side"]>; label: string }> = [
    { value: "club", label: clubLabel?.trim() || "Club" },
    { value: "opposition", label: "Opposition" },
    { value: "both", label: "Both" },
  ];
  const whose = shown.side ?? "both";
  const minimum = (v: string, max: number): number | undefined => {
    const n = Math.round(Number(v));
    return v.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.min(max, n) : undefined;
  };
  if (!stat) return null;
  return (
    <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Which rows">
      {isPerformanceRepeat(repeat) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Whose">
          <span className="w-16 text-xs text-[var(--ed-ink2)]">Whose</span>
          {sides.map((side) => (
            <button
              key={side.value}
              type="button"
              aria-pressed={whose === side.value}
              onClick={() => onPick({ side: side.value })}
              className={chip(whose === side.value)}
            >
              {side.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="How many">
        <span className="w-16 text-xs text-[var(--ed-ink2)]">How many</span>
        {COUNT_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={!custom && count === p.value}
            onClick={() => {
              setCustom(false);
              onPick({ count: p.value });
            }}
            className={chip(!custom && count === p.value)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={chip(custom)}
        >
          Other
        </button>
        {custom && (
          <input
            type="number"
            aria-label="Number of rows"
            min={1}
            max={MAX_PICK_COUNT}
            step={1}
            value={count || ""}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n >= 1) onPick({ count: Math.min(MAX_PICK_COUNT, n) });
            }}
            className={cn(input, "w-16")}
          />
        )}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-[var(--ed-ink2)]">
        <span className="w-16">Sort by</span>
        <select
          aria-label="Sort by"
          value={shownSort(stat, shown.sort)}
          onChange={(e) => onPick({ sort: e.target.value ? (e.target.value as Sort) : undefined })}
          className={input}
        >
          <option value="">Scorecard order</option>
          {SORTS[stat].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ed-ink2)]">
        <span className="w-16">Only</span>
        <label className="flex items-center gap-1">
          At least
          {stat === "batting" ? (
            <input
              type="number"
              aria-label="Minimum runs"
              min={0}
              max={MAX_PICK_MIN_RUNS}
              step={1}
              value={shown.minRuns || ""}
              placeholder="0"
              onChange={(e) => onPick({ minRuns: minimum(e.target.value, MAX_PICK_MIN_RUNS) })}
              className={cn(input, "w-16")}
            />
          ) : (
            <input
              type="number"
              aria-label="Minimum wickets"
              min={0}
              max={MAX_PICK_MIN_WICKETS}
              step={1}
              value={shown.minWickets || ""}
              placeholder="0"
              onChange={(e) =>
                onPick({ minWickets: minimum(e.target.value, MAX_PICK_MIN_WICKETS) })
              }
              className={cn(input, "w-16")}
            />
          )}
          {stat === "batting" ? "runs" : "wickets"}
        </label>
        {stat === "batting" && (
          <label className="ml-2 flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!shown.notOutOnly}
              onChange={(e) => onPick({ notOutOnly: e.target.checked || undefined })}
              className="h-4 w-4 accent-[var(--ed-accent)]"
            />
            Not outs only
          </label>
        )}
      </div>
      {isPerformanceRepeat(repeat) && (
        <p className="text-xs text-[var(--ed-ink2)]">
          A junior card shows your club&apos;s players only.
        </p>
      )}
    </div>
  );
}

/**
 * The list element's settings (R8): the row height and gap, the cells across
 * the row (which field, where, how wide, styled), and per-variant styles such
 * as the club's own row on a ladder. One row is styled; it repeats per row.
 * A cell can show its field as text, as the row's photo (a photo per player)
 * or as a plain panel behind other cells.
 */
export function RowsPanel({
  doc,
  layer,
  kind,
  page,
  size,
  clubLabel,
  onEdit,
}: {
  doc: EditorDoc;
  layer: FreeLayer;
  kind: string;
  /** The page on show; its own lists (a result's innings and performances) when it has them. */
  page?: PageKey;
  size: CardSize;
  /** The club's short name, for a performance list's "Whose". */
  clubLabel?: string;
  onEdit: (next: EditorDoc) => void;
}) {
  const spec = layer.rows!;
  const repeat =
    (page ? pageRepeat(kind, page, spec.repeat) : null) ??
    kindFields(kind)?.repeats.find((r) => r.key === spec.repeat);
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

      <div className="mt-3 flex flex-wrap items-center gap-3" role="group" aria-label="Layout">
        <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
          Columns
          <select
            aria-label="Columns"
            value={rowsColumns(spec)}
            onChange={(e) => {
              const columns = Number(e.target.value);
              onEdit(
                setRows(doc, layer.id, {
                  columns: columns > 1 ? columns : undefined,
                  ...(columns > 1 ? {} : { columnGap: undefined, flow: undefined }),
                }),
              );
            }}
            className={cn(input, "w-16")}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {rowsColumns(spec) > 1 && (
          <>
            <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
              Column gap
              <input
                type="number"
                aria-label="Column gap"
                min={0}
                max={30}
                step={0.5}
                value={spec.columnGap ?? 0}
                onChange={(e) =>
                  onEdit(setRows(doc, layer.id, { columnGap: Math.max(0, num(e.target.value, 0)) }))
                }
                className={cn(input, "w-16")}
              />
            </label>
            <div className="flex items-center gap-1 text-xs" role="group" aria-label="Fill">
              <span className="text-[var(--ed-ink2)]">Fill</span>
              {(
                [
                  ["down", "Down each column"],
                  ["across", "Across each line"],
                ] as const
              ).map(([flow, text]) => (
                <button
                  key={flow}
                  type="button"
                  aria-pressed={(spec.flow ?? "down") === flow}
                  onClick={() => onEdit(setRows(doc, layer.id, { flow }))}
                  className={cn(
                    "rounded-lg border border-[var(--ed-line)] px-2 py-1 font-semibold",
                    (spec.flow ?? "down") === flow
                      ? "bg-[var(--ed-accent)] text-[var(--ed-on-accent)]"
                      : "text-[var(--ed-ink)]",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <PickControls
        key={spec.repeat}
        repeat={spec.repeat}
        pick={spec.pick}
        clubLabel={clubLabel}
        onPick={(patch) => onEdit(setRowsPick(doc, layer.id, patch))}
      />

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
            const field = (unused ?? fields[0])?.key ?? "";
            const cells = [
              ...spec.cells,
              {
                field,
                x: 80,
                w: 20,
                ...(isImageRowField(field) ? { show: "image" as const } : {}),
                style: { fontSize: 3.6 },
              },
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
            onChange={(e) => {
              const field = e.target.value;
              // A photo field shows as the photo; another field can't.
              const show = isImageRowField(field)
                ? "image"
                : cell.show === "image"
                  ? undefined
                  : cell.show;
              onEdit(setRowsCell(doc, layer.id, cellIndex, { field, show }));
            }}
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
          <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
            Show as
            <select
              aria-label="Cell shows"
              value={cell.show ?? "text"}
              onChange={(e) =>
                onEdit(
                  setRowsCell(doc, layer.id, cellIndex, {
                    show:
                      e.target.value === "text"
                        ? undefined
                        : (e.target.value as "image" | "backdrop"),
                  }),
                )
              }
              className={input}
            >
              <option value="text">Text</option>
              {isImageRowField(cell.field) && <option value="image">Photo</option>}
              <option value="backdrop">Panel</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
            Top
            <input
              type="number"
              aria-label="Cell top"
              min={0}
              max={100}
              value={cell.y ?? 0}
              onChange={(e) =>
                onEdit(
                  setRowsCell(doc, layer.id, cellIndex, {
                    y: Math.min(100, Math.max(0, num(e.target.value, cell.y ?? 0))),
                  }),
                )
              }
              className={cn(input, "w-16")}
            />
            %
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
            Height
            <input
              type="number"
              aria-label="Cell height"
              min={1}
              max={100}
              value={cell.h ?? 100}
              onChange={(e) =>
                onEdit(
                  setRowsCell(doc, layer.id, cellIndex, {
                    h: Math.min(100, Math.max(1, num(e.target.value, cell.h ?? 100))),
                  }),
                )
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

      {cell?.show === "image" && (
        <p className="mt-2 text-xs text-[var(--ed-ink2)]">
          Each row shows its own photo here (a junior card only where the family has allowed it).
        </p>
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
