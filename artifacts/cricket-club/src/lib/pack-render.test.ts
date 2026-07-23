import { describe, expect, it } from "vitest";
import { renderPackCard, packSupportsKind, type PackTokens } from "./pack-render";
import { sampleCardInput } from "./sample-card-inputs";
import type { ShareCardInput, CardSize, LadderRow } from "./share-card";

const TOKENS: PackTokens = {
  accent: "#FBAC27",
  panel: "#6E1C2B",
  ink: "#101216",
  textLight: "#F5F2E8",
  displayFont: "anton",
};

const hasUnresolved = (html: string) => /\{\{/.test(html);

describe("renderPackCard", () => {
  it("binds a full matchSummary sample into all three sizes with no unresolved placeholders", () => {
    const input = sampleCardInput("matchSummary");
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const html = renderPackCard(input, size, true, TOKENS, false);
      expect(html.length).toBeGreaterThan(0);
      expect(hasUnresolved(html)).toBe(false);
      // The bound match title from the sample must appear.
      expect(html).toContain("A Grade");
    }
  });

  it("supports every card kind in the pack", () => {
    const kinds: ShareCardInput["kind"][] = [
      "milestone", "player", "record", "gradeLeader", "premiership",
      "debut", "newCap", "century", "fiveFor", "matchSummary", "matchDay",
      "teamList", "weekendWrap", "ladder", "bigMoment", "newSigning",
      "countdown", "clubLeaderboard",
    ];
    for (const kind of kinds) {
      expect(packSupportsKind(kind)).toBe(true);
      const html = renderPackCard(sampleCardInput(kind), "square", true, TOKENS, false);
      expect(hasUnresolved(html)).toBe(false);
    }
  });

  it("renders the hashtag-footer variant (not the sponsor strip) when sponsors are off", () => {
    const input = sampleCardInput("matchSummary");
    const off = renderPackCard(input, "story", false, TOKENS, false);
    expect(off).not.toContain("PROUDLY SUPPORTED BY");
    // The story sponsors-off branch is the centered hashtag footer.
    expect(off).toContain("#HALLSHEAD");

    const on = renderPackCard(input, "story", true, TOKENS, false);
    expect(on).toContain("PROUDLY SUPPORTED BY");
  });

  it("forces the brown junior panel token regardless of the supplied tokens", () => {
    const input = { ...sampleCardInput("matchSummary"), junior: true } as ShareCardInput;
    const html = renderPackCard(input, "story", true, TOKENS, true);
    expect(html).toMatch(/--panel:\s*#42342B/i);
  });

  it("renders placeholder markup (never an empty img src) for a missing photo/logo", () => {
    // The matchSummary sample carries no logo/photo URLs.
    const html = renderPackCard(sampleCardInput("matchSummary"), "story", true, TOKENS, false);
    expect(html).not.toContain('src=""');
    expect(html).toContain("pack-slot-placeholder");
  });

  it("html-escapes user-supplied text to prevent injection", () => {
    const base = sampleCardInput("matchSummary");
    const input = {
      ...base,
      matchTitle: `Round 5 & 6 <script>alert("xss")</script>`,
    } as ShareCardInput;
    const html = renderPackCard(input, "story", true, TOKENS, false);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("expands the ladder repeat to exactly the number of rows supplied", () => {
    const base = sampleCardInput("ladder");
    const rowCell = /width:92px;text-align:center;font-family:var\(--disp/g;

    const oneRow = {
      ...base,
      rows: [{ pos: 1, team: "Solo Club", played: 1, won: 1, lost: 0, points: 6 } as LadderRow],
    } as ShareCardInput;
    const html1 = renderPackCard(oneRow, "story", true, TOKENS, false);
    expect((html1.match(rowCell) ?? []).length).toBe(1);

    // The seven-row sample.
    const html7 = renderPackCard(base, "story", true, TOKENS, false);
    expect((html7.match(rowCell) ?? []).length).toBe(7);
    for (const team of ["Halls Head", "Dawesville"]) expect(html7).toContain(team);
  });

  it("applies the club-highlight row variant to the isClub ladder row", () => {
    const base = sampleCardInput("ladder");
    const withClub = {
      ...base,
      rows: [
        { pos: 1, team: "Halls Head", played: 8, won: 7, lost: 1, points: 42, isClub: true },
        { pos: 2, team: "Baldivis", played: 8, won: 6, lost: 2, points: 38 },
      ] as LadderRow[],
    } as ShareCardInput;
    const html = renderPackCard(withClub, "story", true, TOKENS, false);
    expect(html).toContain('data-repeat-variant="club"');

    const noClub = {
      ...base,
      rows: [
        { pos: 1, team: "Baldivis", played: 8, won: 6, lost: 2, points: 38 },
        { pos: 2, team: "Mandurah", played: 8, won: 5, lost: 3, points: 33 },
      ] as LadderRow[],
    } as ShareCardInput;
    const htmlNoClub = renderPackCard(noClub, "story", true, TOKENS, false);
    expect(htmlNoClub).not.toContain('data-repeat-variant="club"');
  });

  it("falls back sanely for an unknown size", () => {
    const html = renderPackCard(
      sampleCardInput("ladder"),
      "banner" as unknown as CardSize,
      true,
      TOKENS,
      false,
    );
    expect(html.length).toBeGreaterThan(0);
    expect(hasUnresolved(html)).toBe(false);
  });
});
