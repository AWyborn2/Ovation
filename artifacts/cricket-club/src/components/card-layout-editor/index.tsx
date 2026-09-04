import { Button } from "@/components/ui/button";
import { Loader2, Type, ImageIcon, Square, RotateCcw, Save, X, Sticker } from "lucide-react";
import { StickerPicker } from "./sticker-picker";
import { EditorCanvas } from "./editor-canvas";
import { LayerList } from "./layer-list";
import { Inspector } from "./inspector";
import { TemplateModeFields } from "./template-mode-fields";
import { useCardLayoutEditor } from "./use-card-layout-editor";
import type { CardLayoutEditorProps } from "./types";

export type { TemplateMode, CardLayoutEditorProps } from "./types";

/**
 * Drag-and-drop layout editor for share cards (plan.md §5.6 split).
 *
 * Module map:
 *   types                    TemplateMode + props
 *   use-card-layout-editor   state, preview rendering, save/reset flows
 *   editor-to-saved          working layers → minimal persisted layout
 *   editor-canvas            preview + move/resize overlays + snapping
 *   layer-list / inspector   right-hand panel
 *   effects-section / effect-presets / palette-swatches / controls
 *   sticker-picker           built-in sticker library
 */
export function CardLayoutEditor(props: CardLayoutEditorProps) {
  const { onClose } = props;
  const ed = useCardLayoutEditor(props);
  const {
    cardKind,
    isTemplate,
    layers,
    selectedId,
    setSelectedId,
    selected,
    showStickers,
    setShowStickers,
    previewUrl,
    computing,
    rendering,
    error,
    pending,
    W,
    H,
    imgUploading,
    patchLayer,
    removeLayer,
    restack,
    addLayer,
    addSticker,
    handleAddImage,
    handleDropSticker,
    uploadImage,
    handleSave,
    handleReset,
  } = ed;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {isTemplate ? "Design template" : `Customise layout — ${cardKind}`}
        </h3>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag any element to move it, drag its corner to resize. Add images,
        shapes or text, restack with the layer list, then save. Changes apply to
        every size; reset restores the built-in design.
      </p>

      {isTemplate && (
        <TemplateModeFields
          tplName={ed.tplName}
          setTplName={ed.setTplName}
          tplKinds={ed.tplKinds}
          setTplKinds={ed.setTplKinds}
          tplDefaults={ed.tplDefaults}
          setTplDefaults={ed.setTplDefaults}
        />
      )}

      {computing ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
          <EditorCanvas
            previewUrl={previewUrl}
            rendering={rendering}
            layers={layers}
            selectedId={selectedId}
            W={W}
            H={H}
            onSelect={setSelectedId}
            onChange={patchLayer}
            onDropSticker={handleDropSticker}
          />

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <label className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAddImage(e.target.files[0])}
                />
                <span className="flex cursor-pointer items-center justify-center gap-1 rounded border px-2 py-1.5 text-xs hover:bg-muted">
                  {imgUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  Image
                </span>
              </label>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => addLayer("sticker", { shape: "rect", color: "#FBAC27", radius: 0 })}
              >
                <Square className="mr-1 h-3.5 w-3.5" /> Shape
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() =>
                  addLayer("text", {
                    text: "New text",
                    color: "#F5F2E8",
                    fontSize: 0.05,
                    fontWeight: 700,
                    align: "center",
                    fontFamily: "sans",
                    uppercase: false,
                  })
                }
              >
                <Type className="mr-1 h-3.5 w-3.5" /> Text
              </Button>
              <Button
                size="sm"
                variant={showStickers ? "default" : "outline"}
                className="flex-1"
                onClick={() => setShowStickers((s) => !s)}
              >
                <Sticker className="mr-1 h-3.5 w-3.5" /> Stickers
              </Button>
            </div>

            {showStickers && <StickerPicker onPick={(a) => addSticker(a)} />}

            <LayerList
              layers={layers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleHidden={(id, hidden) => patchLayer(id, { hidden })}
              onRestack={restack}
            />

            {selected && (
              <Inspector
                layer={selected}
                cardKind={cardKind}
                onChange={(patch) => patchLayer(selected.id, patch)}
                onRemove={() => removeLayer(selected.id)}
                onUploadImage={uploadImage}
                uploading={imgUploading}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button variant="outline" size="sm" onClick={handleReset} disabled={pending}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to built-in
        </Button>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={pending || computing}>
            {pending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            {isTemplate ? "Save template" : "Save layout"}
          </Button>
        </div>
      </div>
    </div>
  );
}
