import { describe, expect, it } from "vitest";
import { cardNameKey, type CardNames } from "@workspace/scorecard/card-names";
import { applyPackData, bindInput } from "./bind";
import { renderPackCard, PACK_DEFAULT_TOKENS } from "../pack-render";
import { listPackManifests } from "../pack-templates/registry";
import type { ShareCardInput } from "../share-card";

/**
 * ADR-010 P1: every team name and competition label a card binds resolves the
 * same way — the club's own short name (`CardNames`, from the settings bundle
 * or the draft's render data), else the automatic short name, else the raw
 * name — and a crest the input lacks comes from the same map.
 */

const NAMES: CardNames = {
  teams: {
    [cardNameKey("SJ Blues Senior Women")]: "SJ Blues",
    [cardNameKey("MCC Senior Men A Grade")]: "Mandurah",
    [cardNameKey("Halls Head Cricket Club")]: "Hawks",
  },
  crests: { [cardNameKey("MCC Senior Men A Grade")]: "https://img.test/mcc.png" },
  competitions: { [cardNameKey("Female A Grade")]: "Women's A" },
};

const ladder: ShareCardInput = {
  kind: "ladder",
  competitionName: "Female A Grade",
  gradeLabel: "Female A Grade",
  asOfLabel: "AFTER ROUND 8",
  rows: [
    {
      pos: 1,
      team: "Halls Head T20 Female A Grade",
      played: 8,
      won: 7,
      lost: 1,
      points: 42,
      isClub: true,
    },
    { pos: 2, team: "SJ Blues Senior Women", played: 8, won: 6, lost: 2, points: 38 },
    {
      pos: 3,
      team: "White Knights Baldivis Female A Grade",
      played: 8,
      won: 5,
      lost: 3,
      points: 33,
    },
  ],
};

describe("bindInput with the club's names", () => {
  it("ladder rows: the club's name, else the automatic short name", () => {
    const rows = bindInput(ladder, null, NAMES).rows.rows!.map((r) => r.values.team);
    expect(rows).toEqual(["Halls Head", "SJ Blues", "White Knights Baldivis"]);
  });

  it("competition labels take the club's label", () => {
    const { values } = bindInput(ladder, null, NAMES);
    expect(values.competitionName).toBe("Women's A");
    expect(values.gradeLabel).toBe("Women's A");
  });

  it("without a names map every name is the automatic short name", () => {
    const { values, rows } = bindInput(ladder, null, null);
    expect(rows.rows!.map((r) => r.values.team)).toEqual([
      "Halls Head",
      "SJ Blues",
      "White Knights Baldivis",
    ]);
    expect(values.competitionName).toBe("Female A Grade");
  });

  it("match day: short opposition name, crest from the map, and a monogram", () => {
    const input: Extract<ShareCardInput, { kind: "matchDay" }> = {
      kind: "matchDay",
      roundLabel: "ROUND 8",
      grade: "A Grade",
      oppositionName: "MCC Senior Men A Grade",
      homeAway: "HOME",
      venue: "Sample Oval",
      date: "SAT 14 DEC",
      startTime: "12:00 PM",
    };
    const bound = bindInput(input, null, NAMES);
    expect(bound.values["opposition.name"]).toBe("Mandurah");
    expect(bound.values["opposition.monogram"]).toBe("MA");
    expect(bound.images["opposition.logo"]).toBe("https://img.test/mcc.png");
    // The input's own logo wins over the map.
    const own = bindInput({ ...input, oppositionLogoUrl: "https://img.test/own.png" }, null, NAMES);
    expect(own.images["opposition.logo"]).toBe("https://img.test/own.png");
  });

  it("match summary: names, crests and the name-only score bar use the resolved name", () => {
    const input = {
      kind: "matchSummary",
      matchTitle: "A Grade • Round 8",
      result: "Halls Head won by 4 wickets",
      resultWinner: "club",
      club: { name: "Halls Head Cricket Club", logoUrl: null },
      opposition: { name: "SJ Blues Senior Women", logoUrl: null },
      innings: [],
    } as unknown as ShareCardInput;
    const { values, images } = bindInput(input, null, NAMES);
    expect(values["club.name"]).toBe("Hawks");
    expect(values["opposition.name"]).toBe("SJ Blues");
    expect(values["opposition.barName"]).toBe("SJ Blues");
    expect(values["opposition.logoDisplay"]).toBe("none");
    expect(images["opposition.logo"]).toBeUndefined();
  });

  it("results rows resolve both sides", () => {
    const input: ShareCardInput = {
      kind: "resultsSummary",
      dateLabel: "SAT",
      roundLabel: "ROUND 1",
      results: [
        {
          grade: "Female A Grade",
          clubName: "Halls Head Cricket Club",
          clubScore: "120",
          oppName: "SJ Blues Senior Women",
          oppScore: "119",
          outcome: "won",
        },
      ],
    };
    const row = bindInput(input, null, NAMES).rows.results![0]!.values;
    expect([row.grade, row.clubName, row.oppName]).toEqual(["Women's A", "Hawks", "SJ Blues"]);
  });

  it("the header club name resolves through the map too", () => {
    const bound = bindInput(ladder, null, NAMES);
    applyPackData(bound, { brand: { name: "Halls Head Cricket Club" }, names: NAMES }, "ladder");
    expect(bound.values.clubName).toBe("Hawks");
  });
});

/**
 * One name-fit rule for every pack: each box that holds a team name on its own
 * (a ladder row, a fixture row, a result side, a score bar) is marked
 * `data-fit`, so it shrinks, then wraps to two lines, then ends in "…". A box
 * is one whose content is the name alone and which clips or wraps it (its style
 * sets `overflow`). Names inside a sentence ("Round 8 · vs {{opponent}}") and
 * header tags flow with their line.
 */
const NAME_SLOT =
  /<(div|span)\b([^>]*)>(?:v |vs )?\{\{(opposition\.name|club\.name|row\.team|row\.clubName|row\.oppName|row\.opponent|inn\d\.team|opponent|oppositionName)\}\}<\/\1>/g;

describe("every pack fits its team names the same way", () => {
  for (const pack of listPackManifests()) {
    it(`${pack.name}: every team-name box is fit-marked`, () => {
      const unmarked: string[] = [];
      for (const entry of pack.designs) {
        for (const [format, html] of Object.entries(entry.template.formats)) {
          for (const m of String(html).matchAll(NAME_SLOT)) {
            const attrs = ` ${m[2]}`;
            if (!/\sstyle="[^"]*overflow/.test(attrs)) continue;
            if (!/\sdata-fit="\d+"/.test(attrs)) {
              unmarked.push(`${entry.kind}/${format}: {{${m[3]}}}`);
            }
          }
        }
      }
      expect(unmarked).toEqual([]);
    });
  }

  it("a long name in a ladder row wraps at the minimum size, never past two lines", () => {
    const long: ShareCardInput = {
      ...ladder,
      rows: [
        {
          pos: 1,
          team: "Rockingham Mandurah District Seahawks Premier Development Squad Gold",
          played: 8,
          won: 7,
          lost: 1,
          points: 42,
        },
      ],
    };
    for (const packId of ["club-kit-v1", "broadcast-dark-v1", "bold-type-v1"]) {
      const html = renderPackCard(long, "square", true, PACK_DEFAULT_TOKENS, false, null, packId);
      // fitNames consumes `data-fit` once it has sized the box.
      const cell = html.match(/<span data-fit-row style="([^"]*)">Rockingham/);
      expect(cell, packId).not.toBeNull();
      expect(cell![1], packId).toContain("--fit:0.600;");
      expect(cell![1], packId).toContain("-webkit-line-clamp:2");
    }
  });
});
