import { describe, it, expect } from "vitest";
import { renderPackCard, resolvePackTokens, brandDefaultTokens } from "@/lib/pack-render";
import type { ShareCardInput, MatchSummaryInnings } from "@/lib/share-card";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });
const team = (name: string) => ({ name, primaryColor: "#123", secondaryColor: "#456", textColor: "#fff" });
const inn = (teamKey: "club" | "opposition", inningsNum: 1 | 2, runs: string): MatchSummaryInnings => ({
  teamKey, inningsNum, totalRuns: runs, wickets: "6", overs: "50",
  topBatters: [{ name: `Bat<${teamKey}${inningsNum}>`, runs: 71, balls: 90, notOut: true }],
  topBowlers: [{ name: `Bowl${teamKey}${inningsNum}`, wickets: 4, runs: 22, overs: "10" }],
});
const input = (innings: MatchSummaryInnings[], carouselDetail?: boolean): ShareCardInput => ({
  kind: "matchSummary", matchTitle: "A Grade · Round 5", result: "Halls Head won by 40 runs",
  resultWinner: "club", club: team("Halls Head"), opposition: team("Mariners & Co"), innings,
  ...(carouselDetail ? { carouselDetail } : {}),
});
const four = [inn("club", 1, "201"), inn("opposition", 1, "180"), inn("club", 2, "150"), inn("opposition", 2, "131")];

describe("Club Kit detailed match summary", () => {
  it("renders every innings with performers in all sizes, escaped", () => {
    for (const size of ["square", "portrait", "story", "landscape"] as const) {
      const html = renderPackCard(input(four, true), size, false, tokens, false, null, "club-kit-v1");
      expect(html).toContain("MATCH DETAIL");
      for (const n of ["201", "180", "150", "131"]) expect(html).toContain(n);
      expect(html.match(/data-innings="/g)?.length).toBe(4);
      expect(html).toContain("Bowlopposition2");
      expect(html).toContain("Bat&lt;club1&gt;");
      expect(html).not.toContain("Bat<club1>");
    }
  });
  it("leaves the concise card unchanged without the flag", () => {
    const a = renderPackCard(input(four.slice(0, 2)), "square", false, tokens, false, null, "club-kit-v1");
    expect(a).not.toContain("MATCH DETAIL");
    expect(a).not.toContain("data-innings");
  });
});
