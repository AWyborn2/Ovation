/**
 * Club Kit Match Day at Portrait and Story (retest 9, set 1024): the date line
 * and "Game Day" sit over the photo, so a soft scrim is drawn behind them
 * whenever there is a photo (junior or senior; which photo a junior card may
 * show is unchanged). It sits above the photo and below the text, covers both
 * lines, and is left out when the card has no photo.
 *
 * Read from the bundle file on disk, as the other bundle tests are.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { placeholderImage, type TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";

const FILE = path.resolve(__dirname, "../../../../../lib/template-bundles/club-kit/matchDay.json");
const bundle = JSON.parse(readFileSync(FILE, "utf8")) as {
  version: number;
  document: TemplateDocumentV2;
};
const layers = bundle.document.pages.fixture!.layers as Array<{
  id?: string;
  kind: string;
  sizes?: string[];
  showWhen?: Record<string, unknown>;
  geometry: Record<string, { x: number; y: number; w: number; h: number }>;
}>;
const at = (id: string) => layers.findIndex((l) => l.id === id);
const DATE = "fixture-l28";
const GAME_DAY = "fixture-l30";
const SCRIM = (size: string) => `fixture-text-scrim-${size}`;

describe("Club Kit Match Day date and Game Day scrim", () => {
  it("has a raised version for the change", () => {
    expect(bundle.version).toBeGreaterThanOrEqual(12);
  });

  for (const size of ["portrait", "story"] as const) {
    it(`sits above the photo and below the text at ${size}, covering both lines`, () => {
      const i = at(SCRIM(size));
      expect(i).toBeGreaterThan(-1);
      const scrim = layers[i]!;
      expect(scrim.sizes).toEqual([size]);
      expect(scrim.showWhen).toEqual({ photo: true });
      const photo = layers.findIndex((l) => l.kind === "photo" && l.sizes?.includes(size));
      expect(photo).toBeGreaterThan(-1);
      expect(i).toBeGreaterThan(photo);
      expect(i).toBeLessThan(at(DATE));
      expect(i).toBeLessThan(at(GAME_DAY));
      const box = scrim.geometry[size]!;
      for (const id of [DATE, GAME_DAY]) {
        const text = layers[at(id)]!.geometry[size]!;
        expect(text.x).toBeGreaterThanOrEqual(box.x);
        expect(text.x + text.w).toBeLessThanOrEqual(box.x + box.w);
        expect(text.y).toBeGreaterThanOrEqual(box.y);
        expect(text.y + text.h).toBeLessThanOrEqual(box.y + box.h);
      }
    });
  }

  it("is drawn whenever the card shows a photo, and left out when it shows none", () => {
    const input = (junior: boolean, juniorPhotoAllowed?: boolean) =>
      ({
        kind: "matchDay",
        roundLabel: "ROUND 8",
        oppositionName: "Baldivis",
        homeAway: "HOME",
        venue: "Sample Oval",
        date: "SAT 14 DEC",
        startTime: "12:00 PM",
        grade: junior ? "Under 13 Blue" : "A Grade",
        junior,
        ...(juniorPhotoAllowed === undefined ? {} : { juniorPhotoAllowed }),
      }) as unknown as ShareCardInput;
    const scrims = (html: string) =>
      html.match(/radial-gradient\(ellipse at 20% 50%/g)?.length ?? 0;
    for (const size of ["portrait", "story"] as const) {
      const draw = (card: ShareCardInput, photoUrl: string | null) => {
        const junior = (card as { junior?: boolean }).junior === true;
        const tokens = resolveCardTokens({
          theme: null,
          junior,
          data: null,
          packId: BLANK_PACK_ID,
        });
        return renderPackCard(
          card,
          size,
          false,
          tokens,
          junior,
          { photoUrl } as PackCardData,
          BLANK_PACK_ID,
          bundle.document as unknown as CardAdjustments,
          { page: "fixture" },
        );
      };
      const photo = placeholderImage("photo");
      // A junior card with an approved photo, and a senior card: the photo shows.
      expect(scrims(draw(input(true, true), photo))).toBe(1);
      expect(scrims(draw(input(false), photo))).toBe(1);
      // A junior card whose photo isn't approved draws none (consent unchanged), nor its scrim.
      expect(scrims(draw(input(true), photo))).toBe(0);
      // No photo at all.
      expect(scrims(draw(input(false), null))).toBe(0);
    }
  });
});
