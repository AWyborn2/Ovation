/**
 * Pre-cut-over rules of the club overlay (Halls Head cut-over preview, 1 Oct
 * 2026), pinned on small fixtures without a database:
 *
 *   - CAP-ONLY players: a native player with a cap number and no stats (ids in
 *     the 95001+ range) stays a valid player for curated links after cut-over,
 *     and never enters a stat derivation.
 *
 * The real-DB surfaces are in routes/hh-precutover.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  emptyPartialFigures,
  isSeniorAppGrade,
  type CentralPartial,
  type CentralPartialFigures,
} from "@workspace/db/central-queries";
import type { Player } from "@workspace/db";
import {
  applyClubOverlay,
  buildClubIdentity,
  clubCareers,
  clubGradeLeaderboard,
  clubRecordLeaders,
  EMPTY_OVERLAY_DATA,
  overlayKeyForPlayerId,
  type ClubOverlayData,
  type OverlayHistoryRow,
} from "./club-overlay";

// ── Fixtures ────────────────────────────────────────────────────────────────

const D = "33333333-0000-4000-8000-00000000000d"; // Dan (id 10)
const R = "33333333-0000-4000-8000-00000000000e"; // Ryan (id 11)
const IDS: Record<string, number> = { [D]: 10, [R]: 11 };
const NAMES: Record<string, string> = { [D]: "Dan Howell", [R]: "Ryan Burns" };

const BOUNDARIES = [
  { grade: null, startSeason: 2003 },
  { grade: "B Grade", startSeason: 2004 },
];

const nativePlayer = (id: number, over: Partial<Player> = {}): Player => ({
  id,
  surname: "Capper",
  givenName: "Colin",
  gradesPlayed: null,
  totalGames: null,
  totalRuns: null,
  totalWickets: null,
  deceased: false,
  imageUrl: null,
  cardRole: null,
  cardRating: null,
  isFillIn: false,
  isCapOnly: true,
  ...over,
});

function identity(capOnly: Player[] = [], merges: [string, string][] = []) {
  return buildClubIdentity(
    Object.entries(IDS).map(([participantId, playerId]) => ({ participantId, playerId })),
    { nameByGuid: new Map(), canonicalByGuid: new Map(merges) },
    capOnly,
  );
}

function partial(
  participantId: string,
  grade: string,
  season: number | null,
  f: Partial<CentralPartialFigures>,
): CentralPartial {
  return { participantId, grade, season, ...emptyPartialFigures(), ...f };
}

const batted = (pid: string, grade: string, season: number, games: number, runs: number) =>
  partial(pid, grade, season, { games, batLines: games, innings: games, runs, highScore: runs });

function history(
  playerId: number,
  grade: string,
  season: number | null,
  f: Partial<OverlayHistoryRow> = {},
): OverlayHistoryRow {
  return {
    playerId,
    grade,
    season,
    grain: season === null ? "career" : "season",
    games: null,
    innings: null,
    notOuts: null,
    runs: null,
    highScore: null,
    highScoreNotOut: null,
    ballsFaced: null,
    fours: null,
    sixes: null,
    fifties: null,
    hundreds: null,
    ballsBowled: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    bestBowlingWickets: null,
    bestBowlingRuns: null,
    fiveWickets: null,
    catches: null,
    stumpings: null,
    runOuts: null,
    ...f,
  };
}

function apply(opts: {
  buckets: CentralPartial[];
  data?: Partial<ClubOverlayData>;
  capOnly?: Player[];
  merges?: [string, string][];
}) {
  const ids = [...new Set(opts.buckets.map((b) => b.participantId))];
  return applyClubOverlay({
    partials: {
      buckets: opts.buckets,
      players: ids.map((participantId) => ({
        participantId,
        displayName: NAMES[participantId] ?? null,
        isPrivate: false,
      })),
    },
    lines: [],
    identity: identity(opts.capOnly, opts.merges),
    data: { ...EMPTY_OVERLAY_DATA, ...opts.data },
    isSeniorGrade: isSeniorAppGrade,
  });
}

// ── Cap-only players ────────────────────────────────────────────────────────

describe("cap-only players (a cap number, no stats)", () => {
  const CAP = nativePlayer(95001);

  it("are known to the identity by their native row, with no GUID and no crosswalk id", () => {
    const id = identity([CAP]);
    expect(id.capOnly.get(95001)).toMatchObject({ givenName: "Colin", surname: "Capper" });
    expect(id.guidForPlayerId(95001)).toBeNull();
    expect([...id.intByGuid.values()]).not.toContain(95001);
  });

  it("an identity built without them knows none", () => {
    expect(identity().capOnly.size).toBe(0);
  });

  it("only cap-only rows in the fill-in range count: a fill-in or an ordinary id never does", () => {
    const id = identity([
      CAP,
      nativePlayer(90001, { isFillIn: true, isCapOnly: false }),
      nativePlayer(95002, { isFillIn: true }),
      nativePlayer(77),
    ]);
    expect([...id.capOnly.keys()]).toEqual([95001]);
  });

  it("an id the crosswalk already owns is a crosswalk player, not a cap-only one", () => {
    const id = buildClubIdentity(
      [{ participantId: D, playerId: 95001 }],
      { nameByGuid: new Map(), canonicalByGuid: new Map() },
      [CAP],
    );
    expect(id.capOnly.size).toBe(0);
    expect(id.guidForPlayerId(95001)).toBe(D);
  });

  it("have no overlay key, so no stats surface can read a career for them", () => {
    const overlay = {
      identity: identity([CAP]),
      data: { ...EMPTY_OVERLAY_DATA, boundaries: BOUNDARIES },
      active: true,
    };
    expect(overlayKeyForPlayerId(overlay, 95001)).toBeNull();
  });

  it("never enter a stat derivation, even when club history names their id", () => {
    const stats = apply({
      buckets: [batted(D, "A Grade", 2010, 5, 100), batted(R, "A Grade", 2010, 4, 80)],
      capOnly: [CAP],
      data: {
        boundaries: BOUNDARIES,
        history: [
          history(95001, "A Grade", null, { games: 9, innings: 9, runs: 999, catches: 9 }),
          history(95001, "A Grade", 2001, { games: 9, innings: 9, runs: 999 }),
        ],
      },
    });
    expect(
      clubCareers(stats)
        .map((c) => c.participantId)
        .sort(),
    ).toEqual([D, R].sort());
    expect(clubGradeLeaderboard(stats, "A Grade").map((r) => r.playerId)).toEqual([10, 11]);
    expect(clubRecordLeaders(stats, "runs").map((l) => l.value)).toEqual([100, 80]);
    expect([...stats.intByGuid.values()]).not.toContain(95001);
  });
});
