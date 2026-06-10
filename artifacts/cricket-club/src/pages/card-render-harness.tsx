import { useEffect, useState } from "react";
import {
  prepareAnimation,
  type AnimationHandle,
  type ShareCardInput,
  type RenderOptions,
} from "@/lib/share-card";

// Metrics returned by init() so the server knows how many frames to capture.
type HarnessMeta = {
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
};

type HarnessApi = {
  ready: boolean;
  init: (payload: {
    input: ShareCardInput;
    options: RenderOptions;
  }) => Promise<HarnessMeta>;
  drawFrame: (t: number) => string;
  dispose: () => void;
};

declare global {
  interface Window {
    __cardRenderHarness?: HarnessApi;
  }
}

// Hidden route (`/__card-render`) used ONLY by the server-side MP4 renderer.
// Puppeteer drives the EXACT same `prepareAnimation` renderer the live preview
// uses, frame by frame, so server clips are pixel-identical to the preview
// (single source of truth — no second renderer to drift out of sync).
export default function CardRenderHarness() {
  const [status, setStatus] = useState("ready");

  useEffect(() => {
    let handle: AnimationHandle | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

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
      dispose() {
        handle?.cleanup();
        handle = null;
        ctx = null;
        canvas = null;
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
