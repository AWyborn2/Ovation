import { describe, expect, it } from "vitest";
import {
  APPROVED_CAP_ONLY_LINKS,
  centralSurname,
  parseLinkArgs,
  planCapOnlyLinks,
  type CentralIdentity,
  type NativeCapOnlyRow,
} from "./link-hh-cap-only-players-core";

const G1 = "4dd22e68-b462-49e0-9f4c-fccb764acc83";
const G2 = "12b61f63-c894-478b-8a09-eed87ec3db8f";

const native = (id: number, givenName: string, surname: string, isCapOnly = true) =>
  ({ id, givenName, surname, isCapOnly }) satisfies NativeCapOnlyRow;
const central = (participantId: string, displayName: string, over: Partial<CentralIdentity> = {}) =>
  [
    participantId,
    { participantId, displayName, isPrivate: false, clubMatches: 7, ...over },
  ] as const;

const base = {
  requests: [
    { name: "Nick Rostin", participantId: G1 },
    { name: "Brad Holmes", participantId: G2 },
  ],
  nativeRows: [native(95026, "Nick", "Rostin"), native(95029, "Brad", "Holmes")],
  mappedParticipantIds: new Set<string>(),
  central: new Map([central(G1, "N Rostin"), central(G2, "Holmes, Brad")]),
  mintFloor: 760,
};

describe("planCapOnlyLinks", () => {
  it("gives each approved cap-only player the next regular id and its PlayHQ GUID", () => {
    const plan = planCapOnlyLinks(base);
    expect(plan.refused).toEqual([]);
    expect(plan.links.map((l) => [l.name, l.capOnlyId, l.newId, l.participantId])).toEqual([
      ["Nick Rostin", 95026, 761, G1],
      ["Brad Holmes", 95029, 762, G2],
    ]);
  });

  it("refuses rather than guesses", () => {
    const cases: [Partial<typeof base>, RegExp][] = [
      [{ nativeRows: [native(95029, "Brad", "Holmes")] }, /no cap-only native player/],
      [{ nativeRows: [...base.nativeRows, native(95099, "Nick", "Rostin")] }, /2 cap-only/],
      [{ nativeRows: [native(26, "Nick", "Rostin", false), base.nativeRows[1]!] }, /no cap-only/],
      [{ mappedParticipantIds: new Set([G1]) }, /already in Halls Head's crosswalk/],
      [{ central: new Map([central(G2, "Holmes, Brad")]) }, /central has no player/],
      [
        {
          central: new Map([central(G1, "N Rostin", { isPrivate: true }), central(G2, "B Holmes")]),
        },
        /private/,
      ],
      [
        {
          central: new Map([central(G1, "N Rostin", { clubMatches: 0 }), central(G2, "B Holmes")]),
        },
        /no Halls Head appearance/,
      ],
      [{ central: new Map([central(G1, "N Roston"), central(G2, "B Holmes")]) }, /surname differs/],
    ];
    for (const [over, reason] of cases) {
      const plan = planCapOnlyLinks({ ...base, ...over });
      const r = plan.refused.find((x) => x.name === "Nick Rostin");
      expect(r?.reason, String(reason)).toMatch(reason);
      // The other link still goes ahead, and takes the first free id.
      expect(plan.links.map((l) => [l.name, l.newId])).toEqual([["Brad Holmes", 761]]);
    }
  });

  it("never assigns an id in the fill-in / cap-only range", () => {
    const plan = planCapOnlyLinks({ ...base, mintFloor: 89_999 });
    expect(plan.links).toEqual([]);
    expect(plan.refused.map((r) => r.reason)).toEqual([
      expect.stringMatching(/below the fill-in range/),
      expect.stringMatching(/below the fill-in range/),
    ]);
  });

  it("the approved list is the 14 players Ash agreed, each GUID once", () => {
    expect(APPROVED_CAP_ONLY_LINKS).toHaveLength(14);
    expect(new Set(APPROVED_CAP_ONLY_LINKS.map((l) => l.participantId)).size).toBe(14);
  });
});

describe("centralSurname", () => {
  it("reads both central name shapes", () => {
    expect(centralSurname("N Rostin")).toBe("rostin");
    expect(centralSurname("Holmes, Brad")).toBe("holmes");
    expect(centralSurname(null)).toBe("");
  });
});

describe("parseLinkArgs", () => {
  it("defaults to a preview and rejects unknown flags", () => {
    expect(parseLinkArgs(["--tenant=1"])).toMatchObject({ tenant: 1, commit: false });
    expect(parseLinkArgs(["--tenant=1", "--commit"]).commit).toBe(true);
    expect(() => parseLinkArgs(["--yes"])).toThrow(/Unknown argument/);
  });
});
