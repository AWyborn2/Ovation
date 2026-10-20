import type { PackCardTemplate } from "../types";
import { clubHeaderFields, textField } from "../shared";
import { ckCard, ckFormats } from "./card";
import { C, cq, display, eyebrow, meta } from "./parts";
import {
  FLAT_SPONSORS_PAGE,
  SPONSORS_PAGE_TEXT_FIELDS,
  isFlatSponsorsPage,
  sponsorGridHeight,
  sponsorGridsHtml,
  type SponsorsPageBudget,
  type SponsorsPageLayout,
} from "../sponsors-page";

/** Characters the next home game line holds at full size (the shared name-fit rule). */
export const NEXT_HOME_FIT = 30;

/** Height (cqmin) the sponsors page's optional blocks take from the logo grid. */
export const CK_BUDGET: SponsorsPageBudget = {
  thankYou: 4,
  cta: 5,
  nextHome: 13,
  socials: 5,
  minGrid: 18,
};
export const CK_TALL_BUDGET: SponsorsPageBudget = {
  thankYou: 5,
  cta: 6,
  nextHome: 16,
  socials: 6,
  minGrid: 30,
};

/** Private variants of matchDay; not standalone gallery kinds. Same Club Kit
 * layout, brand tokens, escaping, fonts and still-render harness as team cards. */
export function weekendBookendTemplate(
  page: "title" | "sponsors",
  sponsorCount: number,
  titleLength = 0,
  hasCoverPhoto = false,
  /** The sponsors page's optional blocks (P6); none = the page as it was. */
  options: Omit<SponsorsPageLayout, "count"> = FLAT_SPONSORS_PAGE,
): PackCardTemplate {
  const count = Math.max(0, sponsorCount);
  const layout: SponsorsPageLayout =
    page === "sponsors" ? { ...options, count } : { ...FLAT_SPONSORS_PAGE, count };
  return {
    kind: "matchDay",
    designKey: `weekend-${page}`,
    name: page === "title" ? "Weekend title" : "Weekend sponsors",
    sponsorVariants: ["off", "on"],
    fields: [
      ...clubHeaderFields(),
      ...[
        "clubMonogram",
        "clubHashtag",
        "sponsorPresentedBy",
        "weekendTitle",
        "date",
        "roundLabel",
        ...(page === "sponsors" ? SPONSORS_PAGE_TEXT_FIELDS : []),
      ].map((k) => textField(k, k, "")),
    ],
    formats: ckFormats((f) => {
      const tall = f === "story" || f === "portrait";
      // All tiles, including an incomplete final row, share one exact 2:1
      // size. Limit total height by constraining the grid's width, never by
      // squashing individual logos. Tall cards use fewer, larger columns.
      const sponsorGrid = count
        ? sponsorGridsHtml({
            count,
            majorCount: layout.majorCount,
            height: sponsorGridHeight(
              f === "story" ? 112 : f === "portrait" ? 70 : 48,
              layout,
              tall ? CK_TALL_BUDGET : CK_BUDGET,
            ),
            gap: 1.5,
            cols: (n) =>
              n <= 2
                ? Math.max(n, 1)
                : tall
                  ? n <= 10
                    ? 2
                    : n <= 18
                      ? 3
                      : 4
                  : n === 4
                    ? 2
                    : n <= 9
                      ? 3
                      : 4,
            majorCols: tall ? 2 : 3,
            // With an option on, the grid has less height: size tiles to the space.
            fitWidth: isFlatSponsorsPage(layout) ? undefined : f === "landscape" ? 150 : 84,
            line: "var(--ck-line)",
          })
        : meta(cq, "THANK YOU TO OUR CLUB COMMUNITY", ";margin-top:4cqmin");
      // The page's optional blocks (P6): each drops when its value is empty.
      const heading = layout.thankYou
        ? display(
            cq,
            "{{sponsorThanks}}",
            tall ? 8 : 6,
            ";max-width:100%;overflow-wrap:anywhere;line-height:.95",
          )
        : display(cq, "OUR SPONSORS", tall ? 10 : 8);
      const below =
        (layout.cta
          ? meta(cq, "{{sponsorCta}}", ";margin-top:2.4cqmin;max-width:100%").replace(
              "<div ",
              '<div data-drop-if-field="sponsorCta" ',
            )
          : "") +
        (layout.nextHome
          ? `<div data-drop-if-field="nextHomeMatch" data-sponsors-next-home="1" style="display:flex;flex-direction:column;align-items:flex-start;max-width:100%;min-width:0;margin-top:3cqmin">` +
            eyebrow(cq, "NEXT HOME GAME") +
            display(
              cq,
              "{{nextHomeMatch}}",
              tall ? 5.4 : 4.6,
              `;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.8cqmin;font-size:calc(${cq(tall ? 5.4 : 4.6)} * var(--fit,1))`,
            ).replace("<div ", `<div data-fit="${NEXT_HOME_FIT}" `) +
            meta(cq, "{{nextHomeWhen}}", ";margin-top:.6cqmin;max-width:100%") +
            `</div>`
          : "") +
        (layout.socials
          ? meta(
              cq,
              "{{sponsorSocials}}",
              `;margin-top:2.4cqmin;max-width:100%;overflow-wrap:anywhere;color:${C.pt}`,
            ).replace("<div ", '<div data-drop-if-field="sponsorSocials" ')
          : "");
      return ckCard({
        format: f,
        chip: "THIS WEEKEND",
        wide: true,
        centerBody: page === "sponsors",
        backdropPhoto: hasCoverPhoto ? "photo" : undefined,
        body:
          page === "title"
            ? eyebrow(cq, "{{date}}") +
              display(
                cq,
                "{{weekendTitle}}",
                titleLength > 45 ? 6 : titleLength > 25 ? 8 : tall ? 13 : 11,
                ";line-height:.95;overflow-wrap:anywhere;margin-top:3cqmin",
              ) +
              display(
                cq,
                "{{roundLabel}}",
                tall ? 16 : 14,
                `;max-width:100%;overflow-wrap:anywhere;flex-shrink:0;margin-top:4cqmin;font-size:calc(${cq(tall ? 16 : 14)} * var(--fit,1))`,
              ).replace(
                "<div ",
                '<div data-drop-if-field="roundLabel" data-carousel-cover-label="1" data-fit="7" ',
              ) +
              display(cq, "SWIPE &gt;&gt;", tall ? 10 : 8, `;margin-top:2cqmin;color:${C.pt}`)
            : eyebrow(cq, "{{date}}") + heading + sponsorGrid + below,
        footer: {
          hashtag: "clubHashtag",
          sponsors: "logos",
          off: true,
          ...(page === "title" ? { label: "PRESENTED BY" } : {}),
        },
      });
    }),
  };
}
