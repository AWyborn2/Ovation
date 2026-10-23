import { describe, expect, it } from "vitest";
import { TEMPLATE_CARD_KINDS } from "./fields";
import { kindPages } from "./pages";
import { DEFAULT_ROWS, WORST, worstCaseCard } from "./worst-case";
import { WORST_CASE_NAMES } from "./worst-case-names";

const json = (v: unknown) => JSON.stringify(v);

describe("worstCaseCard (T2.2)", () => {
  it("has content for every kind and page", () => {
    for (const kind of TEMPLATE_CARD_KINDS)
      for (const page of kindPages(kind)) {
        const card = worstCaseCard(kind, {
          page,
          contentKind: kind,
          preset: "full",
          junior: page === "day",
        });
        expect(card.input.kind, `${kind} ${page}`).toBe(kind);
        expect(card.page).toBe(page);
      }
  });

  it("prints the longest names and the most digits", () => {
    const fixture = json(
      worstCaseCard("matchDay", {
        page: "fixture",
        contentKind: "matchDay",
        preset: "full",
        junior: false,
      }).input,
    );
    expect(fixture).toContain(WORST_CASE_NAMES.teams[0].card);
    expect(fixture).toContain(WORST_CASE_NAMES.venues[0]);
    const fiveFor = json(
      worstCaseCard("fiveFor", { page: "card", contentKind: "fiveFor", junior: false }).input,
    );
    expect(fiveFor).toContain("10/123");
    expect(fiveFor).toContain(WORST.player);
  });

  it("fills rows to the capacity it is given, else to the default", () => {
    const team = (rows?: Record<string, number>) =>
      worstCaseCard(
        "teamList",
        { page: "team", contentKind: "teamList", preset: "full", junior: false },
        { rows },
      ).input as { players: unknown[] };
    expect(team().players).toHaveLength(DEFAULT_ROWS.players!);
    expect(team({ players: 9 }).players).toHaveLength(9);
    const day = worstCaseCard(
      "matchDay",
      { page: "day", contentKind: "matchDay", preset: "standard", junior: true },
      { rows: { dayRows: 5 } },
    ).input as { carouselDay: { fixtures: unknown[] } };
    expect(day.carouselDay.fixtures).toHaveLength(5);
    const ladder = worstCaseCard(
      "ladder",
      { page: "card", contentKind: "ladder", junior: false },
      { rows: { rows: 14 } },
    );
    expect((ladder.input as { rows: unknown[] }).rows).toHaveLength(14);
  });

  it("shows only the preset's fields: Minimal drops the optional data", () => {
    const at = (preset: "minimal" | "full") =>
      worstCaseCard("matchDay", {
        page: "fixture",
        contentKind: "matchDay",
        preset,
        junior: false,
      });
    expect(at("full").input).toHaveProperty("lastMeeting");
    expect(at("minimal").input).not.toHaveProperty("lastMeeting");
    expect(at("minimal").input.roundLabel).toBe("");
    expect(at("full").visible).toContain("fixture.milestoneWatch");
  });

  it("follows the photo and sponsor branches", () => {
    const off = worstCaseCard("century", {
      page: "card",
      contentKind: "century",
      photo: false,
      sponsors: "none",
      junior: false,
    });
    expect(off.data.photoUrl).toBeNull();
    expect(off.input.photoUrl).toBeNull();
    expect(off.data.sponsors).toEqual([]);
    expect(off.data.presentingSponsorName).toBeNull();
    expect(off.sponsorsOn).toBe(false);
    const on = worstCaseCard("century", {
      page: "card",
      contentKind: "century",
      sponsors: "max",
      junior: false,
    });
    expect(on.data.sponsors).toHaveLength(3);
    expect(on.data.photoUrl).not.toBeNull();
  });

  it("junior variants: junior grades, Private Player rows, never a photo", () => {
    const team = worstCaseCard("teamList", {
      page: "team",
      contentKind: "teamList",
      preset: "full",
      junior: true,
    });
    expect(team.junior).toBe(true);
    expect(team.data.photoUrl).toBeNull();
    expect(json(team.input)).toContain("PRIVATE PLAYER");
    const day = worstCaseCard("matchSummary", {
      page: "day",
      contentKind: "results",
      preset: "full",
      junior: true,
    });
    expect(day.kind).toBe("matchSummary");
    expect(json(day.input)).toContain(WORST_CASE_NAMES.juniorGrades[0].card);
  });

  it("the Results set draws the Match Summary template without performers", () => {
    const results = worstCaseCard("matchSummary", {
      page: "result",
      contentKind: "results",
      preset: "full",
      junior: false,
    });
    const innings = (results.input as { innings: Array<{ topBatters: unknown[] }> }).innings;
    expect(results.kind).toBe("matchSummary");
    expect(innings.every((i) => i.topBatters.length === 0)).toBe(true);
  });

  it("keeps no real player name: the fixture's players are stand-ins", () => {
    for (const name of [...WORST_CASE_NAMES.players, ...WORST_CASE_NAMES.playersLongWord])
      for (const word of name.split(/[\s'-]+/).filter((w) => w.length > 1))
        expect(word.toLowerCase(), name).toMatch(
          /^(mar|lo|wen|da|ric|sen|ham|ton|bur|ley|cal|vin|dor|ra|nel|son|fer|gus|wor|th)+[a-z]*$/,
        );
  });
});

describe("the card's photo follows its field", () => {
  const card = (
    contentKind: string,
    page: "result" | "fixture" | "title",
    preset: "minimal" | "standard",
  ) =>
    worstCaseCard(contentKind === "results" ? "matchSummary" : contentKind, {
      page,
      contentKind,
      preset,
      photo: true,
      junior: false,
    });

  it("attaches the photo only at presets that show it, as drafts and carousels do", () => {
    expect(card("matchSummary", "result", "minimal").data.photoUrl).toBeNull();
    expect(card("matchSummary", "result", "standard").data.photoUrl).toBeTruthy();
    expect(card("results", "result", "minimal").data.photoUrl).toBeNull();
    expect(card("matchDay", "fixture", "minimal").data.photoUrl).toBeNull();
    expect(card("matchDay", "fixture", "standard").data.photoUrl).toBeTruthy();
    // The title page's cover photo is its own field (Standard and up).
    expect(card("matchDay", "title", "minimal").data.photoUrl).toBeNull();
    expect(card("matchDay", "title", "standard").data.photoUrl).toBeTruthy();
  });

  it("keeps the photo on kinds without content presets", () => {
    expect(
      worstCaseCard("player", { page: "card", contentKind: "player", photo: true, junior: false })
        .data.photoUrl,
    ).toBeTruthy();
  });
});
