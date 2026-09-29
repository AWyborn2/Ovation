import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import {
  ELEMENT_CATEGORIES,
  getElement,
  listElements,
  renderElement,
  searchElements,
  type ElementCategory,
  type ElementDef,
} from "@/lib/studio-elements/registry";
import { cn } from "@/lib/utils";
import { newId } from "./document";

/** A new free layer for a library element, placed where the pack puts it. */
export function elementLayer(def: ElementDef, size: CardSize): FreeLayer {
  return {
    id: newId(),
    kind: "element",
    name: def.label,
    element: { id: def.id },
    geometry: { [size]: def.defaultBox(size) },
    editedAt: { [size]: Date.now() },
  };
}

function Thumb({
  def,
  paletteVars,
  crestUrl,
}: {
  def: ElementDef;
  paletteVars: string;
  crestUrl: string | null;
}) {
  const html = useMemo(
    () => renderElement({ id: def.id }, { values: {}, rows: {}, crestUrl }),
    [def.id, crestUrl],
  );
  const wide = def.design.w / def.design.h;
  return (
    <div
      aria-hidden
      className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-md bg-[#10151B]"
    >
      <div
        style={{
          ...styleFromDecls(paletteVars),
          aspectRatio: `${def.design.w} / ${def.design.h}`,
          ...(wide >= 3.2 ? { width: "92%" } : { height: "88%" }),
          maxWidth: "92%",
          maxHeight: "88%",
          color: "#F2F5F8",
        }}
        // Element html is repo code; props are escaped by renderElement.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/** `--a:1;--b:2` → a React style object of custom properties. */
function styleFromDecls(decls: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const d of decls.split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out as React.CSSProperties;
}

/**
 * The Club Kit element library (Club Kit plan U8): every piece of the Club Kit
 * pack, searchable by name and grouped by category, each inserted as a free
 * layer in the club's colours on any card — a blank canvas or any pack.
 */
export function ElementLibrary({
  size,
  paletteVars,
  crestUrl,
  onAdd,
}: {
  size: CardSize;
  /** The club's `--ck-*` palette declarations, for the thumbnails. */
  paletteVars: string;
  crestUrl: string | null;
  onAdd: (layer: FreeLayer) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ElementCategory | "all">("all");
  const items = query.trim()
    ? searchElements(query)
    : category === "all"
      ? listElements()
      : listElements(category);
  return (
    <section aria-label="Club Kit elements" className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ed-ink2)]">
        Club Kit elements
      </h3>
      <label className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2">
        <Search className="h-3.5 w-3.5 text-[var(--ed-ink2)]" aria-hidden />
        <input
          aria-label="Search elements"
          placeholder="Search elements"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      {!query.trim() && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Element categories">
          {[{ id: "all" as const, label: "All" }, ...ELEMENT_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                category === c.id
                  ? "bg-[var(--ed-accent)] text-[var(--ed-on-accent)]"
                  : "bg-[var(--ed-card)] text-[var(--ed-ink2)]",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((def) => (
          <button
            key={def.id}
            type="button"
            aria-label={`Add ${def.label}`}
            onClick={() => onAdd(elementLayer(def, size))}
            className="flex flex-col gap-1.5 rounded-lg bg-[var(--ed-card)] p-1.5 text-left text-[11px] font-semibold text-[var(--ed-ink2)] hover:ring-1 hover:ring-[var(--ed-accent)]"
          >
            <Thumb def={def} paletteVars={paletteVars} crestUrl={crestUrl} />
            {def.label}
          </button>
        ))}
        {items.length === 0 && (
          <p className="col-span-2 text-xs text-[var(--ed-ink2)]">No elements match.</p>
        )}
      </div>
    </section>
  );
}

/**
 * Prop editor for a selected library element: each prop follows the card's
 * live data until edited; "Use card data" clears the edit.
 */
export function ElementPropsEditor({
  layer,
  values,
  onProp,
}: {
  layer: FreeLayer;
  values: Record<string, string>;
  onProp: (key: string, value: string | null) => void;
}) {
  const def = getElement(layer.element?.id);
  if (!def || def.props.length === 0) return null;
  const edited = layer.element?.props ?? {};
  return (
    <div
      aria-label={`${def.label} settings`}
      role="group"
      className="mt-2 flex max-w-[640px] flex-wrap items-end gap-2 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] p-2"
    >
      {def.props.map((prop) => {
        const value =
          edited[prop.key] ?? (prop.bind && values[prop.bind] ? values[prop.bind] : prop.sample);
        const live = edited[prop.key] === undefined && !!prop.bind && !!values[prop.bind];
        return (
          <label key={prop.key} className="flex flex-col gap-1 text-[11px] text-[var(--ed-ink2)]">
            <span>
              {prop.label}
              {live && (
                <span className="ml-1 rounded bg-[var(--ed-accent)] px-1 text-[10px] font-bold text-[var(--ed-on-accent)]">
                  Live
                </span>
              )}
              {prop.cells && <span className="ml-1 opacity-70">({prop.cells.join(" | ")})</span>}
            </span>
            {prop.kind === "rows" ? (
              <textarea
                aria-label={prop.label}
                value={value}
                rows={4}
                onChange={(e) => onProp(prop.key, e.target.value)}
                className="w-72 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 py-1 font-mono text-xs text-[var(--ed-ink)]"
              />
            ) : (
              <input
                aria-label={prop.label}
                value={value}
                placeholder={prop.kind === "image" ? "https://…" : undefined}
                onChange={(e) => onProp(prop.key, e.target.value)}
                className="h-8 w-44 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]"
              />
            )}
            {edited[prop.key] !== undefined && prop.bind && (
              <button
                type="button"
                className="self-start text-[10px] underline"
                onClick={() => onProp(prop.key, null)}
              >
                Use card data
              </button>
            )}
          </label>
        );
      })}
    </div>
  );
}
