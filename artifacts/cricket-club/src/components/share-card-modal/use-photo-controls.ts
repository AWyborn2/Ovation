import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import {
  useGetPlayer,
  getGetPlayerQueryKey,
  useListPlayerImages,
  useAddPlayerImage,
  getListPlayerImagesQueryKey,
} from "@workspace/api-client-react";
import {
  DEFAULT_PHOTO_TRANSFORM,
  type ShareCardInput,
  type PhotoPlacement,
  type PhotoTransform,
} from "@/lib/share-card";

type PhotoSource = "gallery" | "uploaded" | "none";

// Owns the whole photo control: gallery loading, upload + save-to-profile,
// placement, focal-point/zoom transform (with a debounced render transform), and
// resetting all of it when the modal opens or the chosen photo changes.
export function usePhotoControls({
  open,
  playerId,
  input,
}: {
  open: boolean;
  playerId?: number | null;
  input: ShareCardInput | null;
}) {
  // Photo control state. We only surface it when the tile is about a player.
  const showPhotoControls = playerId != null;
  const queryClient = useQueryClient();
  const addPlayerImage = useAddPlayerImage();
  const playerQ = useGetPlayer(playerId ?? 0, {
    query: { enabled: open && showPhotoControls, queryKey: getGetPlayerQueryKey(playerId ?? 0) },
  });
  // The player's saved profile photo (when present) is the default, falling back
  // to whatever photo the input was built with.
  const profilePhotoUrl: string | null =
    (showPhotoControls ? playerQ.data?.imageUrl ?? null : null) ??
    (input && "photoUrl" in input ? input.photoUrl ?? null : null);

  // The player's photo gallery. Each image is selectable; the default image is
  // pre-selected. Falls back to the single profile photo when the gallery is
  // empty (e.g. older players whose image_url predates the gallery).
  const galleryQ = useListPlayerImages(playerId ?? 0, {
    query: {
      enabled: open && showPhotoControls,
      queryKey: getListPlayerImagesQueryKey(playerId ?? 0),
    },
  });
  const galleryPhotos: { url: string; isDefault: boolean }[] = useMemo(() => {
    const rows = galleryQ.data ?? [];
    if (rows.length > 0) {
      return rows.map((r) => ({ url: r.imageUrl, isDefault: r.isDefault }));
    }
    return profilePhotoUrl ? [{ url: profilePhotoUrl, isDefault: true }] : [];
  }, [galleryQ.data, profilePhotoUrl]);
  const defaultGalleryUrl: string | null =
    galleryPhotos.find((p) => p.isDefault)?.url ?? galleryPhotos[0]?.url ?? null;

  const [photoSource, setPhotoSource] = useState<PhotoSource>("none");
  const [galleryUrl, setGalleryUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [photoPlacement, setPhotoPlacement] = useState<PhotoPlacement>("headshot");
  // Focal point + zoom for a feature photo. `photoTransform` updates live as the
  // user drags; `renderTransform` is debounced and drives the (heavier) full
  // card preview so dragging stays smooth.
  const [photoTransform, setPhotoTransform] = useState<PhotoTransform>(DEFAULT_PHOTO_TRANSFORM);
  const [renderTransform, setRenderTransform] = useState<PhotoTransform>(DEFAULT_PHOTO_TRANSFORM);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [photoTouched, setPhotoTouched] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (e) => setPhotoError(e.message),
  });

  // Reset photo controls each time the modal opens.
  useEffect(() => {
    if (open) {
      setPhotoSource("none");
      setGalleryUrl(null);
      setUploadedUrl(null);
      setPhotoPlacement("headshot");
      setPhotoTransform(DEFAULT_PHOTO_TRANSFORM);
      setRenderTransform(DEFAULT_PHOTO_TRANSFORM);
      setSaveToProfile(true);
      setPhotoTouched(false);
      setPhotoError(null);
    }
  }, [open]);

  // Once the gallery is known (it loads async), default to the player's default
  // image — unless the club has already interacted with the photo control.
  useEffect(() => {
    if (open && !photoTouched && photoSource === "none" && uploadedUrl === null && defaultGalleryUrl) {
      setPhotoSource("gallery");
      setGalleryUrl(defaultGalleryUrl);
    }
  }, [open, photoTouched, photoSource, uploadedUrl, defaultGalleryUrl]);

  const effectivePhotoUrl: string | null =
    photoSource === "gallery"
      ? galleryUrl
      : photoSource === "uploaded"
        ? uploadedUrl
        : null;

  // A different photo means a fresh crop — re-centre the focal point + zoom.
  useEffect(() => {
    setPhotoTransform(DEFAULT_PHOTO_TRANSFORM);
    setRenderTransform(DEFAULT_PHOTO_TRANSFORM);
  }, [effectivePhotoUrl]);

  // Debounce the transform that drives the full card preview so dragging the
  // focal point stays smooth (the reposition control gives instant feedback).
  useEffect(() => {
    const id = setTimeout(() => setRenderTransform(photoTransform), 160);
    return () => clearTimeout(id);
  }, [photoTransform]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    const result = await uploadFile(file);
    if (!result) return;
    const url = `/api/storage${result.objectPath}`;
    setUploadedUrl(url);
    setPhotoSource("uploaded");
    setPhotoTouched(true);
    // Save to the player's gallery (as the new default) so it persists and is
    // selectable next time (opt-out via the toggle).
    if (saveToProfile && playerId != null) {
      addPlayerImage.mutate(
        { id: playerId, data: { imageUrl: url, makeDefault: true } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetPlayerQueryKey(playerId) });
            queryClient.invalidateQueries({
              queryKey: getListPlayerImagesQueryKey(playerId),
            });
          },
          onError: (err) =>
            setPhotoError((err as Error)?.message ?? "Could not save photo to profile"),
        },
      );
    }
  };

  // Selecting a gallery photo / clearing the photo both count as interaction.
  const selectGalleryPhoto = (url: string) => {
    setPhotoSource("gallery");
    setGalleryUrl(url);
    setPhotoTouched(true);
  };
  const clearPhoto = () => {
    setPhotoSource("none");
    setPhotoTouched(true);
  };

  return {
    showPhotoControls,
    galleryPhotos,
    photoSource,
    galleryUrl,
    uploadedUrl,
    photoPlacement,
    setPhotoPlacement,
    photoTransform,
    setPhotoTransform,
    renderTransform,
    saveToProfile,
    setSaveToProfile,
    photoError,
    photoInputRef,
    isUploading,
    effectivePhotoUrl,
    handlePhotoUpload,
    selectGalleryPhoto,
    clearPhoto,
  };
}

export type PhotoControlsState = ReturnType<typeof usePhotoControls>;
