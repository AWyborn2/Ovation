/**
 * Curation merges → the club overlay's identity slice (hybrid stats plan U6,
 * KTD2). Pure: the overlay is built from curation + crosswalk rows, so the
 * status, chain, cycle, keeper-id and tenant rules are pinned without a DB.
 * The real-DB read surfaces are covered by routes/player-merge-read.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  playerCurationTable: {},
  playerIdMapTable: {},
}));

import {
  buildCurationOverlay,
  findMergeProblem,
  MAX_MERGE_CHAIN,
  type CurationRowInput,
} from "./central-curation";
import { buildClubIdentity } from "./club-overlay";

const row = (
  participantId: string,
  mergedIntoParticipantId: string | null,
  mergeStatus: CurationRowInput["mergeStatus"],
  overrideDisplayName: string | null = null,
): CurationRowInput => ({
  participantId,
  mergedIntoParticipantId,
  mergeStatus,
  overrideDisplayName,
});

describe("buildCurationOverlay: only confirmed merges fold", () => {
  it("a confirmed merge maps the duplicate to its keeper", () => {
    const o = buildCurationOverlay([row("b", "a", "confirmed")]);
    expect(o.canonicalByGuid.get("b")).toBe("a");
  });

  it("suggested and rejected merges leave both GUIDs separate", () => {
    const o = buildCurationOverlay([row("b", "a", "suggested"), row("c", "a", "rejected")]);
    expect(o.canonicalByGuid.size).toBe(0);
  });

  it("collapses a chain A -> B -> C to C", () => {
    const o = buildCurationOverlay([row("a", "b", "confirmed"), row("b", "c", "confirmed")]);
    expect(o.canonicalByGuid.get("a")).toBe("c");
    expect(o.canonicalByGuid.get("b")).toBe("c");
    expect(o.canonicalByGuid.has("c")).toBe(false);
  });

  it("a chain stops at a link that is not confirmed", () => {
    const o = buildCurationOverlay([row("a", "b", "confirmed"), row("b", "c", "suggested")]);
    expect(o.canonicalByGuid.get("a")).toBe("b");
    expect(o.canonicalByGuid.has("b")).toBe(false);
  });

  it("a legacy cycle folds nobody instead of looping", () => {
    const o = buildCurationOverlay([row("a", "b", "confirmed"), row("b", "a", "confirmed")]);
    expect(o.canonicalByGuid.size).toBe(0);
  });

  it("a chain longer than the bound folds nobody", () => {
    const rows = Array.from({ length: MAX_MERGE_CHAIN + 2 }, (_, i) =>
      row(`g${i}`, `g${i + 1}`, "confirmed"),
    );
    const o = buildCurationOverlay(rows);
    expect(o.canonicalByGuid.has("g0")).toBe(false);
  });

  it("keeps renames", () => {
    const o = buildCurationOverlay([row("a", null, null, "Alex Keeper")]);
    expect(o.nameByGuid.get("a")).toBe("Alex Keeper");
  });
});

describe("findMergeProblem: the curation write guard", () => {
  const edges = new Map([
    ["a", "b"],
    ["b", "c"],
  ]);

  it("rejects an A -> B -> A cycle", () => {
    expect(findMergeProblem(new Map([["a", "b"]]), "b", "a")).toBe("cycle");
    expect(findMergeProblem(edges, "c", "a")).toBe("cycle");
  });

  it("rejects merging a player into itself", () => {
    expect(findMergeProblem(new Map(), "a", "a")).toBe("cycle");
  });

  it("accepts a new link onto the end of a chain", () => {
    expect(findMergeProblem(edges, "d", "a")).toBeNull();
  });

  it("rejects a chain deeper than the bound", () => {
    const long = new Map(
      Array.from({ length: MAX_MERGE_CHAIN }, (_, i) => [`g${i}`, `g${i + 1}`] as const),
    );
    expect(findMergeProblem(long, "x", "g0")).toBe("too-deep");
  });
});

describe("buildClubIdentity: keeper ids and merged-away lookups", () => {
  const crosswalk = [
    { participantId: "keeper", playerId: 11 },
    { participantId: "away", playerId: 12 },
    { participantId: "solo", playerId: 13 },
  ];
  const overlay = buildCurationOverlay([
    row("away", "keeper", "confirmed"),
    row("keeper", null, null, "Kim Keeper"),
  ]);
  const identity = buildClubIdentity(crosswalk, overlay);

  it("maps every GUID in a merged group to the keeper's crosswalk id", () => {
    expect(identity.intByGuid.get("keeper")).toBe(11);
    expect(identity.intByGuid.get("away")).toBe(11);
    expect(identity.intByGuid.get("solo")).toBe(13);
  });

  it("resolves a merged-away player id to the keeper (the /players/:id rule)", () => {
    expect(identity.guidForPlayerId(12)).toBe("keeper");
    expect(identity.guidForPlayerId(11)).toBe("keeper");
    expect(identity.guidForPlayerId(999)).toBeNull();
  });

  it("lists a group keeper-first, with every crosswalk id it owns", () => {
    expect(identity.membersOf("away")).toEqual(["keeper", "away"]);
    expect(identity.intsOf("keeper")).toEqual([11, 12]);
    expect(identity.membersOf("solo")).toEqual(["solo"]);
  });

  it("names a merged group after the keeper's curated name", () => {
    expect(identity.nameFor("away", "K Keeper")).toBe("Kim Keeper");
    expect(identity.nameFor("solo", "S Solo")).toBe("S Solo");
  });

  it("a keeper with no crosswalk row takes a merged-away GUID's id", () => {
    const id = buildClubIdentity(
      [{ participantId: "away", playerId: 40 }],
      buildCurationOverlay([row("away", "keeper", "confirmed")]),
    );
    expect(id.intByGuid.get("keeper")).toBe(40);
    expect(id.guidForPlayerId(40)).toBe("keeper");
  });

  it("a merged-away GUID with no crosswalk row still resolves to the keeper's id", () => {
    const id = buildClubIdentity(
      [{ participantId: "keeper", playerId: 7 }],
      buildCurationOverlay([row("away", "keeper", "confirmed")]),
    );
    expect(id.intByGuid.get("away")).toBe(7);
  });

  it("suggested merges change no ids", () => {
    const id = buildClubIdentity(
      crosswalk,
      buildCurationOverlay([row("away", "keeper", "suggested")]),
    );
    expect(id.intByGuid.get("away")).toBe(12);
    expect(id.guidForPlayerId(12)).toBe("away");
    expect(id.merges.size).toBe(0);
  });
});
