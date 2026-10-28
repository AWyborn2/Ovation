import { describe, expect, it } from "vitest";
import {
  cardSponsors,
  gradeMatchKey,
  maxSponsorLogos,
  sponsorsForCard,
  type CardSponsorContext,
  type SponsorLike,
} from "./card-sponsors";

const SPONSORS: SponsorLike[] = [
  { name: "Gallery", cardKinds: [], grades: [], isPresenting: false },
  { name: "Presenting", cardKinds: [], grades: [], isPresenting: true },
  { name: "A Grade Co", cardKinds: [], grades: ["A Grade"], isPresenting: false },
  { name: "Women Co", cardKinds: [], grades: ["Female B Grade"], isPresenting: false },
];

const names = (list: readonly SponsorLike[], ctx: CardSponsorContext) =>
  sponsorsForCard(list, ctx).map((s) => s.name);

describe("sponsorsForCard: sponsor per team", () => {
  it("gives a team list its team's own sponsor only", () => {
    expect(names(SPONSORS, { kind: "teamList", grade: "A Grade" })).toEqual(["A Grade Co"]);
    expect(names(SPONSORS, { kind: "teamList", grade: "female b grade" })).toEqual(["Women Co"]);
  });

  it("falls back to the presenting sponsor, never another team's", () => {
    expect(names(SPONSORS, { kind: "teamList", grade: "B Grade" })[0]).toBe("Presenting");
    expect(names(SPONSORS, { kind: "teamList", grade: "B Grade" })).not.toContain("A Grade Co");
    expect(names(SPONSORS, { kind: "teamList", grade: null })).toEqual(["Presenting", "Gallery"]);
  });

  it("leaves every other card as before (presenting first, team sponsors included)", () => {
    expect(names(SPONSORS, { kind: "milestone" })).toEqual([
      "Presenting",
      "Gallery",
      "A Grade Co",
      "Women Co",
    ]);
  });

  it("follows card types", () => {
    const list = [...SPONSORS, { name: "Results only", cardKinds: ["matchSummary"] }];
    expect(names(list, { kind: "matchSummary" })).toContain("Results only");
    expect(names(list, { kind: "ladder" })).not.toContain("Results only");
  });

  it("a team list shows one logo", () => {
    expect(maxSponsorLogos("teamList")).toBe(1);
    expect(maxSponsorLogos("milestone")).toBeUndefined();
  });

  it("matches grade labels loosely", () => {
    expect(gradeMatchKey(" A-Grade ")).toBe(gradeMatchKey("a grade"));
  });
});

describe("sponsorsForCard: player sponsors", () => {
  const PLAYER = [
    ...SPONSORS,
    { name: "Joe's Plumbing", cardKinds: [], players: [{ id: 42 }] },
    { name: "Bakery", cardKinds: [], players: [{ id: 42 }, { id: 7 }] },
    { name: "Club and Sam", cardKinds: ["matchSummary"], players: [{ id: 9 }] },
  ];

  it("a player's card carries their sponsors only, in library order", () => {
    expect(names(PLAYER, { kind: "century", playerId: 42 })).toEqual(["Joe's Plumbing", "Bakery"]);
    expect(names(PLAYER, { kind: "milestone", playerId: 7 })).toEqual(["Bakery"]);
  });

  it("a Big Moment card follows its player too", () => {
    expect(names(PLAYER, { kind: "bigMoment", playerId: 42 })).toEqual([
      "Joe's Plumbing",
      "Bakery",
    ]);
    expect(names(PLAYER, { kind: "bigMoment", playerId: 3 })).not.toContain("Bakery");
  });

  it("ignores the sponsor's card types on its players' cards", () => {
    expect(names(PLAYER, { kind: "debut", playerId: 9 })).toEqual(["Club and Sam"]);
  });

  it("a player without sponsors gets the club strip without other players' sponsors", () => {
    const strip = names(PLAYER, { kind: "fiveFor", playerId: 3 });
    expect(strip[0]).toBe("Presenting");
    expect(strip).not.toContain("Joe's Plumbing");
    expect(strip).not.toContain("Bakery");
    expect(strip).not.toContain("Club and Sam");
  });

  it("keeps personal sponsors off other cards unless card types are picked", () => {
    const results = names(PLAYER, { kind: "matchSummary" });
    expect(results).toContain("Club and Sam");
    expect(results).not.toContain("Joe's Plumbing");
    expect(names(PLAYER, { kind: "teamList", grade: null })).not.toContain("Bakery");
    expect(names(PLAYER, { kind: "ladder" })).not.toContain("Club and Sam");
  });

  it("only player-centred kinds follow the player", () => {
    expect(names(PLAYER, { kind: "record", playerId: 42 })).not.toContain("Joe's Plumbing");
    expect(names(PLAYER, { kind: "matchSummary", playerId: 42 })).not.toContain("Bakery");
  });

  it("never follows a fill-in or a missing player", () => {
    const fillIn = [{ name: "Fill", cardKinds: [], players: [{ id: 90001 }] }, ...SPONSORS];
    expect(names(fillIn, { kind: "milestone", playerId: 90001 })).not.toContain("Fill");
    expect(names(PLAYER, { kind: "milestone", playerId: null })[0]).toBe("Presenting");
  });
});

describe("cardSponsors", () => {
  const LIST = [
    ...SPONSORS,
    { name: "Joe's Plumbing", cardKinds: [], players: [{ id: 42 }] },
    { name: "Bakery", cardKinds: [], players: [{ id: 42 }] },
  ];

  it("names the player's first sponsor on their card", () => {
    const r = cardSponsors(LIST, { kind: "player", playerId: 42 });
    expect(r.sponsors.map((s) => s.name)).toEqual(["Joe's Plumbing", "Bakery"]);
    expect(r.presentingName).toBe("Joe's Plumbing");
  });

  it("names the club's presenting sponsor otherwise", () => {
    expect(cardSponsors(LIST, { kind: "player", playerId: 5 }).presentingName).toBe("Presenting");
    expect(cardSponsors(LIST, { kind: "ladder" }).presentingName).toBe("Presenting");
    expect(cardSponsors(SPONSORS.slice(0, 1), { kind: "ladder" }).presentingName).toBeNull();
  });
});

describe("cardSponsors: the player's own sponsors", () => {
  const LIST = [
    ...SPONSORS,
    { name: "Joe's Plumbing", cardKinds: [], players: [{ id: 42 }] },
    { name: "Bakery", cardKinds: [], players: [{ id: 42 }] },
  ];

  it("lists them for the {{playerSponsor…}} fields on the player's card", () => {
    expect(
      cardSponsors(LIST, { kind: "century", playerId: 42 }).playerSponsors.map((s) => s.name),
    ).toEqual(["Joe's Plumbing", "Bakery"]);
  });

  it("an announcement follows a player picked for it", () => {
    const r = cardSponsors(LIST, { kind: "announcement", playerId: 42 });
    expect(r.sponsors.map((s) => s.name)).toEqual(["Joe's Plumbing", "Bakery"]);
    expect(r.playerSponsors).toHaveLength(2);
  });

  it("is empty for a player without sponsors and on other cards", () => {
    expect(cardSponsors(LIST, { kind: "century", playerId: 7 }).playerSponsors).toEqual([]);
    expect(cardSponsors(LIST, { kind: "matchSummary", playerId: 42 }).playerSponsors).toEqual([]);
    expect(cardSponsors(LIST, { kind: "announcement" }).playerSponsors).toEqual([]);
  });
});
