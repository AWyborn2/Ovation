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
import {
  assembleSetDocument,
  placeholderImage,
  type TemplateDocumentV2,
} from "@workspace/scorecard/kind-templates";
import { matchDayFixtureContent, presetFields } from "@workspace/scorecard/card-content";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { setDraftSlides, slideDocument } from "@/lib/set-draft";

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
    // 12: the scrim (round 9); 13: the Portrait scrim drawn without a clip (round 10).
    expect(bundle.version).toBeGreaterThanOrEqual(13);
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

  // Round 10 (junior set 1030): at Portrait the date and "Game Day" still sat
  // on the photo. The Portrait scrim was the only one cut to a clip polygon
  // (to keep the stripe its colour); it is now drawn as Story's is, a plain
  // box whose soft edge ends above the stripe.
  it("at Portrait has no clip, and its shading ends above the stripe", () => {
    type Styled = {
      style?: {
        clip?: { polygon: Array<[number, number]> };
        fill?: { type?: string; at?: { x: number; y: number } };
      };
      geometry: Record<string, { x: number; y: number; w: number; h: number }>;
    };
    const scrim = layers[at(SCRIM("portrait"))] as unknown as Styled;
    expect(scrim.style?.clip).toBeUndefined();
    expect(scrim.style?.fill?.type).toBe("radial");
    // The photo's lower edge (where the stripe starts), from its clip polygon.
    const photo = layers.find(
      (l) => l.kind === "photo" && l.sizes?.includes("portrait"),
    ) as unknown as Styled;
    const pb = photo.geometry.portrait!;
    const right = photo.style!.clip!.polygon.find(([x, y]) => x === 100 && y > 0)![1];
    const edge = (x: number) => pb.y + (pb.h * (100 - ((100 - right) * (x - pb.x)) / pb.w)) / 100;
    // A radial fill at its point, out to the farthest corner, clear from its
    // last stop (70%): what it paints is the ellipse of half-axes 0.8w and 0.5h
    // (each times 0.7 x sqrt 2, about 0.99) round that point.
    const b = scrim.geometry.portrait!;
    const point = scrim.style!.fill!.at!;
    const cx = b.x + (b.w * point.x) / 100;
    const cy = b.y + (b.h * point.y) / 100;
    const rx = b.w * Math.max(point.x, 100 - point.x) * 0.0099;
    const ry = b.h * Math.max(point.y, 100 - point.y) * 0.0099;
    for (let x = b.x; x <= b.x + b.w; x += 0.5) {
      const d = 1 - ((x - cx) / rx) ** 2;
      if (d <= 0) continue;
      const bottom = Math.min(b.y + b.h, cy + ry * Math.sqrt(d));
      expect(bottom).toBeLessThanOrEqual(edge(x) + 0.05);
    }
  });

  // The path set 1030 draws: a junior set's game slide, on the set's fixture page.
  describe("on a junior carousel slide (set 1030)", () => {
    const set = assembleSetDocument("matchDay", (k) =>
      k === "matchDay" ? bundle.document : null,
    )!.document;
    const content = matchDayFixtureContent({
      id: 7,
      grade: "Year 9",
      roundLabel: "",
      opponentName: "Waroona",
      opponentLogoUrl: null,
      venue: "Sample Oval",
      startAt: new Date("2026-11-22T01:00:00Z"),
      isHome: true,
      junior: true,
    } as never);
    const carousel = (photoId: number | null, photoUrl: string | null) => ({
      cardInput: {
        kind: "matchDay",
        weekendCarousel: {
          version: 3,
          templateRef: { libraryTemplateId: 1, version: 13 },
          setType: "matchDay",
          submissionId: "12345678-1234-1234-1234-123456789abc",
          size: "portrait",
          slides: [
            {
              id: "fixture-7",
              label: "Year 9 v Waroona",
              content,
              visibleFields: [...presetFields("matchDay", "standard")],
              photoId,
              data: photoUrl ? { photoUrl } : {},
              junior: true,
              sponsorsOn: false,
              warnings: [],
            },
          ],
        },
      },
      sourceMatchIsJunior: true,
    });
    const drawSlide = (draft: ReturnType<typeof carousel>, size: "portrait" | "story") => {
      const slide = setDraftSlides(draft, set, {} as PackCardData).find(
        (s) => s.key === "fixture-7",
      )!;
      expect(slide.page.page).toBe("fixture");
      expect(slide.junior).toBe(true);
      const tokens = resolveCardTokens({
        theme: null,
        junior: true,
        data: null,
        packId: BLANK_PACK_ID,
      });
      return renderPackCard(
        slide.input,
        size,
        slide.sponsorsOn,
        tokens,
        slide.junior,
        slide.data,
        BLANK_PACK_ID,
        slideDocument(set, slide),
      );
    };
    const styleOf = (html: string, id: string) =>
      new RegExp(`data-layer-id="${id}" style="([^"]*)"`).exec(html)?.[1] ?? null;
    const pct = (style: string, key: string) =>
      Number(new RegExp(`(?:^|;)${key}:([0-9.]+)%`).exec(style)![1]);
    const order = (html: string, id: string) => html.indexOf(`data-layer-id="${id}"`);
    const photo = placeholderImage("photo");

    for (const size of ["portrait", "story"] as const) {
      it(`draws the scrim behind the date and Game Day at ${size}, with the club's stock photo`, () => {
        const html = drawSlide(carousel(5, photo), size);
        // The cleared stock image shows, and so does the scrim, unclipped.
        expect(html).toContain(photo);
        const scrim = styleOf(html, SCRIM(size));
        expect(scrim).not.toBeNull();
        expect(scrim).not.toContain("clip-path");
        expect(html).toContain("radial-gradient(ellipse at 20% 50%");
        // Above the photo, below the date line and Game Day.
        const photoLayer = size === "portrait" ? "fixture-l21" : "fixture-l22";
        expect(order(html, photoLayer)).toBeGreaterThan(-1);
        expect(order(html, SCRIM(size))).toBeGreaterThan(order(html, photoLayer));
        expect(order(html, SCRIM(size))).toBeLessThan(order(html, DATE));
        expect(order(html, SCRIM(size))).toBeLessThan(order(html, GAME_DAY));
        // Its box holds both lines as drawn.
        for (const id of [DATE, GAME_DAY]) {
          const text = styleOf(html, id)!;
          expect(pct(text, "top")).toBeGreaterThanOrEqual(pct(scrim!, "top"));
          expect(pct(text, "top") + pct(text, "height")).toBeLessThanOrEqual(
            pct(scrim!, "top") + pct(scrim!, "height"),
          );
          expect(pct(text, "left") + pct(text, "width")).toBeLessThanOrEqual(
            pct(scrim!, "left") + pct(scrim!, "width"),
          );
        }
      });

      it(`draws no scrim at ${size} when the junior slide has no photo it may show`, () => {
        // No stock image picked: no photo (consent unchanged), so no scrim.
        expect(styleOf(drawSlide(carousel(null, null), size), SCRIM(size))).toBeNull();
      });
    }
  });
});
