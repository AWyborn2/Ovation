import { useEffect, useRef } from "react";
import {
  prepareAnimation,
  type ShareCardInput,
  type RenderOptions,
  type AnimationHandle,
} from "@/lib/share-card";

// Live, looping canvas preview for animated cards. Prepares the animation once
// per `sig` change and drives it with requestAnimationFrame; cleans up any
// playing <video> elements on unmount / re-prepare.
export function AnimatedCardPreview({
  input,
  opts,
  sig,
}: {
  input: ShareCardInput;
  opts: RenderOptions;
  sig: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let handle: AnimationHandle | null = null;
    let cancelled = false;
    let start = 0;
    void (async () => {
      const a = await prepareAnimation(input, opts);
      if (cancelled) {
        a.cleanup();
        return;
      }
      handle = a;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        a.cleanup();
        return;
      }
      canvas.width = a.width;
      canvas.height = a.height;
      const loop = (now: number) => {
        if (!start) start = now;
        const elapsed = now - start;
        const t = a.loop ? (elapsed % a.durationMs) / a.durationMs : Math.min(1, elapsed / a.durationMs);
        a.draw(ctx, t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      handle?.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
}
