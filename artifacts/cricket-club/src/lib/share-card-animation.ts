/**
 * Animation, video and GIF export for share cards.
 *
 * Extracted from share-card.ts so that importing a static card renderer no
 * longer pulls the MediaRecorder / gifenc / audio-muxing pipeline into the
 * bundle — the lazy-loading win the plan (item 13) asked for. This module
 * imports the shared types, constants and render helpers from ./share-card;
 * share-card.ts does not import back, so the dependency is one-directional
 * and cannot cycle.
 */
import { DEFAULT_BRAND } from "@workspace/scorecard";
import {
  resolvePhotoField,
  type TemplateContext,
} from "./card-template";

import {
  type AnimationHandle,
  type BakedLayer,
  type CardAudioSpec,
  type RenderOptions,
  SIZES,
  type ShareCardInput,
  applyLayerTransform,
  applyLayout,
  bakeLayer,
  buildBuiltinLayers,
  clamp01,
  clampDuration,
  defaultHashtag,
  drawTemplateFrame,
  easeOutBack,
  easeOutCubic,
  effectiveDuration,
  effectiveMotion,
  effectiveSpeed,
  ensureCardFonts,
  isJuniorInput,
  juniorThemeFromBrand,
  loadImage,
  loadSponsorLogos,
  loadTemplateBg,
  renderShareCard,
  resolvePalette,
} from "./share-card";

// Build an animation for a card. Preloads every asset up front so each draw()
// call is synchronous and cheap (safe to run inside a rAF / capture loop).
export const prepareAnimation = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<AnimationHandle> => {
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080;
  const p = isJuniorInput(input)
    ? resolvePalette(juniorThemeFromBrand(opts.brand), opts.brand)
    : resolvePalette(opts.theme, opts.brand);
  const motion = effectiveMotion(opts);
  const speed = effectiveSpeed(opts);

  // Template-based animated card: animated/still background + data-bound slots.
  // Pack templates skip this — they flow through the built-in layer animation.
  if (opts.template && opts.template.source !== "pack") {
    const template = opts.template;
    const bgKind = template.backgroundKind ?? "image";
    // Canvas text never triggers a font fetch on its own (see ensureCardFonts'
    // own comment) — without this, an animated/exported template card can bake
    // in a system-font fallback while the PNG export of the same card is correct.
    await ensureCardFonts();
    const bg = await loadTemplateBg(template, true);
    const tctx: TemplateContext = {
      clubName: opts.brand?.name ?? DEFAULT_BRAND.name,
      clubUrl: opts.clubUrl ?? "",
      hashtag: opts.hashtag ?? defaultHashtag(opts.brand),
      photoUrl: opts.photoUrl,
    };
    const purl = resolvePhotoField(input, tctx);
    const photoImg = purl ? await loadImage(purl).catch(() => null) : null;
    const logos = await loadSponsorLogos(opts.sponsors ?? []);

    // Admin clip length wins; else a video bg's own duration; else the default.
    let durationMs = effectiveDuration(opts);
    if (typeof opts.durationMs !== "number" && bgKind === "video" && bg?.video) {
      const vid = bg.video.duration ? bg.video.duration * 1000 : 4000;
      durationMs = clampDuration(template.backgroundDurationMs ?? vid);
    }

    return {
      width: W,
      height: H,
      durationMs,
      loop: true,
      draw: (ctx, t) =>
        drawTemplateFrame(ctx, W, H, scale, input, template, opts, p, bg, photoImg, logos, motion, t, speed),
      cleanup: () => {
        const v = bg?.video;
        if (v) {
          v.pause();
          v.removeAttribute("src");
          v.load();
          v.remove();
        }
      },
    };
  }

  const durationMs = effectiveDuration(opts);

  // Built-in still card (motion "none" or no real layers): render once, draw flat.
  if (motion === "none") {
    const stillBlob = await renderShareCard(input, { ...opts, template: null, motionPreset: "none" });
    const bmp = await createImageBitmap(stillBlob);
    return {
      width: W,
      height: H,
      durationMs,
      loop: true,
      draw: (ctx, t) => {
        void t;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(bmp, 0, 0, W, H);
      },
      cleanup: () => bmp.close(),
    };
  }

  // Built-in animated card: build the real layer model and bake every visible
  // layer to its own bitmap so each element can enter independently. The
  // background draws immediately (full alpha, no flash); foreground layers
  // composite in z-order with a per-layer stagger + entrance. "countUp" redraws
  // numeric layers live (drawCount) instead of compositing their bitmap.
  await ensureCardFonts();
  const builtins = await buildBuiltinLayers(input, opts, p, W, H, scale);
  const tplCtx: TemplateContext = {
    clubName: opts.brand?.name ?? DEFAULT_BRAND.name,
    clubUrl: opts.clubUrl ?? "",
    hashtag: opts.hashtag ?? defaultHashtag(opts.brand),
    photoUrl: opts.photoUrl,
  };
  const laidOut =
    opts.layout && opts.layout.length > 0
      ? applyLayout(builtins, opts.layout, H, input, tplCtx)
      : builtins;
  const ordered = laidOut.filter((l) => !l.hidden).sort((a, b) => a.z - b.z);
  const baked = await Promise.all(ordered.map((l) => bakeLayer(l, W, H)));
  const fg = baked.filter((b) => b.layer.id !== "background");
  const bgBaked = baked.filter((b) => b.layer.id === "background");

  // Per-preset stagger spread (fraction of timeline the element starts spread
  // over) and per-element entrance window. fadeIn/slideUp move as one block
  // (zero spread); the per-element presets spread their starts out. Both shrink
  // with speed so faster = snappier and holds longer.
  const spreadBase =
    motion === "popIn" || motion === "wipe" || motion === "countUp"
      ? 0.3
      : motion === "stagger"
        ? 0.55
        : motion === "matchReveal"
          ? 0.6
          : 0;
  const winBase = 0.45;
  const spread = spreadBase / speed;
  const win = winBase / speed;
  const n = Math.max(1, fg.length);
  const layerProgress = (idx: number, t: number): number => {
    const start = n > 1 ? (idx / (n - 1)) * spread : 0;
    return clamp01((t - start) / win);
  };

  // Composite one foreground baked layer at local progress `lp` (0-1) under the
  // active preset's entrance. Skips zero-progress layers (avoids a blank flash).
  const drawFg = (ctx: CanvasRenderingContext2D, b: BakedLayer, lp: number) => {
    if (lp <= 0) return;
    // countUp: re-render numeric layers live so the figure ticks up; the value
    // fades in alongside (alpha = lp). drawCount(1) === draw() so rest matches.
    if (motion === "countUp" && b.layer.numeric && b.layer.drawCount) {
      ctx.save();
      // countUp redraws live (not the baked bitmap), so fold in the layer's own
      // opacity here — the baked path already has it composited in.
      ctx.globalAlpha = easeOutCubic(lp) * Math.max(0, Math.min(1, b.layer.effects?.opacity ?? 1));
      applyLayerTransform(ctx, b.layer);
      try {
        b.layer.drawCount(ctx, lp);
      } catch {}
      ctx.restore();
      return;
    }
    if (!b.bitmap) return;
    const e = easeOutCubic(lp);
    ctx.save();
    if (motion === "popIn") {
      const s = easeOutBack(lp);
      ctx.globalAlpha = e;
      ctx.translate(b.cx, b.cy);
      ctx.scale(s, s);
      ctx.translate(-b.cx, -b.cy);
      ctx.drawImage(b.bitmap, 0, 0, W, H);
    } else if (motion === "wipe") {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.rect(b.rx, b.ry, Math.max(1, b.rw * e), b.rh);
      ctx.clip();
      ctx.drawImage(b.bitmap, 0, 0, W, H);
    } else if (motion === "matchReveal" && b.bitmap) {
      const headerEnd = H * 0.2;
      const crestsEnd = H * 0.35;
      const inningsEnd = H * 0.78;
      const p1 = clamp01(lp / 0.25);
      const p2 = clamp01((lp - 0.15) / 0.3);
      const p3 = clamp01((lp - 0.4) / 0.35);
      const p4 = clamp01((lp - 0.7) / 0.3);
      const bmp = b.bitmap;
      const drawRegion = (ry: number, rh: number, progress: number, slideY = 0) => {
        if (progress <= 0) return;
        const ep = easeOutCubic(progress);
        ctx.save();
        ctx.globalAlpha = ep;
        ctx.beginPath();
        ctx.rect(0, ry, W, rh);
        ctx.clip();
        if (slideY !== 0) ctx.translate(0, (1 - ep) * slideY);
        ctx.drawImage(bmp, 0, 0, W, H);
        ctx.restore();
      };
      drawRegion(0, headerEnd, p1, -20 * (W / 1080));
      drawRegion(headerEnd, crestsEnd - headerEnd, p2, 0);
      drawRegion(crestsEnd, inningsEnd - crestsEnd, p3, 0);
      drawRegion(inningsEnd, H - inningsEnd, p4, 30 * (W / 1080));
    } else {
      // fadeIn / slideUp / stagger / countUp(non-numeric): fade (+ rise).
      ctx.globalAlpha = e;
      if (motion === "slideUp" || motion === "stagger") {
        ctx.translate(0, (1 - e) * 0.06 * H);
      }
      ctx.drawImage(b.bitmap, 0, 0, W, H);
    }
    ctx.restore();
  };

  return {
    width: W,
    height: H,
    durationMs,
    loop: true,
    draw: (ctx, t) => {
      ctx.clearRect(0, 0, W, H);
      // Background is always fully visible from frame 0 so nothing flashes.
      for (const b of bgBaked) {
        if (b.bitmap) ctx.drawImage(b.bitmap, 0, 0, W, H);
      }
      fg.forEach((b, idx) => drawFg(ctx, b, layerProgress(idx, t)));
    },
    cleanup: () => {
      for (const b of baked) b.bitmap?.close();
    },
  };
};

// Pick the best MediaRecorder container the browser supports. MP4 is preferred
// (broad social-platform support); WebM is the universal fallback in Chromium.
// When `withAudio` is set, prefer mime strings that name an audio codec too
// (avc1+mp4a for MP4, vp9/vp8+opus for WebM) so the muxed track is actually
// encoded — a video-only mime can silently drop the audio track.
export const pickVideoMime = (withAudio = false): { mime: string; ext: string } => {
  const supported = (m: string): boolean =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(m);
  if (withAudio) {
    if (supported("video/mp4;codecs=avc1,mp4a.40.2"))
      return { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" };
    if (supported("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
    if (supported("video/webm;codecs=vp9,opus"))
      return { mime: "video/webm;codecs=vp9,opus", ext: "webm" };
    if (supported("video/webm;codecs=vp8,opus"))
      return { mime: "video/webm;codecs=vp8,opus", ext: "webm" };
    if (supported("video/webm")) return { mime: "video/webm", ext: "webm" };
    return { mime: "", ext: "webm" };
  }
  if (supported("video/mp4;codecs=avc1")) return { mime: "video/mp4;codecs=avc1", ext: "mp4" };
  if (supported("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
  if (supported("video/webm;codecs=vp9")) return { mime: "video/webm;codecs=vp9", ext: "webm" };
  if (supported("video/webm")) return { mime: "video/webm", ext: "webm" };
  return { mime: "", ext: "webm" };
};

// Load + decode a track and build a looping audio graph feeding a MediaStream
// audio track, ready to mux into the canvas capture stream. Returns the stream
// track plus start/stop controls and a cleanup, or null if anything fails (so
// the caller degrades to a silent clip instead of throwing). The source loops
// from `trimStartMs` so a clip longer than the (trimmed) track never falls
// silent; volume is applied via a GainNode.
type ClipAudio = {
  track: MediaStreamTrack;
  start: (when: number) => void;
  stop: () => void;
  cleanup: () => void;
};
const prepareClipAudio = async (spec: CardAudioSpec): Promise<ClipAudio | null> => {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    const res = await fetch(spec.url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const ctx = new AudioCtx();
    const buffer = await ctx.decodeAudioData(arrayBuf);
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, spec.volume));
    gain.connect(dest);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Loop the trimmed window: playback starts at trimStart and wraps back to
    // it (not to 0) so the clip keeps using the admin-chosen section.
    const trimStart = Math.max(0, Math.min(spec.trimStartMs / 1000, buffer.duration));
    src.loopStart = trimStart;
    src.loopEnd = buffer.duration;
    src.connect(gain);
    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      void ctx.close();
      return null;
    }
    return {
      track,
      start: (when: number) => {
        void ctx.resume().catch(() => {});
        src.start(when, trimStart);
      },
      stop: () => {
        try {
          src.stop();
        } catch {}
      },
      cleanup: () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {}
        void ctx.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
};

// Human-facing label for the export format the current browser will produce
// (so the admin UI can document the constraint, e.g. "MP4" vs "WebM").
export const videoFormatLabel = (): string => pickVideoMime().ext.toUpperCase();

// Whether this browser can export video at all (needs MediaRecorder +
// canvas.captureStream). Lets the UI hide the video button gracefully.
export const canExportVideo = (): boolean =>
  typeof MediaRecorder !== "undefined" &&
  typeof document.createElement("canvas").captureStream === "function";

// Render a card to a downloadable video clip via canvas.captureStream +
// MediaRecorder. Returns the encoded blob and its file extension. Runs the
// animation once in real time (no loop) so the clip is a single clean pass.
export const renderShareCardVideo = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> => {
  if (!canExportVideo()) {
    throw new Error("This browser can't export video (MediaRecorder unavailable).");
  }
  const anim = await prepareAnimation(input, opts);
  const canvas = document.createElement("canvas");
  canvas.width = anim.width;
  canvas.height = anim.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  // Paint the first frame before the recorder starts so the clip opens cleanly.
  anim.draw(ctx, 0);

  // Optional background music: build a looping audio graph and mux its stream
  // track into the canvas capture stream BEFORE constructing the recorder (a
  // track added after start() is not encoded). A failed decode/load yields null
  // → silent clip, never a thrown error.
  const clipAudio = opts.audio ? await prepareClipAudio(opts.audio) : null;
  const { mime, ext } = pickVideoMime(!!clipAudio);
  const stream = canvas.captureStream(30);
  if (clipAudio) stream.addTrack(clipAudio.track);
  const recorder = new MediaRecorder(
    stream,
    mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || "video/webm" }));
  });

  recorder.start();
  // Start the music in lockstep with recording so the audio aligns with frame 0.
  if (clipAudio) clipAudio.start(0);
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = (now: number) => {
      try {
        const elapsed = now - start;
        anim.draw(ctx, Math.min(1, elapsed / anim.durationMs));
        if (elapsed >= anim.durationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      } catch (err) {
        // A throw inside an rAF callback is otherwise an uncaught error that
        // never settles this promise, leaving the caller's export state stuck.
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    requestAnimationFrame(tick);
  });
  anim.draw(ctx, 1);
  recorder.stop();

  const blob = await stopped;
  if (clipAudio) {
    clipAudio.stop();
    clipAudio.cleanup();
  }
  anim.cleanup();
  return { blob, ext };
};

// Whether GIF export is feasible in this browser (needs an offscreen 2D canvas
// + createImageBitmap, both used by the animation pipeline). gifenc itself is
// pure JS and loaded on demand.
export const canExportGif = (): boolean =>
  typeof document !== "undefined" &&
  typeof document.createElement("canvas").getContext === "function" &&
  typeof createImageBitmap === "function";

// Render a card to a looping GIF via gifenc. Downscales to ~540px wide (GIFs are
// heavy) at ~12fps over a single pass of the animation, then quantises each
// frame to a 256-colour palette and writes a looping image. Returns the blob +
// "gif" extension. Loaded dynamically so gifenc stays out of the main bundle.
export const renderShareCardGif = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> => {
  if (!canExportGif()) {
    throw new Error("This browser can't export GIF.");
  }
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const anim = await prepareAnimation(input, opts);

  // Downscale: GIF palette + size make full-res clips huge. Cap the long edge.
  const maxW = 540;
  const ratio = anim.height / anim.width;
  const gw = Math.min(maxW, anim.width);
  const gh = Math.round(gw * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  const fps = 12;
  const frameCount = Math.max(2, Math.round((anim.durationMs / 1000) * fps));
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  try {
    for (let i = 0; i < frameCount; i++) {
      const t = frameCount > 1 ? i / (frameCount - 1) : 1;
      ctx.clearRect(0, 0, gw, gh);
      // The animation draws at full size; scale the whole frame down to GIF size.
      ctx.save();
      ctx.scale(gw / anim.width, gh / anim.height);
      anim.draw(ctx, t);
      ctx.restore();
      const { data } = ctx.getImageData(0, 0, gw, gh);
      const palette = quantize(data, 256);
      const indexed = applyPalette(data, palette);
      gif.writeFrame(indexed, gw, gh, { palette, delay, repeat: 0 });
    }
    gif.finish();
  } finally {
    // Ensures every baked bitmap prepareAnimation created for this clip is
    // released even if a mid-loop error (e.g. a tainted-canvas getImageData
    // throw) skips the rest of the loop.
    anim.cleanup();
  }
  const bytes = gif.bytes();
  const blob = new Blob([bytes as BlobPart], { type: "image/gif" });
  return { blob, ext: "gif" };
};

