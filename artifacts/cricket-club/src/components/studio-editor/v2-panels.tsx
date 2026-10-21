/**
 * The template editor's settings for one format v2 layer (ADR-011, L5-B):
 * stack groups (T5.9), conditions and text fit (T5.10), styles (T5.11),
 * motion (T5.12) and a vector's colours (T5.13). Every change goes through
 * `onEdit` with the page's next document, so it is one undo step.
 */
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, LogOut, Ungroup } from "lucide-react";
import {
  BLEND_MODES,
  COLOUR_TOKENS,
  MOTION_IN_PRESETS,
  MOTION_LOOP_PRESETS,
  pageTokens,
  STACK_ALIGNS,
  STACK_DIRECTIONS,
  STACK_JUSTIFIES,
  type PageKey,
  type ShowWhen,
  type TemplateFill,
  type TemplateFilter,
  type TemplateLayerV2,
  type TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";
import { layersOf, type EditorDoc } from "./document";
import {
  findLayer,
  groupLevels,
  moveChild,
  svgTokens,
  swapSvgToken,
  takeOutOfGroup,
  unwrapGroup,
  updatePageLayer,
} from "./v2-ops";

const TOKEN_LABEL: Record<string, string> = {
  "--gold": "Club accent",
  "--panel": "Club panel",
  "--panel-2": "Club panel, darker",
  "--ink": "Stage",
  "--accent-ink": "Text on accent",
};

const input =
  "h-8 rounded-md border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-xs text-[var(--ed-ink)]";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[var(--ed-line)] py-3" aria-label={title}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ed-ink2)]">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[var(--ed-ink2)]">{label}</span>
      {children}
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <Row label={label}>
      <select
        aria-label={label}
        className={input}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Row>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label}>
      <input
        aria-label={label}
        type="number"
        className={`${input} w-20`}
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </Row>
  );
}

/** A colour: one of the club's tokens, or a hex. */
function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const token = /^var\((--[\w-]+)/.exec(value)?.[1];
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
  return (
    <Row label={label}>
      <span className="flex items-center gap-1">
        <select
          aria-label={`${label} colour`}
          className={input}
          value={token ?? "hex"}
          onChange={(e) => onChange(e.target.value === "hex" ? hex : `var(${e.target.value})`)}
        >
          {COLOUR_TOKENS.map((t) => (
            <option key={t} value={t}>
              {TOKEN_LABEL[t] ?? t}
            </option>
          ))}
          <option value="hex">Custom</option>
        </select>
        {!token && (
          <input
            aria-label={`${label} hex`}
            type="color"
            className="h-8 w-8 rounded border border-[var(--ed-line)] bg-transparent"
            value={hex}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </span>
    </Row>
  );
}

type FillKind = "none" | "solid" | "linear" | "radial";
const fillKind = (f: TemplateFill | undefined): FillKind =>
  f === undefined ? "none" : typeof f === "string" ? "solid" : f.type;

/** A fill: none, a colour, or a two-colour linear or radial gradient. */
function FillField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TemplateFill | undefined;
  onChange: (v: TemplateFill | undefined) => void;
}) {
  const kind = fillKind(value);
  const stops =
    value && typeof value === "object" ? value.stops : [{ color: "var(--gold)" }, { color: "var(--ink)" }];
  const from = stops[0]?.color ?? "var(--gold)";
  const to = stops[stops.length - 1]?.color ?? "var(--ink)";
  const gradient = (k: "linear" | "radial", a: string, b: string): TemplateFill =>
    k === "linear"
      ? { type: "linear", angle: value && typeof value === "object" && value.type === "linear" ? (value.angle ?? 180) : 180, stops: [{ color: a }, { color: b }] }
      : { type: "radial", stops: [{ color: a }, { color: b }] };
  return (
    <>
      <Choice<FillKind>
        label={label}
        value={kind}
        options={[
          ["none", "None"],
          ["solid", "Colour"],
          ["linear", "Linear gradient"],
          ["radial", "Radial gradient"],
        ]}
        onChange={(k) =>
          onChange(k === "none" ? undefined : k === "solid" ? (typeof value === "string" ? value : from) : gradient(k, from, to))
        }
      />
      {kind === "solid" && typeof value === "string" && (
        <ColourField label={`${label} colour`} value={value} onChange={onChange} />
      )}
      {(kind === "linear" || kind === "radial") && (
        <>
          <ColourField label="From" value={from} onChange={(c) => onChange(gradient(kind, c, to))} />
          <ColourField label="To" value={to} onChange={(c) => onChange(gradient(kind, from, c))} />
          {kind === "linear" && value && typeof value === "object" && value.type === "linear" && (
            <NumberField
              label="Angle"
              value={value.angle ?? 180}
              min={0}
              max={360}
              onChange={(angle) => onChange({ ...value, angle })}
            />
          )}
        </>
      )}
    </>
  );
}

type Tri = "any" | "yes" | "no";
const tri = (v: boolean | undefined): Tri => (v === undefined ? "any" : v ? "yes" : "no");
const fromTri = (v: Tri): boolean | undefined => (v === "any" ? undefined : v === "yes");

function compact<T extends object>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
}

/** The settings panel for the selected layer of a v2 page. */
export function LayerSettingsPanel({
  doc,
  layerId,
  kind,
  page,
  onEdit,
  onSelect,
}: {
  /** The page's document (`pageDoc`). */
  doc: EditorDoc;
  layerId: string;
  kind: string;
  page: PageKey;
  onEdit: (next: EditorDoc) => void;
  onSelect: (id: string) => void;
}) {
  const found = findLayer(layersOf(doc) as unknown as TemplateLayerV2[], layerId);
  if (!found) return <p className="text-xs text-[var(--ed-ink2)]">Select a layer.</p>;
  const { layer, parent, depth } = found;
  const style: TemplateStyleV2 = layer.style ?? {};
  const set = (patch: Partial<TemplateLayerV2>) => onEdit(updatePageLayer(doc, layer.id, patch));
  const setStyle = (patch: Partial<TemplateStyleV2>) =>
    set({ style: compact({ ...style, ...patch }) } as Partial<TemplateLayerV2>);
  const cat = pageTokens(kind, page);
  const fields = [...(cat?.fields ?? []), ...(cat?.images ?? [])];
  const showWhen: ShowWhen = layer.showWhen ?? {};
  const setShow = (patch: Partial<ShowWhen>) => set({ showWhen: compact({ ...showWhen, ...patch }) });
  const filter = (style.filter ?? [])[0] as TemplateFilter | undefined;
  const isText = layer.kind === "text";
  const isImage = ["photo", "image", "sticker", "medal"].includes(layer.kind);

  return (
    <div className="text-[var(--ed-ink)]">
      <p className="text-xs text-[var(--ed-ink2)]">
        {layer.name ?? layer.id} · {layer.kind}
        {parent ? ` in ${parent.name ?? parent.id}` : ""}
      </p>

      {layer.kind === "group" && (
        <Section title="Stack">
          <Choice
            label="Layout"
            value={layer.stack ? "stack" : "free"}
            options={[
              ["stack", "Stack"],
              ["free", "Free (own boxes)"],
            ]}
            onChange={(v) =>
              set({
                stack: v === "stack" ? { direction: "column", gap: 1, align: "start", justify: "start" } : undefined,
              } as Partial<TemplateLayerV2>)
            }
          />
          {layer.stack && (
            <>
              <Choice
                label="Direction"
                value={layer.stack.direction}
                options={STACK_DIRECTIONS.map((d) => [d, d === "column" ? "Down" : "Across"] as const)}
                onChange={(direction) => set({ stack: { ...layer.stack!, direction } } as Partial<TemplateLayerV2>)}
              />
              <NumberField
                label="Gap (% of width)"
                value={layer.stack.gap ?? 0}
                min={0}
                max={50}
                step={0.5}
                onChange={(gap) => set({ stack: { ...layer.stack!, gap } } as Partial<TemplateLayerV2>)}
              />
              <Choice
                label="Align"
                value={layer.stack.align ?? "start"}
                options={STACK_ALIGNS.map((a) => [a, a] as const)}
                onChange={(align) => set({ stack: { ...layer.stack!, align } } as Partial<TemplateLayerV2>)}
              />
              <Choice
                label="Spread"
                value={layer.stack.justify ?? "start"}
                options={STACK_JUSTIFIES.map((j) => [j, j] as const)}
                onChange={(justify) => set({ stack: { ...layer.stack!, justify } } as Partial<TemplateLayerV2>)}
              />
            </>
          )}
          <ol aria-label="Layers in this group" className="flex flex-col gap-1">
            {layer.children.map((c, i) => (
              <li key={c.id} className="flex items-center gap-1 text-xs">
                <button type="button" className="flex-1 truncate text-left underline-offset-2 hover:underline" onClick={() => onSelect(c.id)}>
                  {c.name ?? c.id}
                </button>
                <button type="button" aria-label={`Move ${c.name ?? c.id} up`} disabled={i === 0} onClick={() => onEdit(moveChild(doc, layer.id, c.id, -1))}>
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" aria-label={`Move ${c.name ?? c.id} down`} disabled={i === layer.children.length - 1} onClick={() => onEdit(moveChild(doc, layer.id, c.id, 1))}>
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="flex items-center gap-1 text-xs font-semibold" onClick={() => onEdit(unwrapGroup(doc, layer.id))}>
            <Ungroup className="h-3.5 w-3.5" aria-hidden /> Ungroup
          </button>
          <p className="text-[11px] text-[var(--ed-ink2)]">
            Group {depth} of at most 4 levels{groupLevels(layer) > 1 ? `, holding ${groupLevels(layer) - 1} more` : ""}.
          </p>
        </Section>
      )}

      {parent && (
        <button
          type="button"
          className="mt-2 flex items-center gap-1 text-xs font-semibold"
          onClick={() => onEdit(takeOutOfGroup(doc, layer.id))}
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Take out of the group
        </button>
      )}

      <Section title="Show when">
        <Choice
          label="Field has a value"
          value={showWhen.field ?? ""}
          options={[["", "Always"], ...fields.map((f) => [f.key, f.label] as const)]}
          onChange={(field) => setShow({ field: field || undefined })}
        />
        <Choice<Tri>
          label="Photo"
          value={tri(showWhen.photo)}
          options={[["any", "Either way"], ["yes", "Card has a photo"], ["no", "No photo"]]}
          onChange={(v) => setShow({ photo: fromTri(v) })}
        />
        <Choice<Tri>
          label="Sponsors"
          value={tri(showWhen.sponsors)}
          options={[["any", "Either way"], ["yes", "Has sponsors"], ["no", "No sponsors"]]}
          onChange={(v) => setShow({ sponsors: fromTri(v) })}
        />
        <Choice<Tri>
          label="Card"
          value={tri(showWhen.junior)}
          options={[["any", "Junior or senior"], ["yes", "Junior only"], ["no", "Senior only"]]}
          onChange={(v) => setShow({ junior: fromTri(v) })}
        />
      </Section>

      {isText && (
        <Section title="Text fit">
          <Choice
            label="Lines"
            value={String(layer.fit?.maxLines ?? 1) as "1" | "2"}
            options={[["1", "One line"], ["2", "Up to two"]]}
            onChange={(v) => set({ fit: { ...layer.fit, maxLines: v === "2" ? 2 : 1 } } as Partial<TemplateLayerV2>)}
          />
          <NumberField
            label="Shrink to (%)"
            value={Math.round((layer.fit?.minScale ?? 0.6) * 100)}
            min={30}
            max={100}
            step={5}
            onChange={(v) => set({ fit: { ...layer.fit, minScale: v / 100 } } as Partial<TemplateLayerV2>)}
          />
          <Row label="End with …">
            <input
              type="checkbox"
              aria-label="End with an ellipsis"
              checked={layer.fit?.ellipsis === true}
              onChange={(e) => set({ fit: { ...layer.fit, ellipsis: e.target.checked } } as Partial<TemplateLayerV2>)}
            />
          </Row>
        </Section>
      )}

      <Section title="Style">
        <FillField label="Fill" value={style.fill} onChange={(fill) => setStyle({ fill })} />
        {isText && <FillField label="Text fill" value={style.textFill} onChange={(textFill) => setStyle({ textFill })} />}
        <Choice
          label="Border"
          value={style.border?.style ?? "none"}
          options={[["none", "None"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]}
          onChange={(v) =>
            setStyle({
              border: v === "none" ? undefined : { width: style.border?.width ?? 0.3, color: style.border?.color ?? "var(--gold)", style: v },
            })
          }
        />
        {style.border && (
          <>
            <NumberField label="Border width" value={style.border.width} min={0} max={20} step={0.1} onChange={(width) => setStyle({ border: { ...style.border!, width } })} />
            <ColourField label="Border" value={style.border.color} onChange={(color) => setStyle({ border: { ...style.border!, color } })} />
          </>
        )}
        <Row label="Shadow">
          <input
            type="checkbox"
            aria-label="Shadow"
            checked={isText ? !!style.textShadow?.length : !!style.boxShadow?.length}
            onChange={(e) =>
              setStyle(
                isText
                  ? { textShadow: e.target.checked ? [{ x: 0, y: 0.3, blur: 1, color: "#00000099" }] : undefined }
                  : { boxShadow: e.target.checked ? [{ x: 0, y: 0.5, blur: 2, color: "#00000066" }] : undefined },
              )
            }
          />
        </Row>
        <Choice
          label="Blend"
          value={style.blend ?? "normal"}
          options={BLEND_MODES.map((b) => [b, b] as const)}
          onChange={(blend) => setStyle({ blend: blend === "normal" ? undefined : blend })}
        />
        {isImage && (
          <>
            <Choice
              label="Photo filter"
              value={filter?.preset ?? "none"}
              options={[["none", "None"], ["duotone", "Duotone"], ["grayscale", "Black and white"], ["blur", "Blur"]]}
              onChange={(v) =>
                setStyle({
                  filter:
                    v === "none"
                      ? undefined
                      : [v === "duotone" ? { preset: "duotone", dark: "var(--ink)", light: "var(--gold)" } : v === "grayscale" ? { preset: "grayscale", amount: 1 } : { preset: "blur", px: 6 }],
                })
              }
            />
            {filter?.preset === "duotone" && (
              <>
                <ColourField label="Shadows" value={filter.dark} onChange={(dark) => setStyle({ filter: [{ ...filter, dark }] })} />
                <ColourField label="Highlights" value={filter.light} onChange={(light) => setStyle({ filter: [{ ...filter, light }] })} />
              </>
            )}
            {filter?.preset === "blur" && (
              <NumberField label="Blur (px)" value={filter.px} min={0} max={20} onChange={(px) => setStyle({ filter: [{ preset: "blur", px }] })} />
            )}
          </>
        )}
        <Choice
          label="Texture"
          value={style.overlay?.kind ?? "none"}
          options={[["none", "None"], ["grain", "Grain"], ["halftone", "Halftone"]]}
          onChange={(v) => setStyle({ overlay: v === "none" ? undefined : { kind: v, opacity: 0.35 } })}
        />
      </Section>

      <Section title="Motion">
        <Choice
          label="Entrance"
          value={layer.motion?.in?.preset ?? "none"}
          options={[["none", "None"], ...MOTION_IN_PRESETS.map((p) => [p, p] as const)]}
          onChange={(v) =>
            set({
              motion: compact({ ...layer.motion, in: v === "none" ? undefined : { ...layer.motion?.in, preset: v } }),
            } as Partial<TemplateLayerV2>)
          }
        />
        {layer.motion?.in && (
          <>
            <NumberField label="Delay (ms)" value={layer.motion.in.delayMs ?? 0} min={0} max={10000} step={50} onChange={(delayMs) => set({ motion: { ...layer.motion, in: { ...layer.motion!.in!, delayMs } } } as Partial<TemplateLayerV2>)} />
            <NumberField label="Duration (ms)" value={layer.motion.in.durationMs ?? 600} min={100} max={10000} step={50} onChange={(durationMs) => set({ motion: { ...layer.motion, in: { ...layer.motion!.in!, durationMs } } } as Partial<TemplateLayerV2>)} />
          </>
        )}
        <Choice
          label="Loop"
          value={layer.motion?.loop?.preset ?? "none"}
          options={[["none", "None"], ...MOTION_LOOP_PRESETS.map((p) => [p, p === "pulse" ? "Pulse" : "Shine"] as const)]}
          onChange={(v) =>
            set({
              motion: compact({ ...layer.motion, loop: v === "none" ? undefined : { ...layer.motion?.loop, preset: v } }),
            } as Partial<TemplateLayerV2>)
          }
        />
        {layer.motion?.loop && (
          <NumberField label="Period (ms)" value={layer.motion.loop.periodMs ?? (layer.motion.loop.preset === "pulse" ? 1400 : 5500)} min={200} max={20000} step={100} onChange={(periodMs) => set({ motion: { ...layer.motion, loop: { ...layer.motion!.loop!, periodMs } } } as Partial<TemplateLayerV2>)} />
        )}
      </Section>

      {layer.kind === "vector" && (
        <Section title="Vector colours">
          {svgTokens(layer.svg).length === 0 && (
            <p className="text-xs text-[var(--ed-ink2)]">This vector uses fixed colours only.</p>
          )}
          {svgTokens(layer.svg).map((token) => (
            <Choice
              key={token}
              label={TOKEN_LABEL[token] ?? token}
              value={token}
              options={[...new Set([token, ...COLOUR_TOKENS])].map((t) => [t, TOKEN_LABEL[t] ?? t] as const)}
              onChange={(to) => set({ svg: swapSvgToken(layer.svg, token, to) } as Partial<TemplateLayerV2>)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}
