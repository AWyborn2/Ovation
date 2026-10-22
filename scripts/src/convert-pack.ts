/**
 * The pack converter (social template library, ADR-011 §5): render every
 * pack × kind × page × size × preset through the card render harness, save
 * what the DOM shows (L4-A1 capture), then map the captures to format v2
 * template documents with a report per look (L4-A2 mapping).
 *
 *   cd scripts && npx tsx src/convert-pack.ts [options]
 *
 *   --pack=<id>[,<id>]       packs (default: all seven, the hidden four included)
 *   --kind=<kind>[,<kind>]   only these kinds (`results` is the Results set)
 *   --variant=<text>         only capture variants whose id contains this
 *   --size=<size>[,<size>]   square, portrait, story, landscape (default: all)
 *   --colour-mode=club|pack  the club's colour mode for the pack (default club)
 *   --out=<dir>              captures (default scripts/exports/pack-capture, git-ignored)
 *   --convert-out=<dir>      converted looks (default scripts/exports/pack-convert, git-ignored)
 *   --bundles                write the converted looks to lib/template-bundles instead (L4-B),
 *                            in Prettier's format (CI checks it); then
 *                            `pnpm --filter @workspace/template-bundles run generate`
 *   --capture-only           capture, don't map
 *   --map-only               map the captures already in --out (no new capture)
 *   --no-check               skip the fit and pixel-diff renders
 *   --shots                  save each pack / template screenshot pair (`<look>/shots/`;
 *                            with --bundles, under scripts/exports/pack-convert, git-ignored)
 *   --no-polish              write the raw conversion, without the look's polish (T4.12)
 *   --recheck                re-check the committed (polished) bundles against the pack
 *                            captures in --out: the report is rewritten, the bundle files aren't
 *   --polish-hd=<n>          with --recheck, the polish time logged so far, in half-days
 *   --base-url=<url>         use a running web app (the dev server) instead of a build
 *   --skip-build             reuse the last `vite build --mode capture`
 *   --concurrency=<n>        pages capturing at once (default 3)
 *   --list                   print the capture plan and stop
 *
 * Captures: `<out>/manifest.json` and `<out>/<packId>/<variantId>.json`.
 * Conversions: `<convert-out>/<look>/look.json`, `<kind>.json` (bundle
 * files, unlisted) and `report.md`. Chrome: CHROME_PATH, else
 * PUPPETEER_EXECUTABLE_PATH / CHROMIUM_PATH, else the installed Chrome or
 * Edge (`lib/harness-browser.ts`).
 */

import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { templateDocumentErrors, type TemplateSize } from "@workspace/scorecard/kind-templates";
import type { Page } from "puppeteer-core";
import { REPO_ROOT, callHarness, withHarness, type HarnessSession } from "./lib/harness-browser";
import { LOOK_POLISH } from "./lib/pack-convert/polish";
import {
  compareResults,
  convertKind,
  packKinds,
  withDocument,
  type KindConversion,
  type VariantCaptures,
} from "./lib/pack-convert/convert";
import { checkKey, lookReport, type Checks } from "./lib/pack-convert/report";

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

/** Each pack's look: its bundle folder and name. */
export const PACK_LOOKS: Record<string, { slug: string; name: string }> = {
  "club-kit-v1": { slug: "club-kit", name: "Club Kit" },
  "broadcast-dark-v1": { slug: "broadcast-dark", name: "Broadcast Dark" },
  "duotone-v1": { slug: "duotone", name: "Duotone" },
  "gold-foil-v1": { slug: "gold-foil", name: "Gold Foil" },
  "bold-type-v1": { slug: "bold-type", name: "Bold Type" },
  "neon-night-v1": { slug: "neon-night", name: "Neon Night" },
  "sunset-v1": { slug: "sunset", name: "Sunset" },
};

export interface ConvertOptions {
  packs: string[];
  kinds: string[] | null;
  variant: string | null;
  sizes: CaptureSize[];
  colourMode: ColourMode;
  out: string;
  convertOut: string;
  bundles: boolean;
  captureOnly: boolean;
  mapOnly: boolean;
  check: boolean;
  baseUrl: string | null;
  skipBuild: boolean;
  concurrency: number;
  list: boolean;
  shots: boolean;
  /** Apply the look's polish (`pack-convert/polish/`); off for a raw conversion. */
  polish: boolean;
  recheck: boolean;
  polishHd: number | null;
}

const list = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

const KNOWN = [
  "pack",
  "kind",
  "variant",
  "size",
  "colour-mode",
  "out",
  "convert-out",
  "bundles",
  "capture-only",
  "map-only",
  "no-check",
  "base-url",
  "skip-build",
  "concurrency",
  "list",
  "shots",
  "no-polish",
  "recheck",
  "polish-hd",
];

export function parseArgs(argv: readonly string[]): ConvertOptions {
  const args = new Map<string, string>();
  for (const a of argv) {
    if (a === "--") continue; // `pnpm run convert-pack -- …` may pass it through
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`Unknown argument: ${a}`);
    args.set(m[1]!, m[2] ?? "true");
  }
  for (const key of args.keys())
    if (!KNOWN.includes(key)) throw new Error(`Unknown option --${key}`);
  const sizes = (list(args.get("size")) ?? [...CAPTURE_SIZES]) as CaptureSize[];
  for (const s of sizes)
    if (!(CAPTURE_SIZES as readonly string[]).includes(s)) throw new Error(`Unknown size: ${s}`);
  const colourMode = args.get("colour-mode") ?? "club";
  if (colourMode !== "club" && colourMode !== "pack")
    throw new Error(`--colour-mode is club or pack, not ${colourMode}`);
  const concurrency = Number(args.get("concurrency") ?? 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("--concurrency is a whole number from 1 to 8");
  if (args.has("capture-only") && args.has("map-only"))
    throw new Error("--capture-only and --map-only can't be used together");
  const recheck = args.has("recheck");
  if (recheck && (args.has("capture-only") || args.has("no-check")))
    throw new Error(
      "--recheck renders the bundles, so it can't be used with --capture-only or --no-check",
    );
  const polishHd = args.has("polish-hd") ? Number(args.get("polish-hd")) : null;
  if (polishHd !== null && !(Number.isFinite(polishHd) && polishHd >= 0))
    throw new Error("--polish-hd is a number of half-days");
  const exports = path.join(REPO_ROOT, "scripts", "exports");
  return {
    packs: list(args.get("pack")) ?? [...CONVERTER_PACKS],
    kinds: list(args.get("kind")),
    variant: args.get("variant") ?? null,
    sizes,
    colourMode,
    out: path.resolve(args.get("out") ?? path.join(exports, "pack-capture")),
    convertOut:
      args.has("bundles") || recheck
        ? path.join(REPO_ROOT, "lib", "template-bundles")
        : path.resolve(args.get("convert-out") ?? path.join(exports, "pack-convert")),
    bundles: args.has("bundles") || recheck,
    captureOnly: args.has("capture-only"),
    mapOnly: args.has("map-only") || recheck,
    check: !args.has("no-check"),
    baseUrl: args.get("base-url") ?? null,
    skipBuild: args.has("skip-build"),
    concurrency,
    list: args.has("list"),
    shots: args.has("shots"),
    polish: !args.has("no-polish"),
    recheck,
    polishHd,
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
  /** The variant's place in the pack's plan (its default design first). */
  index: number;
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

const log = (m: string) => process.stderr.write(`${m}\n`);

// ── Capture (L4-A1) ─────────────────────────────────────────────────────────

async function capturePacks(
  session: HarnessSession,
  pages: Page[],
  opts: ConvertOptions,
): Promise<number> {
  const started = Date.now();
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
    await pool(
      variants.map((variant, index) => ({ variant, index })),
      pages,
      async ({ variant, index }, page) => {
        const file: VariantFile = {
          format: PACK_CAPTURE_FORMAT,
          packId,
          colourMode: opts.colourMode,
          index,
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
      },
    );
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
  return failures;
}

// ── Mapping (L4-A2) ─────────────────────────────────────────────────────────

async function loadPack(dir: string): Promise<VariantCaptures[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const loaded = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as VariantFile),
  );
  // The pack's plan order (its default design first); files without one sort after.
  return loaded
    .sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9) || a.variant.id.localeCompare(b.variant.id))
    .map((f) => ({ variant: f.variant, captures: f.captures as VariantCaptures["captures"] }));
}

/**
 * Whether the template validator reads format v2 yet (L1-B): it does once an
 * empty v2 page passes. Until then validation is reported as pending.
 */
function validatorReadsV2(): boolean {
  const probe = {
    formatVersion: 2,
    pages: {
      card: {
        layers: [
          {
            id: "t",
            kind: "text",
            content: "x",
            geometry: { square: { x: 0, y: 0, w: 10, h: 10 } },
          },
        ],
      },
    },
  };
  return templateDocumentErrors(probe, "milestone").length === 0;
}

/** The share of pixels two PNG screenshots agree on (in the page: no image library needed). */
async function pixelMatch(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    async (pngA, pngB) => {
      // Browser globals, typed here because the scripts package has no DOM types.
      type Pixels = { data: Uint8ClampedArray };
      type Context = {
        drawImage(image: unknown, x: number, y: number): void;
        clearRect(x: number, y: number, w: number, h: number): void;
        getImageData(x: number, y: number, w: number, h: number): Pixels;
      };
      const g = globalThis as unknown as {
        createImageBitmap(blob: Blob): Promise<{ width: number; height: number }>;
        OffscreenCanvas: new (w: number, h: number) => { getContext(kind: "2d"): Context | null };
      };
      const load = async (b64: string) =>
        g.createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const [ia, ib] = await Promise.all([load(pngA), load(pngB)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const canvas = new g.OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(ia, 0, 0);
      const da = ctx.getImageData(0, 0, w, h).data;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(ib, 0, 0);
      const db = ctx.getImageData(0, 0, w, h).data;
      let same = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d =
          Math.abs(da[i]! - db[i]!) +
          Math.abs(da[i + 1]! - db[i + 1]!) +
          Math.abs(da[i + 2]! - db[i + 2]!);
        if (d < 48) same++;
      }
      return same / (w * h);
    },
    a,
    b,
  );
}

/** Render the pack and the converted page from the same input; fit warnings and pixel match per size. */
async function checkConversion(
  page: Page,
  packId: string,
  conv: KindConversion,
  checks: Checks,
  shotsDir: string | null,
) {
  for (const p of conv.pages) {
    const key = checkKey(p.kind, p.page);
    checks[key] = {};
    for (const size of p.sizes) {
      const render = p.renders[size] as CaptureRender | undefined;
      if (!render) continue;
      try {
        const shot = async () =>
          (await (await page.$("#pack-capture-root"))!.screenshot({
            encoding: "base64",
          })) as string;
        await callHarness(page, "mount", packId, render, size);
        const packShot = await shot();
        const { warnings } = await callHarness<{ warnings: string[] }>(
          page,
          "mount",
          packId,
          render,
          size,
          {
            document: conv.document,
            page: p.page,
          },
        );
        const templateShot = await shot();
        if (shotsDir) {
          const base = path.join(shotsDir, `${p.kind}.${p.page}.${size}`);
          await writeFile(`${base}.pack.png`, Buffer.from(packShot, "base64"));
          await writeFile(`${base}.template.png`, Buffer.from(templateShot, "base64"));
        }
        checks[key]![size as TemplateSize] = {
          pixelMatch: await pixelMatch(page, packShot, templateShot),
          warnings,
        };
      } catch (error) {
        checks[key]![size as TemplateSize] = {
          error: (error instanceof Error ? error.message : String(error)).slice(0, 120),
        };
      }
    }
  }
  await callHarness(page, "unmount");
}

async function mapPacks(page: Page | null, opts: ConvertOptions): Promise<number> {
  let failures = 0;
  const generatedAt = new Date().toISOString().slice(0, 10);
  for (const packId of opts.packs) {
    const look = PACK_LOOKS[packId];
    if (!look) {
      log(`[convert-pack] ${packId}: no look name, skipped`);
      continue;
    }
    const files = await loadPack(path.join(opts.out, packId)).catch(() => null);
    if (!files?.length) {
      log(`[convert-pack] ${packId}: no captures in ${opts.out}; capture first`);
      failures++;
      continue;
    }
    const kinds = packKinds(files).filter((k) => !opts.kinds || opts.kinds.includes(k));
    const dir = path.join(opts.convertOut, look.slug);
    const conversions: KindConversion[] = [];
    let listed = 0;
    for (const kind of kinds) {
      const conv = convertKind(files, kind);
      if (!conv) continue;
      if (!opts.recheck) {
        conversions.push(conv);
        continue;
      }
      // The committed bundle, polished by hand, drawn from the pack's same renders.
      const bundle = JSON.parse(
        await readFile(path.join(dir, `${kind}.json`), "utf8").catch(() => "null"),
      ) as { listed?: boolean; document?: KindConversion["document"] } | null;
      if (!bundle?.document) {
        log(`[convert-pack] ${look.slug}/${kind}: no bundle file to re-check`);
        continue;
      }
      if (bundle.listed) listed++;
      conversions.push(withDocument(conv, bundle.document));
    }
    // The look's polish (L4-C), applied before the checks so they measure what ships. A
    // re-check measures the committed bundles, which are polished already.
    const polish = opts.polish && !opts.recheck ? LOOK_POLISH[look.slug] : undefined;
    const polishNotes: Record<string, string[]> = {};
    if (polish)
      for (const conv of conversions)
        polishNotes[conv.kind] = polish.apply(conv.document, conv.kind);
    const checks: Checks = {};
    const validation = validatorReadsV2()
      ? Object.fromEntries(
          conversions.map((c) => [c.kind, templateDocumentErrors(c.document, c.kind)]),
        )
      : null;
    await mkdir(dir, { recursive: true });
    // Screenshots never land in lib/template-bundles: they'd be committed with the bundle.
    const shotsDir = opts.shots
      ? path.join(
          opts.bundles
            ? path.join(REPO_ROOT, "scripts", "exports", "pack-convert", look.slug)
            : dir,
          "shots",
        )
      : null;
    if (shotsDir) await mkdir(shotsDir, { recursive: true });
    if (page)
      for (const conv of conversions) await checkConversion(page, packId, conv, checks, shotsDir);
    // Bundles are checked in, and CI's lint runs `prettier --check`.
    const write = opts.bundles ? writeFormatted : writeFile;
    if (!opts.recheck) {
      await write(
        path.join(dir, "look.json"),
        `${JSON.stringify(
          {
            name: look.name,
            ...(polish
              ? { description: polish.description, displayOrder: polish.displayOrder }
              : {}),
          },
          null,
          2,
        )}
`,
      );
      for (const conv of conversions)
        await write(
          path.join(dir, `${conv.kind}.json`),
          `${JSON.stringify({ name: `${look.name} ${conv.kind}`, version: 1, listed: !!polish, document: conv.document }, null, 2)}
`,
        );
    }
    await write(
      path.join(dir, "report.md"),
      `${lookReport({
        look: look.name,
        packId,
        conversions,
        checks,
        generatedAt,
        results: compareResults(files),
        validation,
        polish: opts.recheck
          ? { halfDays: opts.polishHd ?? LOOK_POLISH[look.slug]?.halfDays ?? null, listed }
          : polish
            ? { halfDays: polish.halfDays, notes: polishNotes }
            : null,
        rendererNote:
          "Pixel match compares the pack and the converted page drawing the same sample input; " +
          "sample photos and logos are grey placeholders in both.",
      })}\n`,
    );
    const pages = conversions.reduce((n, c) => n + c.pages.length, 0);
    log(
      `[convert-pack] ${look.slug}: ${conversions.length} kinds, ${pages} pages → ${path.relative(process.cwd(), dir)}`,
    );
  }
  return failures;
}

async function writeFormatted(file: string, text: string): Promise<void> {
  const prettier = await import("prettier");
  const options = await prettier.resolveConfig(file);
  await writeFile(file, await prettier.format(text, { ...options, filepath: file }));
}

export async function convertPacks(opts: ConvertOptions): Promise<number> {
  const needBrowser = !opts.mapOnly || opts.check;
  if (!needBrowser) return mapPacks(null, opts).then((f) => (f > 0 ? 1 : 0));
  return withHarness(
    {
      baseUrl: opts.baseUrl ?? undefined,
      mode: "capture",
      skipBuild: opts.skipBuild,
      require: ["capture", "captureVariants", "captureRender", "mount"],
      log,
    },
    async (session) => {
      const pages = await Promise.all(
        Array.from({ length: opts.mapOnly ? 1 : opts.concurrency }, () => session.openPage()),
      );
      let failures = 0;
      if (!opts.mapOnly) failures += await capturePacks(session, pages, opts);
      if (opts.list || opts.captureOnly) return failures > 0 ? 1 : 0;
      failures += await mapPacks(opts.check ? pages[0]! : null, opts);
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
