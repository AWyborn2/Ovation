import type { PackCardTemplate } from "./types";
import {
  CAROUSEL_PACK_IDS,
  LEGACY_CAROUSEL_PACK_ID,
  isCarouselPackId,
} from "@workspace/scorecard/queued-carousel";
import { clubHeaderFields, photoField, slot, textField } from "./shared";
import {
  K,
  K_DISP,
  type PackLook,
  kColumn,
  kCond,
  kEyebrow,
  kFooterOn,
  kitCard,
  kitChip,
  kitFormats,
} from "./skeleton-kit";
import { SK_COND, SK_MONO } from "./shared";
import { BD_LOOK } from "./broadcast-dark/fragments";
import { FOIL_LOOK } from "./gold-foil/fragments";
import { BOLD_LOOK } from "./bold-type/fragments";
import { NEON_LOOK } from "./neon-night/fragments";
import { SUNSET_LOOK } from "./sunset/fragments";

/**
 * Private on-demand carousel templates (weekend cover / sponsors and the
 * detailed match summary) for the five skeleton-kit packs, each in the pack's
 * own look. Club Kit keeps its own layouts (`club-kit/`). Not gallery kinds.
 */
export const CAROUSEL_CLUB_KIT = LEGACY_CAROUSEL_PACK_ID;

const LOOKS: Record<string, PackLook> = {
  "broadcast-dark-v1": BD_LOOK,
  "gold-foil-v1": FOIL_LOOK,
  "bold-type-v1": BOLD_LOOK,
  "neon-night-v1": NEON_LOOK,
  "sunset-v1": SUNSET_LOOK,
};

/** Pack ids a carousel can render: Club Kit plus every skeleton pack. */
export { CAROUSEL_PACK_IDS };

export function isCarouselPack(packId: string): boolean {
  return isCarouselPackId(packId);
}

export function carouselLook(packId: string): PackLook | null {
  return Object.prototype.hasOwnProperty.call(LOOKS, packId) ? LOOKS[packId] : null;
}

export function skeletonWeekendTemplate(
  look: PackLook,
  page: "title" | "sponsors",
  sponsorCount: number,
  titleLength = 0,
  hasCoverPhoto = false,
): PackCardTemplate {
  const count = Math.max(0, sponsorCount);
  const photoKey = page === "title" && hasCoverPhoto ? "photo" : undefined;
  const sponsorKeys = Array.from({ length: count }, (_, i) => `weekendSponsor${i}`);
  const build = (land: boolean): string => {
    // Every tile shares one exact 2:1 frame; the grid's width bounds its
    // height so logos are never squashed. Logos only, contained.
    const cols =
      count <= 2
        ? Math.max(count, 1)
        : land
          ? count === 4
            ? 2
            : count <= 9
              ? 3
              : 4
          : count <= 10
            ? 2
            : count <= 18
              ? 3
              : 4;
    const rows = Math.max(1, Math.ceil(count / cols));
    const gap = 1.5;
    const gridH = land ? 52 : 74;
    const tileH = Math.max(1, (gridH - (rows - 1) * gap) / rows);
    const gridW = Math.min(tileH * 2 * cols + (cols - 1) * gap, land ? 150 : 96);
    const grid = count
      ? `<div data-weekend-sponsor-grid="1" style="display:flex;flex-wrap:wrap;justify-content:center;gap:${gap}cqmin;width:100%;max-width:${gridW}cqmin;align-self:center;flex:none;margin-top:3cqmin">` +
        sponsorKeys
          .map(
            (k, i) =>
              `<div data-weekend-sponsor="${i}" data-sponsor-logo-frame="1" data-drop-if-empty="${k}" style="flex:0 0 calc((100% - ${(cols - 1) * gap}cqmin) / ${cols});aspect-ratio:2 / 1;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:.9cqmin;background:#fff;border:1px solid ${K.line};min-width:0;overflow:hidden">` +
              slot(k, "sponsor") +
              `</div>`,
          )
          .join("") +
        `</div>`
      : kEyebrow("THANK YOU TO OUR CLUB COMMUNITY", K.muted, ";margin-top:4cqmin");
    const tsz = titleLength > 45 ? 9 : titleLength > 25 ? 12 : 16;
    const body =
      page === "title"
        ? kColumn(
            look,
            kEyebrow("{{date}}") +
              `<div style="font-family:${K_DISP};font-size:${tsz}cqmin;line-height:.95;text-transform:uppercase;margin-top:3cqmin;overflow-wrap:anywhere;text-shadow:${K.titleGlow}">{{weekendTitle}}</div>` +
              kCond(
                "{{roundLabel}}",
                11,
                `;max-width:100%;overflow-wrap:anywhere;flex-shrink:0;margin-top:3cqmin;color:${K.accText};font-size:calc(11cqmin * var(--fit,1))`,
              ).replace(
                "<div ",
                '<div data-drop-if-field="roundLabel" data-carousel-cover-label="1" data-fit="10" ',
              ) +
              kEyebrow("SWIPE &gt;&gt;", K.muted, ";margin-top:2cqmin"),
            true,
          )
        : `<div style="display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;text-align:center">` +
          kEyebrow("{{date}}") +
          kCond("OUR SPONSORS", 8, ";margin-top:1.4cqmin") +
          grid +
          `</div>`;
    return kitCard(look, {
      chip: kitChip("THIS WEEKEND"),
      photo: photoKey,
      body,
      footer: kFooterOn("proudly supported by"),
      deco: {
        word: page === "title" ? "WEEKEND" : "THANKS",
        script: page === "title" ? "This weekend" : "Our sponsors",
      },
    });
  };
  const fields = [
    ...clubHeaderFields(),
    ...["clubHashtag", "sponsorPresentedBy", "weekendTitle", "date", "roundLabel"].map((k) =>
      textField(k, k, ""),
    ),
    ...(photoKey ? [photoField("photo", "Cover photo", "Club photo")] : []),
    ...sponsorKeys.map((k) => ({
      key: k,
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
    fields: fields as PackCardTemplate["fields"],
    formats: kitFormats((f) => build(f === "landscape")),
  };
}

export function skeletonMatchDetailTemplate(
  look: PackLook,
  inningsCount: number,
): PackCardTemplate {
  const n = Math.max(1, inningsCount);
  const keys = ["clubHashtag", "sponsorPresentedBy", "matchTitle", "result", "resultWord"];
  for (let i = 0; i < n; i++)
    for (const k of ["team", "label", "score", "overs", "batters", "bowlers"])
      keys.push(`inn${i}.${k}`);
  const build = (land: boolean): string => {
    const cols = land && n >= 2 ? 2 : 1;
    const rows = Math.ceil(n / cols);
    const k = land
      ? rows <= 1
        ? 0.8
        : 0.6
      : n <= 2
        ? 1
        : n === 3
          ? 0.82
          : n === 4
            ? 0.66
            : Math.max(0.36, 2.6 / n);
    const s = (v: number) => `${+(v * k).toFixed(2)}cqmin`;
    const line = (tag: string, key: string) =>
      `<div style="font-weight:600;font-size:${s(2.6)};line-height:1.3;color:${K.panelText};overflow-wrap:anywhere"><span style="font-family:${SK_MONO};font-size:${s(2)};letter-spacing:.12em;color:${K.panelMuted}">${tag} </span>{{${key}}}</div>`;
    const panel = (i: number) =>
      `<div data-innings="${i}" style="box-sizing:border-box;min-width:0;padding:${s(1.8)} ${s(2.2)};background:color-mix(in srgb,${K.panel} 30%,var(--ink,#101216) 70%);border:1px solid ${K.panelBorder};border-radius:${K.rowR};display:flex;flex-direction:column;gap:${s(0.8)}">` +
      `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:${s(1.6)};min-width:0">` +
      `<div style="min-width:0;flex:1"><div style="font-family:${SK_MONO};font-size:${s(2)};letter-spacing:.14em;text-transform:uppercase;color:${K.panelMuted}">{{inn${i}.label}}</div>` +
      `<div data-fit="14" style="font-family:${SK_COND};font-weight:800;font-size:calc(${s(4.6)} * var(--fit,1));line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${K.panelText}">{{inn${i}.team}}</div></div>` +
      `<div style="flex:none;text-align:right"><div style="font-family:${K_DISP};font-size:${s(7)};line-height:.9;color:${K.panelAcc}">{{inn${i}.score}}</div>` +
      `<div style="font-family:${SK_MONO};font-size:${s(1.9)};letter-spacing:.12em;color:${K.panelMuted}">{{inn${i}.overs}}</div></div></div>` +
      line("BAT", `inn${i}.batters`) +
      line("BOWL", `inn${i}.bowlers`) +
      `</div>`;
    const grid =
      `<div data-match-detail-grid="${n}" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${s(1.4)};width:100%;margin-top:2cqmin">` +
      Array.from({ length: n }, (_, i) => panel(i)).join("") +
      `</div>`;
    const head =
      kEyebrow("{{matchTitle}}") +
      `<div style="display:flex;align-items:baseline;gap:2cqmin;width:100%;min-width:0;margin-top:.6cqmin">` +
      `<div style="flex:none;font-family:${K_DISP};font-size:${land ? 8 : 10}cqmin;line-height:.9;text-transform:uppercase;color:${K.accText}">{{resultWord}}</div>` +
      `<div style="flex:1;min-width:0;font-family:${SK_COND};font-weight:700;font-size:${land ? 3.6 : 4}cqmin;line-height:1.05;text-transform:uppercase">{{result}}</div></div>`;
    return kitCard(look, {
      chip: kitChip("MATCH DETAIL"),
      photo: "photo",
      body: kColumn(look, head + grid, true),
      footer: kFooterOn("proudly supported by"),
      deco: { word: "SCORE", script: "Full time" },
    });
  };
  return {
    kind: "matchSummary",
    designKey: `match-detail-${n}`,
    name: "Match detail",
    sponsorVariants: ["on"],
    fields: [
      ...clubHeaderFields(),
      photoField("photo", "Photo", "Club photo"),
      ...keys.map((x) => textField(x, x, "")),
    ],
    formats: kitFormats((f) => build(f === "landscape")),
  };
}

// ---------------------------------------------------------------------------
// Junior day slides (ADR-010 P3): the junior matches of one day as compact
// rows under the day's heading, in the pack's own look. Club Kit's are in
// `club-kit/day-slides.ts`; the row counts per size are the layout contract's.
// ---------------------------------------------------------------------------

/**
 * Characters a day row's name box holds at full size. Square, portrait and
 * story share one markup, so this is the narrowest of them as measured in the
 * browser at capacity (portrait), less a margin for fallback fonts.
 */
export const SKELETON_DAY_ROW_FIT = 38;

function skeletonDayCard(
  look: PackLook,
  kind: "fixtures" | "results",
  count: number,
): PackCardTemplate {
  const n = Math.max(1, count);
  const rowKeys =
    kind === "fixtures"
      ? ["grade", "opposition", "meta", "time"]
      : ["grade", "opposition", "result", "word", "clubScore", "oppScore"];
  const build = (land: boolean): string => {
    const cols = land && n > 3 ? 2 : 1;
    const perCol = Math.ceil(n / cols);
    // Landscape's body is short, so its rows set a little larger to fill it.
    const k = (perCol <= 4 ? 1 : Math.max(0.7, 4 / perCol + 0.1)) * (land ? 1.2 : 1);
    const s = (v: number) => `${+(v * k).toFixed(2)}cqmin`;
    const crest = (i: number) =>
      `<div data-drop-if-empty="day${i}.crest" style="flex:none;width:${s(8)};height:${s(8)};display:flex;align-items:center;justify-content:center;background:#fff;border-radius:${K.rowR};overflow:hidden">${slot(`day${i}.crest`, "logo", "rect")}</div>`;
    const name = (i: number) =>
      `<div data-fit="${SKELETON_DAY_ROW_FIT}" data-fit-row style="font-family:${SK_COND};font-weight:800;font-size:calc(${s(4.2)} * var(--fit,1));line-height:1.02;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${K.panelText}">v {{day${i}.opposition}}</div>`;
    const small = (text: string, mono = false, extra = "") =>
      `<div style="${extra}font-family:${mono ? SK_MONO : SK_COND};font-weight:${mono ? 600 : 700};font-size:${s(mono ? 2 : 2.4)};${mono ? "letter-spacing:.14em;" : ""}line-height:1.3;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${K.panelMuted}">${text}</div>`;
    const row = (i: number) =>
      `<div data-day-row="${i}" style="box-sizing:border-box;display:flex;align-items:center;gap:${s(2)};min-width:0;padding:${s(1.4)} ${s(2)};background:${K.panel};border:1px solid ${K.panelBorder};border-radius:${K.rowR}">` +
      (kind === "fixtures"
        ? `<div style="flex:none;min-width:${s(15)};font-family:${K_DISP};font-size:${s(4.6)};line-height:1;color:${K.panelAcc}">{{day${i}.time}}</div>` +
          `<div style="flex:1;min-width:0">${small(`{{day${i}.grade}}`, true)}${name(i)}${small(`{{day${i}.meta}}`)}</div>`
        : `<div style="flex:1;min-width:0"><div style="display:flex;align-items:baseline;gap:${s(1.4)};min-width:0"><span style="flex:none;font-family:${SK_COND};font-weight:800;font-size:${s(2.8)};line-height:1;padding:${s(0.4)} ${s(1)};border-radius:${K.pillR};background:${K.acc};color:${K.accInk}">{{day${i}.word}}</span>${small(`{{day${i}.grade}}`, true, "min-width:0;")}</div>${name(i)}${small(`{{day${i}.result}}`)}</div>` +
          `<div style="flex:none;text-align:right;line-height:1"><div style="font-family:${K_DISP};font-size:${s(4.6)};color:${K.panelAcc}">{{day${i}.clubScore}}</div>` +
          `<div style="font-family:${SK_COND};font-weight:800;font-size:${s(3)};margin-top:${s(0.5)};color:${K.panelMuted}">{{day${i}.oppScore}}</div></div>`) +
      crest(i) +
      `</div>`;
    const list =
      `<div data-day-rows="${n}" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${s(1.4)};width:100%;margin-top:2.4cqmin">` +
      Array.from({ length: n }, (_, i) => row(i)).join("") +
      `</div>`;
    return kitCard(look, {
      chip: kitChip(kind === "fixtures" ? "MATCH DAY" : "RESULTS"),
      // Landscape spans the card (two columns of rows); the others use the pack's column.
      body: (land
        ? (inner: string) =>
            `<div style="display:flex;flex-direction:column;align-items:flex-start;width:100%;min-width:0">${inner}</div>`
        : (inner: string) => kColumn(look, inner, true))(
        kEyebrow(kind === "fixtures" ? "JUNIOR MATCH DAY" : "JUNIOR RESULTS") +
          kCond("{{dayHeading}}", land ? 9 : 11, ";margin-top:1cqmin") +
          list,
      ),
      footer: kFooterOn("proudly supported by"),
      deco: {
        word: kind === "fixtures" ? "GAME DAY" : "RESULTS",
        script: kind === "fixtures" ? "Junior match day" : "Junior results",
      },
    });
  };
  const keys = Array.from({ length: n }, (_, i) => rowKeys.map((k) => `day${i}.${k}`)).flat();
  return {
    kind: kind === "fixtures" ? "matchDay" : "matchSummary",
    designKey: kind === "fixtures" ? `junior-day-${n}` : `junior-results-day-${n}`,
    name: kind === "fixtures" ? "Junior match day" : "Junior results day",
    sponsorVariants: ["on"],
    fields: [
      ...clubHeaderFields(),
      ...["clubHashtag", "sponsorPresentedBy", "dayHeading", ...keys].map((x) =>
        textField(x, x, ""),
      ),
      ...Array.from({ length: n }, (_, i) => ({
        key: `day${i}.crest`,
        label: "Opposition logo",
        type: "logo" as const,
        sample: "",
      })),
    ] as PackCardTemplate["fields"],
    formats: kitFormats((f) => build(f === "landscape")),
  };
}

/** Match Day: a day's junior fixtures (the multi-fixture layout). */
export function skeletonDayFixturesTemplate(look: PackLook, count: number): PackCardTemplate {
  return skeletonDayCard(look, "fixtures", count);
}

/** Results / Match Summary: a day's junior results (the multi-result layout). */
export function skeletonDayResultsTemplate(look: PackLook, count: number): PackCardTemplate {
  return skeletonDayCard(look, "results", count);
}

// ---------------------------------------------------------------------------
// Carousel content variant (input.carouselContent): a clone of the pack's
// ordinary template with contained logos and, for matchDay, an optional photo.
// ---------------------------------------------------------------------------

/** Circle / rounded logo slots become contained rectangles (never cover-cropped). */
export function containLogoSlots(html: string): string {
  return html
    .replace(
      /border-radius:50%;overflow:hidden([^"]*)">(<div data-slot="[^"]*" data-slot-type="logo")/g,
      'border-radius:.6cqmin;overflow:hidden$1">$2',
    )
    .replace(
      /(<div data-slot="[^"]*" data-slot-type="logo") data-shape="(?:circle|rounded)"((?: data-radius="[^"]*")?)/g,
      '$1 data-shape="rect" data-fit="contain"',
    );
}

const PHOTO_BACKDROP =
  `<div data-carousel-photo="1" data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}` +
  `<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.72),rgba(0,0,0,.58) 40%,rgba(0,0,0,.76))"></div></div>`;
const CONTENT_MARK = `<div style="position:relative;height:100%;box-sizing:border-box;padding:6cqmin`;

function withBackdrop(html: string): string {
  if (html.includes('data-carousel-photo="1"')) return html;
  const i = html.indexOf(CONTENT_MARK);
  return i < 0 ? html : html.slice(0, i) + PHOTO_BACKDROP + html.slice(i);
}

export function carouselContentTemplate(
  t: PackCardTemplate,
  opts: { photo?: boolean } = {},
): PackCardTemplate {
  const map = (f: (h: string) => string) =>
    Object.fromEntries(
      Object.entries(t.formats as unknown as Record<string, string>).map(([k, v]) => [
        k,
        typeof v === "string" ? f(v) : v,
      ]),
    ) as unknown as PackCardTemplate["formats"];
  const photo = !!opts.photo && !t.fields.some((f) => f.key === "photo");
  return {
    ...t,
    fields: photo ? [...t.fields, photoField("photo", "Photo", "Club photo")] : t.fields,
    formats: map((h) => (opts.photo ? withBackdrop(containLogoSlots(h)) : containLogoSlots(h))),
  };
}
