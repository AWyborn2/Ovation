import { useEffect, useMemo, useState } from "react";
import {
  renderShareCard,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";

type PreviewUrls = Record<CardSize, string | null>;

const NO_PREVIEWS: PreviewUrls = { square: null, portrait: null, story: null, landscape: null };

function revokeAll(urls: PreviewUrls) {
  Object.values(urls).forEach((url) => {
    if (url) URL.revokeObjectURL(url);
  });
}

// Owns the still-image preview: the per-size render-on-demand effect, the
// preview-URL cache, cache invalidation when the card inputs change, and URL
// cleanup on close. Animated cards preview live on a canvas instead, so the
// render effect bails when `animated` is set.
//
// `renderDeps` / `invalidateDeps` are the verbatim dependency lists from the
// orchestrator (sponsors, theme, photo transform, etc.). They are passed in so
// the orchestrator stays the single source of truth for what affects a render.
//
// The cache is tagged with a key that changes, during render, whenever an
// invalidating input changes (or the modal opens or closes). The render effect
// therefore sees the invalidation in the same commit it runs in. When the
// invalidation lived in its own effect, a change in both lists (the default
// layout resolving, the photo gallery loading, the debounced photo transform)
// let the render effect hit the stale cached URL and bail, after which the
// invalidate effect cleared it and nothing rendered again: a blank tile.
export function useCardPreview({
  open,
  input,
  animated,
  activeSize,
  renderTransform,
  buildOpts,
  renderDeps,
  invalidateDeps,
}: {
  open: boolean;
  input: ShareCardInput | null;
  animated: boolean;
  activeSize: CardSize;
  renderTransform: PhotoTransform;
  buildOpts: (size: CardSize, transform: PhotoTransform) => RenderOptions;
  renderDeps: unknown[];
  invalidateDeps: unknown[];
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cacheKey = useMemo(() => ({}), [open, ...invalidateDeps]);
  const [cache, setCache] = useState<{ key: object; urls: PreviewUrls }>(() => ({
    key: cacheKey,
    urls: NO_PREVIEWS,
  }));
  const [rendering, setRendering] = useState(false);
  const previewUrls = cache.key === cacheKey ? cache.urls : NO_PREVIEWS;

  // Release the previews of an invalidated cache (inputs changed, or closed).
  useEffect(() => {
    if (cache.key === cacheKey) return;
    revokeAll(cache.urls);
    setCache({ key: cacheKey, urls: NO_PREVIEWS });
  }, [cache, cacheKey]);

  // Render the active size on demand when it is not cached for these inputs.
  useEffect(() => {
    if (!open || !input || animated || previewUrls[activeSize]) {
      setRendering(false);
      return;
    }
    let cancelled = false;
    setRendering(true);
    renderShareCard(input, buildOpts(activeSize, renderTransform))
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setCache((prev) => ({
          key: cacheKey,
          urls: { ...(prev.key === cacheKey ? prev.urls : NO_PREVIEWS), [activeSize]: url },
        }));
      })
      .catch((e) => {
        if (!cancelled) console.error("Card render failed", e);
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...renderDeps, cacheKey]);

  return { previewUrls, rendering };
}
