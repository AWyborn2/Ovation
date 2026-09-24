import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Film, Image as ImageIcon, RotateCcw } from "lucide-react";
import { isAnimatedCard, type MotionPreset } from "@/lib/share-card";
import { MOTION_OPTIONS, selectClass, slideLabel, type WorkingSlide } from "./model";
import type { SetEditorState } from "./use-set-editor";

/** Design controls for the selected slide: motion, theme and any legacy layout. */
export function SlideDesignPanel({
  ed,
  selectedSlide,
}: {
  ed: SetEditorState;
  selectedSlide: WorkingSlide;
}) {
  const { slides, platformSize, themes, slideUsesPack, patchSlide } = ed;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Slide {slides.findIndex((s) => s.id === selectedSlide.id) + 1} —{" "}
          {slideLabel(selectedSlide.input)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Pack slides are always static (KTD10), matching the single
                card of that kind — the motion picker only applies to the
                canvas path, so it's hidden for pack slides. */}
          {!slideUsesPack(selectedSlide) && (
            <div className="space-y-1.5">
              <Label className="text-sm">Motion</Label>
              <select
                className={selectClass}
                value={selectedSlide.motionPreset ?? "none"}
                onChange={(e) =>
                  patchSlide(selectedSlide.id, {
                    motionPreset: e.target.value as MotionPreset,
                  })
                }
              >
                {MOTION_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!(
            "junior" in selectedSlide.input && (selectedSlide.input as { junior?: boolean }).junior
          ) &&
            themes.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Card theme</Label>
                <select
                  className={selectClass}
                  value={selectedSlide.themeId ?? ""}
                  onChange={(e) =>
                    patchSlide(selectedSlide.id, {
                      themeId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Default theme</option>
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          <div className="md:col-span-2 flex items-center gap-2">
            {/* Layouts from the retired layout editor still render; they can
                  be cleared back to the design but no longer edited (U18). */}
            {selectedSlide.layout && selectedSlide.layout.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">Custom layout applied</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patchSlide(selectedSlide.id, { layout: [] })}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
                  Clear custom layout
                </Button>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              {!slideUsesPack(selectedSlide) &&
              isAnimatedCard({
                size: platformSize,
                template: null,
                motionPreset: selectedSlide.motionPreset ?? "none",
              }) ? (
                <>
                  <Film className="h-3.5 w-3.5" /> Exports a video clip
                </>
              ) : (
                <>
                  <ImageIcon className="h-3.5 w-3.5" /> Still image
                </>
              )}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
