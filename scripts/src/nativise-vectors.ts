/**
 * The committed template bundles' vectors as native shapes (editable-elements
 * plan, C1), without re-converting the looks, so hand polish stays: see
 * `lib/pack-convert/nativise.ts`. Changed files take the next version
 * (`lib/bundle-files.ts`).
 *
 *   cd scripts && npx tsx src/nativise-vectors.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";
import { nativiseVectors } from "./lib/pack-convert/nativise";

async function main(argv: readonly string[]): Promise<number> {
  const kept = new Map<string, number>();
  const { summary, failures } = await rewriteBundles((doc, look) => {
    const result = nativiseVectors(doc);
    kept.set(look, (kept.get(look) ?? 0) + result.vectors);
    return result.shapes + result.recoloured;
  }, rewriteArgs(argv));
  for (const [look, { files, counted }] of summary)
    if (files || kept.get(look))
      console.log(
        `[nativise] ${look}: ${counted} vectors now shapes or recoloured, ` +
          `${kept.get(look) ?? 0} stay vectors, ${files} files raised a version`,
      );
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
