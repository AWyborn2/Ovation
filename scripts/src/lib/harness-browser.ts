/**
 * Drive the web app's card render harness (`/__card-render`) in a real
 * browser from a script: build the web app, serve the build, and open the
 * harness in Chrome through `puppeteer-core`. The pack converter
 * (`convert-pack.ts`) uses it; the template bundle fit check (L2-B) reuses it.
 *
 * Chrome is found the way the rest of the stack finds it:
 *   - `CHROME_PATH` (CI: `/usr/bin/google-chrome`, as `playhq-sync.yml` sets);
 *   - `PUPPETEER_EXECUTABLE_PATH` / `CHROMIUM_PATH` (the local dev stack sets both);
 *   - else the installed Chrome or Edge.
 */

import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const WEB_DIR = path.join(REPO_ROOT, "artifacts", "cricket-club");
export const HARNESS_PATH = "/__card-render";

type Log = (message: string) => void;
const stderr: Log = (m) => process.stderr.write(`${m}\n`);

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/** Where Chrome or Edge is installed, per platform, in the order tried. */
export function chromeCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA
      ? [path.join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")]
      : [];
    return [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      ...local,
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    ];
  }
  if (platform === "darwin")
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
}

/** The browser to drive: an env override first, else an installed Chrome or Edge. */
export function findChrome(
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
): string {
  for (const name of ["CHROME_PATH", "PUPPETEER_EXECUTABLE_PATH", "CHROMIUM_PATH"] as const) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (exists(value)) return value;
    throw new Error(`${name} is set to ${value}, which does not exist.`);
  }
  const found = chromeCandidates(platform, env).find((p) => exists(p));
  if (found) return found;
  throw new Error(
    "No Chrome or Edge found. Install Chrome, or set CHROME_PATH to a Chrome or Chromium binary.",
  );
}

// ---------------------------------------------------------------------------
// Build and serve
// ---------------------------------------------------------------------------

/** The default build folder for a mode (under the web app's git-ignored `dist`). */
export function buildDir(mode: string): string {
  return path.join(WEB_DIR, "dist", `harness-${mode}`);
}

/**
 * `vite build` the web app into `outDir`. `mode: "capture"` keeps the
 * converter's capture in the bundle (dev and CI only); `"production"` is the
 * bundle that ships.
 */
export async function buildWebApp(
  opts: { mode?: string; outDir?: string; log?: Log } = {},
): Promise<string> {
  const mode = opts.mode ?? "production";
  const outDir = opts.outDir ?? buildDir(mode);
  const log = opts.log ?? stderr;
  const require = createRequire(path.join(WEB_DIR, "package.json"));
  const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
  log(`[harness] building the web app (mode ${mode}) into ${path.relative(REPO_ROOT, outDir)}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        vite,
        "build",
        "--config",
        "vite.config.ts",
        "--mode",
        mode,
        "--outDir",
        outDir,
        "--emptyOutDir",
      ],
      {
        cwd: WEB_DIR,
        env: { ...process.env, NODE_ENV: "production", BASE_PATH: "/" },
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`vite build exited with ${code}`)),
    );
  });
  return outDir;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export interface StaticServer {
  url: string;
  close(): Promise<void>;
}

/**
 * Serve a built web app on 127.0.0.1 (a free port): files as they are, any
 * other page path falls back to `index.html` (the app routes client-side),
 * and `/api/*` answers 404 (the harness needs no API).
 */
export async function serveStatic(root: string): Promise<StaticServer> {
  const base = path.resolve(root);
  if (!existsSync(path.join(base, "index.html")))
    throw new Error(`${base} has no index.html: build the web app first.`);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" }).end("{}");
      return;
    }
    let file = path.resolve(base, `.${decodeURIComponent(url.pathname)}`);
    const inside = file === base || file.startsWith(base + path.sep);
    if (!inside || !existsSync(file) || statSync(file).isDirectory())
      file = path.join(base, "index.html");
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ---------------------------------------------------------------------------
// The browser session
// ---------------------------------------------------------------------------

export interface HarnessSession {
  browser: Browser;
  baseUrl: string;
  /** A fresh page on the harness, ready to call (one per worker). */
  openPage(): Promise<Page>;
  /** Uncaught page errors seen so far. */
  errors: string[];
}

export interface HarnessOptions {
  /** A running web app (e.g. the dev server, `http://localhost:5180`); skips build and serve. */
  baseUrl?: string;
  /** Build mode when building (`capture` keeps the converter's capture). Default `production`. */
  mode?: string;
  /** Reuse the last build in `buildDir(mode)` instead of building again. */
  skipBuild?: boolean;
  /** Wait for these harness methods before handing a page over (e.g. `["capture"]`). */
  require?: string[];
  chromePath?: string;
  log?: Log;
}

/** Open a page on the harness and wait for it (and any required methods). */
async function openHarnessPage(
  browser: Browser,
  baseUrl: string,
  required: string[],
  errors: string[],
): Promise<Page> {
  // A context of its own keeps the page visible: a second tab in one context
  // is hidden, and a hidden page gets no animation frames, which the render
  // waits on.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  // Large enough for the tallest card (story, 1080×1920) at 1:1.
  await page.setViewport({ width: 1200, height: 1920, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  // tsx (esbuild) wraps named inner functions in `__name(…)`; functions sent to
  // the page with `evaluate` carry it, so the page needs the helper too.
  await page.evaluateOnNewDocument("globalThis.__name = (fn) => fn;");
  await page.goto(`${baseUrl}${HARNESS_PATH}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __cardRenderHarness?: { ready?: boolean } }).__cardRenderHarness
        ?.ready === true,
    { timeout: 60_000, polling: 200 },
  );
  for (const method of required) {
    try {
      await page.waitForFunction(
        (m) =>
          typeof (globalThis as unknown as { __cardRenderHarness?: Record<string, unknown> })
            .__cardRenderHarness?.[m] === "function",
        { timeout: 30_000, polling: 200 },
        method,
      );
    } catch {
      throw new Error(
        `The harness at ${baseUrl} has no ${method}(): it exists on the dev server and in ` +
          "`vite build --mode capture` only, never in a production build.",
      );
    }
  }
  return page;
}

/**
 * Run `fn` with a browser on the harness: build and serve the web app (or use
 * `baseUrl`), launch Chrome, and clean everything up afterwards.
 */
export async function withHarness<T>(
  opts: HarnessOptions,
  fn: (session: HarnessSession) => Promise<T>,
): Promise<T> {
  const log = opts.log ?? stderr;
  let server: StaticServer | null = null;
  let browser: Browser | null = null;
  try {
    let baseUrl = opts.baseUrl?.replace(/\/+$/, "");
    if (!baseUrl) {
      const mode = opts.mode ?? "production";
      const dir = buildDir(mode);
      if (!opts.skipBuild || !existsSync(path.join(dir, "index.html")))
        await buildWebApp({ mode, outDir: dir, log });
      server = await serveStatic(dir);
      baseUrl = server.url;
    }
    const executablePath = opts.chromePath ?? findChrome();
    log(`[harness] ${path.basename(executablePath)} on ${baseUrl}${HARNESS_PATH}`);
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-color-profile=srgb",
        "--font-render-hinting=none",
      ],
    });
    const errors: string[] = [];
    const session: HarnessSession = {
      browser,
      baseUrl,
      errors,
      openPage: () => openHarnessPage(browser!, baseUrl!, opts.require ?? [], errors),
    };
    return await fn(session);
  } finally {
    await browser?.close().catch(() => {});
    await server?.close();
  }
}

/** Call a harness method in the page (arguments travel as JSON). */
export async function callHarness<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return (await page.evaluate(
    (m, a) => {
      const harness = (
        globalThis as unknown as {
          __cardRenderHarness: Record<string, (...x: unknown[]) => unknown>;
        }
      ).__cardRenderHarness;
      return harness[m]!(...a);
    },
    method,
    args,
  )) as T;
}
