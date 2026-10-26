/**
 * The format's drift test (T1.11, as the structured-output spike decided):
 * every document the library ships passes `validate.ts` as format v2. That is
 * every committed bundle template (`lib/template-bundles/<look>/<kind>.json`),
 * read as v2 the way `normalise()` reads it, so the starters (now bundles,
 * T5.18) and the converted looks are all held to the rules the AI designer
 * and the editor are checked against.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseDocument } from "./normalise";
import { templateDocumentErrors } from "./validate";

const BUNDLES = path.resolve(__dirname, "../../../template-bundles");

/** Every committed bundle template: look, kind and stored document. */
function bundleDocuments(): Array<{ look: string; kind: string; document: unknown }> {
  const out: Array<{ look: string; kind: string; document: unknown }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    // A look folder has a look.json; `elements/` and build output don't.
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const parsed = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        document: unknown;
      };
      out.push({ look, kind: file.replace(/\.json$/, ""), document: parsed.document });
    }
  }
  return out;
}

describe("every committed bundle template as format v2", () => {
  const docs = bundleDocuments();

  it("finds the bundles", () => {
    expect(docs.length).toBeGreaterThan(50);
  });

  for (const { look, kind, document } of docs) {
    it(`${look}/${kind} passes v2 validation`, () => {
      const { sourceFormat: _source, ...v2 } = normaliseDocument(document, kind);
      expect(templateDocumentErrors(v2, kind)).toEqual([]);
    });
  }
});
