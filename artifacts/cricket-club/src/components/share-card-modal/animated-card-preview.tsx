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
//
// When `soundOn` is set and `opts.audio` is present, an off-DOM <audio> element
// plays the chosen track in sync with the canvas loop: it seeks to the trim
// offset on (re)start and at every loop boundary, and applies the volume. The
// element is muted whenever sound is off so autoplay restrictions never block
// the silent preview. Audio is best-effort — a blocked play() is swallowed.
export function AnimatedCardPreview({
  input,
  opts,
  sig,
  soundOn = false,
}: {
  input: ShareCardInput;
  opts: RenderOptions;
  sig: string;
  soundOn?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Keep the latest audio config + soundOn in refs so the rAF loop reads live
  // values without re-preparing the animation when only volume/soundOn change.
  const audioCfgRef = useRef(opts.audio ?? null);
  const soundOnRef = useRef(soundOn);
  audioCfgRef.current = opts.audio ?? null;
  soundOnRef.current = soundOn;

  // React to volume / mute changes without restarting the animation.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, opts.audio?.volume ?? 1));
    el.muted = !soundOn || !opts.audio;
    if (soundOn && opts.audio) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [soundOn, opts.audio]);

  useEffect(() => {
    let raf = 0;
    let handle: AnimationHandle | null = null;
    let cancelled = false;
    let start = 0;
    let prevT = 1;
    const audioEl = audioRef.current;
    const seekToTrim = () => {
      const el = audioRef.current;
      const cfg = audioCfgRef.current;
      if (!el || !cfg) return;
      try {
        el.currentTime = cfg.trimStartMs / 1000;
      } catch {}
    };
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
        if (!start) {
          start = now;
          seekToTrim();
        }
        const elapsed = now - start;
        const t = a.loop ? (elapsed % a.durationMs) / a.durationMs : Math.min(1, elapsed / a.durationMs);
        // Loop boundary (t wrapped back down): re-seek the audio to the trim
        // offset so each visual loop restarts from the same musical point.
        if (a.loop && t < prevT) seekToTrim();
        prevT = t;
        a.draw(ctx, t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      handle?.cleanup();
      if (audioEl) audioEl.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return (
    <>
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
      {opts.audio ? (
        <audio
          ref={audioRef}
          src={opts.audio.url}
          loop
          preload="auto"
          className="hidden"
        />
      ) : null}
    </>
  );
}
