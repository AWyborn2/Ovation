/**
 * Card 1023 (retest 9): a drawn game's card never says abandoned and an
 * abandoned one never says drawn; a side with no innings shows a dash, never
 * "0/0" or the template's sample score, and real scores always show.
 */
import { describe, expect, it } from "vitest";
import { renderPackCard, resolvePackTokens, brandDefaultTokens } from "@/lib/pack-render";
import { bindInput } from "@/lib/pack-render/bind";
import type { MatchSummaryInnings, ShareCardInput } from "@/lib/share-card";

const team = (name: string) => ({
  name,
  primaryColor: "#123",
  secondaryColor: "#456",
  textColor: "#fff",
});
const inn = (
  teamKey: "club" | "opposition",
  runs: string,
  wickets: string,
): MatchSummaryInnings => ({
  teamKey,
  inningsNum: 1,
  totalRuns: runs,
  wickets,
  overs: "20",
  topBatters: [],
  topBowlers: [],
});
const input = (result: string, innings: MatchSummaryInnings[]): ShareCardInput => ({
  kind: "matchSummary",
  matchTitle: "A Grade · Round 5",
  result,
  resultWinner: "draw",
  club: team("Halls Head"),
  opposition: team("Mariners"),
  innings,
});
const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });
const html = (i: ShareCardInput) =>
  renderPackCard(i, "square", false, tokens, false, null, "club-kit-v1");

describe("abandoned or drawn result cards", () => {
  it("a drawn game with no innings reads as drawn, with dashes for scores", () => {
    const { values } = bindInput(input("Match drawn", []), "club-kit-v1");
    expect(values["resultWord"]).toBe("DRAW");
    expect(values["resultVerb"]).toBe("MATCH DRAWN");
    expect(values["club.score"]).toBe("—");
    expect(values["opposition.score"]).toBe("—");
    const out = html(input("Match drawn", []));
    expect(out).not.toMatch(/abandon/i);
    expect(out).not.toContain("0/0");
  });

  it("an abandoned game reads as abandoned (no result), never drawn, and shows no 0/0", () => {
    const { values } = bindInput(input("Match abandoned", []), "club-kit-v1");
    expect(values["resultWord"]).toBe("ABANDONED");
    expect(values["resultVerb"]).toBe("NO RESULT");
    expect(values["club.score"]).toBe("—");
    const out = html(input("Match abandoned", []));
    expect(out).not.toMatch(/drawn/i);
    expect(out).not.toContain("0/0");
  });

  it("keeps the real score of the side that batted", () => {
    const { values } = bindInput(input("Match abandoned", [inn("club", "87", "4")]), "club-kit-v1");
    expect(values["club.score"]).toBe("4/87");
    expect(values["opposition.score"]).toBe("—");
    expect(html(input("Match abandoned", [inn("club", "87", "4")]))).toContain("4/87");
  });
});
