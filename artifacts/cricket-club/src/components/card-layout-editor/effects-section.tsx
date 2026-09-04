import { RotateCcw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { DEFAULT_LAYER_EFFECTS, hasLayerEffects, type LayerEffects } from "@/lib/share-card";
import { PaletteSwatches } from "./palette-swatches";
import { EffectBtn, RangeRow } from "./controls";
import { EffectPresets } from "./effect-presets";

// Per-layer visual effects: colour grade, mask shape, gradient overlay, drop
// shadow, and border — all from the club palette. "Reset" clears every effect.
// A presets row lets admins apply a saved/built-in effect bundle in one click,
// or save the current layer's effects as a new named preset.
export function EffectsSection({
  effects,
  onChange,
}: {
  effects?: LayerEffects;
  onChange: (effects: LayerEffects | undefined) => void;
}) {
  const cur = effects ?? {};
  const fx = { ...DEFAULT_LAYER_EFFECTS, ...cur };
  const update = (patch: Partial<LayerEffects>) => {
    const merged = { ...DEFAULT_LAYER_EFFECTS, ...cur, ...patch };
    onChange(hasLayerEffects(merged) ? merged : undefined);
  };
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Effects</Label>
        {hasLayerEffects(cur) && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      <EffectPresets
        current={cur}
        onApply={(eff) => onChange(hasLayerEffects(eff) ? { ...DEFAULT_LAYER_EFFECTS, ...eff } : undefined)}
      />

      {/* Whole-layer transparency. 1 = fully opaque (cleared from effects). */}
      <RangeRow
        label="Opacity"
        min={0.1}
        max={1}
        step={0.05}
        value={cur.opacity ?? 1}
        onChange={(v) => update({ opacity: v >= 1 ? undefined : v })}
      />

      {/* Colour grade */}
      <div className="space-y-1">
        <div className="flex gap-1">
          <EffectBtn active={!cur.tone} onClick={() => update({ tone: undefined })}>
            Colour
          </EffectBtn>
          <EffectBtn active={cur.tone === "bw"} onClick={() => update({ tone: "bw" })}>
            B&amp;W
          </EffectBtn>
          <EffectBtn active={cur.tone === "duotone"} onClick={() => update({ tone: "duotone" })}>
            Duotone
          </EffectBtn>
        </div>
        {cur.tone === "duotone" && (
          <PaletteSwatches value={fx.toneColor!} onChange={(c) => update({ toneColor: c })} />
        )}
        {cur.tone && (
          <RangeRow
            label="Strength"
            min={0}
            max={1}
            step={0.05}
            value={fx.toneIntensity!}
            onChange={(v) => update({ toneIntensity: v })}
          />
        )}
      </div>

      {/* Mask shape */}
      <div className="space-y-1">
        <div className="flex gap-1">
          <EffectBtn active={!cur.mask} onClick={() => update({ mask: undefined })}>
            None
          </EffectBtn>
          <EffectBtn active={cur.mask === "rounded"} onClick={() => update({ mask: "rounded" })}>
            Rounded
          </EffectBtn>
          <EffectBtn active={cur.mask === "circle"} onClick={() => update({ mask: "circle" })}>
            Circle
          </EffectBtn>
          <EffectBtn active={cur.mask === "feather"} onClick={() => update({ mask: "feather" })}>
            Feather
          </EffectBtn>
        </div>
        {cur.mask === "rounded" && (
          <RangeRow
            label="Corner"
            min={0}
            max={0.5}
            step={0.02}
            value={fx.maskRadius!}
            onChange={(v) => update({ maskRadius: v })}
          />
        )}
        {cur.mask === "feather" && (
          <RangeRow
            label="Softness"
            min={0.05}
            max={0.9}
            step={0.05}
            value={fx.maskRadius!}
            onChange={(v) => update({ maskRadius: v })}
          />
        )}
      </div>

      {/* Gradient overlay */}
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={!!cur.gradient}
          onChange={(e) => update({ gradient: e.target.checked })}
        />
        Gradient overlay
      </label>
      {cur.gradient && (
        <div className="space-y-1 pl-4">
          <div className="flex items-center gap-2">
            <PaletteSwatches value={fx.gradientColor!} onChange={(c) => update({ gradientColor: c })} />
            <select
              value={fx.gradientDir}
              onChange={(e) => update({ gradientDir: e.target.value as LayerEffects["gradientDir"] })}
              className="h-7 flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <RangeRow
            label="Strength"
            min={0}
            max={1}
            step={0.05}
            value={fx.gradientIntensity!}
            onChange={(v) => update({ gradientIntensity: v })}
          />
        </div>
      )}

      {/* Drop shadow */}
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={!!cur.shadow}
          onChange={(e) => update({ shadow: e.target.checked })}
        />
        Drop shadow
      </label>
      {cur.shadow && (
        <div className="space-y-1 pl-4">
          <PaletteSwatches value={fx.shadowColor!} onChange={(c) => update({ shadowColor: c })} />
          <RangeRow
            label="Strength"
            min={0}
            max={1}
            step={0.05}
            value={fx.shadowIntensity!}
            onChange={(v) => update({ shadowIntensity: v })}
          />
        </div>
      )}

      {/* Border */}
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={!!cur.border}
          onChange={(e) => update({ border: e.target.checked })}
        />
        Border
      </label>
      {cur.border && (
        <div className="space-y-1 pl-4">
          <PaletteSwatches value={fx.borderColor!} onChange={(c) => update({ borderColor: c })} />
          <RangeRow
            label="Width"
            min={0.002}
            max={0.02}
            step={0.001}
            value={fx.borderWidth!}
            onChange={(v) => update({ borderWidth: v })}
          />
        </div>
      )}
    </div>
  );
}
