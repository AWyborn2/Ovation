/** Pages per kind and the bookend rule (T1.3). */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CARD_KINDS } from "./fields";
import { PAGE_KEYS } from "./format";
import {
  carouselPageSource,
  kindHasPage,
  kindPages,
  pageForInput,
  primaryPage,
  templateKindFor,
} from "./pages";

describe("pages per kind", () => {
  it("gives the content kinds their pages, primary first", () => {
    expect(kindPages("matchDay")).toEqual(["fixture", "title", "day", "sponsors"]);
    expect(kindPages("matchSummary")).toEqual(["result", "day"]);
    expect(kindPages("teamList")).toEqual(["team"]);
  });

  it("draws Results with the Match Summary template's pages", () => {
    expect(templateKindFor("results")).toBe("matchSummary");
    expect(kindPages("results")).toEqual(kindPages("matchSummary"));
    expect(primaryPage("results")).toBe("result");
  });

  it("gives every other kind the single card page", () => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      if (["matchDay", "matchSummary", "teamList"].includes(kind)) continue;
      expect(kindPages(kind)).toEqual(["card"]);
      expect(primaryPage(kind)).toBe("card");
    }
    expect(primaryPage("not-a-kind")).toBe("card");
  });

  it("only names known pages", () => {
    for (const kind of [...TEMPLATE_CARD_KINDS, "results"]) {
      for (const page of kindPages(kind)) expect(PAGE_KEYS).toContain(page);
    }
    expect(kindHasPage("teamList", "title")).toBe(false);
    expect(kindHasPage("matchDay", "sponsors")).toBe(true);
  });
});

describe("the bookend rule", () => {
  it("takes every set's title and sponsors pages from the Match Day template", () => {
    for (const set of ["matchDay", "results", "matchSummary", "teamList"]) {
      expect(carouselPageSource(set, "title")).toEqual({
        kind: "matchDay",
        page: "title",
        bookend: true,
      });
      expect(carouselPageSource(set, "sponsors")).toEqual({
        kind: "matchDay",
        page: "sponsors",
        bookend: true,
      });
    }
  });

  it("takes every other page from the set's own template", () => {
    expect(carouselPageSource("matchDay", "fixture")).toEqual({
      kind: "matchDay",
      page: "fixture",
      bookend: false,
    });
    expect(carouselPageSource("results", "result")).toEqual({
      kind: "matchSummary",
      page: "result",
      bookend: false,
    });
    expect(carouselPageSource("results", "day")).toEqual({
      kind: "matchSummary",
      page: "day",
      bookend: false,
    });
    expect(carouselPageSource("teamList", "team")).toEqual({
      kind: "teamList",
      page: "team",
      bookend: false,
    });
    expect(carouselPageSource("teamList", "day")).toBeNull();
  });
});

describe("the page an input is", () => {
  it("reads carousel pages and day slides, else the primary page", () => {
    expect(pageForInput({ kind: "matchDay" })).toBe("fixture");
    expect(pageForInput({ kind: "matchDay", carouselPage: { page: "title" } })).toBe("title");
    expect(pageForInput({ kind: "matchDay", carouselPage: { page: "sponsors" } })).toBe("sponsors");
    expect(pageForInput({ kind: "matchDay", carouselDay: { heading: "SAT" } })).toBe("day");
    expect(pageForInput({ kind: "matchSummary", carouselDay: { heading: "SAT" } })).toBe("day");
    expect(pageForInput({ kind: "matchSummary" })).toBe("result");
    expect(pageForInput({ kind: "teamList", carouselDay: {} })).toBe("team");
    expect(pageForInput({ kind: "ladder" })).toBe("card");
  });
});
