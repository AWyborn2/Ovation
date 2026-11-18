/**
 * Team List player order (round 3 retest, build decision 16): As selected,
 * Shirt number and Alphabetical, a withheld junior always last, roles kept,
 * the club's default read from card content settings and a carousel team
 * slide's own order frozen on the slide.
 */
import { describe, expect, it } from "vitest";
import { readQueuedCarousel } from "../queued-carousel";
import {
  DEFAULT_TEAM_LIST_ORDER,
  defaultCardContentSettings,
  matchDaySponsorsContent,
  matchDayTitleContent,
  orderTeamListInputPlayers,
  orderTeamListPlayers,
  presetFields,
  readCardContentSettings,
  teamListContent,
  teamListDraftInput,
  teamListInputOrder,
  teamListSlideInput,
  type ContentTeamListPlayer,
  type TeamListSource,
} from "./index";

const P = (
  order: number,
  surname: string,
  extra: Partial<ContentTeamListPlayer> = {},
): ContentTeamListPlayer => ({ order, surname, ...extra });

/** A side as picked: two unnumbered, a withheld junior in the middle, roles on two. */
const side = (): ContentTeamListPlayer[] => [
  P(1, "YOUNG", { firstInitial: "J", role: "C", shirtNumber: "23" }),
  P(2, "BROWN", { firstInitial: "T", shirtNumber: "7" }),
  P(3, "PRIVATE PLAYER"),
  P(4, "ADAMS", { firstInitial: "S", role: "WK" }),
  P(5, "BROWN", { firstInitial: "A", shirtNumber: "102" }),
  P(6, "ADAMS", { firstInitial: "C" }),
  P(7, "KHAN", { firstInitial: "R", shirtNumber: "7A" }),
];
const names = (rows: readonly ContentTeamListPlayer[]) =>
  rows.map((p) => [p.firstInitial, p.surname].filter(Boolean).join(" "));

describe("orderTeamListPlayers", () => {
  it("As selected keeps the picked order, the withheld junior last", () => {
    const shuffled = [...side()].reverse();
    expect(names(orderTeamListPlayers(shuffled, "selected"))).toEqual([
      "J YOUNG",
      "T BROWN",
      "S ADAMS",
      "A BROWN",
      "C ADAMS",
      "R KHAN",
      "PRIVATE PLAYER",
    ]);
  });

  it("Shirt number: lowest first, text after numbers, no number last by surname then initial", () => {
    expect(names(orderTeamListPlayers(side(), "shirt"))).toEqual([
      "T BROWN", // 7
      "R KHAN", // 7A
      "J YOUNG", // 23
      "A BROWN", // 102
      "C ADAMS", // no number
      "S ADAMS", // no number
      "PRIVATE PLAYER",
    ]);
  });

  it("Alphabetical: by surname, then first initial", () => {
    expect(names(orderTeamListPlayers(side(), "alpha"))).toEqual([
      "C ADAMS",
      "S ADAMS",
      "A BROWN",
      "T BROWN",
      "R KHAN",
      "J YOUNG",
      "PRIVATE PLAYER",
    ]);
  });

  it("a withheld junior is last whatever the order, however it is printed", () => {
    const rows = [P(1, "Private Player"), P(2, "ZED", { shirtNumber: "99" }), P(3, "AB")];
    for (const order of ["selected", "shirt", "alpha"] as const)
      expect(orderTeamListPlayers(rows, order).at(-1)!.surname).toBe("Private Player");
  });

  it("roles, debuts and numbers move with their player; the rows are not changed", () => {
    const rows = side();
    const sorted = orderTeamListPlayers(rows, "alpha");
    expect(sorted.find((p) => p.surname === "YOUNG")).toBe(rows[0]);
    expect(sorted.find((p) => p.firstInitial === "S")).toMatchObject({ role: "WK", order: 4 });
    expect(rows.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("an unknown order reads as As selected", () => {
    expect(names(orderTeamListPlayers(side(), "random"))).toEqual(
      names(orderTeamListPlayers(side(), "selected")),
    );
  });
});

describe("a card input's order", () => {
  it("the design's own order wins over the one it was built with", () => {
    expect(teamListInputOrder({})).toBe(DEFAULT_TEAM_LIST_ORDER);
    expect(teamListInputOrder({ playerOrder: "shirt" })).toBe("shirt");
    expect(teamListInputOrder({ playerOrder: "shirt", playerOrderOverride: "alpha" })).toBe(
      "alpha",
    );
    expect(teamListInputOrder({ playerOrder: "shirt", playerOrderOverride: "selected" })).toBe(
      "selected",
    );
  });

  it("switching a shirt-ordered card back to As selected uses each row's picked order", () => {
    const built = { players: orderTeamListPlayers(side(), "shirt"), playerOrder: "shirt" };
    expect(
      orderTeamListInputPlayers({ ...built, playerOrderOverride: "selected" }).map((p) => p.order),
    ).toEqual([1, 2, 4, 5, 6, 7, 3]);
  });

  it("a card with its numbers hidden keeps the shirt order it was built in", () => {
    const built = orderTeamListPlayers(side(), "shirt").map(
      ({ shirtNumber: _n, ...p }) => p as ContentTeamListPlayer,
    );
    expect(orderTeamListInputPlayers({ players: built, playerOrder: "shirt" })).toEqual(built);
  });
});

const source = (over: Partial<TeamListSource> = {}): TeamListSource => ({
  kind: "teamList",
  gradeRound: "A GRADE, ROUND 3",
  competitionLine: "A Grade",
  venueDateTime: "Halls Head Oval • SAT 10 OCT • 12:30 PM",
  players: side(),
  grade: "A Grade",
  roundLabel: "ROUND 3",
  opponent: "Mandurah Cricket Club",
  homeAway: "HOME",
  venue: "Halls Head Oval",
  date: "SAT 10 OCT",
  startTime: "12:30 PM",
  numbering: "shirt",
  ...over,
});
const fixture = {
  id: 7,
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Mandurah Cricket Club",
  opponentLogoUrl: null,
  venue: "Halls Head Oval",
  startAt: new Date("2026-10-10T04:30:00Z"),
};
const standard = presetFields("teamList", "standard");
const minimal = presetFields("teamList", "minimal");

describe("team list projections", () => {
  it("As selected leaves the sweep's input exactly as it was", () => {
    const c = teamListContent(fixture, source());
    expect(teamListDraftInput(c, standard)).toBe(c.source);
    expect(teamListDraftInput(c, standard, "selected")).toBe(c.source);
  });

  it("another order sorts the side and stamps it", () => {
    const c = teamListContent(fixture, source());
    const input = teamListDraftInput(c, standard, "alpha") as {
      players: ContentTeamListPlayer[];
      playerOrder: string;
    };
    expect(input.playerOrder).toBe("alpha");
    expect(names(input.players)[0]).toBe("C ADAMS");
    expect(c.source.players[0]!.surname).toBe("YOUNG"); // the content is untouched
  });

  it("sorts by shirt number before a hidden numbers field takes them off", () => {
    const c = teamListContent(fixture, source());
    const input = teamListDraftInput(c, minimal, "shirt") as {
      players: ContentTeamListPlayer[];
      playerOrder: string;
      numbering?: string;
    };
    expect(input.numbering).toBeUndefined();
    expect(input.players.every((p) => p.shirtNumber === undefined)).toBe(true);
    expect(names(input.players).slice(0, 4)).toEqual(["T BROWN", "R KHAN", "J YOUNG", "A BROWN"]);
  });

  it("a carousel team slide takes the order too", () => {
    const c = teamListContent(fixture, source());
    const input = teamListSlideInput(c, standard, "shirt") as {
      players: ContentTeamListPlayer[];
      playerOrder: string;
    };
    expect(input.playerOrder).toBe("shirt");
    expect(input.players.at(-1)!.surname).toBe("PRIVATE PLAYER");
  });
});

describe("the club's default", () => {
  it("is As selected for Team List only, until the club saves another", () => {
    expect(defaultCardContentSettings().teamList.playerOrder).toBe("selected");
    expect(defaultCardContentSettings().matchDay.playerOrder).toBeUndefined();
    expect(readCardContentSettings({}).teamList.playerOrder).toBe("selected");
    expect(readCardContentSettings({ teamList: { playerOrder: "shirt" } }).teamList).toMatchObject({
      preset: "standard",
      playerOrder: "shirt",
    });
    expect(
      readCardContentSettings({ teamList: { playerOrder: "nope" } }).teamList.playerOrder,
    ).toBe("selected");
    expect(
      readCardContentSettings({ matchDay: { playerOrder: "alpha" } }).matchDay.playerOrder,
    ).toBeUndefined();
  });
});

describe("a carousel team slide's own order", () => {
  const bookend = {
    heading: "Team lists",
    from: "2026-10-10",
    to: "2026-10-11",
    roundLabels: ["Round 3"],
    fixtureCount: 1,
  };
  const slide = (id: string, content: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    label: id,
    content,
    visibleFields: [...standard],
    photoId: null,
    data: {},
    junior: false,
    sponsorsOn: false,
    warnings: [],
    ...extra,
  });
  const carousel = (middle: unknown) => ({
    weekendCarousel: {
      version: 2,
      packId: "club-kit-v1",
      setType: "teamList",
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size: "square",
      slides: [
        slide("title", matchDayTitleContent(bookend)),
        middle,
        slide("sponsors", matchDaySponsorsContent({ ...bookend, sponsors: [] })),
      ],
    },
  });

  it("is frozen on the slide and drawn from it", () => {
    const c = teamListContent(fixture, source());
    const read = readQueuedCarousel(carousel(slide("t-7", c, { playerOrder: "alpha" })));
    const input = read!.slides[1]!.input as {
      players: ContentTeamListPlayer[];
      playerOrder: string;
    };
    expect(input.playerOrder).toBe("alpha");
    expect(names(input.players)[0]).toBe("C ADAMS");
    // Absent: As selected, as the side was picked.
    const plain = readQueuedCarousel(carousel(slide("t-7", c)));
    expect(
      (plain!.slides[1]!.input as { players: ContentTeamListPlayer[] }).players[0]!.surname,
    ).toBe("YOUNG");
  });

  it("an unknown order, or one on a slide that is not a team list, is refused", () => {
    const c = teamListContent(fixture, source());
    expect(readQueuedCarousel(carousel(slide("t-7", c, { playerOrder: "random" })))).toBeNull();
    const title = matchDayTitleContent(bookend);
    expect(
      readQueuedCarousel({
        weekendCarousel: {
          ...carousel(slide("t-7", c)).weekendCarousel,
          slides: [
            slide("title", title, { playerOrder: "alpha" }),
            slide("t-7", c),
            slide("sponsors", matchDaySponsorsContent({ ...bookend, sponsors: [] })),
          ],
        },
      }),
    ).toBeNull();
  });
});
