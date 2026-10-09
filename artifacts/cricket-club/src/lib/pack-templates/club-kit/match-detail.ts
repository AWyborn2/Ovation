import type { PackCardTemplate } from "../types";
import { clubHeaderFields, textField } from "../shared";
import { ckCard, ckFormats, isTall } from "./card";
import { C, CK_COND, CK_MONO, CK_SANS, cq, eyebrow } from "./parts";

/**
 * Private detailed variant of matchSummary for the on-demand carousel
 * (input.carouselDetail). Not a gallery design: one panel per innings — team,
 * score, overs, top batters and top bowlers — on the shared Club Kit card.
 * Every innings is rendered (no cap); type scales down as the count grows.
 */
export function matchDetailTemplate(inningsCount: number): PackCardTemplate {
  const n = Math.max(1, inningsCount);
  const keys = ["clubHashtag", "sponsorPresentedBy", "clubMonogram", "matchTitle", "result", "resultWord"];
  for (let i = 0; i < n; i++) {
    for (const k of ["team", "label", "score", "overs", "batters", "bowlers"]) keys.push(`inn${i}.${k}`);
  }
  return {
    kind: "matchSummary",
    designKey: `match-detail-${n}`,
    name: "Match detail",
    sponsorVariants: ["off", "on"],
    fields: [...clubHeaderFields(), ...keys.map((k) => textField(k, k, ""))],
    formats: ckFormats((f) => {
      const tall = isTall(f);
      const land = f === "landscape";
      // Two columns where width allows and there are 3+ innings.
      const cols = n >= 3 && !tall ? 2 : land && n === 2 ? 2 : 1;
      const k = (tall ? (f === "story" ? 1.25 : 1.05) : 1) * (n <= 2 ? 1 : n === 3 ? (cols > 1 ? 0.85 : 0.82) : cols > 1 ? 0.8 : 0.72) * (land ? 0.82 : 1);
      const s = (v: number) => `${+(v * k).toFixed(2)}cqmin`;
      const panel = (i: number) =>
        `<div data-innings="${i}" style="box-sizing:border-box;min-width:0;padding:${s(1.3)} ${s(1.6)};background:${C.panel};border-left:${s(0.6)} solid ${C.p};display:flex;flex-direction:column;gap:${s(0.5)}">` +
        `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:${s(1.2)};min-width:0">` +
        `<div style="min-width:0;flex:1"><div style="font-family:${CK_MONO};font-size:${s(1.4)};letter-spacing:.14em;text-transform:uppercase;color:${C.chalk2}">{{inn${i}.label}}</div>` +
        `<div data-fit="14" style="font-family:${CK_COND};font-weight:800;font-size:calc(${s(3.4)} * var(--fit,1));line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{inn${i}.team}}</div></div>` +
        `<div style="flex:none;text-align:right"><div style="font-family:${CK_COND};font-weight:900;font-size:${s(5)};line-height:.9;color:${C.pt}">{{inn${i}.score}}</div>` +
        `<div style="font-family:${CK_MONO};font-size:${s(1.3)};letter-spacing:.12em;color:${C.chalk2}">{{inn${i}.overs}}</div></div></div>` +
        `<div style="font-family:${CK_SANS};font-weight:600;font-size:${s(1.8)};line-height:1.3;color:${C.chalk};overflow-wrap:anywhere"><span style="font-family:${CK_MONO};font-size:${s(1.3)};letter-spacing:.12em;color:${C.chalk2}">BAT </span>{{inn${i}.batters}}</div>` +
        `<div style="font-family:${CK_SANS};font-weight:600;font-size:${s(1.8)};line-height:1.3;color:${C.chalk};overflow-wrap:anywhere"><span style="font-family:${CK_MONO};font-size:${s(1.3)};letter-spacing:.12em;color:${C.chalk2}">BOWL </span>{{inn${i}.bowlers}}</div>` +
        `</div>`;
      const grid =
        `<div data-match-detail-grid="${n}" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${s(1)};width:100%;margin-top:${s(1.6)}">` +
        Array.from({ length: n }, (_, i) => panel(i)).join("") +
        `</div>`;
      const body =
        `<div style="display:flex;flex-direction:column;align-items:flex-start;width:100%;min-width:0">` +
        eyebrow(cq, "{{matchTitle}}") +
        `<div style="display:flex;align-items:baseline;gap:2cqmin;width:100%;min-width:0;margin-top:.6cqmin">` +
        `<div style="flex:none;font-family:${CK_COND};font-weight:900;font-size:${s(land ? 9 : 10)};line-height:.85;text-transform:uppercase;color:${C.pt}">{{resultWord}}</div>` +
        `<div style="flex:1;min-width:0;font-family:${CK_COND};font-weight:700;font-size:${s(3)};line-height:1.05;text-transform:uppercase">{{result}}</div></div>` +
        grid +
        `</div>`;
      return ckCard({
        format: f,
        chip: "MATCH DETAIL",
        wide: true,
        backdropPhoto: "photo",
        body,
        footer: { hashtag: "clubHashtag", sponsors: "logos", off: true },
      });
    }),
  };
}
