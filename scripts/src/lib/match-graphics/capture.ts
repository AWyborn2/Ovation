/**
 * Capturing an Ovation Match Graphics render the way the pack converter
 * captures a pack (plan 2026-10-23, M2): the markup is laid out in Chrome with
 * the design system's fonts, and the web app's own DOM walker
 * (`pack-render/capture/dom.ts`, transpiled and injected) records every
 * element. The result is a `PackCapture`, so `mapCapture` and `convertKind`
 * read it unchanged.
 *
 * Sizes (decision M11): square and portrait are the design's own 1080×1080 and
 * 1080×1350. The kind's landscape is 1200×630, so the design's 1080×700
 * landscape is drawn at 90 %, centred, and its stage (the photo, the black
 * ground and the vignette) is stretched back to the full card.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Browser, Page } from "puppeteer-core";
import {
  PACK_CAPTURE_FORMAT,
  type CapturedElement,
  type PackCapture,
} from "@workspace/scorecard/pack-capture";
import type { TemplateSize } from "@workspace/scorecard/kind-templates";
import { parseColour } from "../pack-convert/css";
import { REPO_ROOT } from "../harness-browser";
import { bundleFontCss, COMPONENT_ATTR } from "./source";
import { candidateTokens, joinScores, type Palette } from "./sentinels";

/** The card sizes a match graphic is drawn at, and how the design's canvas sits on each. */
export const CARD: Record<
  "square" | "portrait" | "landscape",
  { w: number; h: number; design: { h: number; scale: number; left: number } }
> = {
  square: { w: 1080, h: 1080, design: { h: 1080, scale: 1, left: 0 } },
  portrait: { w: 1080, h: 1350, design: { h: 1350, scale: 1, left: 0 } },
  landscape: { w: 1200, h: 630, design: { h: 700, scale: 0.9, left: 114 } },
};
export type CardFormat = keyof typeof CARD;

let walkerScript: string | null = null;

/** The web app's DOM walker as a browser script that defines `window.__omgWalk`. */
function walker(): string {
  if (walkerScript) return walkerScript;
  const ts = createRequire(path.join(REPO_ROOT, "package.json"))("typescript") as {
    transpileModule: (src: string, o: object) => { outputText: string };
    ScriptTarget: { ES2020: number };
    ModuleKind: { None: number };
  };
  const src = readFileSync(
    path.join(REPO_ROOT, "artifacts/cricket-club/src/lib/pack-render/capture/dom.ts"),
    "utf8",
  );
  const js = ts
    .transpileModule(src, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
    })
    .outputText.replace(/^\s*import[^;]*;\s*$/gm, "")
    .replace(/^export\s+/gm, "")
    .replace(/^Object\.defineProperty\(exports[^\n]*\n/m, "")
    .replace(/^exports\.[^\n]*\n/gm, "");
  walkerScript = `(() => {\n${js}\nwindow.__omgWalk = (root) => captureCardDom(root, "full");\n})();`;
  return walkerScript;
}

/**
 * tsx (esbuild) wraps named inner functions in `__name(…)`; functions sent to
 * a page with `evaluate` carry it, so the page needs the helper too.
 */
export async function nameHelper(page: Page): Promise<void> {
  await page.evaluate("globalThis.__name = (fn) => fn;");
}

/** A page ready to lay match graphics out: the fonts loaded, the walker in. */
export async function openCapturePage(browser: Pick<Browser, "newPage">): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1350, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${bundleFontCss()}
html,body{margin:0;padding:0;background:#fff}
#card{position:relative;overflow:hidden;background:#000}
</style></head><body><div id="card"></div>
<!-- Every weight and style the looks use, so the walk measures real faces. -->
<div style="position:absolute;left:-9999px;top:0">${[
      "'Barlow Condensed'",
      "'Barlow Semi Condensed'",
      "Montserrat",
      "Archivo",
    ]
      .flatMap((f) =>
        [400, 500, 600, 700, 800, 900].flatMap((w) => [
          `<span style="font-family:${f};font-weight:${w}">Aa</span>`,
          `<span style="font-family:${f};font-weight:${w};font-style:italic">Aa</span>`,
          `<span style="font-family:${f};font-weight:${w};font-stretch:125%">Aa</span>`,
        ]),
      )
      .join("")}</div></body></html>`,
    { waitUntil: "load" },
  );
  // In-page code is sent as text: the scripts package has no DOM types.
  await page.evaluate("document.fonts.ready.then(() => true)");
  await page.addScriptTag({ content: walker() });
  await nameHelper(page);
  return page;
}

/** Lay `markup` out on a card of `format` (the design's canvas placed as M11 says). */
export async function mount(page: Page, markup: string, format: CardFormat): Promise<void> {
  const card = CARD[format];
  const inner =
    card.design.scale === 1
      ? markup
      : `<div style="position:absolute;left:${card.design.left}px;top:0;width:1080px;height:${card.design.h}px;transform:scale(${card.design.scale});transform-origin:0 0">${markup}</div>`;
  await page.evaluate(`(async () => {
    const el = document.getElementById("card");
    el.style.width = "${card.w}px";
    el.style.height = "${card.h}px";
    el.innerHTML = ${JSON.stringify(inner)};
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) =>
      img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true }))));
  })()`);
}

/** Every colour in a capture's styles, parsed: what the palette's candidates are matched against. */
function coloursIn(
  elements: CapturedElement[],
): Array<NonNullable<ReturnType<typeof parseColour>>> {
  const out: Array<NonNullable<ReturnType<typeof parseColour>>> = [];
  const seen = new Set<string>();
  for (const el of elements)
    for (const s of [el.style, el.before ?? {}, el.after ?? {}])
      for (const value of Object.values(s))
        for (const m of value.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? []) {
          if (seen.has(m)) continue;
          seen.add(m);
          const c = parseColour(m);
          if (c) out.push(c);
        }
  return out;
}

const near = (
  a: NonNullable<ReturnType<typeof parseColour>>,
  b: NonNullable<ReturnType<typeof parseColour>>,
) =>
  Math.abs(a.r - b.r) <= 1 &&
  Math.abs(a.g - b.g) <= 1 &&
  Math.abs(a.b - b.b) <= 1 &&
  Math.abs(a.a - b.a) <= 0.01;

/**
 * The palette's tokens a capture can use: only those whose colour the capture
 * draws somewhere, so the converter matches against dozens, not thousands.
 */
function tokensIn(elements: CapturedElement[], palette: Palette): Record<string, string> {
  const drawn = coloursIn(elements);
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(candidateTokens(palette))) {
    const c = parseColour(hex);
    if (c && drawn.some((d) => near(c, d))) out[name] = hex;
  }
  return out;
}

/**
 * Stretch the stage (its black ground, the photo and the vignette) to the
 * whole card where the design is drawn smaller than the card (landscape).
 */
function fullBleedStage(elements: CapturedElement[], format: CardFormat): void {
  const card = CARD[format];
  if (card.design.scale === 1) return;
  const marker = elements.find((e) => e.data?.omg === "Stage");
  const stage = marker ? elements.find((e) => e.parent === marker.id) : undefined;
  if (!stage) return;
  const was = { ...stage.box };
  const same = (e: CapturedElement) =>
    Math.abs(e.box.x - was.x) < 1 &&
    Math.abs(e.box.y - was.y) < 1 &&
    Math.abs(e.box.w - was.w) < 1 &&
    Math.abs(e.box.h - was.h) < 1;
  for (const e of elements) {
    if (e !== stage && (e.parent !== stage.id || !same(e))) continue;
    e.box = { x: 0, y: 0, w: card.w, h: card.h };
    delete e.size;
  }
}

/**
 * A component marker (`display: contents`) has no box of its own; it gets its
 * children's, so a row or a part found through it has the box it draws.
 */
function boxMarkers(elements: CapturedElement[]): void {
  const children = new Map<number, CapturedElement[]>();
  for (const e of elements)
    if (e.parent !== null) children.set(e.parent, [...(children.get(e.parent) ?? []), e]);
  for (const e of [...elements].reverse()) {
    if (!e.data?.omg) continue;
    const kids = (children.get(e.id) ?? []).filter((k) => k.box.w > 0 && k.box.h > 0);
    if (!kids.length) continue;
    const x = Math.min(...kids.map((k) => k.box.x));
    const y = Math.min(...kids.map((k) => k.box.y));
    const r = Math.max(...kids.map((k) => k.box.x + k.box.w));
    const b = Math.max(...kids.map((k) => k.box.y + k.box.h));
    e.box = { x, y, w: r - x, h: b - y };
  }
}

/** Capture what's mounted, as a `PackCapture` in `palette`. */
export async function captureMounted(
  page: Page,
  opts: {
    packId: string;
    format: CardFormat;
    palette: Palette;
    rows: PackCapture["rows"];
    /** Turns a text run's real values back into their `[[markers]]`. */
    mark?: (text: string) => string;
  },
): Promise<PackCapture> {
  const started = Date.now();
  const { elements, keyframes } = (await page.evaluate(
    `window.__omgWalk(document.getElementById("card"))`,
  )) as { elements: CapturedElement[]; keyframes: Record<string, string> };
  // The scores the design builds from wickets and runs are one token each.
  for (const el of elements)
    for (const run of el.text ?? [])
      run.text = joinScores(opts.mark ? opts.mark(run.text) : run.text);
  boxMarkers(elements);
  fullBleedStage(elements, opts.format);
  const card = CARD[opts.format];
  const colours = tokensIn(elements, opts.palette);
  return {
    format: PACK_CAPTURE_FORMAT,
    packId: opts.packId,
    size: opts.format as TemplateSize as PackCapture["size"],
    native: { w: card.w, h: card.h },
    colourMode: "club",
    detail: "full",
    rootVars: colours,
    rootColours: colours,
    tokens: {},
    fields: {},
    markers: {},
    rows: opts.rows,
    images: {},
    keyframes,
    fontFailures: [],
    elements,
    warnings: [],
    ms: Date.now() - started,
  };
}

/** The component an element sits in: the nearest `data-omg` marker above it. */
export function componentOf(
  elements: readonly CapturedElement[],
  id: number,
): { name: string; marker: number } | null {
  const byId = new Map(elements.map((e) => [e.id, e]));
  let e = byId.get(id);
  while (e) {
    const name = e.data?.omg;
    if (name) return { name, marker: e.id };
    e = e.parent === null ? undefined : byId.get(e.parent);
  }
  return null;
}

export { COMPONENT_ATTR };
