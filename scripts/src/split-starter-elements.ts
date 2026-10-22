/**
 * The starters' Club Kit library elements as native layers (editable-elements
 * plan, C3). The three starter looks (Club Kit Classic, Broadcast Classic,
 * Clubhouse) draw their backgrounds, frames, crests, chips and rules as
 * `kind: "element"` layers, which can't be taken apart in the editor. Each
 * one is drawn on its own in the capture harness at every size it's on, in
 * both sentinel palettes, mapped like a pack (`lib/pack-convert/split-elements.ts`)
 * and replaced by its native layers. The starters' v1 kinds come out as
 * format v2. Then every changed card is drawn before and after, and the
 * pixel match is reported.
 *
 *   cd scripts && npx tsx src/split-starter-elements.ts [--look=<slug>[,<slug>]]
 *     [--kind=<kind>[,<kind>]] [--skip-build] [--dry-run] [--out=<dir>] [--shots=<dir>]
 *
 * Then `node lib/template-bundles/generate-index.mjs`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "puppeteer-core";
import {
  signDocument,
  templateDocumentErrors,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import type {
  CaptureRender,
  CaptureSize,
  CaptureVariant,
  PackCapture,
} from "@workspace/scorecard/pack-capture";
import { pixelMatch } from "./convert-pack";
import { BUNDLES } from "./lib/bundle-files";
import { callHarness, withHarness } from "./lib/harness-browser";
import { mapCapture, Tree, type MappedLayer } from "./lib/pack-convert/map";
import {
  elementLayers,
  elementSizes,
  nativeElement,
  splitDocument,
  type ElementLayer,
} from "./lib/pack-convert/split-elements";

const STARTERS = ["club-kit-classic", "broadcast-classic", "clubhouse"];
/** The pack whose sentinel inputs the cards are drawn from (Club Kit draws every kind). */
const INPUT_PACK = "club-kit-v1";
/** An element is drawn alone on this kind's card (it has a photo and the crest). */
const ELEMENT_KIND = "century";

const log = (s: string) => process.stderr.write(`${s}\n`);

type BundleFile = {
  name: string;
  version: number;
  listed?: boolean;
  document: TemplateDocumentV2 | { layers: TemplateLayerV2[] };
};

/** A kind's standard renders on the input pack: sentinel content in both palettes. */
function renders(variants: CaptureVariant[], kind: string) {
  const v = variants.find(
    (x) =>
      x.kind === kind &&
      x.renders.some((r) => r.content === "sentinel" && r.palette === "A") &&
      x.renders.some((r) => r.content === "sentinel" && r.palette === "B"),
  );
  if (!v) return null;
  const a = v.renders.find((r) => r.content === "sentinel" && r.palette === "A")!;
  const b = v.renders.find((r) => r.content === "sentinel" && r.palette === "B")!;
  return { variant: v, a, b };
}

async function main(argv: readonly string[]): Promise<number> {
  const arg = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const looks = arg("look")?.split(",") ?? STARTERS;
  const kinds = arg("kind")?.split(",") ?? null;
  const dryRun = argv.includes("--dry-run");
  // Write the changed bundle files here instead of in place (to review them).
  const out = arg("out");
  // Save each card's before and after screenshots here.
  const shots = arg("shots") ?? null;
  return withHarness(
    {
      mode: "capture",
      skipBuild: argv.includes("--skip-build"),
      require: ["capture", "captureVariants", "captureRender", "mount"],
      log,
    },
    async (session) => {
      const page = await session.openPage();
      const variants = await callHarness<CaptureVariant[]>(page, "captureVariants", INPUT_PACK);
      const base = renders(variants, ELEMENT_KIND);
      if (!base) throw new Error(`${INPUT_PACK} has no ${ELEMENT_KIND} sentinel renders`);
      const prettier = await import("prettier");
      // One element drawn alone, per size: identical elements are captured once.
      const cache = new Map<string, MappedLayer[]>();
      const drawAlone = async (layer: ElementLayer, size: TemplateSize): Promise<MappedLayer[]> => {
        const key = JSON.stringify({ ...layer, id: "el", size });
        const hit = cache.get(key);
        if (hit) return hit;
        const doc = { layers: [{ ...layer, id: "el" }] };
        const cap = async (r: typeof base.a) =>
          callHarness<PackCapture>(
            page,
            "capture",
            INPUT_PACK,
            await callHarness<CaptureRender>(
              page,
              "captureRender",
              INPUT_PACK,
              base.variant,
              r,
              size as CaptureSize,
            ),
            size,
            { document: doc },
          );
        const [a, b] = [await cap(base.a), await cap(base.b)];
        const tree = new Tree(a);
        const layers = elementLayers(mapCapture(a, { paletteB: b }), tree, "el");
        cache.set(key, layers);
        return layers;
      };
      const split = async (layer: ElementLayer) => {
        const perSize = [];
        for (const size of elementSizes(layer))
          perSize.push({ size, layers: await drawAlone(layer, size) });
        return nativeElement(layer, perSize);
      };

      let failures = 0;
      for (const look of looks) {
        const dir = path.join(BUNDLES, look);
        const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "look.json");
        const scores: number[] = [];
        let changed = 0;
        for (const name of files) {
          const kind = name.replace(/\.json$/, "");
          if (kinds && !kinds.includes(kind)) continue;
          const file = path.join(dir, name);
          const bundle = JSON.parse(readFileSync(file, "utf8")) as BundleFile;
          const before = bundle.document;
          const { document, split: n } = await splitDocument(before, kind, split);
          if (!n) continue;
          signDocument(document);
          const errors = templateDocumentErrors(document, kind);
          if (errors.length) {
            log(`[split] ${look}/${kind}: ${errors.slice(0, 3).join("; ")}`);
            failures++;
            continue;
          }
          const match = await compare(
            page,
            variants,
            kind,
            before,
            document,
            shots && path.join(shots, look),
          );
          scores.push(...match.map((m) => m.match));
          log(
            `[split] ${look}/${kind}: ${n} elements; match ${match
              .map((m) => `${m.size} ${(m.match * 100).toFixed(1)}%`)
              .join(", ")}`,
          );
          changed++;
          if (dryRun) continue;
          bundle.document = document;
          bundle.version += 1;
          const options = await prettier.resolveConfig(file);
          const target = out ? path.join(out, look, name) : file;
          if (out) mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(
            target,
            await prettier.format(`${JSON.stringify(bundle, null, 2)}\n`, {
              ...options,
              filepath: file,
            }),
          );
        }
        const mean = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
        const min = scores.length ? Math.min(...scores) : 0;
        log(
          `[split] ${look}: ${changed} kinds; match mean ${(mean * 100).toFixed(1)}%, ` +
            `lowest ${(min * 100).toFixed(1)}% over ${scores.length} renders`,
        );
      }
      await callHarness(page, "unmount");
      return failures ? 1 : 0;
    },
  );
}

/** Each size's card before and after, drawn from the kind's sentinel input: the pixel match. */
async function compare(
  page: Page,
  variants: CaptureVariant[],
  kind: string,
  before: unknown,
  after: TemplateDocumentV2,
  shots: string | null,
): Promise<Array<{ size: TemplateSize; match: number }>> {
  const r = renders(variants, kind);
  if (!r) return [];
  const out: Array<{ size: TemplateSize; match: number }> = [];
  const shot = async () =>
    (await (await page.$("#pack-capture-root"))!.screenshot({ encoding: "base64" })) as string;
  for (const size of ["square", "portrait", "story", "landscape"] as TemplateSize[]) {
    const render = await callHarness<CaptureRender>(
      page,
      "captureRender",
      INPUT_PACK,
      r.variant,
      r.a,
      size as CaptureSize,
    );
    await callHarness(page, "mount", INPUT_PACK, render, size, { document: before });
    const a = await shot();
    await callHarness(page, "mount", INPUT_PACK, render, size, { document: after });
    const b = await shot();
    if (shots) {
      mkdirSync(shots, { recursive: true });
      writeFileSync(path.join(shots, `${kind}.${size}.before.png`), Buffer.from(a, "base64"));
      writeFileSync(path.join(shots, `${kind}.${size}.after.png`), Buffer.from(b, "base64"));
    }
    out.push({ size, match: await pixelMatch(page, a, b) });
  }
  return out;
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
