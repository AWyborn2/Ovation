import { useState } from "react";
import { Grid3x3, Pencil } from "lucide-react";
import type {
  BoardDisplayConfig,
  DisplayBoard,
  GridCatalogEntry,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { BackgroundPicker } from "./background-picker";
import { FONT_OPTIONS, TEXT_SIZES, type SkinOption } from "./constants";

/** Expandable per-board styling editor. */
export function BoardConfigEditor({
  board,
  cfg,
  grid,
  skinOptions,
  onPatch,
}: {
  board: DisplayBoard;
  cfg?: BoardDisplayConfig;
  grid: GridCatalogEntry | null;
  skinOptions: SkinOption[];
  onPatch: (patch: Partial<BoardDisplayConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  const cols = cfg?.columns ?? board.display.columns;
  const transition = cfg?.transition ?? board.display.transition;
  const fit = cfg?.fit ?? board.display.fit;
  const isList = board.layout === "list";
  const isGrid = board.layout === "grid";
  const logo = cfg?.logo ?? true;
  const gridColumns = cfg?.gridColumns ?? [];
  const wrapBlocks = cfg?.wrapBlocks ?? board.display.wrapBlocks ?? 2;
  const sort = cfg?.sort ?? "desc";

  const toggleGridCol = (key: string) => {
    const next = gridColumns.includes(key)
      ? gridColumns.filter((k) => k !== key)
      : [...gridColumns, key];
    onPatch({ gridColumns: next });
  };

  return (
    <div className="border rounded bg-card" data-testid={`board-config-${board.id}`}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-[12rem] text-left text-sm font-medium flex items-center gap-1.5"
          data-testid={`board-expand-${board.id}`}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          {board.title}
          {grid && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
              <Grid3x3 className="h-3 w-3" />
              {gridColumns.length > 0 ? "grid" : "grid-capable"}
            </span>
          )}
        </button>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Columns</span>
          <select
            className="px-2 py-1 rounded border bg-background text-sm disabled:opacity-40"
            value={isList ? cols : 1}
            disabled={!isList}
            title={isList ? undefined : "Only list boards support multi-column flow"}
            onChange={(e) => onPatch({ columns: Number(e.target.value) })}
            data-testid={`board-columns-${board.id}`}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Transition</span>
          <select
            className="px-2 py-1 rounded border bg-background text-sm"
            value={transition}
            onChange={(e) =>
              onPatch({
                transition: e.target.value as "scroll" | "slide" | "wrap",
              })
            }
            data-testid={`board-transition-${board.id}`}
          >
            <option value="scroll">Scroll</option>
            <option value="slide">Slide</option>
            {isGrid && <option value="wrap">Wrap (side-by-side)</option>}
          </select>
        </label>
        {isGrid && transition === "wrap" && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Blocks</span>
            <select
              className="px-2 py-1 rounded border bg-background text-sm"
              value={wrapBlocks}
              onChange={(e) => onPatch({ wrapBlocks: Number(e.target.value) })}
              data-testid={`board-wrapblocks-${board.id}`}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
        )}
        {isGrid && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Season order</span>
            <select
              className="px-2 py-1 rounded border bg-background text-sm"
              value={sort}
              onChange={(e) => onPatch({ sort: e.target.value as "asc" | "desc" })}
              data-testid={`board-sort-${board.id}`}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={fit}
            onChange={(e) => onPatch({ fit: e.target.checked })}
            data-testid={`board-fit-${board.id}`}
          />
          <span className="text-muted-foreground">Full width</span>
        </label>
      </div>

      {open && (
        <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Heading override</span>
              <Input
                value={cfg?.heading ?? ""}
                placeholder={board.title}
                onChange={(e) => onPatch({ heading: e.target.value || null })}
                data-testid={`board-heading-${board.id}`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Subtitle override</span>
              <Input
                value={cfg?.subtitle ?? ""}
                placeholder={board.subtitle ?? "—"}
                onChange={(e) => onPatch({ subtitle: e.target.value || null })}
                data-testid={`board-subtitle-${board.id}`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Skin override</span>
              <select
                className="w-full px-2 py-1.5 rounded border bg-card text-sm"
                value={cfg?.skin ?? ""}
                onChange={(e) => onPatch({ skin: e.target.value || null })}
                data-testid={`board-skin-${board.id}`}
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
              <span className="text-xs font-medium text-muted-foreground">Footnote</span>
              <Input
                value={cfg?.footnote ?? ""}
                placeholder="e.g. Premiers 2018/19, 2024/25"
                onChange={(e) => onPatch({ footnote: e.target.value || null })}
                data-testid={`board-footnote-${board.id}`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Text size</span>
              <select
                className="px-2 py-1 rounded border bg-background text-sm"
                value={cfg?.textSize ?? "md"}
                onChange={(e) =>
                  onPatch({
                    textSize: e.target.value as "sm" | "md" | "lg",
                  })
                }
                data-testid={`board-textsize-${board.id}`}
              >
                {TEXT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Density</span>
              <select
                className="px-2 py-1 rounded border bg-background text-sm"
                value={cfg?.density ?? "comfortable"}
                onChange={(e) =>
                  onPatch({
                    density: e.target.value as "comfortable" | "compact",
                  })
                }
                data-testid={`board-density-${board.id}`}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Font</span>
              <select
                className="px-2 py-1 rounded border bg-background text-sm"
                value={cfg?.font ?? ""}
                onChange={(e) => onPatch({ font: e.target.value || null })}
                data-testid={`board-font-${board.id}`}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={logo}
                onChange={(e) => onPatch({ logo: e.target.checked })}
                data-testid={`board-logo-${board.id}`}
              />
              <span className="text-muted-foreground">Show crest</span>
            </label>
          </div>

          <BackgroundPicker
            value={cfg?.background}
            onChange={(bg) => onPatch({ background: bg })}
            testId={`board-bg-${board.id}`}
          />

          {grid && (
            <div className="space-y-1.5 border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Grid3x3 className="h-3.5 w-3.5" /> Season-grid columns
              </span>
              <p className="text-[11px] text-muted-foreground">
                Pick columns to render this board as a season grid (rows × columns). Leave all
                unchecked to keep its natural layout.
              </p>
              <div className="flex flex-wrap gap-2">
                {grid.options.map((opt) => {
                  const on = gridColumns.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleGridCol(opt.key)}
                      className={`text-xs px-2 py-1 rounded border transition ${
                        on ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/50"
                      }`}
                      data-testid={`board-gridcol-${board.id}-${opt.key}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
