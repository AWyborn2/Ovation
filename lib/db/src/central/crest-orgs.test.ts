import { describe, expect, it } from "vitest";
import { pickClubOrgs, type MatchSideLink } from "./crest-orgs";

// Central stores the lower club id as "home" (central-transform.ts), whatever
// PlayHQ says. These fixtures follow that convention.
const HORNETS = 11;
const MURDOCH = 104;
const HH = 1;
const SJ = 7;
const ORG_HORNETS = "218c4b17-6214-4d97-bf9c-3dffe60c2202";
const ORG_MURDOCH = "a9f0e3d1-0000-4000-8000-000000000104";
const ORG_HH = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
const ORG_SJ = "f1000000-0000-4000-8000-000000000007";

/** One projected match, as both central sides see it. */
function match(
  id: number,
  central: { home: [number, string]; away: [number, string] },
  playhq: { home: [string, string]; away: [string, string] },
): MatchSideLink[] {
  const base = {
    matchId: id,
    homeTeam: playhq.home[0],
    homeOrg: playhq.home[1],
    awayTeam: playhq.away[0],
    awayOrg: playhq.away[1],
  };
  return [
    { ...base, clubId: central.home[0], team: central.home[1] },
    { ...base, clubId: central.away[0], team: central.away[1] },
  ];
}

describe("pickClubOrgs", () => {
  it("Murdoch University Melville never takes the Rockingham Hornets crest", () => {
    // Murdoch's only PCA side is its U21 Mixed. PlayHQ had Murdoch at home, so
    // central (lower id = home) has the Hornets as home: pairing home with home
    // linked Murdoch to the Hornets' organisation.
    const sides = [
      ...match(
        1,
        { home: [HORNETS, "Hornets U21 Mixed Colts"], away: [MURDOCH, "MUMCC U21 Mixed"] },
        { home: ["MUMCC U21 Mixed", ORG_MURDOCH], away: ["Hornets U21 Mixed Colts", ORG_HORNETS] },
      ),
      ...match(
        2,
        { home: [HH, "Halls Head U21 Mixed"], away: [MURDOCH, "MUMCC U21 Mixed"] },
        { home: ["Halls Head U21 Mixed", ORG_HH], away: ["MUMCC U21 Mixed", ORG_MURDOCH] },
      ),
    ];
    const picked = pickClubOrgs([MURDOCH, HORNETS], [{ clubId: HH, orgId: ORG_HH }], sides);
    expect(picked.get(MURDOCH)).toEqual([ORG_MURDOCH]);
    expect(picked.get(HORNETS)).toEqual([ORG_HORNETS]);
  });

  it("the crosswalk wins and its organisations are never another club's", () => {
    const sides = match(
      1,
      { home: [HH, "Halls Head A Grade"], away: [SJ, "SJ Blues Senior Women"] },
      // Names that match neither side: the pairing is ambiguous.
      { home: ["SJ Blues Women", ORG_SJ], away: ["Halls Head A", ORG_HH] },
    );
    const picked = pickClubOrgs([HH, SJ], [{ clubId: HH, orgId: ORG_HH.toUpperCase() }], sides);
    expect(picked.get(HH)).toEqual([ORG_HH]);
    // HH's organisation is ruled out, so SJ Blues is left with its own.
    expect(picked.get(SJ)).toEqual([ORG_SJ]);
  });

  it("a link must hold in most of the club's matches", () => {
    // Three matches, but the club's side only names the same organisation once:
    // the other two are ambiguous between two different opponents.
    const sides = [
      ...match(
        1,
        { home: [SJ, "SJ Blues A"], away: [MURDOCH, "Somebody"] },
        { home: ["SJ Blues A", ORG_SJ], away: ["Other name", ORG_MURDOCH] },
      ),
      ...match(
        2,
        { home: [HORNETS, "Hornets A"], away: [MURDOCH, "Somebody else"] },
        { home: ["Hornets A", ORG_HORNETS], away: ["Another name", ORG_HH] },
      ),
    ];
    // Murdoch's sides match no PlayHQ team: each match is ambiguous, nothing is in most.
    expect(pickClubOrgs([MURDOCH], [], sides).get(MURDOCH)).toBeUndefined();
  });

  it("a tie is doubtful: no crest rather than a guess", () => {
    const sides = match(
      1,
      { home: [SJ, "Blues"], away: [MURDOCH, "Murdoch"] },
      { home: ["SJ", ORG_SJ], away: ["MU", ORG_MURDOCH] },
    );
    expect(pickClubOrgs([SJ, MURDOCH], [], sides).size).toBe(0);
  });

  it("a club with no PlayHQ matches has no organisation", () => {
    expect(pickClubOrgs([MURDOCH], [], []).get(MURDOCH)).toBeUndefined();
  });
});
