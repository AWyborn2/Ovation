import { useMemo } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type {
  CustomGridColumn,
  CustomGridDef,
  GridCatalogEntry,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SkinOption } from "./constants";

// Maps a custom-grid column source to the catalog entry that supplies its keys.
const SOURCE_CATALOG_ID: Record<string, string> = {
  office: "committee",
  award: "award_winners",
  grade: "captains_grid",
  premiership: "premierships_grid",
};
const SOURCE_LABELS: { value: CustomGridColumn["source"]; label: string }[] = [
  { value: "office", label: "Committee office" },
  { value: "award", label: "Award" },
  { value: "grade", label: "Grade captain" },
  { value: "premiership", label: "Premiership (grade)" },
  { value: "manual", label: "Manual entry" },
];

/** Builder for a single admin-defined custom grid board. */
export function CustomGridEditor({
  gridDef,
  catalog,
  skinOptions,
  onPatch,
  onRemove,
}: {
  gridDef: CustomGridDef;
  catalog: GridCatalogEntry[];
  skinOptions: SkinOption[];
  onPatch: (patch: Partial<CustomGridDef>) => void;
  onRemove: () => void;
}) {
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const optionsFor = (source: CustomGridColumn["source"]) =>
    source === "manual" ? [] : (catalogById.get(SOURCE_CATALOG_ID[source] ?? "")?.options ?? []);

  const fillMode = gridDef.fillMode ?? "wrap";
  const setCol = (i: number, patch: Partial<CustomGridColumn>) =>
    onPatch({
      columns: gridDef.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });
  const addCol = () =>
    onPatch({
      columns: [
        ...gridDef.columns,
        { key: crypto.randomUUID().slice(0, 8), label: "", source: "office", sourceKey: null },
      ],
    });
  const removeCol = (i: number) =>
    onPatch({ columns: gridDef.columns.filter((_, idx) => idx !== i) });
  const moveCol = (i: number, dir: -1 | 1) => {
    const next = gridDef.columns.slice();
    const t = i + dir;
    if (t < 0 || t >= next.length) return;
    [next[i], next[t]] = [next[t]!, next[i]!];
    onPatch({ columns: next });
  };

  // Manual values <-> "season = value" lines for a simple textarea editor.
  const manualText = (c: CustomGridColumn) =>
    Object.entries(c.manualValues ?? {})
      .map(([k, v]) => `${k} = ${v}`)
      .join("\n");
  const parseManual = (text: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([^=]+?)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]!] = m[2]!;
    }
    return out;
  };

  return (
    <div
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
      data-testid={`customgrid-${gridDef.id}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">Title</span>
          <Input
            value={gridDef.title}
            placeholder="e.g. Office Bearers & Best & Fairest"
            onChange={(e) => onPatch({ title: e.target.value })}
            data-testid={`customgrid-title-${gridDef.id}`}
          />
        </label>
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">Subtitle (optional)</span>
          <Input
            value={gridDef.subtitle ?? ""}
            onChange={(e) => onPatch({ subtitle: e.target.value })}
            data-testid={`customgrid-subtitle-${gridDef.id}`}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onRemove}
          data-testid={`customgrid-remove-${gridDef.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">First season (year)</span>
          <Input
            type="number"
            className="w-28"
            value={gridDef.seasonFrom ?? ""}
            placeholder="auto"
            onChange={(e) =>
              onPatch({
                seasonFrom: e.target.value ? Number(e.target.value) : null,
              })
            }
            data-testid={`customgrid-from-${gridDef.id}`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Last season (year)</span>
          <Input
            type="number"
            className="w-28"
            value={gridDef.seasonTo ?? ""}
            placeholder="auto"
            onChange={(e) =>
              onPatch({
                seasonTo: e.target.value ? Number(e.target.value) : null,
              })
            }
            data-testid={`customgrid-to-${gridDef.id}`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Skin</span>
          <select
            className="px-2 py-1.5 rounded border bg-card text-sm"
            value={gridDef.skin ?? ""}
            onChange={(e) => onPatch({ skin: e.target.value || null })}
            data-testid={`customgrid-skin-${gridDef.id}`}
          >
            <option value="">Club-wide skin</option>
            {skinOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Fill mode</span>
          <select
            className="px-2 py-1.5 rounded border bg-card text-sm"
            value={fillMode}
            onChange={(e) =>
              onPatch({
                fillMode: e.target.value as "scroll" | "slide" | "wrap",
              })
            }
            data-testid={`customgrid-fill-${gridDef.id}`}
          >
            <option value="wrap">Wrap (side-by-side blocks)</option>
            <option value="scroll">Scroll</option>
            <option value="slide">Slide</option>
          </select>
        </label>
        {fillMode === "wrap" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Blocks</span>
            <select
              className="px-2 py-1.5 rounded border bg-card text-sm"
              value={gridDef.wrapBlocks ?? 2}
              onChange={(e) => onPatch({ wrapBlocks: Number(e.target.value) })}
              data-testid={`customgrid-blocks-${gridDef.id}`}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
        )}
      </div>

      <label className="space-y-1 block">
        <span className="text-xs font-medium text-muted-foreground">Footnote (optional)</span>
        <Input
          value={gridDef.footnote ?? ""}
          placeholder="e.g. Premiers 2007, 2009 · *2020/21 cancelled"
          onChange={(e) => onPatch({ footnote: e.target.value })}
          data-testid={`customgrid-footnote-${gridDef.id}`}
        />
      </label>

      <div className="space-y-2 border-t pt-3">
        <span className="text-xs font-medium text-muted-foreground">Columns</span>
        {gridDef.columns.map((col, i) => {
          const opts = optionsFor(col.source);
          return (
            <div key={col.key} className="space-y-1.5 border rounded p-2 bg-background">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                <Input
                  className="flex-1 min-w-[9rem]"
                  value={col.label}
                  placeholder="Column heading"
                  onChange={(e) => setCol(i, { label: e.target.value })}
                  data-testid={`customgrid-col-label-${gridDef.id}-${i}`}
                />
                <select
                  className="px-2 py-1.5 rounded border bg-background text-sm"
                  value={col.source}
                  onChange={(e) =>
                    setCol(i, {
                      source: e.target.value as CustomGridColumn["source"],
                      sourceKey: null,
                    })
                  }
                  data-testid={`customgrid-col-source-${gridDef.id}-${i}`}
                >
                  {SOURCE_LABELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {col.source !== "manual" && (
                  <select
                    className="px-2 py-1.5 rounded border bg-background text-sm min-w-[10rem]"
                    value={col.sourceKey ?? ""}
                    onChange={(e) => {
                      const opt = opts.find((o) => o.key === e.target.value);
                      setCol(i, {
                        sourceKey: e.target.value || null,
                        label: col.label || opt?.label || "",
                      });
                    }}
                    data-testid={`customgrid-col-key-${gridDef.id}-${i}`}
                  >
                    <option value="">Select…</option>
                    {opts.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
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
                  disabled={i === gridDef.columns.length - 1}
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
              {col.source === "manual" && (
                <textarea
                  className="w-full px-2 py-1.5 rounded border bg-background text-xs font-mono"
                  rows={3}
                  value={manualText(col)}
                  placeholder={"2024/25 = J. Smith\n2023/24 = A. Brown"}
                  onChange={(e) => setCol(i, { manualValues: parseManual(e.target.value) })}
                  data-testid={`customgrid-col-manual-${gridDef.id}-${i}`}
                />
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCol}
          data-testid={`customgrid-add-col-${gridDef.id}`}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add column
        </Button>
      </div>
    </div>
  );
}
