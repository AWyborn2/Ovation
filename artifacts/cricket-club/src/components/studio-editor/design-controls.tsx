/**
 * The Layer panel's small controls (`layer-design-panel.tsx`) and the style
 * editors built from them (gradients, clips, shadows): a colour, a number, a
 * titled section, and the classes they share.
 */
import { COLOUR_TOKENS } from "@workspace/scorecard/kind-templates";

export const field =
  "h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]";
export const label = "flex flex-col gap-1 text-[11px] font-semibold text-[var(--ed-ink2)]";
export const btn =
  "rounded-lg border border-[var(--ed-line)] px-2 py-1 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:opacity-40";

/** The card's colour tokens, as the panel names them (`--gold` is the club's accent). */
const TOKEN_LABEL: Record<(typeof COLOUR_TOKENS)[number], string> = {
  "--gold": "Club colour",
  "--panel": "Panel",
  "--panel-2": "Panel 2",
  "--ink": "Text",
  "--accent-ink": "On club colour",
};

/** The token a colour names (`var(--x)` or `var(--x, #fallback)`), or null. */
const tokenOf = (value: string | undefined) =>
  value?.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/)?.[1] ?? null;

/**
 * A colour: a card colour token or a hex. A token the list doesn't name (a
 * derived palette's, as converted looks use: `--ck-stage`, `--dt-p`) is kept
 * and shown by its name.
 */
export function ColourField({
  value,
  onChange,
  name,
}: {
  value: string | undefined;
  onChange: (c: string | undefined) => void;
  name: string;
}) {
  const token = tokenOf(value);
  const listed = (COLOUR_TOKENS as readonly string[]).includes(token ?? "");
  return (
    <span className="flex items-center gap-1">
      <select
        aria-label={`${name} colour`}
        className={field}
        value={token ?? (value ? "hex" : "")}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) onChange(undefined);
          else if (v === "hex") onChange(value && !token ? value : "#ffffff");
          else if (v === token) onChange(value);
          else onChange(`var(${v})`);
        }}
      >
        <option value="">None</option>
        {COLOUR_TOKENS.map((t) => (
          <option key={t} value={t}>
            {TOKEN_LABEL[t]}
          </option>
        ))}
        {token && !listed && <option value={token}>{token}</option>}
        <option value="hex">Custom</option>
      </select>
      {value && !token && (
        <input
          aria-label={`${name} hex`}
          className={`${field} w-24`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </span>
  );
}

const num = (v: string, lo: number, hi: number): number | undefined => {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};

export function NumberField({
  name,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  name: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className={label}>
      {name}
      <input
        type="number"
        className={`${field} w-20`}
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(num(e.target.value, min, max))}
      />
    </label>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2 border-t border-[var(--ed-line)] pt-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--ed-ink2)]">{title}</h3>
      {children}
    </section>
  );
}
