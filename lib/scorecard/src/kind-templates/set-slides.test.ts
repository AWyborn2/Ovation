import { describe, expect, it } from "vitest";
import { planCardSet, type SetInput } from "../card-sets";
import type { SetDocument, SetPage } from "./set-document";
import {
  arrangeSlides,
  carouselSlideSlot,
  expandSetSlides,
  mapCarouselSlides,
  setSlideRender,
  slideInputFor,
  type SetItem,
} from "./set-slides";

const page = (
  over: Partial<SetPage> & Pick<SetPage, "id" | "slot" | "kind" | "page">,
): SetPage => ({
  role: ["team", "fixture", "result", "day"].includes(over.slot) ? "repeat" : "fixed",
  layers: [],
  ...over,
});

const TEAM_SET: SetDocument = {
  formatVersion: 2,
  set: "teamLists",
  pages: [
    page({ id: "cover", slot: "cover", kind: "teamListRound", page: "card" }),
    page({ id: "team", slot: "team", kind: "teamList", page: "team" }),
    page({ id: "sponsors", slot: "sponsors", kind: "matchDay", page: "sponsors" }),
  ],
};

const round: SetInput = {
  kind: "teamListRound",
  roundLabel: "Round 5",
  date: "Sat 14 Feb",
  teams: [
    { grade: "A Grade", players: [{ surname: "Smith", order: 1 }] },
    { grade: "B Grade", players: [{ surname: "Jones", order: 1 }] },
    { grade: "C Grade", players: [{ surname: "Brown", order: 1 }] },
  ],
};

/** A round of team lists as set items, as the renderers make them. */
const itemsOf = (input: SetInput): SetItem[] =>
  planCardSet(input).map((s) => ({
    key: s.key,
    slot: s.role === "cover" ? "cover" : "team",
    input: s.input as Record<string, unknown>,
  }));

describe("a round of team lists drawn with a set", () => {
  it("is the cover, a slide per team on the team page, then the sponsors page", () => {
    const slides = expandSetSlides(TEAM_SET, itemsOf(round), {
      sponsors: [{ name: "Bakery", logoUrl: "" }],
    });
    expect(slides.map((s) => [s.key, s.page.id])).toEqual([
      ["page:cover", "cover"],
      ["detail:senior:A Grade", "team"],
      ["detail:senior:B Grade", "team"],
      ["detail:senior:C Grade", "team"],
      ["page:sponsors", "sponsors"],
    ]);
    expect(slides[1]!.input).toMatchObject({ kind: "teamList", grade: "A Grade" });
    expect(slides[0]!.input).toMatchObject({ kind: "teamListRound", setRole: "cover" });
    // The sponsors page draws the club's sponsors, dated as the round.
    expect(slides[4]!.input).toMatchObject({
      kind: "matchDay",
      date: "Sat 14 Feb",
      carouselPage: { page: "sponsors", sponsors: [{ name: "Bakery", logoUrl: "" }] },
    });
  });

  it("follows the draft's arrangement: order, deletions, and new teams in place", () => {
    const doc: SetDocument = {
      ...TEAM_SET,
      arrangement: {
        order: ["detail:senior:B Grade", "page:cover", "detail:senior:A Grade"],
        removed: ["page:sponsors"],
      },
    };
    const keys = expandSetSlides(doc, itemsOf(round)).map((s) => s.key);
    // C Grade wasn't in the order (named after the edit): it follows B Grade, as it did.
    expect(keys).toEqual([
      "detail:senior:B Grade",
      "detail:senior:C Grade",
      "page:cover",
      "detail:senior:A Grade",
    ]);
  });

  it("draws a Match Day title cover from the round's date", () => {
    const doc: SetDocument = {
      ...TEAM_SET,
      pages: [
        page({ id: "cover", slot: "cover", kind: "matchDay", page: "title" }),
        ...TEAM_SET.pages.slice(1),
      ],
    };
    const cover = expandSetSlides(doc, itemsOf(round))[0]!;
    expect(cover.input).toMatchObject({
      kind: "matchDay",
      date: "Sat 14 Feb",
      roundLabel: "Round 5",
      carouselPage: { page: "title", title: "Team lists", fixtureCount: 3 },
    });
  });

  it("numbers each team's page marker by its place in the arranged set", () => {
    const doc: SetDocument = {
      ...TEAM_SET,
      arrangement: {
        order: [
          "detail:senior:C Grade",
          "page:cover",
          "detail:senior:A Grade",
          "detail:senior:B Grade",
        ],
        removed: ["page:sponsors"],
      },
    };
    const slides = expandSetSlides(doc, itemsOf(round));
    expect(slides.map((s) => [s.key, s.input.setPage ?? null])).toEqual([
      ["detail:senior:C Grade", "1/4"],
      ["page:cover", null],
      ["detail:senior:A Grade", "3/4"],
      ["detail:senior:B Grade", "4/4"],
    ]);
  });

  it("keeps a junior round junior on every slide (C4)", () => {
    const junior = { ...round, junior: true } as SetInput;
    const slides = expandSetSlides(TEAM_SET, itemsOf(junior), { junior: true });
    expect(slides.every((s) => s.input.junior === true)).toBe(true);
  });

  it("renders each slide as its page's document", () => {
    const [cover] = expandSetSlides(TEAM_SET, itemsOf(round));
    const r = setSlideRender(TEAM_SET, cover!);
    expect(Object.keys(r.document.pages)).toEqual(["card"]);
  });
});

describe("a card made into a free set of pages (full draft editor, stage 2)", () => {
  it("draws every page with the card's own data, one slide per page", () => {
    const card = { kind: "matchSummary", headline: "Halls Head won by 4 wickets" };
    const free: SetDocument = {
      formatVersion: 2,
      set: "free",
      pages: ["page-1", "page-2", "page-3"].map((id) =>
        page({ id, slot: "page", kind: "matchSummary", page: "card" }),
      ),
    };
    // As the server plans a single card: its only slide, in a team slot.
    const slides = expandSetSlides(free, [{ key: "single", slot: "team", input: card }]);
    expect(slides.map((s) => s.page.id)).toEqual(["page-1", "page-2", "page-3"]);
    expect(slides.every((s) => s.input.headline === card.headline)).toBe(true);
  });
});

describe("a queued carousel drawn with a set", () => {
  const stored = [
    { id: "title", input: { kind: "matchDay", carouselPage: { page: "title" } } },
    { id: "t1", input: { kind: "teamList", grade: "A Grade" } },
    { id: "d1", pageId: "page-1", input: { kind: "matchDay" } },
    { id: "sponsors", input: { kind: "matchDay", carouselPage: { page: "sponsors" } } },
  ];

  it("draws each stored slide with the page of its slot, or the page it names", () => {
    const doc: SetDocument = {
      ...TEAM_SET,
      pages: [
        page({ id: "cover", slot: "cover", kind: "matchDay", page: "title" }),
        ...TEAM_SET.pages.slice(1),
        page({ id: "page-1", slot: "page", kind: "matchDay", page: "title" }),
      ],
    };
    const r = mapCarouselSlides(doc, stored);
    expect(r.undrawn).toEqual([]);
    expect(r.slides.map((s) => [s.key, s.page.id])).toEqual([
      ["title", "cover"],
      ["t1", "team"],
      ["d1", "page-1"],
      ["sponsors", "sponsors"],
    ]);
  });

  it("adapts a title slide to a Round Team Lists cover, rows from the set's teams", () => {
    const r = mapCarouselSlides(TEAM_SET, [
      {
        id: "title",
        input: { kind: "matchDay", date: "Sat 14 Feb", carouselPage: { page: "title" } },
      },
      { id: "t1", input: { kind: "teamList", grade: "A Grade" } },
      { id: "t2", input: { kind: "teamList", grade: "B Grade" } },
    ]);
    expect(r.slides[0]!.input).toMatchObject({
      kind: "teamListRound",
      date: "Sat 14 Feb",
      teams: [{ grade: "A Grade" }, { grade: "B Grade" }],
      setRole: "cover",
    });
  });

  it("reports a slide no page can draw", () => {
    const r = mapCarouselSlides(TEAM_SET, [
      { id: "day", input: { kind: "matchDay", carouselDay: { heading: "Sat" } } },
    ]);
    expect(r.undrawn).toEqual(["day"]);
  });

  it("reads a stored slide's slot from its input", () => {
    expect(stored.map((s) => carouselSlideSlot(s.input))).toEqual([
      "cover",
      "team",
      "fixture",
      "sponsors",
    ]);
    expect(carouselSlideSlot({ kind: "results" })).toBe("result");
  });
});

describe("arranging slides", () => {
  const s = (key: string) => ({ key });
  it("is unchanged without an arrangement", () => {
    expect(arrangeSlides([s("a"), s("b")], undefined).map((x) => x.key)).toEqual(["a", "b"]);
  });
  it("puts a slide missing from the order first when nothing before it is placed", () => {
    expect(
      arrangeSlides([s("a"), s("b"), s("c")], { order: ["c", "b"], removed: [] }).map((x) => x.key),
    ).toEqual(["a", "c", "b"]);
  });
});

describe("adapting a design page", () => {
  it("draws another kind's page with the kind alone", () => {
    expect(
      slideInputFor(
        { kind: "player", page: "card", slot: "page" },
        { kind: "teamList", grade: "A" },
      ),
    ).toEqual({ kind: "player" });
  });
});
