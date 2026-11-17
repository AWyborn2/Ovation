/**
 * Ash's New Studio checks on the committed bundles (17 Nov 2026), in both
 * studios (they draw the same templates):
 * - a team slide's club name has the header's width and the grade line sits
 *   under the TEAM LIST chip, so "HALLS HEAD CRICKET CLUB" isn't cut to "HALL…";
 * - a carousel cover's date chip reads right for a past or coming round, and
 *   "WATCH LIVE" shows only with a livestream link;
 * - a grade line never prints the grade twice.
 *
 * Reads the committed bundle files from disk (the web app never imports the
 * bundles package).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  type PageKey,
  type TemplateDocumentV2,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { substituteTextTokens } from "./adjustments";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const bundle = (look: string, kind: string) =>
  (
    JSON.parse(readFileSync(path.join(BUNDLES, look, `${kind}.json`), "utf8")) as {
      document: TemplateDocumentV2;
    }
  ).document;

type Box = { x: number; y: number; w: number; h: number };
type Layer = { id: string; kind: string; content?: string; geometry: Record<string, Box> } & {
  showWhen?: { field?: string };
  style?: { align?: string };
};
const layers = (doc: TemplateDocumentV2, page: PageKey) =>
  flattenLayers(doc.pages[page]?.layers ?? []) as unknown as Layer[];
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const DATA: PackCardData = {
  brand: {
    name: "Halls Head Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#HHCC",
};

function render(
  input: Record<string, unknown>,
  doc: TemplateDocumentV2,
  size: CardSize,
  page?: PageKey,
) {
  const tokens = resolveCardTokens({
    theme: null,
    junior: false,
    data: DATA,
    packId: BLANK_PACK_ID,
  });
  return renderPackCard(
    input as unknown as ShareCardInput,
    size,
    true,
    tokens,
    false,
    DATA,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
    { page },
  );
}

const MATCH_DAY_LOOKS = [
  "bold-type",
  "broadcast-classic",
  "broadcast-dark",
  "club-kit",
  "club-kit-classic",
  "clubhouse",
  "duotone",
  "gold-foil",
  "neon-night",
  "sunset",
];
const TEAM_HEADER_LOOKS = ["bold-type", "broadcast-dark", "gold-foil", "neon-night", "sunset"];

describe("team slide header", () => {
  for (const look of TEAM_HEADER_LOOKS) {
    it(`${look}: the club name runs to the chip and the grade line sits under it`, () => {
      const all = layers(bundle(look, "teamList"), "team");
      const text = (c: string) => all.filter((l) => l.kind === "text" && l.content === c);
      for (const name of text("{{clubName}}")) {
        for (const [size, box] of Object.entries(name.geometry)) {
          const chip = text("TEAM LIST").find((c) => c.geometry[size])!.geometry[size]!;
          expect(box.x + box.w).toBeLessThanOrEqual(chip.x);
          if (size !== "landscape") expect(box.w).toBeGreaterThan(50);
        }
      }
      for (const grade of text("{{gradeRound}}")) {
        expect(grade.style?.align).toBe("right");
        for (const [size, box] of Object.entries(grade.geometry)) {
          for (const other of [...text("{{clubName}}"), ...text("{{clubTagline}}")]) {
            const o = other.geometry[size];
            if (o) expect(overlaps(box, o), `${size} ${other.content}`).toBe(false);
          }
        }
      }
    });
  }
});

describe("carousel cover", () => {
  const title = (extra: Record<string, unknown> = {}) => ({
    kind: "matchDay",
    roundLabel: "ROUND 7",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: "FRI 13 NOV – SUN 22 NOV",
    startTime: "",
    namesResolved: true,
    carouselPage: { page: "title", title: "Match day", fixtureCount: 3, sponsors: [], ...extra },
  });

  for (const look of MATCH_DAY_LOOKS) {
    const doc = bundle(look, "matchDay");

    it(`${look}: no "this weekend", and WATCH LIVE goes with the link`, () => {
      for (const page of ["title", "sponsors"] as const)
        for (const l of layers(doc, page)) {
          expect(l.content ?? "").not.toMatch(/this weekend/i);
          if (l.content === "WATCH LIVE") expect(l.showWhen?.field).toBe("livestream");
        }
      for (const size of ["square", "portrait", "story", "landscape"] as const) {
        expect(render(title(), doc, size, "title")).not.toContain("WATCH LIVE");
        const live = render(title({ livestream: "youtube.com/@hhcc/live" }), doc, size, "title");
        expect(live).toContain("WATCH LIVE");
        expect(live).toContain("youtube.com/@hhcc/live");
      }
    });
  }

  it("prints the round's dates short on the chip", () => {
    const html = render(title(), bundle("broadcast-dark", "matchDay"), "portrait", "title");
    expect(html).toContain("13–22 Nov");
  });
});

describe("grade line", () => {
  const team = {
    kind: "teamList",
    grade: "B Grade",
    gradeRound: "B GRADE — ROUND 7",
    competitionLine: "B Grade",
    roundLabel: "ROUND 7",
    venueDateTime: "Halls Head Oval • Sat 14 Nov • 12:30 PM",
    players: [],
  };

  for (const look of ["club-kit", "club-kit-classic", "broadcast-classic"]) {
    it(`${look}: says the grade once`, () => {
      const html = render(team, bundle(look, "teamList"), "portrait");
      expect(html).toContain("B GRADE — ROUND 7");
      expect(html).not.toMatch(/ROUND 7\s*[·•—]\s*B GRADE/i);
      expect(html).not.toMatch(/ROUND 7\s*[·•]\s*</);
    });
  }

  it("keeps a competition line that adds something", () => {
    const html = render(
      { ...team, competitionLine: "One Day" },
      bundle("club-kit", "teamList"),
      "portrait",
    );
    expect(html).toContain("B GRADE — ROUND 7 · One Day");
  });
});

describe("substituteTextTokens", () => {
  const sub = substituteTextTokens;
  const values = { gradeRound: "B GRADE — ROUND 7", competitionLine: "B Grade" };

  it("fills a line as substituteTokens does when nothing repeats", () => {
    expect(sub("{{a}} · {{b}}", { a: "A", b: "B" })).toBe("A · B");
    expect(sub("{{a}} · {{b}}", { a: "A" })).toBe("A · ");
    expect(sub("RD {{round}}", { round: "3" })).toBe("RD 3");
  });

  it("drops a competition line that repeats the grade line beside it, with its separator", () => {
    expect(sub("{{gradeRound}} · {{competitionLine}}", values)).toBe("B GRADE — ROUND 7");
    expect(sub("{{competitionLine}} — {{gradeRound}}", values)).toBe("B GRADE — ROUND 7");
    expect(sub("{{gradeRound}} · {{competitionLine}} · {{x}}", { ...values, x: "X" })).toBe(
      "B GRADE — ROUND 7 · X",
    );
  });

  it("prints the competition line on a line of its own, or when it adds something", () => {
    expect(sub("{{competitionLine}}", values)).toBe("B Grade");
    expect(
      sub("{{gradeRound}} · {{competitionLine}}", { ...values, competitionLine: "One Day" }),
    ).toBe("B GRADE — ROUND 7 · One Day");
  });

  it("never touches separators inside a value", () => {
    expect(
      sub("{{gradeRound}} · {{competitionLine}}", { ...values, gradeRound: "B GRADE — " }),
    ).toBe("B GRADE — ");
  });
});
