import { describe, it, expect } from "vitest";
import {
  buildInitialIndex,
  initialSurnameKey,
  isLinkablePlayerId,
  lineNameKey,
  matchByInitial,
  memberInitialKeys,
  namesMatchQuery,
  pickMostRecent,
  seasonLabel,
  type LinkCandidate,
} from "./squad-link";

/** Squad player linking: initial + surname keys and the recency tie-break (pure). */

const cand = (
  key: string,
  lineNames: string[],
  lastSeasonYear: number | null,
  playerId: number | null = Number(key.replace(/\D/g, "")) || null,
): LinkCandidate => ({ key, playerId, lineNames, lastSeasonYear });

const member = (firstName: string, lastName: string, preferredName: string | null = null) => ({
  firstName,
  lastName,
  preferredName,
});

describe("initial keys", () => {
  it("keys a member on first initial + letters-only surname", () => {
    expect(initialSurnameKey("Jordan", "Wyllie")).toBe("j|wyllie");
    expect(initialSurnameKey("Mary Jane", "Smith")).toBe("m|smith");
    expect(initialSurnameKey("", "Smith")).toBeNull();
    expect(initialSurnameKey("Jo", "")).toBeNull();
  });

  it("reads central's initial + surname names, lower-case included", () => {
    expect(lineNameKey("J Wyllie")).toBe("j|wyllie");
    expect(lineNameKey("a geeraets")).toBe("a|geeraets");
    expect(lineNameKey("T De Pedro")).toBe("t|depedro");
    expect(lineNameKey("Wyllie")).toBeNull();
  });

  it("matches hyphenated and spaced surnames on letters only", () => {
    expect(initialSurnameKey("Kim", "Kelly-Wilson")).toBe(lineNameKey("K Kelly Wilson"));
    expect(initialSurnameKey("Tom", "DePedro")).toBe(lineNameKey("T De Pedro"));
    expect(initialSurnameKey("Tom", "De Pedro")).toBe(lineNameKey("t depedro"));
  });

  it("adds the preferred name's initial", () => {
    expect(memberInitialKeys(member("William", "Jones", "Bill")).sort()).toEqual([
      "b|jones",
      "w|jones",
    ]);
    expect(memberInitialKeys(member("Sam", "Jones", "Sammy"))).toEqual(["s|jones"]);
  });
});

describe("pickMostRecent", () => {
  it("takes a lone candidate whatever its season", () => {
    expect(pickMostRecent([cand("p:1", ["J Barnes"], null)])?.key).toBe("p:1");
  });

  it("takes the strictly most recent of several (J Barnes 2022/23 vs 2025/26)", () => {
    const old = cand("p:1", ["J Barnes"], 2022);
    const recent = cand("p:2", ["J Barnes"], 2025);
    expect(pickMostRecent([old, recent])).toBe(recent);
    expect(pickMostRecent([recent, old])).toBe(recent);
  });

  it("links nobody on a tie or with no seasons to compare", () => {
    expect(pickMostRecent([cand("p:1", ["J Barnes"], 2025), cand("p:2", ["J Barnes"], 2025)])).toBe(
      null,
    );
    expect(pickMostRecent([cand("p:1", ["J Barnes"], null), cand("p:2", ["J Barnes"], null)])).toBe(
      null,
    );
  });

  it("counts one candidate listed twice once", () => {
    const c = cand("p:1", ["J Barnes"], 2024);
    expect(pickMostRecent([c, { ...c }])?.key).toBe("p:1");
  });
});

describe("matchByInitial", () => {
  const index = buildInitialIndex([
    cand("p:10", ["J Wyllie", "j wyllie"], 2025),
    cand("p:11", ["J Barnes"], 2022),
    cand("p:12", ["J Barnes"], 2025),
    cand("p:13", ["S Twin"], 2024),
    cand("g:x", ["S Twin"], 2024, null),
    cand("p:14", ["B Jones"], 2025),
    cand("p:15", ["W Jones"], 2025),
    cand("p:16", ["K Kelly-Wilson"], 2023),
  ]);

  it("links a unique initial + surname, ignoring case", () => {
    expect(matchByInitial(member("Jordan", "WYLLIE"), index)?.playerId).toBe(10);
    expect(matchByInitial(member("Kim", "Kelly Wilson"), index)?.playerId).toBe(16);
  });

  it("links the most recent of two GUIDs for one name", () => {
    expect(matchByInitial(member("Jack", "Barnes"), index)?.playerId).toBe(12);
  });

  it("links nobody when two candidates tie, even if one is unmapped", () => {
    expect(matchByInitial(member("Sam", "Twin"), index)).toBeNull();
  });

  it("links nobody when first and preferred name point at different people", () => {
    expect(matchByInitial(member("William", "Jones", "Bill"), index)).toBeNull();
    expect(matchByInitial(member("William", "Jones"), index)?.playerId).toBe(15);
  });

  it("uses the preferred name when the first name has no candidate", () => {
    expect(matchByInitial(member("Xavier", "Wyllie", "Jay"), index)?.playerId).toBe(10);
  });

  it("links nobody for an unknown name", () => {
    expect(matchByInitial(member("Zed", "Nobody"), index)).toBeNull();
  });
});

describe("helpers", () => {
  it("never treats a fill-in or non-positive id as linkable", () => {
    expect(isLinkablePlayerId(1)).toBe(true);
    expect(isLinkablePlayerId(89999)).toBe(true);
    expect(isLinkablePlayerId(90000)).toBe(false);
    expect(isLinkablePlayerId(0)).toBe(false);
    expect(isLinkablePlayerId(null)).toBe(false);
  });

  it("searches names by substring, ignoring case, spaces and hyphens", () => {
    expect(namesMatchQuery(["J Wyllie"], "wyl")).toBe(true);
    expect(namesMatchQuery(["K Kelly-Wilson"], "kelly wil")).toBe(true);
    expect(namesMatchQuery(["T De Pedro"], "depedro")).toBe(true);
    expect(namesMatchQuery(["J Wyllie"], "barnes")).toBe(false);
  });

  it("labels seasons", () => {
    expect(seasonLabel(2025)).toBe("2025/26");
    expect(seasonLabel(1999)).toBe("1999/00");
    expect(seasonLabel(null)).toBeNull();
  });
});
