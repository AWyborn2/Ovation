/**
 * duplicate-suggestions.test.ts — the duplicate-player suggestion engine
 * (hybrid stats plan U7, R9/R10). The engine is pure over per-GUID evidence,
 * so these run without a database:
 *   - AE2: two "C Phelps" GUIDs that were never in the same match are suggested
 *     with their evidence (seasons, grades, games per GUID);
 *   - AE3: two "M Brown" GUIDs that shared a match are never suggested;
 *   - a name match alone never qualifies, private GUIDs never pair, and
 *     candidates rank by season adjacency then grade overlap;
 *   - a pair already suggested, confirmed or rejected (either way round) is
 *     not suggested again — a rejected pair stays rejected until reopened.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, playerCurationTable: {} }));

import {
  findDuplicateCandidates,
  nameKey,
  planNewSuggestions,
  seasonLabel,
  type EvidenceInput,
} from "./duplicate-suggestions";

function guid(
  participantId: string,
  displayName: string,
  opts: Partial<EvidenceInput> & { matches?: number[] } = {},
): EvidenceInput {
  const matches = opts.matches ?? [];
  return {
    participantId,
    displayName,
    isPrivate: opts.isPrivate ?? false,
    games: opts.games ?? matches.length,
    seasons: opts.seasons ?? [2024],
    grades: opts.grades ?? ["A Grade"],
    allMatchIds: opts.allMatchIds ?? matches,
  };
}

const NO_MERGES = new Map<string, string>();

describe("nameKey: 'Initial Surname' compatibility", () => {
  it("reduces a display name to initial + surname", () => {
    expect(nameKey("C Phelps")).toBe("c phelps");
    expect(nameKey("Chris Phelps")).toBe("c phelps");
    expect(nameKey("C. Phelps")).toBe("c phelps");
    expect(nameKey("  c  PHELPS ")).toBe("c phelps");
    expect(nameKey("S O'Brien")).toBe("s obrien");
    expect(nameKey("José Núñez")).toBe("j nunez");
  });

  it("gives no key for a single token or a blank name", () => {
    expect(nameKey("Phelps")).toBeNull();
    expect(nameKey("")).toBeNull();
    expect(nameKey(null)).toBeNull();
  });
});

describe("findDuplicateCandidates", () => {
  it("AE2: suggests two 'C Phelps' GUIDs never in the same match, with their evidence", () => {
    const out = findDuplicateCandidates(
      [
        guid("p1", "C Phelps", { matches: [1, 2, 3], seasons: [2019, 2020], grades: ["A Grade"] }),
        guid("p2", "C Phelps", {
          matches: [7],
          seasons: [2021],
          grades: ["A Grade", "B Grade"],
        }),
      ],
      NO_MERGES,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      keeper: {
        participantId: "p1",
        displayName: "C Phelps",
        games: 3,
        seasons: ["2019/20", "2020/21"],
        grades: ["A Grade"],
      },
      duplicate: {
        participantId: "p2",
        games: 1,
        seasons: ["2021/22"],
        grades: ["A Grade", "B Grade"],
      },
      seasonGap: 1,
      sharedGrades: ["A Grade"],
    });
  });

  it("AE3: never suggests two 'M Brown' GUIDs that shared a match", () => {
    const out = findDuplicateCandidates(
      [guid("m1", "M Brown", { matches: [1, 2] }), guid("m2", "M Brown", { matches: [2, 5] })],
      NO_MERGES,
    );
    expect(out).toEqual([]);
  });

  it("counts a match played against each other as a shared match", () => {
    // m2 appeared for the opposition in match 9 (allMatchIds, not a club game).
    const out = findDuplicateCandidates(
      [
        guid("m1", "M Brown", { matches: [9] }),
        guid("m2", "M Brown", { matches: [4], allMatchIds: [4, 9] }),
      ],
      NO_MERGES,
    );
    expect(out).toEqual([]);
  });

  it("a name match alone never qualifies: different initials or surnames don't pair", () => {
    const out = findDuplicateCandidates(
      [
        guid("a", "C Phelps", { matches: [1] }),
        guid("b", "D Phelps", { matches: [2] }),
        guid("c", "C Phillips", { matches: [3] }),
      ],
      NO_MERGES,
    );
    expect(out).toEqual([]);
  });

  it("never pairs a private GUID", () => {
    const out = findDuplicateCandidates(
      [
        guid("a", "J Smith", { matches: [1] }),
        guid("b", "J Smith", { matches: [2], isPrivate: true }),
      ],
      NO_MERGES,
    );
    expect(out).toEqual([]);
  });

  it("ranks by season adjacency, then grade overlap", () => {
    const out = findDuplicateCandidates(
      [
        // Far apart in time.
        guid("far1", "A Far", { matches: [1], seasons: [2005], grades: ["A Grade"] }),
        guid("far2", "A Far", { matches: [2], seasons: [2020], grades: ["A Grade"] }),
        // Adjacent seasons, no shared grade.
        guid("adj1", "B Adj", { matches: [3], seasons: [2019], grades: ["A Grade"] }),
        guid("adj2", "B Adj", { matches: [4], seasons: [2020], grades: ["C Grade"] }),
        // Adjacent seasons AND a shared grade.
        guid("best1", "C Best", { matches: [5], seasons: [2019], grades: ["B Grade"] }),
        guid("best2", "C Best", { matches: [6], seasons: [2020], grades: ["B Grade"] }),
      ],
      NO_MERGES,
    );
    expect(out.map((c) => c.keeper.participantId.replace(/\d$/, ""))).toEqual([
      "best",
      "adj",
      "far",
    ]);
    expect(out.map((c) => c.seasonGap)).toEqual([1, 1, 15]);
  });

  it("the GUID with more games is the keeper", () => {
    const out = findDuplicateCandidates(
      [guid("few", "C Phelps", { matches: [1] }), guid("many", "C Phelps", { matches: [2, 3] })],
      NO_MERGES,
    );
    expect(out[0]).toMatchObject({
      keeper: { participantId: "many" },
      duplicate: { participantId: "few" },
    });
  });

  it("treats a confirmed-merged group as one player", () => {
    // b is already confirmed into a; c shares a match with b, so c and a's
    // group were in the same match — no suggestion. The merged-away b is never
    // a candidate on its own.
    const out = findDuplicateCandidates(
      [
        guid("a", "C Phelps", { matches: [1] }),
        guid("b", "C Phelps", { matches: [2] }),
        guid("c", "C Phelps", { matches: [2] }),
      ],
      new Map([["b", "a"]]),
    );
    expect(out).toEqual([]);
  });

  it("seasonLabel formats a start year", () => {
    expect(seasonLabel(2024)).toBe("2024/25");
    expect(seasonLabel(1999)).toBe("1999/00");
  });
});

describe("planNewSuggestions", () => {
  const cands = findDuplicateCandidates(
    [guid("keep", "C Phelps", { matches: [1, 2] }), guid("dup", "C Phelps", { matches: [3] })],
    NO_MERGES,
  );

  it("persists a new pair as the duplicate pointing at the keeper", () => {
    expect(planNewSuggestions(cands, [])).toEqual([{ participantId: "dup", keeperId: "keep" }]);
  });

  it.each(["suggested", "confirmed", "rejected"] as const)(
    "skips a pair already %s (either way round)",
    (status) => {
      expect(
        planNewSuggestions(cands, [
          { participantId: "dup", mergedIntoParticipantId: "keep", mergeStatus: status },
        ]),
      ).toEqual([]);
      expect(
        planNewSuggestions(cands, [
          { participantId: "keep", mergedIntoParticipantId: "dup", mergeStatus: status },
        ]),
      ).toEqual([]);
    },
  );

  it("a rename-only row on the duplicate doesn't block a suggestion", () => {
    expect(
      planNewSuggestions(cands, [
        { participantId: "dup", mergedIntoParticipantId: null, mergeStatus: null },
      ]),
    ).toEqual([{ participantId: "dup", keeperId: "keep" }]);
  });

  it("flips the direction when the duplicate already points elsewhere", () => {
    expect(
      planNewSuggestions(cands, [
        { participantId: "dup", mergedIntoParticipantId: "other", mergeStatus: "rejected" },
      ]),
    ).toEqual([{ participantId: "keep", keeperId: "dup" }]);
  });

  it("skips the pair when both GUIDs already point elsewhere", () => {
    expect(
      planNewSuggestions(cands, [
        { participantId: "dup", mergedIntoParticipantId: "x", mergeStatus: "rejected" },
        { participantId: "keep", mergedIntoParticipantId: "y", mergeStatus: "suggested" },
      ]),
    ).toEqual([]);
  });

  it("never plans a link that would loop", () => {
    // keep -> z -> dup already (suggested); dup -> keep would close a cycle,
    // and keep already has an outgoing link, so the pair is skipped.
    expect(
      planNewSuggestions(cands, [
        { participantId: "keep", mergedIntoParticipantId: "z", mergeStatus: "suggested" },
        { participantId: "z", mergedIntoParticipantId: "dup", mergeStatus: "suggested" },
      ]),
    ).toEqual([]);
  });

  it("gives each GUID at most one outgoing suggestion in a run", () => {
    const three = findDuplicateCandidates(
      [
        guid("a", "C Phelps", { matches: [1, 2, 3] }),
        guid("b", "C Phelps", { matches: [4, 5] }),
        guid("c", "C Phelps", { matches: [6] }),
      ],
      NO_MERGES,
    );
    const plan = planNewSuggestions(three, []);
    const froms = plan.map((p) => p.participantId);
    expect(new Set(froms).size).toBe(froms.length);
    expect(plan).toEqual(
      expect.arrayContaining([
        { participantId: "b", keeperId: "a" },
        { participantId: "c", keeperId: "a" },
      ]),
    );
  });
});
