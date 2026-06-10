import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, ImageOff, User, ImageIcon } from "lucide-react";
import { PhotoReposition } from "@/components/photo-reposition";
import { SIZES, type CardSize } from "@/lib/share-card";
import type { PhotoControlsState } from "./use-photo-controls";

// Presentational photo control block. All state lives in usePhotoControls; this
// just renders the gallery, upload/no-photo buttons, placement and reposition.
export function PhotoControls({
  photo,
  activeSize,
}: {
  photo: PhotoControlsState;
  activeSize: CardSize;
}) {
  const {
    galleryPhotos,
    photoSource,
    galleryUrl,
    uploadedUrl,
    photoPlacement,
    setPhotoPlacement,
    photoTransform,
    setPhotoTransform,
    saveToProfile,
    setSaveToProfile,
    photoError,
    photoInputRef,
    isUploading,
    effectivePhotoUrl,
    handlePhotoUpload,
    selectGalleryPhoto,
    clearPhoto,
  } = photo;

  return (
    <div className="space-y-2.5 rounded border px-3 py-2.5">
      <Label className="text-sm">Photo</Label>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
      {galleryPhotos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {galleryPhotos.map((p) => {
            const selected =
              photoSource === "gallery" && galleryUrl === p.url;
            return (
              <button
                key={p.url}
                type="button"
                title={p.isDefault ? "Default photo" : undefined}
                className={`relative h-12 w-12 overflow-hidden rounded border-2 ${
                  selected ? "border-primary" : "border-muted"
                }`}
                onClick={() => selectGalleryPhoto(p.url)}
              >
                <img
                  src={p.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {p.isDefault && (
                  <span className="absolute bottom-0 left-0 right-0 bg-primary/80 text-center text-[8px] font-semibold leading-tight text-primary-foreground">
                    Default
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={photoSource === "uploaded" ? "default" : "outline"}
          className="h-8 text-xs"
          disabled={isUploading}
          onClick={() => photoInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1" />
          )}
          {uploadedUrl ? "Replace photo" : "Upload photo"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={photoSource === "none" ? "default" : "outline"}
          className="h-8 text-xs"
          onClick={clearPhoto}
        >
          <ImageOff className="h-3.5 w-3.5 mr-1" />
          No photo
        </Button>
      </div>

      {effectivePhotoUrl && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Placement</Label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={photoPlacement === "feature" ? "default" : "outline"}
              className="h-8 flex-1 text-xs"
              onClick={() => setPhotoPlacement("feature")}
            >
              <ImageIcon className="h-3.5 w-3.5 mr-1" />
              Feature
            </Button>
            <Button
              type="button"
              size="sm"
              variant={photoPlacement === "headshot" ? "default" : "outline"}
              className="h-8 flex-1 text-xs"
              onClick={() => setPhotoPlacement("headshot")}
            >
              <User className="h-3.5 w-3.5 mr-1" />
              Headshot
            </Button>
          </div>
          {photoPlacement === "feature" && (
            <PhotoReposition
              src={effectivePhotoUrl}
              aspect={{ w: SIZES[activeSize].w, h: SIZES[activeSize].h }}
              value={photoTransform}
              onChange={setPhotoTransform}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <Label htmlFor="save-profile-toggle" className="text-xs text-muted-foreground">
          Save uploads to player profile
        </Label>
        <Switch
          id="save-profile-toggle"
          checked={saveToProfile}
          onCheckedChange={setSaveToProfile}
        />
      </div>

      {photoError && <p className="text-xs text-destructive">{photoError}</p>}
    </div>
  );
}
