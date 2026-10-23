import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { TemplateStyleV2, TemplateTextStyle } from "@workspace/scorecard/kind-templates";
import { loadFontCatalogue, primaryFamily, type CatalogueEntry } from "@/lib/document-fonts";
import { cn } from "@/lib/utils";

const field =
  "h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]";
const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg text-[var(--ed-ink2)] hover:bg-[var(--ed-card)] hover:text-[var(--ed-ink)]";

/** The card's own display face; a template that sets no font uses it. */
const DEFAULT_FONT = "Card default";
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];
const MAX_RESULTS = 60;

/**
 * Families the picker lists first, before any search: the Ovation Match
 * Graphics design system's four (plan 2026-10-23, M10).
 */
export const FEATURED_FONTS = {
  label: "Match graphics",
  families: ["Barlow Condensed", "Barlow Semi Condensed", "Montserrat", "Archivo"],
} as const;

/** The featured families, in their order, as the catalogue has them. */
export function featuredFonts(catalogue: readonly CatalogueEntry[]): CatalogueEntry[] {
  const byFamily = new Map(catalogue.map((f) => [f.family, f]));
  return FEATURED_FONTS.families.flatMap((family) => byFamily.get(family) ?? []);
}

/** Families whose name matches `query`: the exact name, then prefixes, then the rest. */
export function searchFonts(catalogue: readonly CatalogueEntry[], query: string): CatalogueEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalogue.slice(0, MAX_RESULTS);
  const exact: CatalogueEntry[] = [];
  const prefix: CatalogueEntry[] = [];
  const inner: CatalogueEntry[] = [];
  for (const f of catalogue) {
    const name = f.family.toLowerCase();
    if (name === q) exact.push(f);
    else if (name.startsWith(q)) prefix.push(f);
    else if (name.includes(q)) inner.push(f);
  }
  return [...exact, ...prefix, ...inner].slice(0, MAX_RESULTS);
}

/** The CSS font-family a picked catalogue family is stored as. */
export const fontFamilyValue = (f: CatalogueEntry): string =>
  `'${f.family}', ${f.category === "serif" ? "serif" : f.category === "monospace" ? "monospace" : "sans-serif"}`;

/**
 * Font picker over the Google Fonts catalogue (KTD17): type to search, pick a
 * family. Loaded on first open so the catalogue stays out of the main bundle.
 */
export function FontPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (fontFamily: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogueEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || catalogue) return;
    let live = true;
    loadFontCatalogue()
      .then((c) => live && setCatalogue(c))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, catalogue]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // Escape closes the picker (and goes no further) wherever focus is inside it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const results = useMemo(
    () => (catalogue ? searchFonts(catalogue, query) : []),
    [catalogue, query],
  );
  const featured = useMemo(() => (catalogue ? featuredFonts(catalogue) : []), [catalogue]);
  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };
  const current = primaryFamily(value) ?? DEFAULT_FONT;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Font: ${current}`}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(field, "w-40 truncate text-left font-semibold")}
      >
        {current}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose a font"
          className="absolute left-0 top-10 z-30 w-64 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] p-2 shadow-xl"
        >
          <input
            ref={inputRef}
            aria-label="Search fonts"
            placeholder="Search 1,700+ fonts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(field, "mb-2 w-full")}
          />
          <ul role="listbox" aria-label="Fonts" className="max-h-64 overflow-auto">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--ed-card)]"
                onClick={() => {
                  onChange(undefined);
                  close();
                }}
              >
                {DEFAULT_FONT}
              </button>
            </li>
            {failed && (
              <li className="px-2 py-1.5 text-sm text-[var(--ed-danger)]">
                Couldn't load the font list. Try again.
              </li>
            )}
            {!catalogue && !failed && (
              <li className="px-2 py-1.5 text-sm text-[var(--ed-ink2)]">Loading fonts…</li>
            )}
            {!query.trim() && catalogue && featured.length > 0 && (
              <li role="presentation">
                <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--ed-ink2)]">
                  {FEATURED_FONTS.label}
                </p>
                <ul role="group" aria-label={FEATURED_FONTS.label}>
                  {featured.map((f) => (
                    <li key={f.family}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={primaryFamily(value) === f.family}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--ed-card)]"
                        onClick={() => {
                          onChange(fontFamilyValue(f));
                          close();
                        }}
                      >
                        {f.family}
                        <span className="ml-2 text-xs text-[var(--ed-ink2)]">{f.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ed-ink2)]">
                  All fonts
                </p>
              </li>
            )}
            {results.map((f) => (
              <li key={f.family}>
                <button
                  type="button"
                  role="option"
                  aria-selected={primaryFamily(value) === f.family}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--ed-card)]"
                  onClick={() => {
                    onChange(fontFamilyValue(f));
                    close();
                  }}
                >
                  {f.family}
                  <span className="ml-2 text-xs text-[var(--ed-ink2)]">{f.category}</span>
                </button>
              </li>
            ))}
            {catalogue && results.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-[var(--ed-ink2)]">No fonts match.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Text styling for a template's text box (R6): font, size, weight,
 * alignment, letter spacing and colour. Sizes are percent of the card width so
 * text scales with each size.
 */
/** What the bar sets: v1's text style, plus v2's italic and width (`stretch`). */
export type TextBarStyle = TemplateTextStyle & Pick<TemplateStyleV2, "italic" | "stretch">;

/** The width axis of `fontFamily`'s family, from the catalogue (null without one). */
function useWidthAxis(fontFamily: string | undefined): [number, number] | null {
  const family = primaryFamily(fontFamily);
  const [axis, setAxis] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!family) return void setAxis(null);
    let live = true;
    loadFontCatalogue()
      .then((c) => live && setAxis(c.find((f) => f.family === family)?.width ?? null))
      .catch(() => live && setAxis(null));
    return () => {
      live = false;
    };
  }, [family]);
  return axis;
}

export function TextStyleBar({
  style,
  onStyle,
  v2Styles = true,
}: {
  style: TextBarStyle | undefined;
  onStyle: (patch: Partial<TextBarStyle>) => void;
  /** Offer italic and width, which only format v2 holds (off for a v1-only surface). */
  v2Styles?: boolean;
}) {
  const s = style ?? {};
  const widthAxis = useWidthAxis(s.fontFamily);
  const num = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) ? undefined : n;
  };
  return (
    <div
      role="toolbar"
      aria-label="Text style"
      className="mt-2 flex min-h-11 max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-1.5 py-1"
    >
      <FontPicker value={s.fontFamily} onChange={(fontFamily) => onStyle({ fontFamily })} />
      <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
        Size
        <input
          type="number"
          aria-label="Font size"
          min={1}
          max={40}
          step={0.5}
          value={s.fontSize ?? 5}
          onChange={(e) => onStyle({ fontSize: num(e.target.value) })}
          className={cn(field, "w-16")}
        />
      </label>
      <select
        aria-label="Font weight"
        value={s.fontWeight ?? 700}
        onChange={(e) => onStyle({ fontWeight: Number(e.target.value) })}
        className={field}
      >
        {WEIGHTS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <div className="flex items-center" role="group" aria-label="Alignment">
        {(
          [
            ["left", AlignLeft, "Align left"],
            ["center", AlignCenter, "Align centre"],
            ["right", AlignRight, "Align right"],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={(s.align ?? "center") === value}
            onClick={() => onStyle({ align: value })}
            className={cn(iconBtn, (s.align ?? "center") === value && "bg-[var(--ed-card)]")}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Capitals"
        aria-pressed={s.uppercase === true}
        title="Set the text in capitals"
        onClick={() => onStyle({ uppercase: s.uppercase ? undefined : true })}
        className={cn(
          iconBtn,
          "w-auto px-2 text-xs font-bold",
          s.uppercase && "bg-[var(--ed-card)]",
        )}
      >
        AA
      </button>
      {v2Styles && (
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={s.italic === true}
          title="Set the text in italics"
          onClick={() => onStyle({ italic: s.italic ? undefined : true })}
          className={cn(
            iconBtn,
            "w-auto px-2 text-xs font-bold italic",
            s.italic && "bg-[var(--ed-card)]",
          )}
        >
          I
        </button>
      )}
      {v2Styles && widthAxis && (
        <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
          Width
          <input
            type="number"
            aria-label="Font width"
            title={`Percent of the font's normal width (${widthAxis[0]}–${widthAxis[1]})`}
            min={widthAxis[0]}
            max={widthAxis[1]}
            step={5}
            value={s.stretch ?? 100}
            onChange={(e) => {
              const n = num(e.target.value);
              onStyle({ stretch: n === undefined || n === 100 ? undefined : n });
            }}
            className={cn(field, "w-16")}
          />
        </label>
      )}
      <label className="flex items-center gap-1 text-xs text-[var(--ed-ink2)]">
        Spacing
        <input
          type="number"
          aria-label="Letter spacing"
          min={-0.2}
          max={1}
          step={0.01}
          value={s.letterSpacing ?? 0}
          onChange={(e) => onStyle({ letterSpacing: num(e.target.value) || undefined })}
          className={cn(field, "w-16")}
        />
      </label>
      <input
        type="color"
        aria-label="Text colour"
        value={/^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : "#ffffff"}
        onChange={(e) => onStyle({ color: e.target.value })}
        className="h-7 w-7 cursor-pointer rounded border border-[var(--ed-line)] bg-transparent"
      />
    </div>
  );
}
