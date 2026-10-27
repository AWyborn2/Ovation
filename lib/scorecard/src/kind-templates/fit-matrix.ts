/**
 * The fit matrix (ADR-011 §4, task T2.1): every variant of a template the fit
 * check draws with worst-case content (`worst-case.ts`).
 *
 *   every page the template has × every size it covers
 *   × every preset (content kinds only)
 *   × photo present and absent, where a layer is photo-conditioned or photo-bound
 *   × sponsors none and the kind's maximum, where a layer uses sponsors
 *
 * Plus, for the pages a junior card can draw (a junior fixture, result or
 * team list), one junior pass per size at the Full preset with no photo:
 * junior names, "Private Player" rows. A junior day slide is junior in every
 * variant. A Match Summary template is checked as the Results set too (its
 * projection drops the top performers), at its own presets.
 *
 * Pure: the fit check (`template-fit.ts`, L2-B) renders each variant.
 */

import { TEMPLATE_SIZE_ORDER, type TemplateSize } from "./document";
import { layerTokens } from "./drop-rule";
import { CONTENT_PRESETS, isContentKind, type ContentPreset } from "./fields";
import {
  flattenLayers,
  isGroupLayer,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "./format";
import { pageTokens, PHOTO_TOKEN } from "./page-tokens";
import { kindPages, templateKindFor } from "./pages";

export type SponsorLoad = "none" | "max";

export interface FitVariant {
  page: PageKey;
  size: TemplateSize;
  /** The content kind drawn: the template's own, or `results` on a Match Summary template. */
  contentKind: string;
  /** Content kinds only. */
  preset?: ContentPreset;
  /** Set when the page's layers depend on the photo. */
  photo?: boolean;
  /** Set when the page's layers use sponsors. */
  sponsors?: SponsorLoad;
  junior: boolean;
}

/** Tokens and repeats that carry the club's sponsors. */
const SPONSOR_TOKENS = new Set([
  "sponsorPresentedBy",
  "playerSponsorName",
  "playerSponsor2Name",
  "playerSponsorLogo",
  "playerSponsor2Logo",
  "sponsor1",
  "sponsor2",
  "sponsor3",
  "sponsors",
]);

/** Pages a junior card can draw, so they get a junior pass. Day pages are always junior. */
const JUNIOR_PAGES: Partial<Record<string, readonly PageKey[]>> = {
  matchDay: ["fixture"],
  matchSummary: ["result"],
  teamList: ["team"],
};

const drawn = (layers: readonly TemplateLayerV2[]) =>
  flattenLayers(layers).filter((l) => !isGroupLayer(l) && !l.hidden);

/** The sizes a page covers: at least one layer is on the size and has a box there. */
export function pageSizes(doc: TemplateDocumentV2, page: PageKey): TemplateSize[] {
  const layers = drawn(doc.pages[page]?.layers ?? []);
  return TEMPLATE_SIZE_ORDER.filter((size) =>
    layers.some((l) => (!l.sizes || l.sizes.includes(size)) && l.geometry?.[size]),
  );
}

/** The photo tokens a page offers: the card's photo and the kind's own photo slots. */
function photoTokens(kind: string, page: PageKey): Set<string> {
  const cat = pageTokens(kind, page);
  return new Set([
    PHOTO_TOKEN,
    ...(cat?.images.filter((i) => i.type === "photo") ?? []).map((i) => i.key),
  ]);
}

/** Whether any layer of a page depends on the photo: a photo layer, a photo token, `showWhen.photo`. */
export function pageUsesPhoto(doc: TemplateDocumentV2, kind: string, page: PageKey): boolean {
  const tokens = photoTokens(templateKindFor(kind), page);
  return drawn(doc.pages[page]?.layers ?? []).some(
    (l) =>
      l.showWhen?.photo !== undefined ||
      l.kind === "photo" ||
      layerTokens(l).some((t) => tokens.has(t)),
  );
}

/** Whether any layer of a page uses sponsors: a sponsor token or repeat, or `showWhen.sponsors`. */
export function pageUsesSponsors(doc: TemplateDocumentV2, page: PageKey): boolean {
  return flattenLayers(doc.pages[page]?.layers ?? []).some(
    (l) =>
      !l.hidden &&
      (l.showWhen?.sponsors !== undefined || layerTokens(l).some((t) => SPONSOR_TOKENS.has(t))),
  );
}

/** Every variant the fit check draws for a template of `kind`. */
export function fitMatrix(doc: TemplateDocumentV2, kind: string): FitVariant[] {
  const templateKind = templateKindFor(kind);
  const contentKinds =
    templateKind === "matchSummary" ? ["matchSummary", "results"] : [templateKind];
  const out: FitVariant[] = [];
  for (const page of kindPages(templateKind)) {
    if (!doc.pages[page]) continue;
    const sizes = pageSizes(doc, page);
    const photos = pageUsesPhoto(doc, templateKind, page) ? [true, false] : [undefined];
    const sponsors: Array<SponsorLoad | undefined> = pageUsesSponsors(doc, page)
      ? ["max", "none"]
      : [undefined];
    const dayPage = page === "day";
    for (const contentKind of contentKinds) {
      const presets: Array<ContentPreset | undefined> = isContentKind(contentKind)
        ? [...CONTENT_PRESETS]
        : [undefined];
      for (const size of sizes) {
        for (const preset of presets)
          for (const photo of dayPage ? [undefined] : photos)
            for (const load of sponsors)
              out.push({
                page,
                size,
                contentKind,
                ...(preset ? { preset } : {}),
                ...(photo === undefined ? {} : { photo }),
                ...(load ? { sponsors: load } : {}),
                junior: dayPage,
              });
        if (!dayPage && JUNIOR_PAGES[templateKind]?.includes(page))
          out.push({
            page,
            size,
            contentKind,
            ...(isContentKind(contentKind) ? { preset: "full" as const } : {}),
            ...(photos[0] === undefined ? {} : { photo: false }),
            ...(sponsors[0] ? { sponsors: "max" as const } : {}),
            junior: true,
          });
      }
    }
  }
  return out;
}

/** A variant's stable label, for reports: `fixture.story.full.photo.sponsors-max.junior`. */
export function fitVariantLabel(v: FitVariant): string {
  return [
    v.page,
    v.size,
    ...(v.contentKind === "results" ? ["results"] : []),
    ...(v.preset ? [v.preset] : []),
    ...(v.photo === undefined ? [] : [v.photo ? "photo" : "no-photo"]),
    ...(v.sponsors ? [`sponsors-${v.sponsors}`] : []),
    ...(v.junior ? ["junior"] : []),
  ].join(".");
}
