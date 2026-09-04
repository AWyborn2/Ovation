import { Circle, ImageIcon, Loader2, Minus, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSticker } from "@/lib/sticker-library";
import { fieldsForKind } from "@/lib/card-template";
import { CARD_FONT_OPTIONS, type EditorLayer, type ShareCardInput } from "@/lib/share-card";
import { PaletteSwatches } from "./palette-swatches";
import { RangeRow, ShapeBtn } from "./controls";
import { EffectsSection } from "./effects-section";

/** Property inspector for the selected layer (text / shape / sticker / image / built-ins). */
export function Inspector({
  layer,
  cardKind,
  onChange,
  onRemove,
  onUploadImage,
  uploading,
}: {
  layer: EditorLayer;
  cardKind: ShareCardInput["kind"];
  onChange: (patch: Partial<EditorLayer>) => void;
  onRemove: () => void;
  onUploadImage: (file: File) => Promise<string | null>;
  uploading: boolean;
}) {
  const isCustom = layer.editKind !== "element";
  const sticker = layer.editKind === "libsticker" ? getSticker(layer.assetId) : undefined;
  return (
    <div className="space-y-2 rounded border p-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{layer.label}</Label>
        {isCustom && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>

      {layer.editKind === "text" && (
        <>
          <Input
            value={layer.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Text"
            className="h-8 text-xs"
          />
          <PaletteSwatches
            value={layer.color ?? "#F5F2E8"}
            onChange={(color) => onChange({ color })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={layer.align ?? "center"}
              onChange={(e) => onChange({ align: e.target.value as EditorLayer["align"] })}
              className="h-8 min-w-[88px] flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
            <select
              value={layer.fontFamily ?? "sans"}
              onChange={(e) =>
                onChange({ fontFamily: e.target.value as EditorLayer["fontFamily"] })
              }
              className="h-8 min-w-[88px] flex-1 rounded border bg-card px-1 text-xs"
            >
              {CARD_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={String(layer.fontWeight ?? 700)}
              onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
              className="h-8 min-w-[88px] flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Black</option>
            </select>
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={layer.uppercase ?? false}
                onChange={(e) => onChange({ uppercase: e.target.checked })}
              />
              CAPS
            </label>
          </div>
          <RangeRow
            label="Size"
            min={0.02}
            max={0.2}
            step={0.005}
            value={layer.fontSize ?? 0.05}
            onChange={(v) => onChange({ fontSize: v })}
          />
        </>
      )}

      {layer.editKind === "sticker" && (
        <>
          <PaletteSwatches
            value={layer.color ?? "#FBAC27"}
            onChange={(color) => onChange({ color })}
          />
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <ShapeBtn
                active={layer.shape === "rect" || !layer.shape}
                onClick={() => onChange({ shape: "rect" })}
              >
                <Square className="h-3.5 w-3.5" />
              </ShapeBtn>
              <ShapeBtn
                active={layer.shape === "circle"}
                onClick={() => onChange({ shape: "circle" })}
              >
                <Circle className="h-3.5 w-3.5" />
              </ShapeBtn>
              <ShapeBtn active={layer.shape === "line"} onClick={() => onChange({ shape: "line" })}>
                <Minus className="h-3.5 w-3.5" />
              </ShapeBtn>
            </div>
          </div>
          {(layer.shape === "rect" || !layer.shape) && (
            <RangeRow
              label="Corner"
              min={0}
              max={0.5}
              step={0.02}
              value={layer.radius ?? 0}
              onChange={(v) => onChange({ radius: v })}
            />
          )}
          {layer.shape === "line" && (
            <RangeRow
              label="Thickness"
              min={0.002}
              max={0.04}
              step={0.002}
              value={layer.radius ?? 0.008}
              onChange={(v) => onChange({ radius: v })}
            />
          )}
        </>
      )}

      {layer.editKind === "libsticker" && sticker && (
        <>
          {sticker.recolourable && (
            <div className="flex items-center gap-2">
              <PaletteSwatches
                value={layer.color ?? "#FBAC27"}
                onChange={(color) => onChange({ color })}
              />
            </div>
          )}
          {sticker.dataBound && (
            <>
              <Label className="text-[10px] text-muted-foreground">Auto-fill from</Label>
              <select
                value={layer.field ?? ""}
                onChange={(e) => onChange({ field: e.target.value || undefined })}
                className="h-8 w-full rounded border bg-card px-1 text-xs"
              >
                <option value="">— None (manual text) —</option>
                {fieldsForKind(cardKind)
                  .filter((f) => f.type === "text")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
              <Input
                value={layer.text ?? ""}
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder={sticker.defaultText ?? "Text"}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {layer.field
                  ? "Auto-fills from card data; the text above is a fallback."
                  : "Enter the text to display on the badge."}
              </p>
            </>
          )}
        </>
      )}

      {layer.editKind === "image" && (
        <>
          <div className="flex items-center gap-2">
            <ShapeBtn active={layer.shape !== "circle"} onClick={() => onChange({ shape: "rect" })}>
              <Square className="h-3.5 w-3.5" />
            </ShapeBtn>
            <ShapeBtn
              active={layer.shape === "circle"}
              onClick={() => onChange({ shape: "circle" })}
            >
              <Circle className="h-3.5 w-3.5" />
            </ShapeBtn>
            <select
              value={layer.fit ?? "cover"}
              onChange={(e) => onChange({ fit: e.target.value as EditorLayer["fit"] })}
              className="h-8 flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>
          <RangeRow
            label="Zoom"
            min={1}
            max={3}
            step={0.05}
            value={layer.zoom ?? 1}
            onChange={(v) => onChange({ zoom: v })}
          />
          <RangeRow
            label="X"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalX ?? 0.5}
            onChange={(v) => onChange({ focalX: v })}
          />
          <RangeRow
            label="Y"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalY ?? 0.5}
            onChange={(v) => onChange({ focalY: v })}
          />
        </>
      )}

      {!isCustom && layer.id === "photo" && (
        <>
          <RangeRow
            label="Zoom"
            min={1}
            max={3}
            step={0.05}
            value={layer.zoom ?? 1}
            onChange={(v) => onChange({ zoom: v })}
          />
          <RangeRow
            label="X"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalX ?? 0.5}
            onChange={(v) => onChange({ focalX: v })}
          />
          <RangeRow
            label="Y"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalY ?? 0.5}
            onChange={(v) => onChange({ focalY: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            Scroll on the photo to zoom. Drag to move or resize.
          </p>
        </>
      )}

      {!isCustom && layer.id === "background" && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Upload a full-bleed background image, or leave it empty to use the theme/feature photo.
            Use the effects below to tone, gradient or mask it; it always covers the whole card.
          </p>
          {layer.url ? (
            <>
              <div className="flex items-center gap-2">
                <img
                  src={layer.url}
                  alt="Background"
                  className="h-10 w-10 rounded border object-cover"
                />
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const url = await onUploadImage(file);
                      if (url) onChange({ url });
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full cursor-pointer"
                    disabled={uploading}
                    asChild
                  >
                    <span>
                      {uploading ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="mr-1 h-3.5 w-3.5" />
                      )}
                      Replace
                    </span>
                  </Button>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange({ url: undefined })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <RangeRow
                label="Zoom"
                min={1}
                max={3}
                step={0.05}
                value={layer.zoom ?? 1}
                onChange={(v) => onChange({ zoom: v })}
              />
              <RangeRow
                label="X"
                min={0}
                max={1}
                step={0.02}
                value={layer.focalX ?? 0.5}
                onChange={(v) => onChange({ focalX: v })}
              />
              <RangeRow
                label="Y"
                min={0}
                max={1}
                step={0.02}
                value={layer.focalY ?? 0.5}
                onChange={(v) => onChange({ focalY: v })}
              />
            </>
          ) : (
            <label className="block">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const url = await onUploadImage(file);
                  if (url) onChange({ url, fit: layer.fit ?? "cover" });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full cursor-pointer"
                disabled={uploading}
                asChild
              >
                <span>
                  {uploading ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="mr-1 h-3.5 w-3.5" />
                  )}
                  Upload background image
                </span>
              </Button>
            </label>
          )}
        </>
      )}

      {!isCustom && layer.id !== "photo" && layer.id !== "background" && (
        <p className="text-[11px] text-muted-foreground">
          Drag on the canvas to move or resize. Hide it from the layer list.
        </p>
      )}

      <EffectsSection effects={layer.effects} onChange={(effects) => onChange({ effects })} />
    </div>
  );
}
