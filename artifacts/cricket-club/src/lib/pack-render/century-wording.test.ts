/**
 * A century card's fixed "CENTURY" follows the innings (card 927): the century
 * kind also carries a junior Big Moment innings, which counts from 50 when the
 * club set its junior runs bar to a half-century, so a 52 reads FIFTY, not
 * CENTURY. Reads the committed century bundles from disk, every look.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { withInningsWording } from "./bind";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const LOOKS = readdirSync(BUNDLES).filter((look) =>
  existsSync(path.join(BUNDLES, look, "century.json")),
);
const bundle = (look: string) =>
  (
    JSON.parse(readFileSync(path.join(BUNDLES, look, "century.json"), "utf8")) as {
      document: TemplateDocumentV2;
    }
  ).document;

const DATA: PackCardData = {
  brand: {
    name: "Test Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#TCC",
};

const century = (runs: number, junior = false) =>
  ({
    kind: "century",
    playerName: "Young Gun",
    grade: junior ? "Under 15" : "A Grade",
    runs,
    balls: 40,
    opponent: "Rivals",
    round: 4,
    ...(junior ? { junior: true } : {}),
  }) as unknown as ShareCardInput;

function render(input: ShareCardInput, doc: TemplateDocumentV2, junior = false): string {
  const tokens = resolveCardTokens({ theme: null, junior, data: DATA, packId: BLANK_PACK_ID });
  return renderPackCard(
    input,
    "square",
    true,
    tokens,
    junior,
    DATA,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
  );
}

describe("a century card's wording follows its innings", () => {
  it("has century bundles to check", () => {
    expect(LOOKS.length).toBeGreaterThan(0);
  });

  for (const look of LOOKS) {
    it(`${look}: a junior 52 reads FIFTY, never CENTURY; a 104 still reads CENTURY`, () => {
      const doc = bundle(look);
      const fifty = render(century(52, true), doc, true);
      expect(fifty).not.toMatch(/CENTURY/i);
      expect(fifty).toContain("52");
      const ton = render(century(104), doc);
      expect(ton).not.toContain("FIFTY");
      // A look that names the feat names the right one (Clubhouse doesn't name it).
      if (/CENTURY/.test(ton)) expect(fifty).toContain("FIFTY");
    });
  }

  it("leaves the stored design and other kinds untouched", () => {
    const doc = bundle(LOOKS[0]!);
    const before = JSON.stringify(doc);
    const out = withInningsWording(doc, century(52, true));
    expect(JSON.stringify(doc)).toBe(before);
    expect(JSON.stringify(out)).not.toMatch(/CENTURY/);
    expect(withInningsWording(doc, century(120))).toBe(doc);
    const milestone = { kind: "milestone", playerName: "X" } as unknown as ShareCardInput;
    expect(withInningsWording(doc, milestone)).toBe(doc);
  });
});
