/**
 * Grade Leader headings follow the category in every pack: a Dismissals
 * leaderboard reads SAFE HANDS rather than borrowing LEADING RUN-SCORER, and a
 * recap's "Most Wickets" gets the wicket-taker heading and design.
 */
import { describe, it, expect } from "vitest";
import { renderPackCard, resolvePackTokens, brandDefaultTokens } from "@/lib/pack-render";
import { listPackManifests } from "@/lib/pack-templates/registry";
import { leaderTitle } from "./bind";
import type { ShareCardInput } from "@/lib/share-card";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });
const leader = (category: string): ShareCardInput => ({
  kind: "gradeLeader",
  grade: "A Grade",
  category,
  playerName: "Jarod Little",
  value: 14,
});

describe("leaderTitle", () => {
  it("maps each category to its heading", () => {
    expect(leaderTitle("Runs")).toEqual(["LEADING", "RUN-SCORER"]);
    expect(leaderTitle("Wickets")).toEqual(["LEADING", "WICKET-TAKER"]);
    expect(leaderTitle("Most Wickets")).toEqual(["LEADING", "WICKET-TAKER"]);
    // The recap engine's categories.
    expect(leaderTitle("Champion Bowler")).toEqual(["LEADING", "WICKET-TAKER"]);
    expect(leaderTitle("Champion Batsman")).toEqual(["LEADING", "RUN-SCORER"]);
    expect(leaderTitle("Dismissals")).toEqual(["SAFE", "HANDS"]);
    expect(leaderTitle("Most Dismissals")).toEqual(["SAFE", "HANDS"]);
  });
});

describe.each(listPackManifests().map((m) => m.packId))("pack %s", (packId) => {
  const render = (category: string) =>
    renderPackCard(leader(category), "square", false, tokens, false, null, packId);

  it("a Dismissals leaderboard reads SAFE HANDS", () => {
    const html = render("Dismissals");
    if (!html) return; // pack has no Grade Leader design
    expect(html).toContain("SAFE");
    expect(html).toContain("HANDS");
    expect(html).not.toContain("RUN-SCORER");
    expect(html).toContain("Jarod Little");
  });

  it('"Most Wickets" gets the wicket-taker heading', () => {
    const html = render("Most Wickets");
    if (!html) return;
    expect(html).toContain("WICKET-TAKER");
    expect(html).not.toContain("RUN-SCORER");
  });
});
