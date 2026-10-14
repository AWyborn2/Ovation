/**
 * Template lint (plan U10): the rendered-output half of the leak guards that
 * protect pack cards (pack-lint.test.ts), for card kind templates. Every
 * starter document — and the placeholder used while a starter isn't designed —
 * is rendered for a club other than Halls Head, on every size, and must show
 * that club, never a sample identity, never an unresolved {{field}}, and never
 * a photo on a junior card. The starter contract test in lib/scorecard owns
 * the static checks on the documents themselves.
 *
 * `<PackCard>` mounts (including the template editor's) are already covered
 * by pack-card-mounts.test.ts, which fails any mount without tenant data.
 */
import { describe, expect, it } from "vitest";
import {
  placeholderDocument,
  STARTER_IDS,
  starterDocument,
  TEMPLATE_CARD_KINDS,
  TEMPLATE_SIZE_ORDER,
} from "@workspace/scorecard/kind-templates";
import { buildPackData } from "@/lib/pack-card-data";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolvePackTokens,
  type CardAdjustments,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { previewSample, stressSample } from "./samples";

const CLUB = "Seaview Strikers";
const PHOTO = "https://example.test/library/player.jpg";
const SAMPLE_IDENTITY = /HALLS\s*HEAD|HHCC|#PEELPREMIERLEAGUE/i;

const brand = {
  name: CLUB,
  tagline: "Est. 1987",
  logoUrl: "https://example.test/crest.png",
  primaryColour: "#0b6e4f",
  backgroundColour: "#08131f",
  juniorsColour: "#5a3e2b",
};
const tokens = resolvePackTokens({ brand: brandDefaultTokens(brand), theme: null, junior: false });
const data = buildPackData({ brand, hashtag: "#Strikers", sponsors: [], photoUrl: PHOTO });

const render = (
  input: ShareCardInput,
  doc: CardAdjustments,
  size: (typeof TEMPLATE_SIZE_ORDER)[number],
  junior = false,
) => renderPackCard(input, size, true, tokens, junior, data, BLANK_PACK_ID, doc);

for (const starter of STARTER_IDS) {
  describe(`${starter} starter renders cleanly for another club`, () => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      const designed = starterDocument(starter, kind);
      const doc = (designed ?? placeholderDocument(kind)) as CardAdjustments;
      const label = designed ? kind : `${kind} (placeholder)`;

      it(`${label}: no sample identity or unresolved fields on any size`, () => {
        for (const input of [previewSample(kind, CLUB), stressSample(kind, CLUB)]) {
          for (const size of TEMPLATE_SIZE_ORDER) {
            const html = render(input, doc, size);
            expect(html, `${kind} ${size}`).not.toMatch(SAMPLE_IDENTITY);
            expect(html, `${kind} ${size}`).not.toMatch(/\{\{\s*[\w.]+\s*\}\}/);
          }
        }
      });

      it(`${label}: no photo on a junior card (AE6)`, () => {
        for (const size of TEMPLATE_SIZE_ORDER) {
          expect(render(previewSample(kind, CLUB), doc, size, true)).not.toContain(PHOTO);
        }
      });
    }
  });
}
