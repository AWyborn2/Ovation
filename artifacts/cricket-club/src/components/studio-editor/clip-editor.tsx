/**
 * The clip editor (B2): the polygon a layer's box is cut to. Pick a preset
 * (slash, chevron, angled band, cut corner) and its amount, flip it, or shape
 * it point by point: drag the points on the pad, or type them, and add or
 * remove points.
 */
import { useRef, useState } from "react";
import { FlipHorizontal2, Plus, X } from "lucide-react";
import { MAX_CLIP_POINTS, type TemplateClip } from "@workspace/scorecard/kind-templates";
import { btn, field, label, NumberField } from "./design-controls";
import {
  addPoint,
  CLIP_PRESET_AMOUNT,
  CLIP_PRESET_LABEL,
  CLIP_PRESETS,
  clipPolygon,
  flipX,
  movePoint,
  presetOf,
  presetPolygon,
  RECTANGLE,
  removePoint,
  type ClipPolygon,
  type ClipPreset,
} from "./clip-ops";

/** The pad shows the box (0–100) with a margin, so points just outside can be reached. */
const PAD_MIN = -10;
const PAD_SPAN = 120;

export function ClipEditor({
  value,
  onChange,
}: {
  value: TemplateClip | undefined;
  /** `done: false` while a point is being dragged; the drag ends with `done: true`. */
  onChange: (clip: TemplateClip | undefined, done?: boolean) => void;
}) {
  const polygon = clipPolygon(value);
  const preset = polygon ? presetOf(polygon) : null;
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const pad = useRef<SVGSVGElement>(null);
  const set = (p: ClipPolygon, done = true) => onChange({ polygon: p }, done);
  const endDrag = () => {
    if (dragging === null) return;
    setDragging(null);
    if (polygon) set(polygon);
  };
  const at = Math.min(selected, (polygon?.length ?? 1) - 1);

  const choose = (v: string) => {
    if (!v) onChange(undefined);
    else if (v === "custom") set(polygon ?? RECTANGLE);
    else {
      const p = presetPolygon(v as ClipPreset, CLIP_PRESET_AMOUNT[v as ClipPreset]);
      set(preset?.flipped ? flipX(p) : p);
    }
  };

  /** The pointer's position on the pad, in percent of the box. */
  const padPoint = (e: React.PointerEvent): [number, number] | null => {
    const r = pad.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height || !Number.isFinite(e.clientX + e.clientY)) return null;
    return [
      PAD_MIN + ((e.clientX - r.left) / r.width) * PAD_SPAN,
      PAD_MIN + ((e.clientY - r.top) / r.height) * PAD_SPAN,
    ];
  };

  return (
    <div className="space-y-2" role="group" aria-label="Clip">
      <div className="flex flex-wrap items-end gap-2">
        <label className={label}>
          Clip
          <select
            className={field}
            aria-label="Clip shape"
            value={!polygon ? "" : (preset?.preset ?? "custom")}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">None</option>
            {CLIP_PRESETS.map((p) => (
              <option key={p} value={p}>
                {CLIP_PRESET_LABEL[p]}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        {preset && (
          <NumberField
            name="Amount (%)"
            value={preset.amount}
            min={1}
            max={50}
            step={1}
            onChange={(amount) => {
              const p = presetPolygon(preset.preset, amount ?? CLIP_PRESET_AMOUNT[preset.preset]);
              set(preset.flipped ? flipX(p) : p);
            }}
          />
        )}
        {polygon && (
          <button
            type="button"
            className={`${btn} flex items-center gap-1`}
            onClick={() => set(flipX(polygon))}
          >
            <FlipHorizontal2 className="h-3 w-3" aria-hidden /> Flip
          </button>
        )}
      </div>
      {polygon && (
        <>
          <svg
            ref={pad}
            role="img"
            aria-label="Clip shape points"
            data-testid="clip-pad"
            viewBox={`${PAD_MIN} ${PAD_MIN} ${PAD_SPAN} ${PAD_SPAN}`}
            className="h-40 w-40 touch-none rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)]"
            onPointerMove={(e) => {
              if (dragging === null) return;
              const p = padPoint(e);
              if (p) set(movePoint(polygon, dragging, p), false);
            }}
            onPointerUp={endDrag}
            onLostPointerCapture={endDrag}
          >
            <rect
              x={0}
              y={0}
              width={100}
              height={100}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
            <polygon
              points={polygon.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="currentColor"
              fillOpacity={0.25}
              stroke="currentColor"
            />
            {polygon.map(([x, y], i) => (
              <circle
                key={i}
                data-testid={`clip-point-${i}`}
                cx={x}
                cy={y}
                r={i === at ? 4.5 : 3.5}
                fill={i === at ? "currentColor" : "var(--ed-card, #fff)"}
                stroke="currentColor"
                className="cursor-move"
                onPointerDown={(e) => {
                  e.preventDefault();
                  pad.current?.setPointerCapture?.(e.pointerId);
                  setSelected(i);
                  setDragging(i);
                }}
              />
            ))}
          </svg>
          <ol aria-label="Clip points" className="space-y-1">
            {polygon.map(([x, y], i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  className={btn}
                  aria-pressed={i === at}
                  onClick={() => setSelected(i)}
                >
                  {i + 1}
                </button>
                <NumberField
                  name={`Point ${i + 1} across (%)`}
                  value={x}
                  min={-100}
                  max={200}
                  onChange={(v) => v !== undefined && set(movePoint(polygon, i, [v, y]))}
                />
                <NumberField
                  name={`Point ${i + 1} down (%)`}
                  value={y}
                  min={-100}
                  max={200}
                  onChange={(v) => v !== undefined && set(movePoint(polygon, i, [x, v]))}
                />
                <button
                  type="button"
                  className={btn}
                  aria-label={`Remove clip point ${i + 1}`}
                  disabled={polygon.length <= 3}
                  onClick={() => {
                    set(removePoint(polygon, i));
                    setSelected(Math.max(0, i - 1));
                  }}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={`${btn} flex items-center gap-1`}
            disabled={polygon.length >= MAX_CLIP_POINTS}
            onClick={() => {
              set(addPoint(polygon, at));
              setSelected(at + 1);
            }}
          >
            <Plus className="h-3 w-3" aria-hidden /> Add point after {at + 1}
          </button>
        </>
      )}
    </div>
  );
}
