/**
 * The Elements panel's 29 Club Kit pieces (`lib/studio-elements/registry.ts`)
 * as native layers (editable-elements plan, D3 follow-up), with C3's tool:
 * each piece is drawn alone on a card in the capture harness at every size,
 * in both sentinel palettes, mapped like a pack (`lib/pack-convert/split-elements.ts`)
 * and merged across sizes. Each card is drawn before and after, and the
 * pixel match is reported.
 *
 * Writes `src/data/club-kit-pieces.json`, which the element extraction
 * (`extract-elements.ts`) adds to Club Kit's elements. The registry stays, so
 * cards that already hold a `kind: "element"` piece still draw it.
 *
 *   cd scripts && npx tsx src/native-ck-pieces.ts [--only=<id>[,<id>]] [--skip-build]
 *
 * Then run `extract-elements.ts`, Prettier and the bundles index.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Page } from "puppeteer-core";
import type { TemplateLayerV2, TemplateSize } from "@workspace/scorecard/kind-templates";
import type {
  CaptureRender,
  CaptureSize,
  CaptureVariant,
  PackCapture,
} from "@workspace/scorecard/pack-capture";
import { pixelMatch } from "./convert-pack";
import { callHarness, withHarness } from "./lib/harness-browser";
import { mapCapture, Tree } from "./lib/pack-convert/map";
import { elementLayers, nativeElement, type ElementLayer } from "./lib/pack-convert/split-elements";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PIECES_FILE = path.join(HERE, "data", "club-kit-pieces.json");

/** The web app's piece registry, loaded at run time: its types need the DOM, the scripts' don't. */
const REGISTRY = path.resolve(
  HERE,
  "../../artifacts/cricket-club/src/lib/studio-elements/registry.ts",
);
type PieceDef = {
  id: string;
  label: string;
  category: string;
  keywords: string;
  defaultBox: (size: TemplateSize) => { x: number; y: number; w: number; h: number };
};

/** The pack whose sentinel inputs the pieces are drawn on, and the card kind (photo and crest). */
const INPUT_PACK = "club-kit-v1";
const CARD_KIND = "century";
const SIZES: TemplateSize[] = ["square", "portrait", "story", "landscape"];

const log = (s: string) => process.stderr.write(`${s}\n`);

/** One piece as native layers, with what the panel lists it by. */
export type NativePiece = {
  id: string;
  label: string;
  category: string;
  keywords: string;
  layers: TemplateLayerV2[];
  /** The lowest before/after pixel match over the four sizes. */
  match: number;
};

/** The registry piece as the element layer a card would hold, at every size. */
function pieceLayer(def: PieceDef): ElementLayer {
  return {
    id: "el",
    kind: "element",
    name: def.label,
    element: { id: def.id },
    geometry: Object.fromEntries(SIZES.map((s) => [s, def.defaultBox(s)])),
  } as unknown as ElementLayer;
}

async function main(argv: readonly string[]): Promise<number> {
  const only =
    argv
      .find((a) => a.startsWith("--only="))
      ?.slice(7)
      .split(",") ?? null;
  const { ELEMENTS } = (await import(pathToFileURL(REGISTRY).href)) as {
    ELEMENTS: readonly PieceDef[];
  };
  const defs = ELEMENTS.filter((d) => !only || only.includes(d.id));
  return withHarness(
    {
      mode: "capture",
      skipBuild: argv.includes("--skip-build"),
      require: ["capture", "captureVariants", "captureRender", "mount"],
      log,
    },
    async (session) => {
      const page: Page = await session.openPage();
      const variants = await callHarness<CaptureVariant[]>(page, "captureVariants", INPUT_PACK);
      const variant = variants.find((v) => v.kind === CARD_KIND);
      const a = variant?.renders.find((r) => r.content === "sentinel" && r.palette === "A");
      const b = variant?.renders.find((r) => r.content === "sentinel" && r.palette === "B");
      if (!variant || !a || !b)
        throw new Error(`${INPUT_PACK} has no ${CARD_KIND} sentinel renders`);
      const render = (r: typeof a, size: TemplateSize) =>
        callHarness<CaptureRender>(
          page,
          "captureRender",
          INPUT_PACK,
          variant,
          r,
          size as CaptureSize,
        );
      const shot = async () =>
        (await (await page.$("#pack-capture-root"))!.screenshot({ encoding: "base64" })) as string;

      const pieces: NativePiece[] = [];
      let failures = 0;
      for (const def of defs) {
        const layer = pieceLayer(def);
        const doc = { layers: [layer] };
        const perSize = [];
        for (const size of SIZES) {
          const capture = async (r: typeof a) =>
            callHarness<PackCapture>(page, "capture", INPUT_PACK, await render(r, size), size, {
              document: doc,
            });
          const [ca, cb] = [await capture(a), await capture(b)];
          perSize.push({
            size,
            layers: elementLayers(mapCapture(ca, { paletteB: cb }), new Tree(ca), "el"),
          });
        }
        const layers = nativeElement(layer, perSize);
        if (layers.length === 0 || layers.some((l) => (l.kind as string) === "element")) {
          log(`[pieces] ${def.id}: nothing captured`);
          failures++;
          continue;
        }
        // The card with the piece, before and after, at every size.
        let match = 1;
        for (const size of SIZES) {
          const r = await render(a, size);
          await callHarness(page, "mount", INPUT_PACK, r, size, { document: doc });
          const before = await shot();
          await callHarness(page, "mount", INPUT_PACK, r, size, {
            document: { formatVersion: 2, pages: { card: { layers } }, palettes: ["club-kit"] },
          });
          const after = await shot();
          match = Math.min(match, await pixelMatch(page, before, after));
        }
        log(
          `[pieces] ${def.id}: ${layers.length} layer(s), lowest match ${(match * 100).toFixed(1)}%`,
        );
        pieces.push({
          id: def.id,
          label: def.label,
          category: def.category,
          keywords: def.keywords,
          layers,
          match,
        });
      }
      await callHarness(page, "unmount");
      if (!only) {
        mkdirSync(path.dirname(PIECES_FILE), { recursive: true });
        writeFileSync(PIECES_FILE, `${JSON.stringify(pieces, null, 2)}\n`);
        log(
          `[pieces] wrote ${pieces.length} pieces to ${path.relative(process.cwd(), PIECES_FILE)}`,
        );
      }
      return failures ? 1 : 0;
    },
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
