/**
 * merges.test.ts — confirmed player merges folded into central reads (hybrid
 * stats plan U6). The helpers are pure; the achievement fold is the Social
 * Studio sweep's detection step, so the "a merged pair crosses a milestone once
 * and history is never re-drafted" rule (KTD8) is pinned here without a DB.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../central", async () => {
  const schema = await vi.importActual("../central-schema");
  return { ...schema, centralDb: { select: () => ({}) } };
});

import {
  canonicalGuid,
  canonicalizeLines,
  canonicalPidSql,
  groupByCanonicalPid,
  mergeGroupMembers,
  mergesCacheArg,
} from "./merges";
import { foldMatchAchievements, type AchievementMatchMeta } from "./social-achievements";
import { aggregateVsClubLines } from "./vs-club";
import { foldGradeSeasonSocial } from "./social-recap";

const KEEPER = "keeper-guid";
const AWAY = "away-guid";
const OTHER = "other-guid";
const merges = new Map([[AWAY, KEEPER]]);

describe("merge helpers", () => {
  it("maps a merged-away GUID to its keeper and leaves everyone else alone", () => {
    expect(canonicalGuid(AWAY, merges)).toBe(KEEPER);
    expect(canonicalGuid(KEEPER, merges)).toBe(KEEPER);
    expect(canonicalGuid(OTHER, merges)).toBe(OTHER);
    expect(canonicalGuid(AWAY, undefined)).toBe(AWAY);
  });

  it("rewrites line participants and keeps blanks", () => {
    const rows = [
      { participantId: AWAY, runs: 10 },
      { participantId: KEEPER, runs: 5 },
      { participantId: null, runs: 1 },
    ];
    expect(canonicalizeLines(rows, merges).map((r) => r.participantId)).toEqual([
      KEEPER,
      KEEPER,
      null,
    ]);
    // No merges: the very same array, untouched.
    expect(canonicalizeLines(rows, new Map())).toBe(rows);
  });

  it("expands keepers to their whole group", () => {
    expect(mergeGroupMembers([KEEPER], merges).sort()).toEqual([AWAY, KEEPER].sort());
    expect(mergeGroupMembers([OTHER], merges)).toEqual([OTHER]);
  });

  it("keeps no-merge cache keys and SQL unchanged", () => {
    expect(mergesCacheArg(new Map())).toBeNull();
    expect(mergesCacheArg(undefined)).toBeNull();
    expect(mergesCacheArg(merges)).toBe(merges);
    // One bound parameter for the whole map when merges exist.
    const folded = canonicalPidSql({} as never, merges);
    const params = folded.queryChunks.filter((c) => typeof c === "string");
    expect(params).toContain(JSON.stringify({ [AWAY]: KEEPER }));
  });

  it("groups a folded builder select by ordinal (a second bound copy would not match)", () => {
    const column = { name: "participant_id" } as never;
    expect(groupByCanonicalPid(column, new Map())).toBe(column);
    const folded = groupByCanonicalPid(column, merges) as { queryChunks: unknown[] };
    expect(JSON.stringify(folded.queryChunks)).toContain("1");
    expect(folded).not.toBe(column);
  });
});

// ---------------------------------------------------------------------------
// Achievements (the draft sweep's detection): KTD8 sweep safety.
// ---------------------------------------------------------------------------

const TIERS = { games: [4], runs: [1000], wickets: [100], dismissals: [50] };
const meta = (matchId: number): AchievementMatchMeta => ({
  matchId,
  grade: "A Grade",
  season: 2020 + matchId,
  matchDate: `${2020 + matchId}-11-01`,
  round: 1,
  opponent: "Rivals CC",
});
const matches = [1, 2, 3, 4, 5].map(meta);
const roster = (participantId: string, matchId: number) => ({ participantId, matchId });
// The keeper played matches 1-3, the merged-away GUID (the same person under a
// second PlayHQ id) played 4-5.
const rosters = [
  roster(KEEPER, 1),
  roster(KEEPER, 2),
  roster(KEEPER, 3),
  roster(AWAY, 4),
  roster(AWAY, 5),
];
const names = new Map([
  [KEEPER, { displayName: "Kim Keeper", isPrivate: false }],
  [AWAY, { displayName: "K Keeper", isPrivate: false }],
]);
const fold = (targetIds: number[], m = merges as ReadonlyMap<string, string>, n = names) =>
  foldMatchAchievements({
    targetIds,
    matches,
    batting: [],
    bowling: [],
    rosters,
    fielding: [],
    names: n,
    tiers: TIERS,
    merges: m,
  });

describe("achievements over a confirmed merge", () => {
  it("a merged pair crosses a career milestone once, under the keeper", () => {
    const out = fold([4, 5]);
    const careers = out.filter((a) => a.kind === "career");
    expect(careers).toHaveLength(1);
    expect(careers[0]).toMatchObject({
      participantId: KEEPER,
      displayName: "Kim Keeper",
      matchId: 4,
      threshold: 4,
      value: 4,
    });
  });

  it("the merged-away GUID's first game is not a debut (the keeper debuted earlier)", () => {
    expect(fold([4]).filter((a) => a.kind === "debut")).toEqual([]);
    // Unmerged, the second GUID looks like a debutant — the bug merges fix.
    expect(fold([4], new Map()).filter((a) => a.kind === "debut")).toHaveLength(1);
  });

  it("a crossing that happened in an old match is never drafted from a later target", () => {
    // The combined career reached 4 games in match 4; sweeping only match 5
    // (past the watermark) must not emit it.
    expect(fold([5]).filter((a) => a.kind === "career")).toEqual([]);
  });

  it("unmerged, neither GUID alone reaches the tier", () => {
    expect(fold([4, 5], new Map()).filter((a) => a.kind === "career")).toEqual([]);
  });

  it("a private GUID folded into a public keeper omits the whole group", () => {
    const withPrivate = new Map(names);
    withPrivate.set(AWAY, { displayName: "K Keeper", isPrivate: true });
    expect(fold([1, 2, 3, 4, 5], merges, withPrivate)).toEqual([]);
  });
});

describe("other pure folds take canonicalized lines", () => {
  it("head-to-head sums a merged pair into one row", () => {
    const rows = aggregateVsClubLines({
      matchIds: [1, 2],
      batting: canonicalizeLines(
        [
          {
            matchId: 1,
            participantId: KEEPER,
            runs: 30,
            dismissal: "b X",
            dismissalType: "bowled",
          },
          { matchId: 2, participantId: AWAY, runs: 45, dismissal: "b X", dismissalType: "bowled" },
        ],
        merges,
      ),
      bowling: [],
      appearances: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ participantId: KEEPER, runs: 75, matches: 2, innings: 2 });
  });

  it("the round-up fold sums a merged pair", () => {
    const folded = foldGradeSeasonSocial(
      canonicalizeLines(
        [
          { participantId: KEEPER, runs: 20, dismissal: "b X", dismissalType: "bowled" },
          { participantId: AWAY, runs: 31, dismissal: "b X", dismissalType: "bowled" },
        ],
        merges,
      ),
      [],
      [],
    );
    expect([...folded.keys()]).toEqual([KEEPER]);
    expect(folded.get(KEEPER)?.runs).toBe(51);
  });
});
