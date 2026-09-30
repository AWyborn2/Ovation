/**
 * The corrections admin rules (hybrid stats plan U16; R15, KTD7, KTD8), pinned
 * on small fixtures without a database. The real-DB surface — tenant
 * isolation, the public career changing and reverting, the sweep — is
 * routes/club-corrections-isolation.test.ts (CI).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClubCorrection } from "@workspace/db";
import type {
  CentralCorrectionMatch,
  CentralParticipantMatchLine,
} from "@workspace/db/central-queries";
import {
  checkNewCorrection,
  correctionActor,
  CorrectionsStoreMissingError,
  describeCorrections,
  lineFigures,
  withCorrectionsStore,
} from "./club-corrections";

const G = "22222222-0000-4000-8000-00000000000a";
const PHQ = "phq-match-1";

const match = (over: Partial<CentralCorrectionMatch> = {}): CentralCorrectionMatch => ({
  matchId: 11,
  playhqMatchId: PHQ,
  season: 2024,
  grade: "A Grade",
  round: "3",
  matchDate: "2024-11-02",
  opponent: "Opp CC",
  clubScore: "5/150",
  opponentScore: "10/120",
  ...over,
});

const line = (over: Partial<CentralParticipantMatchLine> = {}): CentralParticipantMatchLine => ({
  participantId: G,
  matchId: 11,
  playhqMatchId: PHQ,
  grade: "A Grade",
  season: 2024,
  batting: [{ runs: 40, balls: 50, fours: 4, sixes: 1, kind: "out" }],
  bowling: [{ balls: 60, maidens: 1, runs: 30, wickets: 2, wides: 1, noBalls: 0 }],
  catches: 1,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

const input = (over: Partial<Parameters<typeof checkNewCorrection>[0]> = {}) => ({
  match: match(),
  line: line(),
  boundaries: [],
  field: "runs",
  previousValue: 40,
  newValue: 45,
  ...over,
});

describe("checkNewCorrection", () => {
  it("accepts a correction made against the central figure now", () => {
    expect(checkNewCorrection(input())).toEqual({ ok: true, field: "runs", centralValue: 40 });
    expect(
      checkNewCorrection(input({ field: "balls_bowled", previousValue: 60, newValue: 54 })),
    ).toMatchObject({ ok: true, centralValue: 60 });
    expect(
      checkNewCorrection(input({ field: "catches", previousValue: 1, newValue: 2 })),
    ).toMatchObject({ ok: true });
  });

  it("rejects a match that doesn't involve the club", () => {
    expect(checkNewCorrection(input({ match: null }))).toMatchObject({
      ok: false,
      status: 422,
      error: expect.stringMatching(/isn't one of this club's matches/),
    });
  });

  it("rejects a GUID with no line for the club in the match", () => {
    expect(checkNewCorrection(input({ line: null }))).toMatchObject({
      ok: false,
      status: 422,
      error: expect.stringMatching(/no batting, bowling or fielding line/),
    });
  });

  it("never corrects a junior match (juniors isolation)", () => {
    expect(checkNewCorrection(input({ match: match({ grade: null }) }))).toMatchObject({
      ok: false,
      status: 422,
      error: expect.stringMatching(/Junior/),
    });
  });

  it("rejects a field that isn't correctable", () => {
    for (const field of ["overs", "strike_rate", "", "runs; drop table"]) {
      expect(checkNewCorrection(input({ field }))).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("can't be born stale: previous value must equal the central figure now", () => {
    expect(checkNewCorrection(input({ previousValue: 41, newValue: 45 }))).toEqual({
      ok: false,
      status: 409,
      error: expect.stringMatching(/now 40, not 41/),
      centralValue: 40,
    });
  });

  it("can't be born stale: a match before the boundary is refused", () => {
    expect(
      checkNewCorrection(input({ boundaries: [{ grade: null, startSeason: 2025 }] })),
    ).toMatchObject({ ok: false, status: 422, error: expect.stringMatching(/boundary/) });
    // A boundary for another grade doesn't apply; the boundary season itself is central's.
    expect(
      checkNewCorrection(input({ boundaries: [{ grade: "B Grade", startSeason: 2025 }] })),
    ).toMatchObject({ ok: true });
    expect(
      checkNewCorrection(input({ boundaries: [{ grade: null, startSeason: 2024 }] })),
    ).toMatchObject({ ok: true });
  });

  it("rejects non-integers, negatives, no-ops and a not-out that isn't 0 or 1", () => {
    expect(checkNewCorrection(input({ newValue: 4.5 }))).toMatchObject({ status: 400 });
    expect(checkNewCorrection(input({ newValue: -1 }))).toMatchObject({ status: 400 });
    expect(checkNewCorrection(input({ newValue: 40 }))).toMatchObject({ status: 400 });
    expect(
      checkNewCorrection(input({ field: "not_out", previousValue: 0, newValue: 2 })),
    ).toMatchObject({ status: 400 });
    expect(
      checkNewCorrection(input({ field: "not_out", previousValue: 0, newValue: 1 })),
    ).toMatchObject({ ok: true, centralValue: 0 });
  });
});

describe("lineFigures", () => {
  it("lists every correctable figure with the value the overlay reads", () => {
    const figures = Object.fromEntries(lineFigures(line()).map((f) => [f.field, f.value]));
    expect(figures).toEqual({
      runs: 40,
      balls_faced: 50,
      fours: 4,
      sixes: 1,
      not_out: 0,
      balls_bowled: 60,
      maidens: 1,
      runs_conceded: 30,
      wickets: 2,
      wides: 1,
      no_balls: 0,
      catches: 1,
      stumpings: 0,
      run_outs: 0,
    });
  });
});

describe("describeCorrections", () => {
  const row = (over: Partial<ClubCorrection>): ClubCorrection => ({
    id: 1,
    tenantId: 7,
    playhqMatchId: PHQ,
    participantId: G,
    field: "runs",
    previousValue: 40,
    newValue: 45,
    note: null,
    createdBy: "admin:owner",
    createdAt: new Date("2026-09-30T00:00:00Z"),
    removedAt: null,
    removedBy: null,
    ...over,
  });
  const players = new Map([[G, { displayName: "Ann Able", isPrivate: false }]]);

  it("shows active and stale corrections with U10's reasons, newest first; removed ones never", () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, field: "wickets", previousValue: 3, newValue: 4 }), // central says 2
      row({ id: 3, playhqMatchId: "gone", field: "catches", previousValue: 0, newValue: 1 }),
      row({ id: 4, field: "fours", previousValue: 4, newValue: 5, removedAt: new Date() }),
    ];
    const out = describeCorrections(rows, {
      lines: [line()],
      boundaries: [],
      matches: [match()],
      players,
    });
    expect(out.map((c) => [c.id, c.status, c.staleReason, c.centralValue])).toEqual([
      [3, "stale", "not_found", null],
      [2, "stale", "mismatch", 2],
      [1, "active", null, 40],
    ]);
    expect(out[2]).toMatchObject({
      displayName: "Ann Able",
      match: expect.objectContaining({ matchId: 11, opponent: "Opp CC" }),
      createdBy: "admin:owner",
      createdAt: "2026-09-30T00:00:00.000Z",
    });
    expect(out[0]!.match).toBeNull();
  });

  it("reports a correction before a later-set boundary as stale", () => {
    const out = describeCorrections([row({})], {
      lines: [line()],
      boundaries: [{ grade: null, startSeason: 2025 }],
      matches: [match()],
      players,
    });
    expect(out[0]).toMatchObject({ status: "stale", staleReason: "before_boundary" });
  });

  it("masks a private player's name", () => {
    const out = describeCorrections([row({})], {
      lines: [line()],
      boundaries: [],
      matches: [match()],
      players: new Map([[G, { displayName: "Secret", isPrivate: true }]]),
    });
    expect(out[0]).toMatchObject({ displayName: null, isPrivate: true });
  });
});

describe("the store", () => {
  it("turns a missing corrections table into a clear 503", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    await expect(
      withCorrectionsStore(() => Promise.reject(new Error("x", { cause: missing }))),
    ).rejects.toBeInstanceOf(CorrectionsStoreMissingError);
    await expect(withCorrectionsStore(() => Promise.reject(missing))).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/migration 0021/),
    });
    const other = new Error("boom");
    await expect(withCorrectionsStore(() => Promise.reject(other))).rejects.toBe(other);
  });

  it("records the admin who acted", () => {
    expect(correctionActor({ id: 3, username: "owner" })).toBe("admin:owner");
  });
});

describe("KTD8: corrections never reach the Social Studio draft sweep", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("neither the route nor its library imports a drafter, the sweep or the social tables", () => {
    const sources = [
      join(here, "club-corrections.ts"),
      join(here, "..", "routes", "club-corrections.ts"),
    ].map((p) => readFileSync(p, "utf8"));
    for (const src of sources) {
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(imports.filter((i) => /draft|sweep|social|milestone|post-commit/i.test(i!))).toEqual(
        [],
      );
      expect(src).not.toMatch(
        /socialDraftsTable|socialSettingsTable|centralSweepWatermark|milestoneEventsTable/,
      );
    }
  });
});
