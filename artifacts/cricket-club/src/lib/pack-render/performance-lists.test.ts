/**
 * Performance lists on the renderer (full draft editor plan, stage 4): both
 * innings' batters and bowlers as one list each, and a list's row choice
 * (whose, how many, sorted how). The server's render binds and draws through
 * the same code, so a draft posts what the editor shows.
 */
import { describe, expect, it } from "vitest";
import type { RowsPick } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { bindInput } from "./bind";

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

const team = (name: string, shortName: string) => ({
  name,
  shortName,
  primaryColor: "#333F48",
  secondaryColor: "#FBAC27",
  textColor: "#ffffff",
  logoUrl: null,
});

/** The opposition batted first; the club chased. Full lists beside the top three. */
const INPUT = {
  kind: "matchSummary",
  matchTitle: "A Grade • Round 5",
  result: "Halls Head won by 6 wickets",
  resultWinner: "club",
  club: team("Halls Head", "HHCC"),
  opposition: team("Warnbro Swans", "WSCC"),
  innings: [
    {
      teamKey: "opposition",
      inningsNum: 1,
      totalRuns: "171",
      wickets: "10",
      overs: "49.4",
      topBatters: [
        { name: "Kane Standing", runs: 88, balls: 121 },
        { name: "Lee Moss", runs: 22, balls: 40 },
      ],
      topBowlers: [
        { name: "Tom Miles", wickets: 3, runs: 18, overs: "7.4" },
        { name: "Sam Ross", wickets: 3, runs: 25, overs: "10" },
      ],
      batters: [
        { name: "Kane Standing", runs: 88, balls: 121 },
        { name: "Lee Moss", runs: 22, balls: 40 },
        { name: "Ian Grey", runs: 4, balls: 9 },
      ],
      bowlers: [
        { name: "Tom Miles", wickets: 3, runs: 18, overs: "7.4" },
        { name: "Sam Ross", wickets: 3, runs: 25, overs: "10" },
        { name: "Ben Hart", wickets: 1, runs: 40, overs: "8" },
        { name: "Joe Wood", wickets: 0, runs: 30, overs: "6" },
      ],
    },
    {
      teamKey: "club",
      inningsNum: 1,
      totalRuns: "172",
      wickets: "4",
      overs: "41.2",
      topBatters: [
        { name: "Dexter Trego", runs: 61, balls: 70, notOut: true },
        { name: "Alex Bell", runs: 61, balls: 55 },
      ],
      topBowlers: [{ name: "Ryan Smart", wickets: 4, runs: 30, overs: "10" }],
      batters: [
        { name: "Dexter Trego", runs: 61, balls: 70, notOut: true },
        { name: "Alex Bell", runs: 61, balls: 55 },
        { name: "Chris Low", runs: 30, balls: 33 },
        { name: "Dan Fry", runs: 9, balls: 12 },
      ],
      bowlers: [
        { name: "Ryan Smart", wickets: 4, runs: 30, overs: "10" },
        { name: "Josh Rudge", wickets: 1, runs: 25, overs: "8" },
      ],
    },
  ],
} as unknown as ShareCardInput;

const listDoc = (repeat: string, pick?: RowsPick): CardAdjustments =>
  ({
    formatVersion: 2,
    pages: {
      result: {
        layers: [
          {
            id: "list",
            kind: "rows",
            geometry: { square: { x: 0, y: 10, w: 100, h: 80 } },
            rows: {
              repeat,
              rowHeight: 5,
              cells: [
                { field: "name", x: 0, w: 60 },
                { field: "team", x: 60, w: 40 },
              ],
              ...(pick ? { pick } : {}),
            },
          },
        ],
      },
    },
  }) as CardAdjustments;

/** The names a rendered list draws, in order. */
function drawn(input: ShareCardInput, repeat: string, pick?: RowsPick): string[] {
  const html = renderPackCard(
    input,
    "square",
    true,
    tokens(),
    false,
    DATA,
    BLANK_PACK_ID,
    listDoc(repeat, pick),
  );
  return [...html.matchAll(/data-row-cell="name"[^>]*>([^<]*)</g)].map((m) => m[1]!);
}

describe("performance rows", () => {
  const bound = bindInput(INPUT, BLANK_PACK_ID);

  it("lists both innings' batters, each with its side and team", () => {
    const rows = bound.rows["performances.batting"]!;
    expect(rows.map((r) => r.values.name)).toEqual([
      "Kane Standing",
      "Lee Moss",
      "Ian Grey",
      "Dexter Trego",
      "Alex Bell",
      "Chris Low",
      "Dan Fry",
    ]);
    expect(rows[0]!.values).toMatchObject({ side: "opposition", team: "Warnbro Swans" });
    expect(rows[3]!.values).toMatchObject({ side: "club", team: "Halls Head", runs: "61*" });
    // A row's style can follow its side.
    expect(rows.map((r) => r.variant)).toEqual([
      "opposition",
      "opposition",
      "opposition",
      "club",
      "club",
      "club",
      "club",
    ]);
  });

  it("gives a bowler the bowling side: the club bowled in the opposition's innings", () => {
    const rows = bound.rows["performances.bowling"]!;
    expect(rows.slice(0, 4).every((r) => r.values.side === "club")).toBe(true);
    expect(rows[0]!.values).toMatchObject({ name: "Tom Miles", team: "Halls Head" });
    expect(rows[4]!.values).toMatchObject({
      name: "Ryan Smart",
      side: "opposition",
      figures: "4/30",
    });
  });

  it("falls back to an older input's top three", () => {
    const older = {
      ...INPUT,
      innings: (INPUT as { innings: Array<Record<string, unknown>> }).innings.map(
        ({ batters: _b, bowlers: _w, ...i }) => i,
      ),
    } as unknown as ShareCardInput;
    const rows = bindInput(older, BLANK_PACK_ID).rows["performances.batting"]!;
    expect(rows.map((r) => r.values.name)).toEqual([
      "Kane Standing",
      "Lee Moss",
      "Dexter Trego",
      "Alex Bell",
    ]);
  });

  it("leaves the innings lists at the top three", () => {
    expect(bound.rows["innings2.batting"]!.map((r) => r.values.name)).toEqual([
      "Dexter Trego",
      "Alex Bell",
    ]);
  });
});

describe("a list's row choice on the card", () => {
  it("draws the club's top three without a choice (D4), never the opposition's", () => {
    expect(drawn(INPUT, "performances.batting")).toEqual([
      "Alex Bell", // 61 off 55 beats 61 off 70
      "Dexter Trego",
      "Chris Low",
    ]);
    expect(drawn(INPUT, "performances.bowling")).toEqual(["Tom Miles", "Sam Ross", "Ben Hart"]);
  });

  it("draws the opposition's, or both sides, when set to", () => {
    expect(drawn(INPUT, "performances.batting", { side: "opposition", count: 0 })).toEqual([
      "Kane Standing",
      "Lee Moss",
      "Ian Grey",
    ]);
    expect(
      drawn(INPUT, "performances.bowling", { side: "both", count: 2, sort: "wickets" }),
    ).toEqual(["Ryan Smart", "Tom Miles"]);
  });

  it("draws only the best, or every row", () => {
    expect(drawn(INPUT, "performances.batting", { side: "both", count: 1, sort: "runs" })).toEqual([
      "Kane Standing",
    ]);
    // Every club batter, in the order bound (no sort).
    expect(drawn(INPUT, "performances.batting", { side: "club", count: 0 })).toEqual([
      "Dexter Trego",
      "Alex Bell",
      "Chris Low",
      "Dan Fry",
    ]);
  });

  it("applies how many and sort to an innings list", () => {
    expect(drawn(INPUT, "innings2.batting")).toEqual(["Dexter Trego", "Alex Bell"]);
    expect(drawn(INPUT, "innings2.batting", { count: 1, sort: "runs" })).toEqual(["Alex Bell"]);
  });

  it("draws nothing when the side chosen has no rows", () => {
    const clubOnly = {
      ...INPUT,
      junior: true,
      innings: (INPUT as { innings: Array<Record<string, unknown>> }).innings.map((i) =>
        i.teamKey === "club"
          ? { ...i, topBowlers: [], bowlers: [] }
          : { ...i, topBatters: [], batters: [] },
      ),
    } as unknown as ShareCardInput;
    // A junior card's input names only the club's players, whatever the list is set to.
    expect(drawn(clubOnly, "performances.batting", { side: "opposition" })).toEqual([]);
    expect(drawn(clubOnly, "performances.batting", { side: "both", count: 0 })).toEqual([
      "Dexter Trego",
      "Alex Bell",
      "Chris Low",
      "Dan Fry",
    ]);
  });
});
