import type { FreeLayer } from "@/lib/pack-render";
import { getElement } from "@/lib/studio-elements/registry";

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
