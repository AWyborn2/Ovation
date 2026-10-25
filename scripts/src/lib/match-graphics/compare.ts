/**
 * Side-by-side fidelity shots (plan 2026-10-23, "Fit and fidelity"): a look
 * drawn by the design system itself, and its converted template drawn by the
 * web app's renderer from the same match, in the same club colours.
 *
 * The match is the design system's sample (Halls Head beat Warnbro Swans);
 * the club is Halls Head, with its brand colours, and both sides' logos are
 * the design's dashed LOGO placeholder.
 */
import type { Page } from "puppeteer-core";
import type { CaptureRender } from "@workspace/scorecard/pack-capture";
import { callHarness } from "../harness-browser";
import { pixelMatch } from "../../convert-pack";
import { CARD, mount, nameHelper, type CardFormat } from "./capture";
import type { MatchLook } from "./looks";
import { renderComponent, type OvationMatch } from "./source";

/** The design's preview placeholder logo. */
export const LOGO =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='46' fill='%23d9dbde' stroke='%238b8d90' stroke-width='4' stroke-dasharray='8 6'/%3E%3Ctext x='50' y='57' text-anchor='middle' font-family='Arial' font-weight='700' font-size='20' fill='%236b6e72'%3ELOGO%3C/text%3E%3C/svg%3E";

type SampleTeam = { name: string; short: string };
type SampleInnings = {
  team: string;
  overs: string;
  runs: number;
  wickets: number;
  batting: Array<{ name: string; runs: number; balls?: number; notOut?: boolean }>;
  bowling: Array<{ name: string; wickets: number; runs: number; overs: string }>;
};
type SampleMatch = {
  home: string;
  venue: string;
  date: string;
  grade: string;
  result: string;
  winner: string;
  innings: SampleInnings[];
};

/** The design's sample match as a Match Summary card input, Halls Head the club. */
export function sampleRender(ds: OvationMatch): CaptureRender {
  const match = ds.SAMPLE_MATCH as SampleMatch;
  const teams = ds.SAMPLE_TEAMS as Record<string, SampleTeam>;
  const club = "HHCC";
  const side = (id: string) =>
    id === club
      ? {
          name: teams[id]!.name,
          shortName: teams[id]!.short,
          primaryColor: "#333F48",
          secondaryColor: "#FBAC27",
          textColor: "#FBAC27",
          logoUrl: LOGO,
        }
      : {
          name: teams[id]!.name,
          shortName: teams[id]!.short,
          primaryColor: "#FEF203",
          secondaryColor: "#560560",
          textColor: "#ffffff",
          logoUrl: LOGO,
        };
  const opp = match.innings.map((i) => i.team).find((t) => t !== club)!;
  return {
    input: {
      kind: "matchSummary",
      matchTitle: `${match.grade} • Round 5`,
      venue: match.venue,
      date: match.date,
      result: match.result,
      resultWinner: match.winner === club ? "club" : "opposition",
      club: side(club),
      opposition: side(opp),
      innings: match.innings.map((inn) => ({
        teamKey: inn.team === club ? "club" : "opposition",
        inningsNum: 1,
        totalRuns: String(inn.runs),
        wickets: String(inn.wickets),
        overs: inn.overs,
        topBatters: inn.batting.map((b) => ({ ...b, balls: b.balls ?? null })),
        topBowlers: inn.bowling,
      })),
      namesResolved: true,
    },
    data: {
      brand: {
        name: "Halls Head",
        logoUrl: LOGO,
        primaryColour: "#FBAC27",
        backgroundColour: "#333F48",
      },
    },
    sponsorsOn: false,
    junior: false,
    markFields: false,
    detail: "full",
  };
}

/** The design system's own render of the sample, on the capture page. */
export async function designShot(
  page: Page,
  ds: OvationMatch,
  look: MatchLook,
  format: CardFormat,
): Promise<string> {
  const teams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ds.SAMPLE_TEAMS))
    teams[k] = { ...(v as object), logo: LOGO, logoOnDark: LOGO };
  const competition = { ...(ds.SAMPLE_COMPETITION as object), logo: LOGO };
  await mount(
    page,
    renderComponent(ds, look.component, {
      ...look.props,
      teams,
      competition,
      background: null,
      format,
    }),
    format,
  );
  const el = await page.$("#card");
  return (await el!.screenshot({ encoding: "base64" })) as string;
}

/** The converted template drawn by the web app's renderer from the same match. */
export async function templateShot(
  page: Page,
  render: CaptureRender,
  document: unknown,
  format: CardFormat,
): Promise<{ png: string; warnings: string[] }> {
  const { warnings } = await callHarness<{ warnings: string[] }>(
    page,
    "mount",
    "club-kit-v1",
    render,
    format,
    { document, page: "result" },
  );
  const png = (await (await page.$("#pack-capture-root"))!.screenshot({
    encoding: "base64",
  })) as string;
  return { png, warnings };
}

/** The two shots side by side, labelled, as one PNG. */
export async function sideBySide(
  page: Page,
  format: CardFormat,
  design: string,
  template: string,
  label: string,
): Promise<{ png: Buffer; match: number }> {
  const { w, h } = CARD[format];
  await nameHelper(page);
  const match = await pixelMatch(page, design, template);
  await page.setViewport({ width: w * 2 + 30, height: h + 50 });
  await page.setContent(
    `<html><body style="margin:0;background:#202326;font:600 18px sans-serif;color:#eee">
<div style="display:flex;gap:10px;padding:10px">
<figure style="margin:0"><figcaption>Design system</figcaption><img src="data:image/png;base64,${design}" width="${w}" height="${h}"></figure>
<figure style="margin:0"><figcaption>${label} · ${(match * 100).toFixed(1)}% of pixels match</figcaption><img src="data:image/png;base64,${template}" width="${w}" height="${h}"></figure>
</div></body></html>`,
  );
  const png = (await page.screenshot({ fullPage: true })) as Buffer;
  return { png, match };
}
