/**
 * Pack converter, capture half (social template library, ADR-011 §5, slice
 * L4-A1): render every pack × kind × page × size × preset through the card
 * render harness and save what the DOM shows as JSON. The mapping to
 * template layers (L4-A2) reads these files; nothing here writes a bundle.
 *
 *   cd scripts && npx tsx src/convert-pack.ts [options]
 *
 *   --pack=<id>[,<id>]       packs (default: all seven, the hidden four included)
 *   --kind=<kind>[,<kind>]   only these kinds (`results` is the Results set)
 *   --variant=<text>         only variants whose id contains this
 *   --size=<size>[,<size>]   square, portrait, story, landscape (default: all)
 *   --colour-mode=club|pack  the club's colour mode for the pack (default club)
 *   --out=<dir>              output folder (default scripts/exports/pack-capture, git-ignored)
 *   --base-url=<url>         capture from a running web app (the dev server) instead of a build
 *   --skip-build             reuse the last `vite build --mode capture`
 *   --concurrency=<n>        pages capturing at once (default 3)
 *   --list                   print the plan and stop
 *
 * Output: `<out>/manifest.json`, and `<out>/<packId>/<variantId>.json` per
 * variant holding each of its captures (size × render). Chrome: CHROME_PATH,
 * else PUPPETEER_EXECUTABLE_PATH / CHROMIUM_PATH, else the installed Chrome or
 * Edge (`lib/harness-browser.ts`).
 */

import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPTURE_SIZES,
  PACK_CAPTURE_FORMAT,
  SENTINEL_PALETTES,
  type CaptureRender,
  type CaptureSize,
  type CaptureVariant,
  type ColourMode,
  type PackCapture,
} from "@workspace/scorecard/pack-capture";
import type { Page } from "puppeteer-core";
import { REPO_ROOT, callHarness, withHarness } from "./lib/harness-browser";

/** Every pack the converter covers: the three active looks, then the hidden four. */
export const CONVERTER_PACKS = [
  "club-kit-v1",
  "broadcast-dark-v1",
  "duotone-v1",
  "gold-foil-v1",
  "bold-type-v1",
  "neon-night-v1",
  "sunset-v1",
] as const;

export interface ConvertOptions {
  packs: string[];
  kinds: string[] | null;
  variant: string | null;
  sizes: CaptureSize[];
  colourMode: ColourMode;
  out: string;
  baseUrl: string | null;
  skipBuild: boolean;
  concurrency: number;
  list: boolean;
}

const list = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

export function parseArgs(argv: readonly string[]): ConvertOptions {
  const args = new Map<string, string>();
  for (const a of argv) {
    if (a === "--") continue; // `pnpm run convert-pack -- …` may pass it through
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`Unknown argument: ${a}`);
    args.set(m[1]!, m[2] ?? "true");
  }
  const known = [
    "pack",
    "kind",
    "variant",
    "size",
    "colour-mode",
    "out",
    "base-url",
    "skip-build",
    "concurrency",
    "list",
  ];
  for (const key of args.keys())
    if (!known.includes(key)) throw new Error(`Unknown option --${key}`);
  const sizes = (list(args.get("size")) ?? [...CAPTURE_SIZES]) as CaptureSize[];
  for (const s of sizes)
    if (!(CAPTURE_SIZES as readonly string[]).includes(s)) throw new Error(`Unknown size: ${s}`);
  const colourMode = args.get("colour-mode") ?? "club";
  if (colourMode !== "club" && colourMode !== "pack")
    throw new Error(`--colour-mode is club or pack, not ${colourMode}`);
  const concurrency = Number(args.get("concurrency") ?? 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("--concurrency is a whole number from 1 to 8");
  return {
    packs: list(args.get("pack")) ?? [...CONVERTER_PACKS],
    kinds: list(args.get("kind")),
    variant: args.get("variant") ?? null,
    sizes,
    colourMode,
    out: path.resolve(
      args.get("out") ?? path.join(REPO_ROOT, "scripts", "exports", "pack-capture"),
    ),
    baseUrl: args.get("base-url") ?? null,
    skipBuild: args.has("skip-build"),
    concurrency,
    list: args.has("list"),
  };
}

/** One saved capture: what was rendered, and what the DOM showed. */
export interface SavedCapture {
  size: CaptureSize;
  content: CaptureVariant["renders"][number]["content"];
  palette: CaptureVariant["renders"][number]["palette"];
  detail: CaptureVariant["renders"][number]["detail"];
  render: CaptureRender;
  capture: PackCapture;
}

/** `<out>/<packId>/<variantId>.json`. */
export interface VariantFile {
  format: typeof PACK_CAPTURE_FORMAT;
  packId: string;
  colourMode: ColourMode;
  variant: CaptureVariant;
  captures: SavedCapture[];
}

interface PackSummary {
  variants: number;
  captures: number;
  failures: Array<{ variant: string; size: string; render: string; error: string }>;
  warnings: number;
  ms: number;
}

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** A capture takes well under a second; one that hangs is a failure, not a stuck run. */
const CAPTURE_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`capture timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Run `work` over `items` with `pages.length` workers, one page each. */
async function pool<T>(items: T[], pages: Page[], work: (item: T, page: Page) => Promise<void>) {
  let next = 0;
  await Promise.all(
    pages.map(async (page) => {
      while (next < items.length) {
        const item = items[next++]!;
        await work(item, page);
      }
    }),
  );
}

export async function convertPacks(opts: ConvertOptions): Promise<number> {
  const started = Date.now();
  const log = (m: string) => process.stderr.write(`${m}\n`);
  return withHarness(
    {
      baseUrl: opts.baseUrl ?? undefined,
      mode: "capture",
      skipBuild: opts.skipBuild,
      require: ["capture", "captureVariants", "captureRender"],
      log,
    },
    async (session) => {
      const pages = await Promise.all(
        Array.from({ length: opts.concurrency }, () => session.openPage()),
      );
      const plans = new Map<string, CaptureVariant[]>();
      for (const packId of opts.packs) {
        const all = await callHarness<CaptureVariant[]>(pages[0]!, "captureVariants", packId);
        plans.set(
          packId,
          all.filter(
            (v) =>
              (!opts.kinds || opts.kinds.includes(v.kind)) &&
              (!opts.variant || v.id.includes(opts.variant)),
          ),
        );
      }

      if (opts.list) {
        for (const [packId, variants] of plans) {
          const captures = variants.reduce((n, v) => n + v.renders.length * opts.sizes.length, 0);
          process.stdout.write(`${packId}: ${variants.length} variants, ${captures} captures\n`);
          for (const v of variants)
            process.stdout.write(
              `  ${v.id}  [${v.renders.map((r) => `${r.content}/${r.palette}`).join(" ")}]\n`,
            );
        }
        return 0;
      }

      const summary: Record<string, PackSummary> = {};
      for (const [packId, variants] of plans) {
        const packStarted = Date.now();
        const dir = path.join(opts.out, packId);
        await rm(dir, { recursive: true, force: true });
        await mkdir(dir, { recursive: true });
        const s: PackSummary = {
          variants: variants.length,
          captures: 0,
          failures: [],
          warnings: 0,
          ms: 0,
        };
        summary[packId] = s;
        log(`[convert-pack] ${packId}: ${variants.length} variants`);
        await pool(variants, pages, async (variant, page) => {
          const file: VariantFile = {
            format: PACK_CAPTURE_FORMAT,
            packId,
            colourMode: opts.colourMode,
            variant,
            captures: [],
          };
          for (const r of variant.renders)
            for (const size of opts.sizes) {
              try {
                const render = await callHarness<CaptureRender>(
                  page,
                  "captureRender",
                  packId,
                  variant,
                  r,
                  size,
                  opts.colourMode,
                );
                const capture = await withTimeout(
                  callHarness<PackCapture>(page, "capture", packId, render, size),
                  CAPTURE_TIMEOUT_MS,
                );
                file.captures.push({ size, ...r, render, capture });
                s.captures++;
                s.warnings += capture.warnings.length;
              } catch (error) {
                s.failures.push({
                  variant: variant.id,
                  size,
                  render: `${r.content}/${r.palette}`,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          await writeFile(path.join(dir, `${variant.id}.json`), JSON.stringify(file));
        });
        s.ms = Date.now() - packStarted;
        log(
          `[convert-pack] ${packId}: ${s.captures} captures, ${s.failures.length} failed, ` +
            `${s.warnings} warnings, ${(s.ms / 1000).toFixed(1)}s`,
        );
      }

      const failures = Object.values(summary).reduce((n, s) => n + s.failures.length, 0);
      await mkdir(opts.out, { recursive: true });
      await writeFile(
        path.join(opts.out, "manifest.json"),
        JSON.stringify(
          {
            format: PACK_CAPTURE_FORMAT,
            generatedAt: new Date().toISOString(),
            gitSha: gitSha(),
            baseUrl: opts.baseUrl ?? "vite build --mode capture",
            colourMode: opts.colourMode,
            sizes: opts.sizes,
            palettes: SENTINEL_PALETTES,
            packs: summary,
            pageErrors: session.errors,
            seconds: Math.round((Date.now() - started) / 1000),
          },
          null,
          2,
        ),
      );
      log(
        `[convert-pack] wrote ${path.relative(process.cwd(), opts.out) || "."} (${failures} failures)`,
      );
      return failures > 0 ? 1 : 0;
    },
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  convertPacks(parseArgs(process.argv.slice(2))).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
      process.exit(1);
    },
  );
}
