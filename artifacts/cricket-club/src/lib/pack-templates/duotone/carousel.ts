import type { PackCardTemplate, PackTemplateField } from "../types";
import { CLUB_LOGO_SLOT, logoField, photoField, slot, textField } from "../shared";
import {
  FLAT_SPONSORS_PAGE,
  SPONSORS_PAGE_TEXT_FIELDS,
  isFlatSponsorsPage,
  sponsorGridHeight,
  sponsorGridsHtml,
  type SponsorsPageBudget,
  type SponsorsPageLayout,
} from "../sponsors-page";
import {
  C,
  PUSH,
  baseEyebrow,
  chip,
  crestBox,
  dtCard,
  dtFormats,
  face,
  hashtag,
  headline,
  sheetFoot,
  sheetMeta,
  sponsorNameFallback,
  sponsorStrip,
  u,
  wrapHeadline,
  type DtFormat,
} from "./parts";

/**
 * Duotone's private on-demand carousel slides (not gallery designs): the
 * Match Day title and sponsors pages, the junior day slides (P3: a day's
 * fixtures or results as compact rows) and the detailed match summary. Each
 * is the Duotone card: headline on the base, the white sheet below.
 */

const text = (keys: readonly string[]): PackTemplateField[] => keys.map((k) => textField(k, k, ""));

// ---------------------------------------------------------------------------
// Title and sponsors pages
// ---------------------------------------------------------------------------

/** Characters the sponsors page's next home game line holds at full size. */
export const DT_NEXT_HOME_FIT = 30;

/** Height (cqmin) the sponsors page's optional blocks take from the logo grid. */
export const DT_BUDGET: SponsorsPageBudget = {
  thankYou: 0,
  cta: 6,
  nextHome: 16,
  socials: 5,
  minGrid: 20,
};
export const DT_LAND_BUDGET: SponsorsPageBudget = {
  thankYou: 0,
  cta: 7,
  nextHome: 0,
  socials: 0,
  minGrid: 24,
};

/** The logo grid's base height (card cqmin) per format, before optional blocks. */
const GRID_HEIGHT: Record<DtFormat, number> = {
  square: 44,
  portrait: 64,
  story: 80,
  landscape: 58,
};

/** Title size (scaled cqmin) by title length. */
function titleSize(f: DtFormat, length: number): number {
  const base = f === "story" ? 6.4 : f === "landscape" ? 5 : 5.6;
  return length > 45 ? base * 0.62 : length > 25 ? base * 0.8 : base;
}

/** "SWIPE →" on feed sizes; story has none (brief §4.1). */
function swipe(f: DtFormat): string {
  if (f === "story") return "";
  return `<div style="flex:none;${face(100, 800)};font-size:${u(f, 1.9)};letter-spacing:.1em;padding:${u(f, 0.6)} ${u(f, 1.6)};border-radius:99cqmin;background:${C.ink};color:#fff;white-space:nowrap">SWIPE &#8594;</div>`;
}

export function duotoneWeekendTemplate(
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
  const photoKey = hasCoverPhoto ? "photo" : undefined;
  const build = (f: DtFormat): string => {
    const land = f === "landscape";
    if (page === "title") {
      const sheet =
        `<div style="display:flex;align-items:center;gap:${u(f, 2.2)};min-width:0">` +
        crestBox(f, 9, CLUB_LOGO_SLOT, 'data-drop-if-empty="clubLogo"') +
        `<div style="min-width:0">` +
        `<div data-fit="20" style="${face(112, 900)};font-size:calc(${u(f, 3)} * var(--fit,1));line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubName}}</div>` +
        sheetMeta(f, "{{date}}", `;${face(100, 700)};margin-top:${u(f, 0.3)}`) +
        `</div></div>` +
        `<div style="${face(112, 900)};font-size:${u(f, titleSize(f, titleLength))};line-height:1.05;margin-top:${u(f, 2.4)};overflow-wrap:anywhere">{{weekendTitle}}</div>` +
        (land ? PUSH : "") +
        // The club's livestream link (P5): "WATCH LIVE" and the short address.
        `<div data-drop-if-field="livestream" data-livestream="1" style="display:flex;align-items:center;gap:${u(f, 1.4)};max-width:100%;min-width:0;margin-top:${u(f, 2.4)}">` +
        chip(f, "WATCH LIVE", "p", "", ";flex:none;white-space:nowrap") +
        `<span style="min-width:0;${face(100, 600)};font-size:${u(f, 2.2)};color:${C.label};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{livestream}}</span>` +
        `</div>` +
        sheetFoot(
          f,
          sponsorStrip(f, "Presented by") + sponsorNameFallback(f, "Presented by"),
          swipe(f),
        );
      return dtCard({
        f,
        photo: photoKey,
        head: headline(f, "{{roundLabel}}", {
          dropIfEmpty: "roundLabel",
          fallback: "THIS WEEKEND",
          attrs: 'data-carousel-cover-label="1"',
        }),
        sheet,
      });
    }
    // Every tile shares one exact 2:1 frame; the grid's width bounds its
    // height so logos are never squashed. Logos only, contained.
    const grid = count
      ? sponsorGridsHtml({
          count,
          majorCount: layout.majorCount,
          height: sponsorGridHeight(GRID_HEIGHT[f], layout, land ? DT_LAND_BUDGET : DT_BUDGET),
          gap: 1.5,
          // Three across (the sheet's width), four past nine logos.
          cols: (n) => (n <= 2 ? Math.max(n, 1) : n <= 9 ? 3 : 4),
          majorCols: 2,
          maxWidth: land ? 78 : 84,
          // With an option on, the grid has less height: size tiles to the space.
          fitWidth: isFlatSponsorsPage(layout) ? undefined : land ? 78 : 84,
          line: C.line,
        })
      : sheetMeta(f, "Thank you to our club community", `;${face(100, 700)};text-align:center`);
    const sheet =
      sheetMeta(f, "{{date}}", `;${face(100, 700)};text-align:center`) +
      // Landscape's sheet is full height: the logos sit in its middle.
      (land ? PUSH : "") +
      `<div style="display:flex;flex-direction:column;align-items:center;width:100%;min-width:0">${grid}</div>` +
      (layout.cta
        ? `<div data-drop-if-field="sponsorCta" style="display:flex;justify-content:center;margin-top:${u(f, 2.4)}">${chip(f, "{{sponsorCta}}", "p", "", ";text-align:center")}</div>`
        : "") +
      (land ? PUSH : "");
    // Next home game and socials: under the sheet on the base, white text.
    const below =
      (layout.nextHome
        ? `<div data-drop-if-field="nextHomeMatch" data-sponsors-next-home="1" style="flex:none;display:flex;flex-direction:column;align-items:flex-start;max-width:100%;min-width:0;padding:0 1cqmin">` +
          baseEyebrow(f, "NEXT HOME GAME") +
          `<div data-fit="${DT_NEXT_HOME_FIT}" style="max-width:100%;${face(112, 900)};font-size:calc(${u(f, 3.4)} * var(--fit,1));line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:${u(f, 0.6)}">{{nextHomeMatch}}</div>` +
          baseEyebrow(
            f,
            "{{nextHomeWhen}}",
            `;margin-top:${u(f, 0.4)};text-transform:none;letter-spacing:0`,
          ) +
          `</div>`
        : "") +
      (layout.socials
        ? `<div data-drop-if-field="sponsorSocials" style="flex:none;padding:0 1cqmin;${face(100, 700)};font-size:${u(f, 2.3)};line-height:1.3;overflow-wrap:anywhere;color:#fff">{{sponsorSocials}}</div>`
        : "");
    const head = layout.thankYou
      ? wrapHeadline(f, "{{sponsorThanks}}", land ? 7.5 : f === "story" ? 9 : 7.5)
      : headline(f, "OUR SPONSORS");
    return dtCard({ f, photo: photoKey, head, sheet, below, landWidth: 50 });
  };
  const fields = [
    textField("clubName", "Club name", ""),
    logoField("clubLogo", "Club logo", "Club logo"),
    ...text([
      "sponsorPresentedBy",
      "weekendTitle",
      "date",
      "roundLabel",
      "livestream",
      ...(page === "sponsors" ? SPONSORS_PAGE_TEXT_FIELDS : []),
    ]),
    ...(photoKey ? [photoField("photo", "Cover photo", "Club photo")] : []),
    ...Array.from({ length: count }, (_, i) => ({
      key: `weekendSponsor${i}`,
      label: "Sponsor logo",
      type: "logo" as const,
      sample: "",
    })),
  ];
  return {
    kind: "matchDay",
    designKey: `weekend-${page}`,
    name: page === "title" ? "Weekend title" : "Weekend sponsors",
    sponsorVariants: ["on"],
    fields,
    formats: dtFormats(build),
  };
}

// ---------------------------------------------------------------------------
// Junior day slides (ADR-010 P3)
// ---------------------------------------------------------------------------

/**
 * Characters a day row's name box holds at full size, per format: measured in
 * the browser at each format's capacity, less a margin for fallback fonts.
 */
export const DT_DAY_ROW_FIT: Record<DtFormat, number> = {
  square: 28,
  portrait: 26,
  story: 22,
  landscape: 24,
};

function dayCard(f: DtFormat, kind: "fixtures" | "results", count: number): string {
  const n = Math.max(1, count);
  const s = (v: number) => u(f, v);
  const crest = (i: number) =>
    crestBox(
      f,
      5.6,
      slot(`day${i}.crest`, "logo", "rect").replace(
        'data-shape="rect"',
        'data-shape="rect" data-fit="contain"',
      ),
      `data-drop-if-empty="day${i}.crest"`,
    );
  const name = (i: number) =>
    `<div data-fit="${DT_DAY_ROW_FIT[f]}" data-fit-row style="${face(112, 900)};font-size:calc(${s(3)} * var(--fit,1));line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">v {{day${i}.opposition}}</div>`;
  const small = (t: string, extra = "") =>
    `<div style="${face(100, 500)};font-size:${s(1.9)};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.label}${extra}">${t}</div>`;
  const row = (i: number) =>
    `<div data-day-row="${i}" style="display:flex;align-items:center;gap:${s(1.6)};min-width:0;padding:${s(1.1)} 0;border-top:${s(0.15)} solid ${C.line}">` +
    (kind === "fixtures"
      ? `<div style="flex:none;min-width:${s(11.5)};${face(112, 900)};font-size:${s(2.8)};line-height:1;color:${C.pLight}">{{day${i}.time}}</div>` +
        `<div style="flex:1;min-width:0">${small(`{{day${i}.grade}}`, `;${face(100, 700)};color:${C.ink}`)}${name(i)}${small(`{{day${i}.meta}}`)}</div>`
      : `<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:${s(1.2)};min-width:0">${chip(f, `{{day${i}.word}}`, "p", "", `;flex:none;font-size:${s(1.8)};padding:${s(0.3)} ${s(1.2)}`)}${small(`{{day${i}.grade}}`, `;min-width:0;${face(100, 700)};color:${C.ink}`)}</div>${name(i)}${small(`{{day${i}.result}}`)}</div>` +
        `<div style="flex:none;text-align:right;line-height:1"><div style="${face(118, 900)};font-size:${s(3.2)};color:${C.ink}">{{day${i}.clubScore}}</div>` +
        `<div style="${face(118, 800)};font-size:${s(2.2)};margin-top:${s(0.4)};color:${C.label}">{{day${i}.oppScore}}</div></div>`) +
    crest(i) +
    `</div>`;
  const cols = f === "landscape" && n > 4 ? 2 : 1;
  const list =
    `<div data-day-rows="${n}" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));column-gap:${s(3)};width:100%;margin-top:${s(1.6)}">` +
    Array.from({ length: n }, (_, i) => row(i)).join("") +
    `</div>`;
  // Our club sits in the sheet's header with our crest, not on every row.
  const sheet =
    `<div style="display:flex;align-items:center;gap:${s(1.8)};min-width:0">` +
    crestBox(f, 6, CLUB_LOGO_SLOT, 'data-drop-if-empty="clubLogo"') +
    `<div style="min-width:0">` +
    `<div data-fit="22" style="${face(112, 900)};font-size:calc(${s(2.8)} * var(--fit,1));line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubName}}</div>` +
    sheetMeta(
      f,
      kind === "fixtures" ? "Junior match day" : "Junior results",
      `;font-size:${s(2)}`,
    ) +
    `</div></div>` +
    list;
  return dtCard({
    f,
    head: headline(f, "{{dayHeading}}"),
    sheet,
    fill: f === "landscape",
    landWidth: 62,
  });
}

function dayTemplate(kind: "fixtures" | "results", count: number): PackCardTemplate {
  const n = Math.max(1, count);
  const rowKeys =
    kind === "fixtures"
      ? ["grade", "opposition", "meta", "time"]
      : ["grade", "opposition", "result", "word", "clubScore", "oppScore"];
  const keys = Array.from({ length: n }, (_, i) => rowKeys.map((k) => `day${i}.${k}`)).flat();
  return {
    kind: kind === "fixtures" ? "matchDay" : "matchSummary",
    designKey: kind === "fixtures" ? `junior-day-${n}` : `junior-results-day-${n}`,
    name: kind === "fixtures" ? "Junior match day" : "Junior results day",
    sponsorVariants: [],
    fields: [
      textField("clubName", "Club name", ""),
      logoField("clubLogo", "Club logo", "Club logo"),
      ...text(["dayHeading", ...keys]),
      ...Array.from({ length: n }, (_, i) => ({
        key: `day${i}.crest`,
        label: "Opposition logo",
        type: "logo" as const,
        sample: "",
      })),
    ],
    formats: dtFormats((f) => dayCard(f, kind, n)),
  };
}

/** Match Day: a day's junior fixtures (the multi-fixture layout). */
export function duotoneDayFixturesTemplate(count: number): PackCardTemplate {
  return dayTemplate("fixtures", count);
}

/** Results / Match Summary: a day's junior results (the multi-result layout). */
export function duotoneDayResultsTemplate(count: number): PackCardTemplate {
  return dayTemplate("results", count);
}

// ---------------------------------------------------------------------------
// Match detail (the match summary carousel's detailed slide)
// ---------------------------------------------------------------------------

export function duotoneMatchDetailTemplate(inningsCount: number): PackCardTemplate {
  const n = Math.max(1, inningsCount);
  const keys = ["matchTitle", "result", "resultWord", "hashtags"];
  for (let i = 0; i < n; i++)
    for (const k of ["team", "label", "score", "overs", "batters", "bowlers"])
      keys.push(`inn${i}.${k}`);
  const build = (f: DtFormat): string => {
    const tall = f === "portrait" || f === "story";
    // Two innings stack on every format; three or more go two-up where the card is wide.
    const cols = n >= 3 && !tall ? 2 : 1;
    const rows = Math.ceil(n / cols);
    const k = rows <= 1 ? 1 : rows === 2 ? (tall ? 0.92 : 0.8) : rows === 3 ? 0.72 : 0.6;
    const s = (v: number) => u(f, v * k);
    const line = (tag: string, key: string) =>
      `<div style="${face(100, 600)};font-size:${s(2.1)};line-height:1.3;overflow-wrap:anywhere"><span style="${face(100, 800)};font-size:${s(1.7)};letter-spacing:.08em;color:${C.label}">${tag} </span>{{${key}}}</div>`;
    const panel = (i: number) =>
      `<div data-innings="${i}" style="box-sizing:border-box;min-width:0;padding:${s(1.4)} ${s(1.8)};background:${C.tint};border-radius:${s(2)};display:flex;flex-direction:column;gap:${s(0.5)}">` +
      `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:${s(1.4)};min-width:0">` +
      `<div style="min-width:0;flex:1"><div style="${face(100, 600)};font-size:${s(1.7)};letter-spacing:.06em;text-transform:uppercase;color:${C.label}">{{inn${i}.label}}</div>` +
      `<div data-fit="14" style="${face(112, 900)};font-size:calc(${s(3.2)} * var(--fit,1));line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{inn${i}.team}}</div></div>` +
      `<div style="flex:none;text-align:right"><div style="${face(118, 900)};font-size:${s(4.6)};line-height:.95;color:${C.ink}">{{inn${i}.score}}</div>` +
      `<div style="${face(100, 600)};font-size:${s(1.6)};color:${C.label}">{{inn${i}.overs}}</div></div></div>` +
      line("BAT", `inn${i}.batters`) +
      line("BOWL", `inn${i}.bowlers`) +
      `</div>`;
    const sheet =
      `<div style="min-width:0">${chip(f, "{{matchTitle}}")}</div>` +
      `<div style="${face(108, 800)};font-size:${u(f, 2.6)};line-height:1.2;margin-top:${u(f, 1.6)}">{{result}}</div>` +
      `<div data-match-detail-grid="${n}" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${s(1.2)};width:100%;margin-top:${u(f, 1.8)}">` +
      Array.from({ length: n }, (_, i) => panel(i)).join("") +
      `</div>` +
      sheetFoot(f, sponsorStrip(f, "Supported by"), hashtag(f, "hashtags"));
    return dtCard({ f, photo: "photo", head: headline(f, "{{resultWord}}"), sheet, landWidth: 64 });
  };
  return {
    kind: "matchSummary",
    designKey: `match-detail-${n}`,
    name: "Match detail",
    sponsorVariants: ["on"],
    fields: [
      photoField("photo", "Photo", "Club photo"),
      logoField("sponsor1", "Sponsor logo", "Sponsor"),
      ...text(keys),
    ],
    formats: dtFormats(build),
  };
}
