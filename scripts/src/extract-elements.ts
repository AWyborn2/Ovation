/**
 * Writes the element library's bundle files (editable-elements plan, D2):
 * every distinct decoration from the ten looks, one file per look, at
 * `lib/template-bundles/elements/<look>.json`. The API syncs them into
 * `library_elements` at start. How decorations are found, de-duplicated,
 * named and sorted: `lib/element-extract.ts`.
 *
 *   pnpm --filter @workspace/scripts run extract-elements
 *
 * Then format the files with Prettier and regenerate the bundles index
 * (`pnpm --filter @workspace/template-bundles run generate`). Re-run after the
 * converter re-generates the looks (Stream C4).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractElements, type LookInput } from "./lib/element-extract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLES = path.join(ROOT, "lib/template-bundles");
const OUT = path.join(BUNDLES, "elements");

const LOOK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readLooks(): LookInput[] {
  return readdirSync(BUNDLES)
    .filter((name) => LOOK.test(name) && name !== "elements")
    .filter((name) => existsSync(path.join(BUNDLES, name, "look.json")))
    .map((slug) => {
      const dir = path.join(BUNDLES, slug);
      const look = JSON.parse(readFileSync(path.join(dir, "look.json"), "utf8")) as {
        name: string;
      };
      const templates = readdirSync(dir)
        .filter((f) => f.endsWith(".json") && f !== "look.json")
        .map((f) => ({
          kind: f.slice(0, -".json".length),
          document: (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { document: unknown })
            .document,
        }));
      return { slug, name: look.name, templates };
    });
}

const { files, summary } = extractElements(readLooks());
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".json")) rmSync(path.join(OUT, f));
for (const file of files) {
  writeFileSync(path.join(OUT, `${file.look}.json`), `${JSON.stringify(file, null, 2)}\n`);
  const counts = new Map<string, number>();
  for (const e of file.elements) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  console.log(
    `${file.look}: ${file.elements.length} (${[...counts].map(([c, n]) => `${c} ${n}`).join(", ")})`,
  );
}
console.log(
  `decorations ${summary.candidates}, distinct ${summary.distinct}, kept ${summary.kept}, invalid ${summary.invalid.length}`,
);
for (const i of summary.invalid.slice(0, 10)) console.log(`  invalid ${i.slug}: ${i.error}`);
