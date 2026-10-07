/**
 * Starter contract (plan U6). Both starters must carry a document for every
 * one of the 21 kinds, on all four sizes, using only the kind's live fields.
 * Kinds not designed yet are skipped and listed, so the remaining skips are
 * the design track's checklist; the release switch stays off until none are
 * left (KTD18).
 */
import { describe, expect, it } from "vitest";
import { emptySizes } from "./document";
import { kindFields, kindHasRepeat, TEMPLATE_CARD_KINDS } from "./fields";
import {
  isRetiredPack,
  missingStarterKinds,
  PACK_TO_STARTER,
  placeholderDocument,
  RETIRED_PACK_IDS,
  STARTER_IDS,
  starterDocument,
  starterForPack,
  startingDocument,
} from "./starters";

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
const CLUB_LITERALS = /HALLS\s*HEAD|HHCC|#PEELPREMIERLEAGUE/i;

describe("pack to starter map (KTD11)", () => {
  it("maps every pack, retired or not, to a starter", () => {
    for (const pack of ["club-kit-v1", "broadcast-dark-v1", ...RETIRED_PACK_IDS]) {
      expect(STARTER_IDS).toContain(PACK_TO_STARTER[pack]);
    }
  });

  it("sends dark packs to Broadcast and light packs to Club Kit", () => {
    expect(starterForPack("gold-foil-v1")).toBe("broadcast");
    expect(starterForPack("neon-night-v1")).toBe("broadcast");
    expect(starterForPack("bold-type-v1")).toBe("club-kit");
    expect(starterForPack("sunset-v1")).toBe("club-kit");
    expect(starterForPack(null)).toBe("club-kit");
  });

  it("knows which packs retire", () => {
    expect(isRetiredPack("gold-foil-v1")).toBe(true);
    expect(isRetiredPack("club-kit-v1")).toBe(false);
  });
});

describe("placeholder document", () => {
  it("stacks the kind's fields as live text on every size", () => {
    const doc = placeholderDocument("milestone");
    expect(doc.layers.length).toBeGreaterThan(0);
    expect(emptySizes(doc)).toEqual([]);
    expect(String(doc.layers[0].content)).toMatch(/^\{\{\w+\}\}$/);
  });

  it("is a fresh copy each time", () => {
    const a = startingDocument("club-kit", "ladder");
    a.layers.length = 0;
    expect(startingDocument("club-kit", "ladder").layers.length).toBeGreaterThan(0);
  });
});

for (const starter of STARTER_IDS) {
  describe(`${starter} starter contract`, () => {
    const missing = missingStarterKinds(starter);
    it(`lists kinds still to design (${missing.length} of ${TEMPLATE_CARD_KINDS.length})`, () => {
      expect(missing.length).toBeLessThanOrEqual(TEMPLATE_CARD_KINDS.length);
    });

    for (const kind of TEMPLATE_CARD_KINDS) {
      const doc = starterDocument(starter, kind);
      it.skipIf(!doc)(`${kind} has elements on every size`, () => {
        expect(emptySizes(doc!)).toEqual([]);
      });
      it.skipIf(!doc)(`${kind} uses only the kind's fields`, () => {
        const tokens = new Set((kindFields(kind)?.fields ?? []).map((f) => f.key));
        for (const layer of doc!.layers) {
          for (const [, key] of String(layer.content ?? "").matchAll(TOKEN)) {
            expect(tokens.has(key), `${kind}: {{${key}}}`).toBe(true);
          }
          if (typeof layer.bind === "string")
            expect(tokens.has(layer.bind), `${kind}: bind ${layer.bind}`).toBe(true);
          if (layer.rows)
            expect(
              kindHasRepeat(kind, layer.rows.repeat),
              `${kind}: repeat ${layer.rows.repeat}`,
            ).toBe(true);
        }
      });
      it.skipIf(!doc)(`${kind} carries no club identity or hard-coded photo`, () => {
        const json = JSON.stringify(doc);
        expect(json).not.toMatch(CLUB_LITERALS);
        for (const layer of doc!.layers) {
          if (layer.kind === "image")
            expect(String(layer.content ?? "")).not.toMatch(/photo|player/i);
        }
      });
    }
  });
}
