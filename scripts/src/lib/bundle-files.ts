/**
 * Rewrite the committed template bundles in place (`lib/template-bundles`):
 * each kind file's document goes through `change`, and a file that changes
 * is checked against the template validator, takes the next version (the
 * server's bundle sync keeps a version it already has, whatever its file now
 * says) and is written in Prettier's format (CI checks it). Afterwards run
 * `node lib/template-bundles/generate-index.mjs`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  templateDocumentErrors,
  type TemplateDocumentV2,
} from "@workspace/scorecard/kind-templates";

export const BUNDLES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../lib/template-bundles",
);

type BundleFile = { name: string; version: number; listed?: boolean; document: TemplateDocumentV2 };

export interface RewriteOptions {
  /** Only these looks (slugs). */
  looks?: string[] | null;
  /** Report what would change without writing. */
  dryRun?: boolean;
}

/** Per look: files changed, and the sum of what `change` counted. */
export type RewriteSummary = Map<string, { files: number; counted: number }>;

/**
 * Every bundle kind file through `change`, which edits the document in place
 * and returns how much it changed (0: nothing). Returns the summary and how
 * many files failed validation (left unwritten).
 */
export async function rewriteBundles(
  change: (doc: TemplateDocumentV2, look: string, kind: string) => number,
  opts: RewriteOptions = {},
): Promise<{ summary: RewriteSummary; failures: number }> {
  const prettier = await import("prettier");
  const summary: RewriteSummary = new Map();
  let failures = 0;
  const looks = readdirSync(BUNDLES).filter(
    (d) =>
      existsSync(path.join(BUNDLES, d, "look.json")) && (!opts.looks || opts.looks.includes(d)),
  );
  for (const look of looks) {
    const totals = { files: 0, counted: 0 };
    summary.set(look, totals);
    for (const name of readdirSync(path.join(BUNDLES, look))) {
      if (!name.endsWith(".json") || name === "look.json") continue;
      const file = path.join(BUNDLES, look, name);
      const bundle = JSON.parse(readFileSync(file, "utf8")) as BundleFile;
      const kind = name.replace(/\.json$/, "");
      const counted = change(bundle.document, look, kind);
      if (!counted) continue;
      const errors = templateDocumentErrors(bundle.document, kind);
      if (errors.length) {
        console.error(`[bundles] ${look}/${kind}: ${errors.slice(0, 3).join("; ")}`);
        failures++;
        continue;
      }
      bundle.version += 1;
      totals.files++;
      totals.counted += counted;
      if (opts.dryRun) continue;
      const options = await prettier.resolveConfig(file);
      writeFileSync(
        file,
        await prettier.format(`${JSON.stringify(bundle, null, 2)}\n`, {
          ...options,
          filepath: file,
        }),
      );
    }
  }
  return { summary, failures };
}

/** `--look=a,b` and `--dry-run` from argv. */
export function rewriteArgs(argv: readonly string[]): RewriteOptions {
  const look = argv.find((a) => a.startsWith("--look="))?.slice("--look=".length);
  return { looks: look ? look.split(",") : null, dryRun: argv.includes("--dry-run") };
}
