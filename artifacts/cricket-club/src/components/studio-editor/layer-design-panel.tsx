/**
 * Editor v2's layer panel (ADR-011 L5-B, T5.9–T5.13): what a selected layer
 * does beyond its box and text style.
 *
 * - Stack: a group's direction, gap and alignment, its children's order, and
 *   making or undoing a stack (depth limited to `MAX_STACK_DEPTH`).
 * - Show when: the field, photo, sponsors and junior conditions.
 * - Text fit: lines, smallest size and ellipsis.
 * - Style: a colour or gradient fill (`gradient-editor.tsx`), a text fill,
 *   border, shadows, blending, photo filters and the clip (`clip-editor.tsx`),
 *   every colour a hex or a palette token.
 * - Motion: an entrance and a loop, with a preview.
 * - Vector: swap the drawing's colours for tokens or hexes.
 */
import { ArrowDown, ArrowUp, Play } from "lucide-react";
import {
  BLEND_MODES,
  BORDER_STYLES,
  MAX_BLUR_PX,
  MAX_STACK_DEPTH,
  MOTION_IN_PRESETS,
  MOTION_LOOP_PRESETS,
  STACK_ALIGNS,
  STACK_DIRECTIONS,
  STACK_JUSTIFIES,
  pageTokens,
  type LayerMotion,
  type PageKey,
  type ShowWhen,
  type StackSpec,
  type TemplateFilter,
  type TemplateStyleV2,
  type TextFit,
} from "@workspace/scorecard/kind-templates";
import { ClipEditor } from "./clip-editor";
import { btn, ColourField, field, label, NumberField, Section } from "./design-controls";
import { GradientEditor } from "./gradient-editor";
import { DEFAULT_GRADIENT, isGradient } from "./gradient-ops";
import { depthOf, type EditorLayer } from "./template-doc";

const tri = (v: boolean | undefined) => (v === undefined ? "" : v ? "yes" : "no");
const fromTri = (v: string): boolean | undefined => (v === "" ? undefined : v === "yes");

/** Drop empty keys so a cleared control leaves nothing behind. */
function compact<T extends Record<string, unknown>>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
}

/** The colours a drawing uses, as written (`#hex` or `var(--token)`). */
export function vectorColours(svg: string): string[] {
  const found = new Set<string>();
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*=\s*"([^"]+)"/g)) {
    const c = m[1]!.trim();
    if (c !== "none" && !c.startsWith("url(")) found.add(c);
  }
  return [...found];
}

/** The drawing with every use of one colour swapped for another. */
export function swapVectorColour(svg: string, from: string, to: string): string {
  return svg.replace(
    /((?:fill|stroke|stop-color)\s*=\s*")([^"]+)(")/g,
    (all, a: string, c: string, b: string) => (c.trim() === from ? `${a}${to}${b}` : all),
  );
}

export type LayerDesignPanelProps = {
  layer: EditorLayer;
  kind: string;
  page: PageKey;
  /**
   * Change the layer. `done: false` is part of a drag (the clip pad's points):
   * the editor shows it and records the whole drag as one change when it ends.
   */
  onPatch: (patch: Partial<EditorLayer>, done?: boolean) => void;
  /** Select a child of a stack (or any layer) by id. */
  onSelect: (id: string) => void;
  onMoveChild: (childId: string, delta: -1 | 1) => void;
  onUnstack: () => void;
  /** Play the card's motion in the canvas preview. */
  onPlay: () => void;
};

export function LayerDesignPanel({
  layer,
  kind,
  page,
  onPatch,
  onSelect,
  onMoveChild,
  onUnstack,
  onPlay,
}: LayerDesignPanelProps) {
  const style = (layer.style ?? {}) as TemplateStyleV2;
  const setStyle = (patch: Partial<TemplateStyleV2>, done?: boolean) =>
    onPatch({ style: compact({ ...style, ...patch }) as TemplateStyleV2 | undefined }, done);
  const show = layer.showWhen ?? {};
  const setShow = (patch: Partial<ShowWhen>) =>
    onPatch({ showWhen: compact({ ...show, ...patch }) });
  const fit = layer.fit ?? {};
  const setFit = (patch: Partial<TextFit>) => onPatch({ fit: compact({ ...fit, ...patch }) });
  const motion = layer.motion ?? {};
  const setMotion = (patch: Partial<LayerMotion>) =>
    onPatch({ motion: compact({ ...motion, ...patch }) });
  const fields = [
    ...(pageTokens(kind, page)?.fields ?? []),
    ...(pageTokens(kind, page)?.images ?? []),
  ];
  const isText = layer.kind === "text";
  const isPhoto = layer.kind === "photo" || layer.kind === "image";

  const fill = style.fill;
  const gradient = isGradient(fill) ? fill : null;
  const textFill = isGradient(style.textFill) ? style.textFill : null;
  const filter = style.filter?.[0];
  const setFilter = (f: TemplateFilter | undefined) => setStyle({ filter: f ? [f] : undefined });
  const shadow = style.boxShadow?.[0];
  const textShadow = style.textShadow?.[0];

  return (
    <div className="space-y-3 text-sm" data-testid="layer-design-panel">
      <p className="font-semibold">{layer.name ?? layer.kind}</p>

      {layer.kind === "group" && (
        <Section title="Stack">
          <div className="flex flex-wrap gap-2">
            <label className={label}>
              Direction
              <select
                className={field}
                aria-label="Stack direction"
                value={layer.stack?.direction ?? "column"}
                onChange={(e) =>
                  onPatch({
                    stack: {
                      ...(layer.stack ?? {}),
                      direction: e.target.value as StackSpec["direction"],
                    },
                  })
                }
              >
                {STACK_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === "column" ? "Down" : "Across"}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              name="Gap"
              value={layer.stack?.gap}
              min={0}
              max={20}
              step={0.5}
              onChange={(gap) =>
                onPatch({ stack: { direction: "column", ...layer.stack, gap } as StackSpec })
              }
            />
            <label className={label}>
              Align
              <select
                className={field}
                aria-label="Stack align"
                value={layer.stack?.align ?? "start"}
                onChange={(e) =>
                  onPatch({
                    stack: {
                      direction: "column",
                      ...layer.stack,
                      align: e.target.value as StackSpec["align"],
                    },
                  })
                }
              >
                {STACK_ALIGNS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              Spread
              <select
                className={field}
                aria-label="Stack spread"
                value={layer.stack?.justify ?? "start"}
                onChange={(e) =>
                  onPatch({
                    stack: {
                      direction: "column",
                      ...layer.stack,
                      justify: e.target.value as StackSpec["justify"],
                    },
                  })
                }
              >
                {STACK_JUSTIFIES.map((j) => (
                  <option key={j}>{j}</option>
                ))}
              </select>
            </label>
          </div>
          <ol aria-label="Stack layers" className="space-y-1">
            {(layer.children ?? []).map((c, i, all) => (
              <li key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className={`${btn} flex-1 text-left`}
                  onClick={() => onSelect(c.id)}
                >
                  {c.name ?? c.kind}
                </button>
                <button
                  type="button"
                  className={btn}
                  aria-label={`Move ${c.name ?? c.kind} up`}
                  disabled={i === 0}
                  onClick={() => onMoveChild(c.id, -1)}
                >
                  <ArrowUp className="h-3 w-3" aria-hidden />
                </button>
                <button
                  type="button"
                  className={btn}
                  aria-label={`Move ${c.name ?? c.kind} down`}
                  disabled={i === all.length - 1}
                  onClick={() => onMoveChild(c.id, 1)}
                >
                  <ArrowDown className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-[var(--ed-ink2)]">
            A hidden or empty layer takes no space. Stacks nest {depthOf(layer)} of{" "}
            {MAX_STACK_DEPTH} deep.
          </p>
          <button type="button" className={btn} onClick={onUnstack}>
            Undo stack
          </button>
        </Section>
      )}

      <Section title="Show when">
        <label className={label}>
          Field has a value
          <select
            className={field}
            aria-label="Show when field"
            value={show.field ?? ""}
            onChange={(e) => setShow({ field: e.target.value || undefined })}
          >
            <option value="">Always</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["photo", "Photo", "With a photo", "Without a photo"],
              ["sponsors", "Sponsors", "With sponsors", "Without sponsors"],
              ["junior", "Card", "Junior cards", "Senior cards"],
            ] as const
          ).map(([key, name, yes, no]) => (
            <label key={key} className={label}>
              {name}
              <select
                className={field}
                aria-label={`Show when ${name.toLowerCase()}`}
                value={tri(show[key])}
                onChange={(e) => setShow({ [key]: fromTri(e.target.value) })}
              >
                <option value="">Any</option>
                <option value="yes">{yes}</option>
                <option value="no">{no}</option>
              </select>
            </label>
          ))}
        </div>
      </Section>

      {isText && (
        <Section title="Text fit">
          <div className="flex flex-wrap items-end gap-2">
            <label className={label}>
              Lines
              <select
                className={field}
                aria-label="Text lines"
                value={fit.maxLines ?? 1}
                onChange={(e) => setFit({ maxLines: Number(e.target.value) === 2 ? 2 : undefined })}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <NumberField
              name="Smallest size (%)"
              value={fit.minScale !== undefined ? Math.round(fit.minScale * 100) : undefined}
              min={30}
              max={100}
              step={5}
              onChange={(v) => setFit({ minScale: v === undefined ? undefined : v / 100 })}
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={!!fit.ellipsis}
                onChange={(e) => setFit({ ellipsis: e.target.checked || undefined })}
              />
              End with …
            </label>
          </div>
        </Section>
      )}

      <Section title="Style">
        <label className={label}>
          Fill
          <select
            className={field}
            aria-label="Fill"
            value={gradient ? "gradient" : fill ? "solid" : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) setStyle({ fill: undefined });
              else if (v === "solid")
                setStyle({ fill: gradient?.stops[0]?.color ?? "var(--panel)" });
              else setStyle({ fill: DEFAULT_GRADIENT });
            }}
          >
            <option value="">None</option>
            <option value="solid">Colour</option>
            <option value="gradient">Gradient</option>
          </select>
        </label>
        {typeof fill === "string" && (
          <ColourField name="Fill" value={fill} onChange={(c) => setStyle({ fill: c })} />
        )}
        {gradient && (
          <GradientEditor name="Fill" value={gradient} onChange={(g) => setStyle({ fill: g })} />
        )}
        {isText && (
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={!!style.textFill}
              onChange={(e) =>
                setStyle({
                  textFill: e.target.checked
                    ? {
                        type: "linear",
                        angle: 90,
                        stops: [
                          { color: "var(--gold)", at: 0 },
                          { color: "#ffffff", at: 50 },
                          { color: "var(--gold)", at: 100 },
                        ],
                      }
                    : undefined,
                })
              }
            />
            Gradient text (foil)
          </label>
        )}
        {isText && textFill && (
          <GradientEditor
            name="Text fill"
            value={textFill}
            onChange={(g) => setStyle({ textFill: g })}
          />
        )}
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            name="Border"
            value={style.border?.width}
            min={0}
            max={5}
            step={0.1}
            onChange={(width) =>
              setStyle({
                border: width ? { color: "var(--ink)", ...style.border, width } : undefined,
              })
            }
          />
          {style.border && (
            <>
              <ColourField
                name="Border"
                value={style.border.color}
                onChange={(c) =>
                  style.border &&
                  setStyle({ border: { ...style.border, color: c ?? "var(--ink)" } })
                }
              />
              <select
                className={field}
                aria-label="Border style"
                value={style.border.style ?? "solid"}
                onChange={(e) =>
                  style.border &&
                  setStyle({
                    border: {
                      ...style.border,
                      style: e.target.value as (typeof BORDER_STYLES)[number],
                    },
                  })
                }
              >
                {BORDER_STYLES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            name="Shadow"
            value={shadow?.blur}
            min={0}
            max={10}
            step={0.5}
            onChange={(blur) =>
              setStyle({
                boxShadow:
                  blur === undefined
                    ? undefined
                    : [{ x: 0, y: 0.5, color: "#00000080", ...shadow, blur }],
              })
            }
          />
          {isText && (
            <NumberField
              name="Glow"
              value={textShadow?.blur}
              min={0}
              max={10}
              step={0.5}
              onChange={(blur) =>
                setStyle({
                  textShadow:
                    blur === undefined
                      ? undefined
                      : [{ x: 0, y: 0, color: "var(--gold)", ...textShadow, blur }],
                })
              }
            />
          )}
          <label className={label}>
            Blend
            <select
              className={field}
              aria-label="Blend"
              value={style.blend ?? "normal"}
              onChange={(e) =>
                setStyle({
                  blend:
                    e.target.value === "normal"
                      ? undefined
                      : (e.target.value as (typeof BLEND_MODES)[number]),
                })
              }
            >
              {BLEND_MODES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        {isPhoto && (
          <div className="flex flex-wrap items-end gap-2">
            <label className={label}>
              Photo filter
              <select
                className={field}
                aria-label="Photo filter"
                value={filter?.preset ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilter(
                    v === "duotone"
                      ? { preset: "duotone", dark: "var(--panel)", light: "var(--gold)" }
                      : v === "grayscale"
                        ? { preset: "grayscale", amount: 1 }
                        : v === "blur"
                          ? { preset: "blur", px: 4 }
                          : undefined,
                  );
                }}
              >
                <option value="">None</option>
                <option value="duotone">Duotone</option>
                <option value="grayscale">Black and white</option>
                <option value="blur">Blur</option>
              </select>
            </label>
            {filter?.preset === "duotone" && (
              <>
                <ColourField
                  name="Duotone dark"
                  value={filter.dark}
                  onChange={(c) => setFilter({ ...filter, dark: c ?? "var(--panel)" })}
                />
                <ColourField
                  name="Duotone light"
                  value={filter.light}
                  onChange={(c) => setFilter({ ...filter, light: c ?? "var(--gold)" })}
                />
              </>
            )}
            {filter?.preset === "blur" && (
              <NumberField
                name="Blur (px)"
                value={filter.px}
                min={0}
                max={MAX_BLUR_PX}
                onChange={(px) => setFilter({ preset: "blur", px: px ?? 0 })}
              />
            )}
          </div>
        )}
        <ClipEditor value={style.clip} onChange={(clip, done) => setStyle({ clip }, done)} />
      </Section>

      <Section title="Motion">
        <div className="flex flex-wrap items-end gap-2">
          <label className={label}>
            Entrance
            <select
              className={field}
              aria-label="Entrance"
              value={motion.in?.preset ?? ""}
              onChange={(e) =>
                setMotion({
                  in: e.target.value
                    ? {
                        ...motion.in,
                        preset: e.target.value as (typeof MOTION_IN_PRESETS)[number],
                      }
                    : undefined,
                })
              }
            >
              <option value="">None</option>
              {MOTION_IN_PRESETS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {motion.in && (
            <>
              <NumberField
                name="Delay (ms)"
                value={motion.in.delayMs}
                min={0}
                max={10000}
                step={100}
                onChange={(delayMs) => motion.in && setMotion({ in: { ...motion.in, delayMs } })}
              />
              <NumberField
                name="Length (ms)"
                value={motion.in.durationMs}
                min={100}
                max={5000}
                step={100}
                onChange={(durationMs) =>
                  motion.in && setMotion({ in: { ...motion.in, durationMs } })
                }
              />
            </>
          )}
          <label className={label}>
            Loop
            <select
              className={field}
              aria-label="Loop"
              value={motion.loop?.preset ?? ""}
              onChange={(e) =>
                setMotion({
                  loop: e.target.value
                    ? {
                        ...motion.loop,
                        preset: e.target.value as (typeof MOTION_LOOP_PRESETS)[number],
                      }
                    : undefined,
                })
              }
            >
              <option value="">None</option>
              {MOTION_LOOP_PRESETS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {motion.loop && (
            <NumberField
              name="Every (ms)"
              value={motion.loop.periodMs}
              min={200}
              max={20000}
              step={100}
              onChange={(periodMs) =>
                motion.loop && setMotion({ loop: { ...motion.loop, periodMs } })
              }
            />
          )}
          <button type="button" className={`${btn} flex items-center gap-1`} onClick={onPlay}>
            <Play className="h-3 w-3" aria-hidden /> Play
          </button>
        </div>
      </Section>

      {layer.kind === "vector" && layer.svg && (
        <Section title="Drawing colours">
          <ul className="space-y-1">
            {vectorColours(layer.svg).map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-4 w-4 rounded border border-[var(--ed-line)]"
                  style={{ background: c }}
                />
                <ColourField
                  name={`Drawing ${c}`}
                  value={c}
                  onChange={(to) => to && onPatch({ svg: swapVectorColour(layer.svg!, c, to) })}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
