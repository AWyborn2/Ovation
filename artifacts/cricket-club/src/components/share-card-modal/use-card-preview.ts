import { useEffect, useState } from "react";
import {
  renderShareCard,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";

// Owns the still-image preview: the per-size render-on-demand effect, the
// preview-URL cache, cache invalidation when the card inputs change, and URL
// cleanup on close. Animated cards preview live on a canvas instead, so the
// render effect bails when `animated` is set.
//
// `renderDeps` / `invalidateDeps` are the verbatim dependency lists from the
// orchestrator (sponsors, theme, photo transform, etc.). They are passed in so
// the orchestrator stays the single source of truth for what affects a render,
// and so this hook re-renders / invalidates on exactly the same triggers as
// before the extraction.
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
  const [previewUrls, setPreviewUrls] = useState<Record<CardSize, string | null>>({
    square: null,
    portrait: null,
    story: null,
  });
  const [rendering, setRendering] = useState(false);

  // Render preview when size/sponsors/input changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open || !input) return;
      if (animated) return; // animated cards preview live on a canvas instead
      if (previewUrls[activeSize]) return; // cache hit
      setRendering(true);
      try {
        const blob = await renderShareCard(input, buildOpts(activeSize, renderTransform));
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrls((prev) => ({ ...prev, [activeSize]: url }));
      } catch (e) {
        console.error("Card render failed", e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, renderDeps);

  // Invalidate cached previews when sponsors flip or the theme changes.
  useEffect(() => {
    setPreviewUrls((prev) => {
      Object.values(prev).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return { square: null, portrait: null, story: null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, invalidateDeps);

  // Cleanup URLs on close.
  useEffect(() => {
    if (!open) {
      setPreviewUrls((prev) => {
        Object.values(prev).forEach((url) => {
          if (url) URL.revokeObjectURL(url);
        });
        return { square: null, portrait: null, story: null };
      });
    }
  }, [open]);

  return { previewUrls, rendering };
}
