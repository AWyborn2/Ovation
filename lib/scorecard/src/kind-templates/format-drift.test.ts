/**
 * The format's drift test (T1.11, as the structured-output spike decided):
 * every document the library ships passes `validate.ts` as format v2. Today
 * that is every starter × kind, read as v2 the way `normalise()` reads it.
 * L4-B adds the converted bundles (`lib/template-bundles/`) here when it
 * creates them.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CARD_KINDS } from "./fields";
import { normaliseDocument } from "./normalise";
import { STARTER_IDS, starterDocument } from "./starters";
import { templateDocumentErrors } from "./validate";

for (const starter of STARTER_IDS) {
  describe(`${starter} starter as format v2`, () => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      const doc = starterDocument(starter, kind);
      it.skipIf(!doc)(`${kind} passes v2 validation`, () => {
        const { sourceFormat: _source, ...v2 } = normaliseDocument(doc, kind);
        expect(templateDocumentErrors(v2, kind)).toEqual([]);
      });
    }
  });
}
