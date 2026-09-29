import { describe, expect, it } from "vitest";

import {
  classifyPlayer,
  linkNativeToCentral,
  type LineAssignment,
  type NativeLine,
  type PlayerLink,
  type Strength,
} from "./hh-central-crosswalk-core";
import {
  parsePersistArgs,
  planPersistence,
  type ExistingCurationRow,
  type ExistingMapRow,
  type PersistPlanInput,
} from "./persist-hh-crosswalk-core";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";

/** n assignments of one native player to one GUID, at one strength. */
function assigns(
  nativePlayerId: number,
  participantId: string,
  n: number,
  strength: Strength = "strong",
): LineAssignment[] {
  return Array.from({ length: n }, (_, i) => ({
    nativeMatchId: i + 1,
    centralMatchId: i + 1,
    nativePlayerId,
    participantId,
    figure: 1,
    name: 1,
    strength,
    reasons: [],
  }));
}

/** Classify a native player from its assignments exactly as the matcher does. */
function link(nativePlayerId: number, as: LineAssignment[], totalLines = as.length): PlayerLink {
  return classifyPlayer(nativePlayerId, as, totalLines, 0);
}

function plan(
  links: PlayerLink[],
  opts: {
    privateGuids?: string[];
    existingMap?: ExistingMapRow[];
    existingCuration?: ExistingCurationRow[];
  } = {},
) {
  const input: PersistPlanInput = {
    links,
    privateByGuid: new Map((opts.privateGuids ?? []).map((g) => [g, true])),
    existingMap: opts.existingMap ?? [],
    existingCuration: opts.existingCuration ?? [],
  };
  return planPersistence(input);
}

describe("planPersistence", () => {
  it("maps a CLEAN player with one GUID to its native id", () => {
    const l = link(17, assigns(17, A, 5));
    expect(l.status).toBe("CLEAN");
    const p = plan([l]);
    expect(p.mapInserts).toEqual([{ nativePlayerId: 17, participantId: A, playerId: 17 }]);
    expect(p.merges).toEqual([]);
    expect(p.review).toEqual([]);
    expect(p.counts).toMatchObject({ clean: 1, mapRows: 1, mergeRows: 0 });
  });

  it("splits across two GUIDs: one keeper row (most lines) plus one merge into it", () => {
    // 19 lines under A, 1 strong line under B → share 0.95, still CLEAN.
    const l = link(42, [...assigns(42, A, 19), ...assigns(42, B, 1)]);
    expect(l.status).toBe("CLEAN");
    const p = plan([l]);
    expect(p.mapInserts).toEqual([{ nativePlayerId: 42, participantId: A, playerId: 42 }]);
    expect(p.merges).toEqual([
      { nativePlayerId: 42, participantId: B, keeperParticipantId: A, kind: "insert" },
    ]);
    expect(p.counts).toMatchObject({ mapRows: 1, mergeRows: 1 });
  });

  it("merges into an existing un-merged curation row (keeps its rename) as an update", () => {
    const l = link(42, [...assigns(42, A, 19), ...assigns(42, B, 1)]);
    const p = plan([l], {
      existingCuration: [{ participantId: B, mergedIntoParticipantId: null }],
    });
    expect(p.merges).toEqual([
      { nativePlayerId: 42, participantId: B, keeperParticipantId: A, kind: "update" },
    ]);
  });

  it("sends an AMBIGUOUS player to review and writes nothing for it", () => {
    const l = link(7, [...assigns(7, A, 5), ...assigns(7, B, 5)]);
    expect(l.status).toBe("AMBIGUOUS");
    const p = plan([l]);
    expect(p.mapInserts).toEqual([]);
    expect(p.merges).toEqual([]);
    expect(p.review).toEqual([expect.objectContaining({ nativePlayerId: 7, reason: "AMBIGUOUS" })]);
    expect(p.counts.ambiguous).toBe(1);
  });

  it("never maps a fill-in (id >= 90000), even if handed a CLEAN-looking link", () => {
    const classified = link(90001, assigns(90001, A, 5));
    expect(classified.status).toBe("EXCLUDED_FILL_IN");
    // Defensive: a forged CLEAN link on a fill-in id is still refused.
    const forged: PlayerLink = { ...link(1, assigns(1, B, 5)), nativePlayerId: 90002 };
    const p = plan([classified, forged]);
    expect(p.mapInserts).toEqual([]);
    expect(p.merges).toEqual([]);
    expect(p.counts.skippedFillIn).toBe(2);
  });

  it("ignores UNMATCHED and NO_LINES players without reporting them", () => {
    const unmatched = classifyPlayer(3, [], 4, 0);
    const noLines = classifyPlayer(4, [], 0, 0);
    expect([unmatched.status, noLines.status]).toEqual(["UNMATCHED", "NO_LINES"]);
    const p = plan([unmatched, noLines]);
    expect(p.mapInserts).toEqual([]);
    expect(p.review).toEqual([]);
  });

  it("is a no-op on re-run: feeding its own writes back plans nothing new", () => {
    const links = [
      link(17, assigns(17, C, 5)),
      link(42, [...assigns(42, A, 19), ...assigns(42, B, 1)]),
    ];
    const first = plan(links);
    const second = plan(links, {
      existingMap: first.mapInserts.map((r) => ({
        participantId: r.participantId,
        playerId: r.playerId,
      })),
      existingCuration: first.merges.map((m) => ({
        participantId: m.participantId,
        mergedIntoParticipantId: m.keeperParticipantId,
      })),
    });
    expect(second.mapInserts).toEqual([]);
    expect(second.merges).toEqual([]);
    expect(second.review).toEqual([]);
    expect(second.mapUnchanged).toHaveLength(2);
    expect(second.mergesUnchanged).toHaveLength(1);
    expect(second.counts).toEqual(first.counts);
  });

  it("refuses to overwrite a different existing mapping for the keeper GUID", () => {
    const p = plan([link(17, assigns(17, A, 5))], {
      existingMap: [{ participantId: A, playerId: 500 }],
    });
    expect(p.mapInserts).toEqual([]);
    expect(p.review).toEqual([expect.objectContaining({ reason: "EXISTING_MAP_DIFFERS" })]);
  });

  it("refuses when the native id is already mapped to another GUID", () => {
    const p = plan([link(17, assigns(17, A, 5))], {
      existingMap: [{ participantId: C, playerId: 17 }],
    });
    expect(p.mapInserts).toEqual([]);
    expect(p.review).toEqual([expect.objectContaining({ reason: "NATIVE_ID_TAKEN" })]);
  });

  it("refuses a keeper GUID that two native players both pick", () => {
    const p = plan([link(17, assigns(17, A, 5)), link(18, assigns(18, A, 5))]);
    expect(p.mapInserts).toEqual([]);
    expect(p.review.map((r) => [r.nativePlayerId, r.reason])).toEqual([
      [17, "KEEPER_CLAIMED_BY_MULTIPLE_NATIVE"],
      [18, "KEEPER_CLAIMED_BY_MULTIPLE_NATIVE"],
    ]);
  });

  it("refuses a keeper GUID that is already merged away", () => {
    const p = plan([link(17, assigns(17, A, 5))], {
      existingCuration: [{ participantId: A, mergedIntoParticipantId: C }],
    });
    expect(p.mapInserts).toEqual([]);
    expect(p.review).toEqual([expect.objectContaining({ reason: "KEEPER_IS_MERGED_AWAY" })]);
  });

  it("does not merge a GUID another native player also claims", () => {
    const p = plan([
      link(42, [...assigns(42, A, 19), ...assigns(42, B, 1)]),
      link(43, assigns(43, B, 5)),
    ]);
    // Both keepers map; the shared GUID B is not folded into A.
    expect(p.mapInserts.map((r) => r.participantId).sort()).toEqual([A, B]);
    expect(p.merges).toEqual([]);
    expect(p.review).toEqual([
      expect.objectContaining({
        nativePlayerId: 42,
        participantId: B,
        reason: "MERGE_SHARED_GUID",
      }),
    ]);
  });

  it("does not merge when either GUID is private (KTD2)", () => {
    const l = link(42, [...assigns(42, A, 19), ...assigns(42, B, 1)]);
    for (const priv of [A, B]) {
      const p = plan([l], { privateGuids: [priv] });
      expect(p.mapInserts).toHaveLength(1);
      expect(p.merges).toEqual([]);
      expect(p.review).toEqual([expect.objectContaining({ reason: "MERGE_PRIVATE" })]);
    }
  });

  it("does not merge a secondary GUID backed by weak evidence only", () => {
    const l = link(42, [...assigns(42, A, 19), ...assigns(42, B, 1, "weak")]);
    const p = plan([l]);
    expect(p.merges).toEqual([]);
    expect(p.review).toEqual([expect.objectContaining({ reason: "MERGE_WEAK_EVIDENCE" })]);
  });

  it("never re-points a GUID already merged into a different keeper", () => {
    const l = link(42, [...assigns(42, A, 19), ...assigns(42, B, 1)]);
    const p = plan([l], {
      existingCuration: [{ participantId: B, mergedIntoParticipantId: C }],
    });
    expect(p.merges).toEqual([]);
    expect(p.review).toEqual([expect.objectContaining({ reason: "MERGE_EXISTING_DIFFERS" })]);
  });
});

describe("linkNativeToCentral → planPersistence (end to end on the matcher)", () => {
  const nativeLine = (matchId: number, over: Partial<NativeLine> = {}): NativeLine => ({
    matchId,
    playerId: 17,
    batted: true,
    battingPos: 3,
    runs: 20 + matchId,
    balls: 30 + matchId,
    notOut: false,
    bowled: false,
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    ...over,
  });

  it("links a native batter to its GUID from scorecard figures and plans one map row", () => {
    const matchIds = [1, 2, 3];
    const result = linkNativeToCentral({
      native: {
        players: [
          { id: 17, givenName: "Sam", surname: "Smith" },
          { id: 90001, givenName: "Fill", surname: "In" },
        ],
        matches: matchIds.map((id) => ({
          id,
          sourceKey: `ph-${id}`,
          season: 2024,
          grade: "A",
          abandoned: false,
        })),
        lines: [
          ...matchIds.map((id) => nativeLine(id)),
          nativeLine(1, { playerId: 90001, battingPos: 11, runs: 0, balls: 1 }),
        ],
      },
      central: {
        matches: matchIds.map((id) => ({
          matchId: 100 + id,
          playhqMatchId: `ph-${id}`,
          season: "2024/25",
          grade: "A Grade",
        })),
        batting: matchIds.map((id) => ({
          matchId: 100 + id,
          innings: 1,
          batOrder: 3,
          participantId: A,
          playerName: "S Smith",
          runs: 20 + id,
          balls: 30 + id,
          dismissal: "caught",
          dismissalType: "caught",
        })),
        bowling: [],
        rosters: [],
        fielding: [],
        players: [{ participantId: A, displayName: "S Smith" }],
      },
    });
    const sam = result.playerLinks.find((l) => l.nativePlayerId === 17);
    expect(sam).toMatchObject({ status: "CLEAN", participantId: A });
    const p = plan(result.playerLinks);
    expect(p.mapInserts).toEqual([{ nativePlayerId: 17, participantId: A, playerId: 17 }]);
    expect(p.mapInserts.some((r) => r.playerId >= 90000)).toBe(false);
  });
});

describe("parsePersistArgs", () => {
  it("defaults to a preview and requires --tenant=1", () => {
    expect(parsePersistArgs(["--tenant=1"])).toEqual({
      tenantId: 1,
      commit: false,
      out: undefined,
    });
    expect(parsePersistArgs([])).toEqual({ error: expect.stringContaining("--tenant=1") });
  });

  it("only writes with an explicit --commit", () => {
    expect(parsePersistArgs(["--tenant=1", "--commit", "--out=/tmp/x"])).toEqual({
      tenantId: 1,
      commit: true,
      out: "/tmp/x",
    });
  });

  it("refuses any other tenant and unknown flags", () => {
    expect(parsePersistArgs(["--tenant=2"])).toEqual({ error: expect.stringContaining("refused") });
    expect(parsePersistArgs(["--tenant=1", "--force"])).toEqual({
      error: expect.stringContaining("--force"),
    });
  });
});
