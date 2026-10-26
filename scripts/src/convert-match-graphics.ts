/**
 * The Ovation Match Graphics converter (plan 2026-10-23): Ash's design system
 * (vendored in `src/data/ovation-match-graphics/`) becomes seven Match
 * Summary template looks and 51 library elements, through the pack
 * converter's own capture and mapping (M2).
 *
 *   cd scripts && npx tsx src/convert-match-graphics.ts [options]
 *
 *   --look=<slug>[,<slug>]   only these looks (default: all seven)
 *   --out=<dir>              where to write (default scripts/exports/match-graphics,
 *                            git-ignored); with --bundles, lib/template-bundles
 *   --bundles                write the looks and elements to lib/template-bundles, then
 *                            run Prettier on them and `generate-index.mjs`
 *   --shots                  side-by-side shots (design | template) per look and size, in
 *                            <out>/shots or, with --bundles, scripts/exports/match-graphics/shots;
 *                            the template is drawn by the web app's harness
 *   --base-url=<url>         with --shots: a running web app (the dev server) instead of a build
 *   --skip-build             with --shots: reuse the last `vite build --mode capture`
 *
 * Chrome: CHROME_PATH, else PUPPETEER_EXECUTABLE_PATH / CHROMIUM_PATH, else the
 * installed Chrome or Edge. The fonts come from Google Fonts, so it needs the
 * network.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import { findChrome, REPO_ROOT, withHarness } from "./lib/harness-browser";
import { designShot, sampleRender, sideBySide, templateShot } from "./lib/match-graphics/compare";
import { openCapturePage } from "./lib/match-graphics/capture";
import { FAMILY, MATCH_LOOKS } from "./lib/match-graphics/looks";
import { captureLook, convertLook, FORMATS } from "./lib/match-graphics/templates";
import { lookElements } from "./lib/match-graphics/elements";
import { loadBundle } from "./lib/match-graphics/source";

const log = (m: string) => process.stderr.write(`${m}\n`);

function parseArgs(argv: readonly string[]) {
  const args = new Map<string, string>();
  for (const a of argv) {
    if (a === "--") continue;
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`Unknown argument: ${a}`);
    args.set(m[1]!, m[2] ?? "true");
  }
  const bundles = args.has("bundles");
  const looks = args.get("look")?.split(",").filter(Boolean) ?? null;
  for (const slug of looks ?? [])
    if (!MATCH_LOOKS.some((l) => l.slug === slug)) throw new Error(`Unknown look: ${slug}`);
  return {
    looks,
    bundles,
    shots: args.has("shots"),
    baseUrl: args.get("base-url"),
    skipBuild: args.has("skip-build"),
    out: bundles
      ? path.join(REPO_ROOT, "lib/template-bundles")
      : path.resolve(args.get("out") ?? path.join(REPO_ROOT, "scripts/exports/match-graphics")),
  };
}

/** Convert every look asked for, with `harness` drawing the shots when given. */
async function run(
  opts: ReturnType<typeof parseArgs>,
  browser: Browser,
  harness: Page | null,
): Promise<void> {
  const ds = loadBundle({ mark: true });
  const plain = loadBundle();
  const context = await browser.createBrowserContext();
  const page = await openCapturePage(context);
  // The side-by-side shots are laid out on a page of their own, in a context of its own:
  // a second tab in one context is hidden, and a hidden page gets no animation frames.
  const shotPage = await (await browser.createBrowserContext()).newPage();
  const shotsDir = path.join(
    opts.bundles ? path.join(REPO_ROOT, "scripts/exports/match-graphics") : opts.out,
    "shots",
  );
  for (const [order, look] of MATCH_LOOKS.entries()) {
    if (opts.looks && !opts.looks.includes(look.slug)) continue;
    const files = await captureLook(page, ds, look);
    const conv = convertLook(files, look);
    const errors = templateDocumentErrors(conv.document, "matchSummary");
    const dir = path.join(opts.out, look.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "look.json"),
      `${JSON.stringify(
        {
          name: look.name,
          description: look.description,
          family: FAMILY,
          displayOrder: 100 + order,
        },
        null,
        2,
      )}
`,
    );
    await writeFile(
      path.join(dir, "matchSummary.json"),
      `${JSON.stringify(
        { name: `${look.name} Match Summary`, version: 1, listed: true, document: conv.document },
        null,
        2,
      )}
`,
    );
    if (!opts.bundles) await writeFile(path.join(dir, "captures.json"), JSON.stringify(files));
    // The look's layer components, as library elements credited to the look (M4).
    const els = lookElements(look, files);
    await mkdir(path.join(opts.out, "elements"), { recursive: true });
    await writeFile(
      path.join(opts.out, "elements", `${look.slug}.json`),
      `${JSON.stringify({ look: look.slug, elements: els.elements }, null, 2)}
`,
    );
    log(
      `  elements: ${els.elements.length} of ${look.layers.length}${els.empty.length ? `; nothing drawn: ${els.empty.join(", ")}` : ""}`,
    );
    for (const i of els.invalid)
      log(`  invalid element ${i.name}: ${i.errors.slice(0, 3).join(" ")}`);
    const p = conv.pages[0]!;
    log(
      `${look.slug}: ${JSON.stringify(p.layers)} stacks ${p.stacks}; ${errors.length} errors; unknown ${p.unknownTokens.join(", ") || "none"}; untokenised ${p.untokenised.length}; polish ${p.polish.length}`,
    );
    for (const e of errors.slice(0, 8)) log(`  error: ${e}`);
    for (const u of p.untokenised.slice(0, 8)) log(`  untokenised: ${u}`);
    for (const w of p.polish.slice(0, 8)) log(`  polish: ${w}`);
    if (!harness) continue;
    await mkdir(shotsDir, { recursive: true });
    const render = sampleRender(plain);
    for (const format of FORMATS) {
      const design = await designShot(page, plain, look, format);
      await harness.bringToFront();
      const template = await templateShot(harness, render, conv.document, format);
      const shot = await sideBySide(shotPage, format, design, template.png, "Template");
      await writeFile(path.join(shotsDir, `${look.slug}.${format}.png`), shot.png);
      log(
        `  ${format}: ${(shot.match * 100).toFixed(1)}% match${template.warnings.length ? `; ${template.warnings.join("; ")}` : ""}`,
      );
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.shots) {
    await withHarness(
      {
        baseUrl: opts.baseUrl,
        mode: "capture",
        skipBuild: opts.skipBuild,
        require: ["mount"],
        log,
      },
      async (session) => run(opts, session.browser, await session.openPage()),
    );
    return;
  }
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb"],
  });
  try {
    await run(opts, browser, null);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
