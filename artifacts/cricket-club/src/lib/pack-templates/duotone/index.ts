import type { PackManifest, PackRootVarsContext } from "../types";
import { duotoneFilterSvg, duotonePaletteFor, duotoneVars } from "../../pack-render/duotone-vars";
import { matchDay } from "./match-day";
import { matchResult } from "./match-result";
import { teamList } from "./team-list";

export const DUOTONE_PACK_ID = "duotone-v1";

/**
 * Coverage contract: the kinds this pack renders, written as literals so
 * api-server `pack-coverage-parity.test.ts` can read them from source. The
 * carousel kinds (ADR-010): Match Day, results and match summaries, team
 * lists. Other kinds are not designed in Duotone; a club choosing it gets
 * those from its default pack.
 */
export const DUOTONE_COVERAGE: ReadonlyArray<{ kind: string }> = [
  { kind: "matchDay" },
  { kind: "matchSummary" },
  { kind: "teamList" },
];

// ---------------------------------------------------------------------------
// Finish pass: markup CSS cannot express, per render
// ---------------------------------------------------------------------------

/** The smallest a one-line headline shrinks to (the brief's short forms are not built yet). */
const MIN_LINE_FIT = 0.3;
/** The smallest a two-line headline shrinks to before it may run to a third line. */
const MIN_WRAP_FIT = 0.45;

/**
 * Archivo Black-weight glyph advances at its widest (`wdth` 125), in ems, as
 * measured in the browser. Headlines are uppercase; anything else counts as
 * a capital O.
 */
const GLYPH: Record<string, number> = {
  A: 0.94,
  B: 0.92,
  C: 0.93,
  D: 0.92,
  E: 0.85,
  F: 0.8,
  G: 1,
  H: 1,
  I: 0.39,
  J: 0.75,
  K: 0.98,
  L: 0.78,
  M: 1.17,
  N: 1,
  O: 1,
  P: 0.85,
  Q: 1,
  R: 0.93,
  S: 0.87,
  T: 0.87,
  U: 0.98,
  V: 0.93,
  W: 1.22,
  X: 0.95,
  Y: 0.96,
  Z: 0.87,
  "0": 0.8,
  "1": 0.72,
  "2": 0.8,
  "3": 0.8,
  "4": 0.81,
  "5": 0.8,
  "6": 0.81,
  "7": 0.74,
  "8": 0.82,
  "9": 0.81,
  " ": 0.28,
  "-": 0.41,
  "–": 0.61,
  "—": 1.24,
  "'": 0.31,
  "’": 0.31,
  "&": 1.05,
  ".": 0.37,
  "/": 0.3,
  "·": 0.41,
  ",": 0.37,
};

const decode = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, "_")
    .trim();

/** A headline's width in tenths of an em at full size. */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of decode(text).toUpperCase()) w += GLYPH[ch] ?? 1;
  return w * 10;
}

const withFit = (attrs: string, scale: number) =>
  /--fit:[\d.]+;/.test(attrs)
    ? attrs.replace(/--fit:[\d.]+;/, `--fit:${scale.toFixed(3)};`)
    : attrs.replace(/style="/, `style="--fit:${scale.toFixed(3)};`);

/**
 * A headline that lost its value (no round) gives way to its fallback words
 * ("MATCH DAY", "THIS WEEKEND"); one that kept it drops the fallback.
 */
function resolveFallbacks(html: string): string {
  const fallback = /<div data-dt-fallback="1"[^>]*>[^<]*<\/div>/g;
  if (html.includes('data-dt-head="1"')) return html.replace(fallback, "");
  return html.replace(/<div data-dt-fallback="1"/g, '<div data-dt-head="1"');
}

/** One-line headlines shrink to fit their line (`data-dt-line`), never wrap. */
function fitLines(html: string): string {
  return html.replace(
    /<div([^>]*?)\sdata-dt-line="(\d+)"([^>]*)>([^<]*)<\/div>/g,
    (_all, before: string, cap: string, after: string, text: string) => {
      const scale = Math.max(MIN_LINE_FIT, Math.min(1, Number(cap) / Math.max(emWidth(text), 1)));
      const attrs = `${before}${after}`;
      return `<div${scale < 1 ? withFit(attrs, scale) : attrs}>${text}</div>`;
    },
  );
}

/** Headlines that may take two lines (`data-dt-wrap`): shrink, then wrap; never cut off. */
function fitWraps(html: string): string {
  return html.replace(
    /<div([^>]*?)\sdata-dt-wrap="(\d+)"([^>]*)>([^<]*)<\/div>/g,
    (_all, before: string, cap: string, after: string, text: string) => {
      const line = Number(cap);
      const width = emWidth(text);
      const words = decode(text).split(/\s+/);
      // Two lines as even as the word breaks allow, sized by the longer one.
      let longest = width;
      for (let i = 1; i < words.length; i++)
        longest = Math.min(
          longest,
          Math.max(emWidth(words.slice(0, i).join(" ")), emWidth(words.slice(i).join(" "))),
        );
      const scale =
        width <= line
          ? 1
          : line / width >= 0.6
            ? line / width
            : Math.max(MIN_WRAP_FIT, Math.min(1, line / longest));
      const attrs = `${before}${after}`;
      return `<div${scale < 1 ? withFit(attrs, scale) : attrs}>${text}</div>`;
    },
  );
}

/** "ROUND 6": the round's number in the primary (lifted to read on the dark base). */
function colourNumbers(html: string): string {
  return html.replace(
    /(<div data-dt-head="1"[^>]*>)([^<]*?)(\d+)(<\/div>)/g,
    (_all, open: string, words: string, num: string, close: string) =>
      `${open}${words}<span style="color:var(--dt-p-on-dark,#FBAC27)">${num}</span>${close}`,
  );
}

/** Home / Away chips read in sentence case; an Away chip is outlined in ink. */
function homeAway(html: string): string {
  return html.replace(
    /<span data-dt-ha="1" style="([^"]*)">([^<]*)<\/span>/g,
    (_all, style: string, value: string) => {
      const word = value.trim();
      const label = word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "";
      const away = /^away$/i.test(word);
      const css = away
        ? style
            .replace(/background:[^;]*;/, "background:transparent;")
            .replace(/color:var\(--dt-on-p[^;]*;/, "color:var(--dt-ink,#10151B);")
            .replace(
              /border:([^;]*?) solid var\(--dt-p[^;]*\)/,
              "border:$1 solid var(--dt-ink,#10151B)",
            )
        : style;
      return `<span style="${css}">${label}</span>`;
    },
  );
}

/** Paired name boxes share the smaller of their scales, so neither is drawn bigger. */
function sharePairScale(html: string): string {
  const box = /<div([^>]*?)\sdata-dt-pair="([\w-]+)"([^>]*)>/g;
  const smallest = new Map<string, number>();
  for (const m of html.matchAll(box)) {
    const fit = /--fit:([\d.]+)/.exec(`${m[1]}${m[3]}`);
    const scale = fit ? Number(fit[1]) : 1;
    smallest.set(m[2], Math.min(smallest.get(m[2]) ?? 1, scale));
  }
  return html.replace(box, (_all, before: string, group: string, after: string) => {
    const scale = smallest.get(group) ?? 1;
    const attrs = `${before}${after}`;
    return `<div${scale < 1 ? withFit(attrs, scale) : attrs}>`;
  });
}

/** The gradient map for this card's colours, once, when a photo is showing. */
function addFilter(html: string, ctx: PackRootVarsContext): string {
  if (!html.includes('data-dt-photo="1"')) return html;
  return duotoneFilterSvg(duotonePaletteFor(ctx.tokens, ctx.brand)) + html;
}

export function finishDuotone(html: string, ctx: PackRootVarsContext): string {
  let out = resolveFallbacks(html);
  out = fitLines(out);
  out = fitWraps(out);
  out = colourNumbers(out);
  out = homeAway(out);
  out = sharePairScale(out);
  return addFilter(out, ctx);
}

/**
 * Pack G — Duotone (`duotone-v1`), the third pack of ADR-010, from the agreed
 * brief (`docs/plans/2026-10-20-new-social-pack-brief.md`). Photo-led and
 * modern: the photo full bleed and gradient-mapped to the club's colours, a
 * one-line "ROUND N" headline, a white rounded sheet with pill chips, Archivo
 * at its expanded widths. Without a photo: the club logo zoomed and offset at
 * 13% under a halftone screen and grain.
 *
 * `colourMode: "club-only"` — like Club Kit, the pack IS the club's colours.
 * The api-server `PACKS` entry declares the SAME kinds
 * (`pack-coverage-parity.test.ts`).
 */
export const DUOTONE_PACK: PackManifest = {
  packId: "duotone-v1",
  name: "Duotone",
  colourMode: "club-only",
  rootVars: ({ tokens, brand }) => duotoneVars(duotonePaletteFor(tokens, brand)),
  finish: finishDuotone,
  designs: [
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "team-list", kind: "teamList", template: teamList },
  ],
};
