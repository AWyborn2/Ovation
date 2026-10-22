/**
 * Every layer of the committed v2 template bundles given its design signature
 * (`sig`, editable-elements plan C2), so the element library finds each
 * distinct decoration once. v1 documents are left alone. Changed files take
 * the next version (`lib/bundle-files.ts`). The converter signs what it
 * writes; this signs bundles already made.
 *
 *   cd scripts && npx tsx src/sign-bundles.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signDocument } from "@workspace/scorecard/kind-templates";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";

async function main(argv: readonly string[]): Promise<number> {
  const { summary, failures } = await rewriteBundles((doc) => signDocument(doc), rewriteArgs(argv));
  for (const [look, { files, counted }] of summary)
    if (files) console.log(`[sign] ${look}: ${counted} layers signed in ${files} files`);
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
