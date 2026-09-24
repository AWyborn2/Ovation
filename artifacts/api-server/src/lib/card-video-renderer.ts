import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { logger } from "./logger";
import { env } from "../config";

// The frontend exposes a hidden harness route that runs the EXACT same renderer
// the browser preview uses, so server-rendered MP4s are pixel-identical to the
// preview (single source of truth — no node-canvas port to drift out of sync).
const HARNESS_PATH = "/__card-render";

// The harness lives in the cricket-club web app, so the api-server must drive
// Chromium to an origin that actually serves it. In the autoscale deployment the
// api-server sits behind the application router and NOTHING listens on
// localhost:80, so we prefer the origin the request itself arrived on (the same
// public host that serves the web app's routes). Precedence: explicit
// RENDER_HARNESS_URL / RENDER_HARNESS_ORIGIN env overrides, then the per-request
// origin, then localhost:80 as a last resort for request-less contexts (the
// render smoke test / internal callers).
function harnessUrl(originOverride?: string | null): string {
  const explicitUrl = env.RENDER_HARNESS_URL();
  if (explicitUrl) return explicitUrl;
  const origin =
    env.RENDER_HARNESS_ORIGIN() ?? (originOverride || undefined) ?? "http://localhost:80";
  return `${origin.replace(/\/$/, "")}${HARNESS_PATH}`;
}

// Derive a reachable harness origin from an inbound request's (forwarded)
// headers — the same public host the client used to reach the API also serves
// the web app's `/__card-render` route. Returns null when host headers are
// absent (e.g. an internal job with no originating request), letting
// harnessUrl() fall back to the env override or localhost.
export function harnessOriginFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const first = (v: string | string[] | undefined): string | undefined =>
    (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim() || undefined;
  const host = first(headers["x-forwarded-host"]) ?? first(headers["host"]);
  if (!host) return null;
  const proto =
    first(headers["x-forwarded-proto"]) ??
    (/^(localhost|127\.|\[?::1)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

// Resolve the Chromium binary. The Nix store path changes across rebuilds, so we
// prefer an env override, then a `which chromium` lookup at runtime, then a few
// common fallbacks. Cached after first success.
let cachedChromium: string | null = null;
function resolveChromiumPath(): string {
  if (cachedChromium) return cachedChromium;
  const fromEnv = env.PUPPETEER_EXECUTABLE_PATH() ?? env.CHROMIUM_PATH();
  if (fromEnv && existsSync(fromEnv)) {
    cachedChromium = fromEnv;
    return fromEnv;
  }
  for (const bin of ["chromium", "chromium-browser", "google-chrome"]) {
    try {
      const found = execFileSync("which", [bin], { encoding: "utf8" }).trim();
      if (found && existsSync(found)) {
        cachedChromium = found;
        return found;
      }
    } catch {
      // not on PATH; try the next candidate
    }
  }
  throw new Error(
    "Chromium binary not found. Set CHROMIUM_PATH or install the 'chromium' system dependency.",
  );
}

// Lazily-launched, reused browser. Relaunched automatically if it disconnects.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // fall through to relaunch
    }
  }
  browserPromise = puppeteer.launch({
    executablePath: resolveChromiumPath(),
    headless: true,
    // The container has no sandbox namespaces and limited /dev/shm; these flags
    // mirror the verified smoke test.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  return browserPromise;
}

export type RenderResult = {
  filePath: string;
  contentType: string;
  ext: string;
};

export type VideoFormat = "mp4" | "gif";
export type StillFormat = "png" | "jpg" | "pdf";

/** Pixel density for exports: 1–3× native (the card's own px size). */
export function clampScale(scale: number | null | undefined): number {
  if (typeof scale !== "number" || !Number.isFinite(scale)) return 1;
  return Math.min(3, Math.max(1, scale));
}

/**
 * ffmpeg arguments for a stream of PNG frames on stdin. MP4 is H.264 (even
 * dimensions for yuv420p); GIF builds a palette from the clip for clean colour.
 */
export function ffmpegArgs(format: VideoFormat, fps: number, filePath: string): string[] {
  const input = ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-"];
  if (format === "gif") {
    return [
      ...input,
      "-vf",
      "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer",
      "-loop",
      "0",
      filePath,
    ];
  }
  return [
    ...input,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    filePath,
  ];
}

export type RenderParams = {
  jobId: string;
  // Opaque ShareCardInput + RenderOptions JSON, identical to the preview.
  input: unknown;
  options: unknown;
  fps?: number;
  /** Output container (default mp4). */
  format?: VideoFormat;
  /** Pixel density for pack-card clips, 1–3× (default 1). */
  scale?: number;
  onProgress?: (progress: number) => void;
  // Per-request harness origin (see harnessOriginFromHeaders). Optional: falls
  // back to the env override / localhost when absent.
  harnessOrigin?: string | null;
};

type HarnessMeta = {
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
  /**
   * Set for a pack card (DOM animation): frames are seeked with seek() and
   * screenshotted from this element instead of drawn to a canvas.
   */
  selector?: string;
};

// Shape of the in-page harness installed by the cricket-club web app. The
// evaluate callbacks below run in the browser (where globalThis === window); we
// type them against globalThis so the Node-only api-server tsconfig (no DOM lib)
// still type-checks.
type StillMeta = {
  width: number;
  height: number;
  selector: string;
};
type HarnessApi = {
  ready: boolean;
  init: (payload: { input: unknown; options: unknown }) => Promise<HarnessMeta>;
  drawFrame: (t: number) => string;
  seek: (t: number) => Promise<void>;
  renderStill: (payload: { input: unknown; options: unknown }) => Promise<StillMeta>;
  dispose: () => void;
};
type HarnessGlobal = typeof globalThis & {
  __cardRenderHarness?: HarnessApi;
};

// Where finished clips live until the admin downloads them.
export function outputDir(): string {
  return path.join(os.tmpdir(), "hhcc-card-video");
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Buffer.from(b64, "base64");
}

// Drive the harness frame-by-frame and pipe PNG frames into ffmpeg, producing a
// guaranteed-compatible H.264/yuv420p MP4 with +faststart (web/social friendly).
export async function renderCardVideo(params: RenderParams): Promise<RenderResult> {
  const { jobId, input, options, onProgress } = params;
  const format: VideoFormat = params.format === "gif" ? "gif" : "mp4";
  // GIFs run at 15fps by default: smooth enough, and far smaller files.
  const fps = Math.max(1, Math.min(60, Math.round(params.fps ?? (format === "gif" ? 15 : 30))));

  const { mkdir } = await import("node:fs/promises");
  await mkdir(outputDir(), { recursive: true });
  const filePath = path.join(outputDir(), `${jobId}.${format}`);

  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    page.on("pageerror", (err) =>
      logger.warn({ err: String(err) }, "card-video harness page error"),
    );

    const url = harnessUrl(params.harnessOrigin);
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean((globalThis as HarnessGlobal).__cardRenderHarness?.ready),
      { timeout: 30_000 },
    );

    // Prepare the animation in-page (preloads every image/font), get its metrics.
    const meta = (await page.evaluate(
      async (payload) => (globalThis as HarnessGlobal).__cardRenderHarness!.init(payload),
      { input, options } as { input: unknown; options: unknown },
    )) as HarnessMeta;

    const totalFrames = Math.max(1, Math.round((meta.durationMs / 1000) * fps));

    // A pack card's clip is its DOM, screenshotted per frame at the export scale.
    const packEl = meta.selector ? await page.$(meta.selector) : null;
    if (meta.selector) {
      if (!packEl) throw new Error(`Card element ${meta.selector} not found`);
      await page.setViewport({
        width: meta.width,
        height: meta.height,
        deviceScaleFactor: clampScale(params.scale),
      });
    }

    // Spawn ffmpeg reading a stream of PNGs from stdin.
    const ff = spawn("ffmpeg", ffmpegArgs(format, fps, filePath), {
      stdio: ["pipe", "ignore", "pipe"],
    });

    let ffErr = "";
    ff.stderr?.on("data", (d: Buffer) => {
      ffErr += d.toString();
      if (ffErr.length > 8000) ffErr = ffErr.slice(-8000);
    });
    const ffDone = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-500)}`));
      });
    });

    // Capture loop. t is 0..1 progress — the same contract the browser export
    // uses (draw(ctx, elapsed/durationMs)). First frame t=0, last frame t=1.
    for (let i = 0; i < totalFrames; i += 1) {
      const t = totalFrames > 1 ? i / (totalFrames - 1) : 0;
      let buf: Buffer;
      if (packEl) {
        await page.evaluate((tt) => (globalThis as HarnessGlobal).__cardRenderHarness!.seek(tt), t);
        const shot = await packEl.screenshot({ type: "png" });
        buf = Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
      } else {
        const dataUrl = (await page.evaluate(
          (tt) => (globalThis as HarnessGlobal).__cardRenderHarness!.drawFrame(tt),
          t,
        )) as string;
        buf = dataUrlToBuffer(dataUrl);
      }
      if (!ff.stdin.write(buf)) {
        await new Promise<void>((resolve) => ff.stdin.once("drain", resolve));
      }
      // Reserve the last 5% for the encoder flush.
      onProgress?.(((i + 1) / totalFrames) * 0.95);
    }

    ff.stdin.end();
    await ffDone;
    onProgress?.(1);

    return format === "gif"
      ? { filePath, contentType: "image/gif", ext: "gif" }
      : { filePath, contentType: "video/mp4", ext: "mp4" };
  } finally {
    try {
      await page?.evaluate(() => (globalThis as HarnessGlobal).__cardRenderHarness?.dispose());
    } catch {
      // page may already be gone
    }
    await page?.close().catch(() => {});
  }
}

export type StillRenderResult = {
  buffer: Buffer;
  contentType: "image/png" | "image/jpeg" | "application/pdf";
  ext: StillFormat;
  width: number;
  height: number;
};

const STILL_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  pdf: "application/pdf",
} as const;

// Render a STATIC pack card to a PNG. Reuses the shared browser pool and the
// same harness page as the MP4 path, but drives its static mode: the harness
// mounts <PackCard> unscaled at native px and we screenshot that element. No
// prepareAnimation, no ffmpeg — a single frame straight to a buffer.
export async function renderCardStill(
  input: unknown,
  options: unknown,
  harnessOrigin?: string | null,
  out: { format?: StillFormat; scale?: number } = {},
): Promise<StillRenderResult> {
  const format: StillFormat = out.format ?? "png";
  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    page.on("pageerror", (err) =>
      logger.warn({ err: String(err) }, "card-still harness page error"),
    );

    const url = harnessUrl(harnessOrigin);
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean((globalThis as HarnessGlobal).__cardRenderHarness?.ready),
      { timeout: 30_000 },
    );

    // Mount the pack card at native size in-page (preloads fonts), get its box.
    const meta = (await page.evaluate(
      async (payload) => (globalThis as HarnessGlobal).__cardRenderHarness!.renderStill(payload),
      { input, options } as { input: unknown; options: unknown },
    )) as StillMeta;

    // Match the viewport to the native card so the element is fully painted with
    // no device scaling (1080px element → 1080px PNG).
    // PDF is vector, so it prints at 1×; images render at the export scale.
    await page.setViewport({
      width: meta.width,
      height: meta.height,
      deviceScaleFactor: format === "pdf" ? 1 : clampScale(out.scale),
    });

    const el = await page.$(meta.selector);
    if (!el) {
      throw new Error(`Card still element ${meta.selector} not found`);
    }
    // The card is fixed at the page's top-left, so a page the card's size
    // prints exactly the card.
    const shot =
      format === "pdf"
        ? await page.pdf({
            width: `${meta.width}px`,
            height: `${meta.height}px`,
            printBackground: true,
            pageRanges: "1",
          })
        : await el.screenshot(format === "jpg" ? { type: "jpeg", quality: 92 } : { type: "png" });
    const buffer = Buffer.isBuffer(shot) ? shot : Buffer.from(shot);

    return {
      buffer,
      contentType: STILL_TYPES[format],
      ext: format,
      width: meta.width,
      height: meta.height,
    };
  } finally {
    try {
      await page?.evaluate(() => (globalThis as HarnessGlobal).__cardRenderHarness?.dispose());
    } catch {
      // page may already be gone
    }
    await page?.close().catch(() => {});
  }
}

// Best-effort shutdown (used in tests / graceful exit).
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    // ignore
  } finally {
    browserPromise = null;
  }
}
