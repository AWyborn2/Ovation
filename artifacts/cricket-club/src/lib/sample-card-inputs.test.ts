import { describe, it, expect } from "vitest";
import { sampleCardInput } from "./sample-card-inputs";
import { shortClubName } from "./pack-card-data";
import type { LadderRow, ShareCardInput } from "./share-card";

type MatchSummaryInput = Extract<ShareCardInput, { kind: "matchSummary" }>;

/**
 * Tenant-named samples: the Studio gallery and the composer seed pass the
 * tenant's short club name so sample content reads as THEIR club — "Mandurah
 * won by 5 wickets", the ladder's highlighted row is Mandurah's — instead of a
 * generic "Sample Club".
 */
describe("sampleCardInput club substitution", () => {
  it("substitutes the club tokens in matchSummary content", () => {
    const s = sampleCardInput("matchSummary", "Mandurah") as MatchSummaryInput;
    expect(s.result).toBe("Mandurah won by 5 wickets");
    expect(s.club.name).toBe("Mandurah");
    // The opposition is the other side of the fixture, never the tenant.
    expect(s.opposition.name).toBe("Rival Club");
  });

  it("substitutes the ladder's highlighted (isClub) row", () => {
    const s = sampleCardInput("ladder", "Mandurah") as { rows: LadderRow[] };
    const mine = s.rows.find((r) => r.isClub);
    expect(mine?.team).toBe("Mandurah");
    // Other teams keep their sample names.
    expect(s.rows.some((r) => r.team === "Baldivis")).toBe(true);
  });

  it("matches token case: uppercase tokens get the uppercase name", () => {
    // No current sample carries an uppercase token in input data, but template
    // transcriptions do ("YOUR CLUB · 2ND INNINGS") — the shared regex must
    // handle both, so pin the behaviour here at the unit level.
    const s = sampleCardInput("matchSummary", "Mandurah") as MatchSummaryInput;
    expect(JSON.stringify(s)).not.toContain("Sample Club");
  });

  it("never mutates the shared sample objects", () => {
    const before = JSON.stringify(sampleCardInput("matchSummary"));
    sampleCardInput("matchSummary", "Mandurah");
    expect(JSON.stringify(sampleCardInput("matchSummary"))).toBe(before);
  });

  it("returns the neutral sample unchanged when no club is given", () => {
    for (const club of [undefined, null, "", "  "]) {
      const s = sampleCardInput("matchSummary", club) as MatchSummaryInput;
      expect(s.result).toBe("Sample Club won by 5 wickets");
    }
  });
});

describe("shortClubName", () => {
  it("strips the Cricket Club suffix for card copy", () => {
    expect(shortClubName("Mandurah Cricket Club")).toBe("Mandurah");
    expect(shortClubName("Halls Head CRICKET CLUB")).toBe("Halls Head");
  });

  it("leaves names without the suffix alone, and never returns empty", () => {
    expect(shortClubName("Peel Thunder")).toBe("Peel Thunder");
    expect(shortClubName("Cricket Club")).toBe("Cricket Club");
  });
});
