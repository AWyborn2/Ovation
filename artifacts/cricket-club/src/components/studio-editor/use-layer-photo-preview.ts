import { useQuery } from "@tanstack/react-query";
import { previewLayerPhotos } from "@workspace/api-client-react";
import { sourcedPhotoLayers, type LayerPhotos } from "@workspace/scorecard/kind-templates";

/**
 * The photos a template's sourced photo layers show in the editor (photo layer
 * sources): resolved by the server against the club's photo collections and
 * its latest published team list, as a draft would pick them. Only asked for
 * when a layer has a source, and again only when the sources change; null
 * while loading, with no source, or when the request fails (the layers then
 * show the sample photo).
 */
export function useLayerPhotoPreview(
  kind: string,
  document: unknown,
  enabled: boolean,
): LayerPhotos | null {
  const sources = enabled ? sourcedPhotoLayers(document, kind) : [];
  const key = JSON.stringify(sources);
  const q = useQuery({
    queryKey: ["layer-photo-preview", kind, key],
    enabled: sources.length > 0,
    staleTime: 60_000,
    retry: false,
    // Asked again only when a source changes (the key), not on every edit.
    queryFn: () => previewLayerPhotos({ kind, document }),
  });
  if (sources.length === 0) return null;
  const photos = q.data?.layerPhotos;
  return photos && typeof photos === "object" && !Array.isArray(photos)
    ? (photos as LayerPhotos)
    : null;
}
