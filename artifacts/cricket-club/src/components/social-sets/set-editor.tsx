import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/stat-badge";
import { Loader2, ArrowLeft, Download, Save, Globe, Lock } from "lucide-react";
import { LoadingState, QueryError } from "@/components/data-states";
import { SIZES, type CardSize } from "@/lib/share-card";
import { MAX_SLIDES, MIN_SLIDES, selectClass } from "./model";
import { useSetEditor } from "./use-set-editor";
import { Filmstrip } from "./filmstrip";
import { SlideDesignPanel } from "./slide-design-panel";
import { SlideSourcePicker } from "./sources";

/** Editor for one carousel set (plan.md §5.6 split of admin-social-sets). */
export function SetEditor({ id, onBack }: { id: number; onBack: () => void }) {
  const ed = useSetEditor(id);
  const {
    setsQ,
    set,
    update,
    name,
    setName,
    platformSize,
    setPlatformSize,
    slides,
    published,
    selectedSlide,
    exporting,
    enabledSizes,
    addSlide,
    addSlides,
    handleSave,
    canPublish,
    togglePublish,
    handleExport,
    tooFew,
  } = ed;

  if (setsQ.isLoading) return <LoadingState label="Loading set…" />;
  if (!set) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to sets
        </Button>
        <QueryError onRetry={() => setsQ.refetch()} />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Size</Label>
          <select
            className={selectClass + " w-44"}
            value={platformSize}
            onChange={(e) => setPlatformSize(e.target.value as CardSize)}
          >
            {enabledSizes.map((s) => (
              <option key={s} value={s}>
                {SIZES[s].label} ({SIZES[s].code})
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StatusPill tone={published ? "live" : "neutral"}>
            {published ? (
              <Globe className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            {published ? "Published" : "Draft"}
          </StatusPill>
          <Button
            onClick={() => handleSave()}
            disabled={update.isPending}
            variant="secondary"
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
          <Button
            onClick={togglePublish}
            disabled={update.isPending || (!published && !canPublish)}
            variant={published ? "outline" : "default"}
          >
            {published ? (
              <Lock className="h-4 w-4 mr-2" />
            ) : (
              <Globe className="h-4 w-4 mr-2" />
            )}
            {published ? "Unpublish" : "Publish"}
          </Button>
          <Button onClick={handleExport} disabled={exporting || tooFew}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export set (zip)
          </Button>
        </div>
      </div>

      {tooFew && (
        <p className="text-xs text-amber-600">
          A carousel needs at least {MIN_SLIDES} slides before it can be exported
          or published.
        </p>
      )}

      {/* Filmstrip */}
      <Filmstrip ed={ed} />

      {/* Selected slide design controls */}
      {selectedSlide && <SlideDesignPanel ed={ed} selectedSlide={selectedSlide} />}

      {/* Add-slide sources */}
      {slides.length < MAX_SLIDES && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add a slide</CardTitle>
          </CardHeader>
          <CardContent>
            <SlideSourcePicker onAdd={addSlide} onAddMany={addSlides} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
