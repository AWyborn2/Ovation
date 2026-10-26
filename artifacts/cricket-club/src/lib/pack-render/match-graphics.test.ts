/**
 * Ovation Match Graphics on the renderer (plan 2026-10-23): the Match
 * Summary's match graphics content (M9), the `match` palette (M5–M7) and the
 * italic and width text styles (M10).
 */
import { describe, expect, it } from "vitest";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { matchColours } from "@workspace/scorecard/match-palette";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { bindInput, initialNameOf, surnameOf } from "./bind";
import { cardMatchColours } from "./match-vars";

const DATA: PackCardData = {
  brand: {
    name: "Halls Head Cricket Club",
    logoUrl: "https://cdn.example.org/hh.png",
    primaryColour: "#FBAC27",
    backgroundColour: "#333F48",
  },
};

const tokens = () =>
  resolveCardTokens({ theme: null, junior: false, data: DATA, packId: BLANK_PACK_ID });

const INPUT = {
  kind: "matchSummary",
  matchTitle: "A Grade • Round 5",
  venue: "Peelwood Reserve",
  date: "18 Oct 2026",
  result: "Halls Head won by 6 wickets",
  resultWinner: "club",
  club: {
    name: "Halls Head",
    shortName: "HHCC",
    primaryColor: "#333F48",
    secondaryColor: "#FBAC27",
    textColor: "#FBAC27",
    logoUrl: "https://cdn.example.org/hh.png",
  },
  opposition: {
    name: "Warnbro Swans",
    shortName: "WSCC",
    primaryColor: "#FEF203",
    secondaryColor: "#560560",
    textColor: "#ffffff",
    logoUrl: "https://cdn.example.org/ws.png",
  },
  innings: [
    {
      teamKey: "opposition",
      inningsNum: 1,
      totalRuns: "171",
      wickets: "10",
      overs: "49.4",
      topBatters: [
        { name: "Kane Standing", runs: 53, balls: 121 },
        { name: "********", runs: 22, balls: 40, notOut: true },
      ],
      topBowlers: [{ name: "Tom Miles", wickets: 3, runs: 18, overs: "7.4" }],
    },
    {
      teamKey: "club",
      inningsNum: 1,
      totalRuns: "172",
      wickets: "4",
      overs: "41.2",
      topBatters: [{ name: "Dexter Trego", runs: 61, balls: 70, notOut: true }],
      topBowlers: [
        { name: "Ryan Smart", wickets: 2, runs: 30, overs: "10" },
        { name: "Josh Rudge", wickets: 1, runs: 25, overs: "8" },
      ],
    },
  ],
} as unknown as ShareCardInput;

describe("match graphics content (M9)", () => {
  const bound = bindInput(INPUT, BLANK_PACK_ID);

  it("binds the innings in batting order, with both score forms", () => {
    expect(bound.values["innings1.team"]).toBe("Warnbro Swans");
    expect(bound.values["innings1.short"]).toBe("WSCC");
    expect(bound.values["innings1.score"]).toBe("10/171");
    expect(bound.values["innings1.scoreDash"]).toBe("10-171");
    expect(bound.values["innings1.overs"]).toBe("49.4");
    expect(bound.values["innings2.team"]).toBe("Halls Head");
    expect(bound.images["innings1.logo"]).toBe("https://cdn.example.org/ws.png");
    expect(bound.images["winner.logo"]).toBe("https://cdn.example.org/hh.png");
    expect(bound.images["loser.logo"]).toBe("https://cdn.example.org/ws.png");
  });

  it("binds the venue, competition, date and winner", () => {
    expect(bound.values.venue).toBe("Peelwood Reserve");
    expect(bound.values.competition).toBe("A Grade");
    expect(bound.values.date).toBe("18 Oct 2026");
    expect(bound.values["winner.name"]).toBe("Halls Head");
    expect(bound.values["club.short"]).toBe("HHCC");
  });

  it("binds batting, bowling and paired rows, keeping a hidden name hidden", () => {
    expect(bound.rows["innings1.batting"]!.map((r) => r.values)).toEqual([
      {
        name: "Kane Standing",
        initialName: "K Standing",
        initialDotName: "K.Standing",
        surname: "Standing",
        runs: "53",
        runsOnly: "53",
        notOut: "",
        balls: "121",
      },
      {
        name: "********",
        initialName: "********",
        initialDotName: "********",
        surname: "********",
        runs: "22*",
        runsOnly: "22",
        notOut: "*",
        balls: "40",
      },
    ]);
    expect(bound.rows["innings1.bowling"]![0]!.values).toMatchObject({
      figures: "3/18",
      figuresDash: "3-18",
      overs: "7.4",
    });
    const pairs = bound.rows["innings2.pairs"]!.map((r) => r.values);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({ batSurname: "Trego", batRuns: "61*", bowlSurname: "Smart" });
    expect(pairs[1]).toMatchObject({ bowlName: "Josh Rudge", bowlFigures: "1/25" });
    expect(pairs[1]!.batName).toBeUndefined();
  });

  it("shortens names the way the looks do", () => {
    expect(surnameOf("Kane Michael Standing")).toBe("Michael Standing");
    expect(initialNameOf("Kane Standing", ".")).toBe("K.Standing");
    expect(surnameOf("Madonna")).toBe("Madonna");
  });
});

describe("the match palette (M5–M7)", () => {
  it("puts the club in its brand colours and the opposition in the input's", () => {
    expect(cardMatchColours(INPUT, tokens(), DATA.brand)).toEqual(
      matchColours({
        club: { identity: "#FBAC27", base: "#333F48" },
        opposition: { identity: "#560560", base: "#FEF203" },
        firstInnings: "opposition",
        winner: "club",
        competition: { colour: "#333F48", accent: "#FBAC27" },
      }),
    );
  });

  it("emits the tokens a document names on the card", () => {
    const layer: TemplateLayerV2 = {
      id: "bar",
      kind: "shape",
      geometry: { square: { x: 0, y: 0, w: 50, h: 10 } },
      style: {
        fill: "var(--mt-win-colour)",
        border: { width: 0.2, color: "var(--mt-i1-dark-d32)" },
      },
    };
    const doc = { formatVersion: 2, pages: { result: { layers: [layer] } } } as CardAdjustments;
    const html = renderPackCard(INPUT, "square", true, tokens(), false, DATA, BLANK_PACK_ID, doc);
    expect(html).toContain("--mt-win-colour:#fbac27");
    expect(html).toMatch(/--mt-i1-dark-d32:#[0-9a-f]{6}/);
    expect(html).not.toContain("--mt-lose-colour");
  });
});

describe("italic and width (M10)", () => {
  it("sets text and row cells in italic at their width", () => {
    const doc = {
      formatVersion: 2,
      pages: {
        result: {
          layers: [
            {
              id: "t",
              kind: "text",
              content: "MATCH SUMMARY",
              geometry: { square: { x: 0, y: 0, w: 50, h: 10 } },
              style: { fontFamily: "Archivo", stretch: 125 },
            },
            {
              id: "r",
              kind: "rows",
              geometry: { square: { x: 0, y: 20, w: 50, h: 30 } },
              rows: {
                repeat: "innings1.batting",
                rowHeight: 5,
                cells: [
                  {
                    field: "initialDotName",
                    x: 0,
                    w: 70,
                    style: {
                      italic: true,
                      textShadow: [{ x: 0, y: 0, blur: 0.6, color: "#ffffff4d" }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    } as CardAdjustments;
    const html = renderPackCard(INPUT, "square", true, tokens(), false, DATA, BLANK_PACK_ID, doc);
    expect(html).toContain("font-stretch:125%");
    expect(html).toMatch(/font-style:italic[^>]*>K\.Standing</);
    expect(html).toMatch(/text-shadow:[^>]*#ffffff4d[^>]*>K\.Standing</);
  });
});
