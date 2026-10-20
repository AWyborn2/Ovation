import type { PackCardTemplate } from "../types";
import { clubHeaderFields, slot, textField } from "../shared";
import { ckCard, ckFormats, isTall, type CkFormat } from "./card";
import { C, CK_COND, CK_MONO, CK_SANS, cq, display, eyebrow } from "./parts";

/**
 * Junior day slides (ADR-010 P3): the junior matches of one day on one
 * on-demand carousel slide, as compact rows under the day's heading. Private
 * variants of matchDay (multi-fixture) and matchSummary (multi-result); not
 * gallery designs. The rows a slide holds per size are the layout contract's
 * (`content-layouts.ts`), which `groupSlides` splits a day at.
 *
 * Every name box follows the shared name-fit rule (`data-fit` +
 * `data-fit-row`): shrink, then two lines, then "…".
 */

/**
 * Characters a row's name box holds at full size, per format: measured in the
 * browser at each format's capacity (crest showing), less a margin for
 * fallback fonts.
 */
export function dayRowFit(f: CkFormat): number {
  return f === "story" ? 34 : f === "square" ? 44 : 40;
}

/** Two columns on landscape, so a wide card still fits a day of games. */
const columns = (f: CkFormat, n: number) => (f === "landscape" && n > 3 ? 2 : 1);

/** Row type scale: rows shrink a little as the day fills up. */
function rowScale(f: CkFormat, n: number): number {
  const rowsPerColumn = Math.ceil(n / columns(f, n));
  const roomy = f === "story" ? 7 : f === "portrait" ? 5 : 3;
  return rowsPerColumn <= roomy ? 1 : Math.max(0.78, roomy / rowsPerColumn + 0.12);
}

function rows(f: CkFormat, n: number, row: (i: number, s: (v: number) => string) => string) {
  const k = rowScale(f, n) * (f === "story" ? 1.15 : 1);
  const s = (v: number) => `${+(v * k).toFixed(2)}cqmin`;
  return (
    `<div data-day-rows="${n}" style="display:grid;grid-template-columns:repeat(${columns(f, n)},minmax(0,1fr));gap:${s(1)};width:100%;margin-top:${s(2)}">` +
    Array.from({ length: n }, (_, i) => row(i, s)).join("") +
    `</div>`
  );
}

const crest = (i: number, s: (v: number) => string) =>
  `<div data-drop-if-empty="day${i}.crest" style="flex:none;width:${s(6)};height:${s(6)};display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden">${slot(`day${i}.crest`, "logo", "rect")}</div>`;

const name = (key: string, fit: number, size: string, color: string) =>
  `<div data-fit="${fit}" data-fit-row style="font-family:${CK_COND};font-weight:800;font-size:calc(${size} * var(--fit,1));line-height:1.02;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${color}">${key}</div>`;

function dayCard(f: CkFormat, chip: string, title: string, body: string): string {
  const tall = isTall(f);
  return ckCard({
    format: f,
    chip,
    wide: true,
    centerBody: true,
    body:
      `<div style="display:flex;flex-direction:column;align-items:flex-start;width:100%;min-width:0">` +
      eyebrow(cq, title) +
      display(cq, "{{dayHeading}}", tall ? 10 : 8, ";margin-top:.6cqmin") +
      body +
      `</div>`,
    footer: { hashtag: "clubHashtag", sponsors: "logos", off: true },
  });
}

const fixtureKeys = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    ["grade", "opposition", "meta", "time"].map((k) => `day${i}.${k}`),
  ).flat();

const resultKeys = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    ["grade", "opposition", "result", "word", "clubScore", "oppScore"].map((k) => `day${i}.${k}`),
  ).flat();

/** Match Day: a day's junior fixtures — start time, team, "v opposition", ground. */
export function dayFixturesTemplate(count: number): PackCardTemplate {
  const n = Math.max(1, count);
  return {
    kind: "matchDay",
    designKey: `junior-day-${n}`,
    name: "Junior match day",
    sponsorVariants: ["off", "on"],
    fields: [
      ...clubHeaderFields(),
      ...["clubMonogram", "clubHashtag", "sponsorPresentedBy", "dayHeading", ...fixtureKeys(n)].map(
        (k) => textField(k, k, ""),
      ),
      ...Array.from({ length: n }, (_, i) => ({
        key: `day${i}.crest`,
        label: "Opposition logo",
        type: "logo" as const,
        sample: "",
      })),
    ],
    formats: ckFormats((f) =>
      dayCard(
        f,
        "MATCH DAY",
        "JUNIOR MATCH DAY",
        rows(
          f,
          n,
          (i, s) =>
            `<div data-day-row="${i}" style="display:flex;align-items:center;gap:${s(1.6)};min-width:0;padding:${s(1)} ${s(1.4)};background:${C.panel};border-left:${s(0.6)} solid ${C.p}">` +
            `<div style="flex:none;min-width:${s(11)};font-family:${CK_COND};font-weight:900;font-size:${s(3.4)};line-height:1;color:${C.pt}">{{day${i}.time}}</div>` +
            `<div style="flex:1;min-width:0">` +
            `<div style="font-family:${CK_MONO};font-size:${s(1.4)};letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk2}">{{day${i}.grade}}</div>` +
            name(`v {{day${i}.opposition}}`, dayRowFit(f), s(3), C.chalk) +
            `<div style="font-family:${CK_SANS};font-size:${s(1.6)};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk2}">{{day${i}.meta}}</div>` +
            `</div>` +
            crest(i, s) +
            `</div>`,
        ),
      ),
    ),
  };
}

/** Results / Match Summary: a day's junior results — outcome, team, opposition, both scores. */
export function dayResultsTemplate(count: number): PackCardTemplate {
  const n = Math.max(1, count);
  return {
    kind: "matchSummary",
    designKey: `junior-results-day-${n}`,
    name: "Junior results day",
    sponsorVariants: ["off", "on"],
    fields: [
      ...clubHeaderFields(),
      ...["clubMonogram", "clubHashtag", "sponsorPresentedBy", "dayHeading", ...resultKeys(n)].map(
        (k) => textField(k, k, ""),
      ),
      ...Array.from({ length: n }, (_, i) => ({
        key: `day${i}.crest`,
        label: "Opposition logo",
        type: "logo" as const,
        sample: "",
      })),
    ],
    formats: ckFormats((f) =>
      dayCard(
        f,
        "RESULTS",
        "JUNIOR RESULTS",
        rows(
          f,
          n,
          (i, s) =>
            `<div data-day-row="${i}" style="display:flex;align-items:center;gap:${s(1.6)};min-width:0;padding:${s(1)} ${s(1.4)};background:${C.panel};border-left:${s(0.6)} solid ${C.p}">` +
            `<div style="flex:1;min-width:0">` +
            `<div style="display:flex;align-items:baseline;gap:${s(1.2)};min-width:0"><span style="flex:none;font-family:${CK_COND};font-weight:900;font-size:${s(2.2)};line-height:1;padding:${s(0.3)} ${s(0.8)};background:${C.p};color:${C.onp}">{{day${i}.word}}</span>` +
            `<span style="min-width:0;font-family:${CK_MONO};font-size:${s(1.4)};letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk2}">{{day${i}.grade}}</span></div>` +
            name(`v {{day${i}.opposition}}`, dayRowFit(f), s(3), C.chalk) +
            `<div style="font-family:${CK_SANS};font-size:${s(1.6)};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk2}">{{day${i}.result}}</div>` +
            `</div>` +
            `<div style="flex:none;text-align:right;font-family:${CK_COND};font-weight:900;line-height:1"><div style="font-size:${s(3.4)};color:${C.pt}">{{day${i}.clubScore}}</div>` +
            `<div style="font-size:${s(2.4)};margin-top:${s(0.4)};color:${C.chalk2}">{{day${i}.oppScore}}</div></div>` +
            crest(i, s) +
            `</div>`,
        ),
      ),
    ),
  };
}
