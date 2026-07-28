import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import {
  type AnimationHandle,
  type ShareCardInput,
  type RenderOptions,
  type CardSize,
} from "@/lib/share-card";
import {
  prepareAnimation,
} from "@/lib/share-card-animation";
import { PackCard } from "@/components/pack-card";
import { packNativeSize, type PackCardData } from "@/lib/pack-render";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";

// Metrics returned by init() so the server knows how many frames to capture.
type HarnessMeta = {
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
};

// Static-mode payload: the same values that drive the live <PackCard> preview.
// `data` carries the tenant logo / name / hashtags / sponsors / uploaded photo
// so the server PNG matches the branded preview (options are opaque over the
// wire — `CardRenderStillInput.options` is `additionalProperties: true`, so no
// OpenAPI change was needed to add this field).
type StillOptions = {
  size: CardSize;
  sponsorsOn: boolean;
  junior: boolean;
  theme?: ApiCardTheme | null;
  data?: PackCardData | null;
  /** Which design pack to render; omitted resolves to the default pack. */
  packId?: string | null;
};

// Metrics returned by renderStill() so the server knows what to screenshot.
type StillMeta = {
  width: number;
  height: number;
  /** CSS selector of the mounted card element (stable id). */
  selector: string;
};

type HarnessApi = {
  ready: boolean;
  init: (payload: {
    input: ShareCardInput;
    options: RenderOptions;
  }) => Promise<HarnessMeta>;
  drawFrame: (t: number) => string;
  renderStill: (payload: {
    input: ShareCardInput;
    options: StillOptions;
  }) => Promise<StillMeta>;
  dispose: () => void;
};

declare global {
  interface Window {
    __cardRenderHarness?: HarnessApi;
  }
}

// The offscreen container id the server screenshots in static (pack) mode.
const STILL_CONTAINER_ID = "pack-still-root";

// Wait for every <img> under `root` to finish loading AND decoding before the
// server screenshots the card. Pack image slots (club logo, player photo,
// sponsors) render as real <img> elements (pack-render), and the first card in
// a batch hits a cold image cache — without this the screenshot captures a
// half-loaded (blank) photo while later cards, with the image now cached, look
// fine. A per-image timeout keeps a slow/broken image from hanging the render;
// a genuinely broken image simply paints blank.
async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
      if (!(img.complete && img.naturalWidth > 0)) {
        await Promise.race([
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
          timeout,
        ]);
      }
      try {
        // decode() guarantees the pixels are ready to paint (not just fetched).
        await Promise.race([img.decode(), timeout]);
      } catch {
        // decode() rejects on a broken/undecodable image — paint what we have.
      }
    }),
  );
}

// Hidden route (`/__card-render`) used ONLY by the server-side renderers. It has
// two modes over one page:
//  - ANIMATED (init/drawFrame): Puppeteer drives the EXACT same `prepareAnimation`
//    renderer the live preview uses, frame by frame, so server MP4 clips are
//    pixel-identical to the preview.
//  - STATIC / PACK (renderStill): mounts <PackCard> unscaled at native px and
//    exposes the element so the server can `page.screenshot` a single PNG. Pack
//    cards are static, so this bypasses the ffmpeg pipeline entirely.
// Both share one source of truth (no second renderer to drift out of sync).
export default function CardRenderHarness() {
  const [status, setStatus] = useState("ready");

  useEffect(() => {
    let handle: AnimationHandle | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let stillRoot: Root | null = null;
    let stillContainer: HTMLDivElement | null = null;

    const teardownStill = () => {
      if (stillRoot) {
        stillRoot.unmount();
        stillRoot = null;
      }
      if (stillContainer) {
        stillContainer.remove();
        stillContainer = null;
      }
    };

    const api: HarnessApi = {
      ready: true,
      async init(payload) {
        handle?.cleanup();
        handle = await prepareAnimation(payload.input, payload.options);
        canvas = document.createElement("canvas");
        canvas.width = handle.width;
        canvas.height = handle.height;
        ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas 2D context");
        setStatus("initialised");
        return {
          width: handle.width,
          height: handle.height,
          durationMs: handle.durationMs,
          loop: handle.loop,
        };
      },
      drawFrame(t) {
        if (!handle || !ctx || !canvas) {
          throw new Error("Harness not initialised");
        }
        handle.draw(ctx, Math.max(0, Math.min(1, t)));
        return canvas.toDataURL("image/png");
      },
      async renderStill(payload) {
        const { input, options } = payload;
        const size = options.size;
        const native = packNativeSize(size);

        // Fresh offscreen container mounted at native px (unscaled). Fixed at the
        // top-left so its bounding box is a clean native-size clip to screenshot.
        teardownStill();
        stillContainer = document.createElement("div");
        stillContainer.id = STILL_CONTAINER_ID;
        Object.assign(stillContainer.style, {
          position: "fixed",
          top: "0",
          left: "0",
          width: `${native.w}px`,
          height: `${native.h}px`,
          margin: "0",
          padding: "0",
          overflow: "hidden",
          background: "#000",
          zIndex: "2147483647",
        } as Partial<CSSStyleDeclaration>);
        document.body.appendChild(stillContainer);

        // Reuse the SAME <PackCard> the modal previews. Passing an explicit width
        // equal to the native width makes its internal scale factor exactly 1, so
        // the DOM renders at true 1080-wide native resolution with no cropping.
        stillRoot = createRoot(stillContainer);
        stillRoot.render(
          <PackCard
            input={input}
            size={size}
            sponsorsOn={options.sponsorsOn}
            theme={options.theme ?? null}
            junior={options.junior}
            data={options.data ?? null}
            packId={options.packId ?? null}
            width={native.w}
          />,
        );

        // Settle web fonts, then wait for slot images, then two animation frames
        // so the screenshot is stable and fully painted.
        await ensureCardFontsLoaded();
        try {
          const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
          if (fonts?.ready) await fonts.ready;
        } catch {
          // Font Loading API unavailable — proceed with system fallback.
        }
        // Let React commit so the <img> slots exist, then wait for every slot
        // image to finish loading/decoding before we screenshot (see
        // waitForImages) — otherwise the first card in a batch exports a blank
        // photo while the image is still fetching.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await waitForImages(stillContainer);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );

        setStatus("still");
        return {
          width: native.w,
          height: native.h,
          selector: `#${STILL_CONTAINER_ID}`,
        };
      },
      dispose() {
        handle?.cleanup();
        handle = null;
        ctx = null;
        canvas = null;
        teardownStill();
        setStatus("disposed");
      },
    };

    window.__cardRenderHarness = api;
    return () => {
      api.dispose();
      if (window.__cardRenderHarness === api) {
        delete window.__cardRenderHarness;
      }
    };
  }, []);

  return (
    <div
      data-testid="card-render-harness"
      style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}
    >
      card-render-harness: {status}
    </div>
  );
}
