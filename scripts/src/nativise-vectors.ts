/**
 * The committed template bundles' vectors as native shapes (editable-elements
 * plan, C1), without re-converting the looks, so hand polish stays: see
 * `lib/pack-convert/nativise.ts`. A bundle file that changes has its version
 * raised, since the server's bundle sync keeps a version it already has
 * whatever its file now says. Every changed document must still pass the
 * template validator.
 *
 *   cd scripts && npx tsx src/nativise-vectors.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  templateDocumentErrors,
  type TemplateDocumentV2,
} from "@workspace/scorecard/kind-templates";
import { nativiseVectors } from "./lib/pack-convert/nativise";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLES = path.join(REPO_ROOT, "lib", "template-bundles");

type BundleFile = { name: string; version: number; listed?: boolean; document: TemplateDocumentV2 };

async function main(argv: readonly string[]): Promise<number> {
  const args = new Map(
    argv
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, v] = a.slice(2).split("=");
        return [k!, v ?? "true"] as const;
      }),
  );
  const only = args.get("look")?.split(",");
  const dryRun = args.has("dry-run");
  const prettier = await import("prettier");
  let failures = 0;
  const looks = readdirSync(BUNDLES).filter(
    (d) => existsSync(path.join(BUNDLES, d, "look.json")) && (!only || only.includes(d)),
  );
  for (const look of looks) {
    const totals = { files: 0, shapes: 0, vectors: 0, recoloured: 0 };
    for (const name of readdirSync(path.join(BUNDLES, look))) {
      if (!name.endsWith(".json") || name === "look.json") continue;
      const file = path.join(BUNDLES, look, name);
      const bundle = JSON.parse(readFileSync(file, "utf8")) as BundleFile;
      const result = nativiseVectors(bundle.document);
      if (!result.shapes && !result.recoloured) {
        totals.vectors += result.vectors;
        continue;
      }
      const kind = name.replace(/\.json$/, "");
      const errors = templateDocumentErrors(bundle.document, kind);
      if (errors.length) {
        console.error(`[nativise] ${look}/${kind}: ${errors.slice(0, 3).join("; ")}`);
        failures++;
        continue;
      }
      bundle.version += 1;
      totals.files++;
      totals.shapes += result.shapes;
      totals.vectors += result.vectors;
      totals.recoloured += result.recoloured;
      if (dryRun) continue;
      const options = await prettier.resolveConfig(file);
      writeFileSync(
        file,
        await prettier.format(`${JSON.stringify(bundle, null, 2)}\n`, {
          ...options,
          filepath: file,
        }),
      );
    }
    console.log(
      `[nativise] ${look}: ${totals.shapes} vectors now shapes, ${totals.vectors} stay vectors ` +
        `(${totals.recoloured} given a colour per element), ${totals.files} files raised a version`,
    );
  }
  return failures ? 1 : 0;
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
