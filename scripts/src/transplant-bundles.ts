/**
 * The converter's links and skews carried onto the looks polished by hand
 * (editable-elements plan, C4), which a re-conversion would undo: see
 * `lib/pack-convert/transplant.ts`. First convert those packs into the
 * git-ignored exports folder, then carry what's new across:
 *
 *   cd scripts && npx tsx src/convert-pack.ts --pack=club-kit-v1,broadcast-dark-v1,duotone-v1 \
 *     --map-only --no-check
 *   npx tsx src/transplant-bundles.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Every layer is signed (`sig`); changed bundle files take the next version
 * (`lib/bundle-files.ts`). Then `node lib/template-bundles/generate-index.mjs`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signDocument, type TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";
import { transplant, type TransplantResult } from "./lib/pack-convert/transplant";

/** The looks polished by hand. */
const HAND_POLISHED = ["club-kit", "broadcast-dark", "duotone"];
const FRESH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../exports/pack-convert");

async function main(argv: readonly string[]): Promise<number> {
  const opts = rewriteArgs(argv);
  type Totals = TransplantResult & { signed: number };
  const zero = (): Totals => ({
    matched: 0,
    unmatched: 0,
    links: 0,
    linkedLayers: 0,
    skews: 0,
    signed: 0,
  });
  const totals = new Map<string, Totals>();
  const { summary, failures } = await rewriteBundles(
    (doc, look, kind) => {
      const t = totals.get(look) ?? zero();
      totals.set(look, t);
      const file = path.join(FRESH, look, `${kind}.json`);
      let changed = 0;
      if (existsSync(file)) {
        const fresh = (JSON.parse(readFileSync(file, "utf8")) as { document: TemplateDocumentV2 })
          .document;
        const r = transplant(doc, fresh);
        for (const k of ["matched", "unmatched", "links", "linkedLayers", "skews"] as const)
          t[k] += r[k];
        changed += r.links + r.skews;
      }
      // Every layer signed for the element library, the polish's own layers too.
      const signed = signDocument(doc);
      t.signed += signed;
      return changed + signed;
    },
    { ...opts, looks: opts.looks ?? HAND_POLISHED },
  );
  for (const [look, t] of totals)
    console.log(
      `[transplant] ${look}: ${t.matched} layers matched, ${t.unmatched} left as they were; ` +
        `${t.links} link groups (${t.linkedLayers} layers), ${t.skews} skews, ` +
        `${t.signed} layers re-signed, ${summary.get(look)?.files ?? 0} files raised a version`,
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
