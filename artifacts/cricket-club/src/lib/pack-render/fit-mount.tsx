/**
 * Draw fit-check variants in the browser (L2-B, T2.5): one offscreen
 * container, re-rendered per variant with the same <PackCard> every preview
 * and server render uses, at native size, after its fonts and images load.
 * The harness `fitCheck` and the template proofs sheet both use it, so a
 * template is measured the same way wherever it's checked.
 */
import { createRoot, type Root } from "react-dom/client";
import { PackCard } from "@/components/pack-card";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";
import { ensureDocumentFonts } from "@/lib/document-fonts";
import type { ShareCardInput } from "@/lib/share-card";
import {
  BLANK_PACK_ID,
  packNativeSize,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import { prepareTeamNames } from "./team-name-fit";
import type { FitMount } from "./template-fit";
import { nextPaint, waitForImages } from "./wait-images";

export interface FitMountHandle {
  mount: FitMount;
  /** Remove the offscreen container. */
  dispose(): void;
}

/** A fit mount on this page; call `dispose()` when the check is done. */
export function createFitMount(): FitMountHandle {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mount: FitMount = async (card, variant, doc) => {
    const native = packNativeSize(variant.size);
    if (!container) {
      container = document.createElement("div");
      container.setAttribute("data-fit-check", "");
      Object.assign(container.style, {
        position: "fixed",
        top: "0",
        // Laid out and painted, but out of sight.
        left: "-20000px",
        margin: "0",
        padding: "0",
        overflow: "hidden",
        pointerEvents: "none",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(container);
      root = createRoot(container);
    }
    container.style.width = `${native.w}px`;
    container.style.height = `${native.h}px`;
    const adjustments = doc as CardAdjustments;
    root!.render(
      <PackCard
        input={card.input as unknown as ShareCardInput}
        size={variant.size}
        sponsorsOn={card.sponsorsOn}
        junior={card.junior}
        data={card.data as PackCardData}
        packId={BLANK_PACK_ID}
        adjustments={adjustments}
        page={variant.page}
        width={native.w}
      />,
    );
    await ensureCardFontsLoaded();
    const fontFailures = await ensureDocumentFonts(adjustments);
    try {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) await fonts.ready;
    } catch {
      // Font Loading API unavailable — measure with what loaded.
    }
    await nextPaint();
    await waitForImages(container);
    await prepareTeamNames(container);
    await nextPaint();
    return { root: container, fontFailures };
  };

  return {
    mount,
    dispose() {
      root?.unmount();
      root = null;
      container?.remove();
      container = null;
    },
  };
}
