import type { PackCardTemplate } from "../types";
import { SK_COND, SK_MONO } from "../shared";
import {
  ACC,
  LINE,
  MUTED,
  bdCard,
  bdChip,
  bdDisplay,
  bdEyebrow,
  bdFooterLogos,
  bdFormats,
  bdSplit,
  clubHeaderFields,
  logoField,
  slot,
  textField,
  type BdFormat,
} from "./fragments";

// A2 — Match Day. The handoff's "MATCH DAY" title with the round line, then
// the fixture: both sides with logos and home/away tags, ground/date/start,
// and the club's note. Landscape sets the title beside the fixture.

function side(logoKey: string, name: string, tag: string, accent: boolean): string {
  return (
    `<div style="display:flex;align-items:center;gap:2.4cqmin;padding:1.4cqmin 0;border-bottom:.2cqmin solid ${LINE}">` +
    `<div style="width:8cqmin;height:8cqmin;flex:none;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.08)">${slot(logoKey, "logo", "circle")}</div>` +
    `<div style="flex:1;min-width:0;font-family:${SK_COND};font-weight:800;font-size:5cqmin;line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>` +
    `<div style="flex:none;font-family:${SK_COND};font-weight:800;font-size:2.4cqmin;letter-spacing:.1em;padding:.6cqmin 1.4cqmin;border-radius:.6cqmin;${accent ? `background:${ACC};color:var(--accent-ink,#10151B)` : `border:.2cqmin solid ${LINE};color:${MUTED}`}">${tag}</div>` +
    `</div>`
  );
}

function info(label: string, value: string): string {
  return `<div style="min-width:0"><div style="font-family:${SK_MONO};font-weight:600;font-size:1.8cqmin;letter-spacing:.18em;color:${MUTED}">${label}</div><div style="font-weight:700;font-size:3.2cqmin;line-height:1.2;margin-top:.6cqmin">${value}</div></div>`;
}

function build(fmt: BdFormat): string {
  const head =
    bdDisplay("MATCH<br>DAY", fmt === "landscape" ? 18 : 16, ";line-height:.84;margin-top:0") +
    bdEyebrow("{{roundLabel}}", ACC, ";margin-top:2cqmin");
  const fixture =
    `<div style="border-top:.2cqmin solid ${LINE}">` +
    side("clubLogo", "{{clubName}}", "{{homeAway}}", true) +
    side("opposition.logo", "{{opposition.name}}", "{{oppositionHomeAway}}", false) +
    `</div>` +
    `<div style="display:flex;gap:5cqmin;margin-top:2.6cqmin">${info("GROUND", "{{venue}}")}${info("DATE", "{{date}}")}${info("START", "{{startTime}}")}</div>` +
    `<div style="margin-top:2.6cqmin;padding:1.8cqmin 2.4cqmin;border-left:.8cqmin solid ${ACC};background:rgba(255,255,255,.05);border-radius:0 1cqmin 1cqmin 0">` +
    `<div style="font-family:${SK_MONO};font-weight:600;font-size:2cqmin;letter-spacing:.16em;color:${ACC}">{{note.title}}</div>` +
    `<div style="font-size:2.8cqmin;line-height:1.35;margin-top:.6cqmin;color:rgba(242,245,248,.85)">{{note.body}}</div>` +
    `</div>`;
  return bdCard({
    chip: bdChip("MATCH DAY"),
    body: bdSplit(fmt, head, fixture),
    footer: bdFooterLogos(),
  });
}

export const matchDay: PackCardTemplate = {
  kind: "matchDay",
  designKey: "match-day",
  name: "Match Day",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("roundLabel", "Round label", "THIS SATURDAY · ROUND 3"),
    textField("opposition.name", "Opposition name", "MARINERS"),
    logoField("opposition.logo", "Opposition logo", "Opponent logo"),
    textField("homeAway", "Club home/away label", "HOME"),
    textField("oppositionHomeAway", "Opposition home/away label", "AWAY"),
    textField("venue", "Ground", "Rushton Park"),
    textField("date", "Date", "Sat 8 Nov"),
    textField("startTime", "Start time", "12:30 PM"),
    textField("note.title", "Note title", "BAR & KITCHEN OPEN"),
    textField("note.body", "Note body", "Get down early and get behind the boys."),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: bdFormats(build),
};
