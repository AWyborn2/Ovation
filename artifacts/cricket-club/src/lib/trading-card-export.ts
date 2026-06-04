import { toPng, toCanvas } from "html-to-image";
import { pickVideoMime, canExportVideo } from "@/lib/share-card";

export { canExportVideo };
export const videoFormatLabel = (): string => pickVideoMime().ext.toUpperCase();

/** Wait for every <img> inside a node to finish loading (or error). */
async function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      // `complete` is true once the image has finished loading OR failed; either
      // way no further load/error event will fire, so it is a terminal state.
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };
            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
            // Safety net: never block export forever on a stuck image.
            setTimeout(finish, 5000);
          }),
    ),
  );
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

/** Export a still PNG of a fully-rendered card node. */
export async function exportCardPng(node: HTMLElement, fileName: string): Promise<void> {
  if (document.fonts?.ready) await document.fonts.ready;
  await waitForImages(node);
  const dataUrl = await toPng(node, {
    pixelRatio: 3,
    cacheBust: true,
    skipFonts: false,
  });
  triggerDownload(dataUrlToBlob(dataUrl), fileName);
}

/** Snapshot a node to an ImageBitmap at the given pixel ratio. */
export async function snapshotBitmap(node: HTMLElement, pixelRatio = 2): Promise<ImageBitmap> {
  await waitForImages(node);
  const canvas = await toCanvas(node, {
    pixelRatio,
    cacheBust: true,
    backgroundColor: "#333F48",
  });
  return await createImageBitmap(canvas);
}

export interface CardVideoFrame {
  bitmap: ImageBitmap;
  durationMs: number;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

function drawFrame(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  w: number,
  h: number,
  alpha: number,
  scale: number,
  dy: number,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  const dw = w * scale;
  const dh = h * scale;
  const x = (w - dw) / 2;
  const y = (h - dh) / 2 + dy;
  ctx.drawImage(bmp, x, y, dw, dh);
  ctx.restore();
}

/**
 * Encode a sequence of phase stills into a downloadable video. Each frame is held
 * for its duration with a continuous slow zoom; adjacent frames cross-dissolve and
 * the incoming frame rises into place. Playback runs in real time and is recorded
 * via the canvas capture stream.
 */
export async function encodeCardVideo(
  frames: CardVideoFrame[],
  width: number,
  height: number,
  fileName: string,
): Promise<void> {
  const { mime, ext } = pickVideoMime();
  if (!mime) throw new Error("Video recording is not supported in this browser.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing context for the video.");

  const starts: number[] = [];
  let acc = 0;
  for (const f of frames) {
    starts.push(acc);
    acc += f.durationMs;
  }
  const total = acc;
  const TRANSITION = 450;

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const startTime = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed, total);

      let i = frames.length - 1;
      for (let k = 0; k < frames.length; k++) {
        if (t < starts[k] + frames[k].durationMs) {
          i = k;
          break;
        }
      }
      const localT = (t - starts[i]) / frames[i].durationMs;

      ctx.fillStyle = "#333F48";
      ctx.fillRect(0, 0, width, height);

      const zoom = 1 + 0.04 * easeInOut(Math.max(0, Math.min(1, localT)));
      const localMs = t - starts[i];

      if (localMs < TRANSITION && i > 0) {
        const p = easeOut(localMs / TRANSITION);
        drawFrame(ctx, frames[i - 1].bitmap, width, height, 1 - p, 1.04, 0);
        drawFrame(ctx, frames[i].bitmap, width, height, p, 0.97 + 0.03 * p, (1 - p) * 30);
      } else {
        drawFrame(ctx, frames[i].bitmap, width, height, 1, zoom, 0);
      }

      if (elapsed >= total) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  await done;

  const blob = new Blob(chunks, { type: mime });
  triggerDownload(blob, `${fileName}.${ext}`);
}
