/**
 * Central achievement cards (centuries, five-fors, debuts, career milestones)
 * with the database and the central read mocked: the card shapes and source
 * keys match the native engines, the achievements family and per-grade
 * switches gate drafting, fill-ins are dropped, unmapped players keep their
 * card without a profile link (and their GUID never reaches a draft), and a
 * dismissed card is never drafted again.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type * as DraftUpsertModule from "./draft-upsert";

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const table = (name: string) => ({
    __table: name,
    tenantId: { __col: `${name}.tenant_id` },
    sourceKey: { __col: `${name}.source_key` },
    status: { __col: `${name}.status` },
    id: { __col: `${name}.id` },
    playerId: { __col: `${name}.player_id` },
    category: { __col: `${name}.category` },
    capNumber: { __col: `${name}.cap_number` },
  });
  const state = {
    rows: {} as Record<string, Row[]>,
    reset() {
      state.rows = {};
    },
  };
  const query = (rows: () => Row[]) => {
    const q = {
      where: () => q,
      limit: () => q,
      then: (ok: (v: Row[]) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(rows()).then(ok, err),
    };
    return q;
  };
  const db = {
    select: () => ({
      from: (t: { __table: string }) => query(() => state.rows[t.__table] ?? []),
    }),
  };
  return {
    state,
    db,
    socialSettingsTable: table("social_settings"),
    socialDraftsTable: table("social_drafts"),
    capRegisterTable: table("cap_register"),
    centralMatchAchievements: vi.fn(),
    findDraftByKey: vi.fn(),
    upsertDraftByKey: vi.fn(),
    identity: {
      playerIdFor: (pid: string) => ({ "g-star": 41, "g-debut": 42 })[pid] ?? null,
      isFillIn: (pid: string) => pid === "g-fillin",
      nameFor: (_pid: string, name: string | null) => name ?? "Unknown",
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  socialSettingsTable: h.socialSettingsTable,
  socialDraftsTable: h.socialDraftsTable,
  capRegisterTable: h.capRegisterTable,
}));
vi.mock("@workspace/db/central-queries", () => ({
  centralMatchAchievements: h.centralMatchAchievements,
}));
vi.mock("./roundup-central", () => ({
  loadCentralIdentity: async () => h.identity,
}));
vi.mock("./roundup", () => ({
  playerPath: (id: number | null) => (id == null ? "/players" : `/players/${id}`),
}));
vi.mock("./draft-upsert", async () => {
  const actual = await vi.importActual<typeof DraftUpsertModule>("./draft-upsert");
  return {
    draftKeys: actual.draftKeys,
    findDraftByKey: h.findDraftByKey,
    upsertDraftByKey: h.upsertDraftByKey,
  };
});

import type { CentralAchievement } from "@workspace/db/central-queries";
import {
  buildAchievementDrafts,
  centralPlayerKey,
  draftCentralAchievements,
} from "./central-achievements";
import { resolveFamilyConfig } from "./social-families";

const base = {
  grade: "A Grade",
  season: 2024,
  round: 3,
  opponent: "Rivals CC",
  matchId: 501,
};
const century = (participantId: string, displayName: string): CentralAchievement => ({
  ...base,
  kind: "century",
  participantId,
  displayName,
  runs: 112,
  balls: 98,
  notOut: true,
});
const fiveFor: CentralAchievement = {
  ...base,
  kind: "fiveFor",
  participantId: "g-unmapped",
  displayName: "U Bowler",
  wickets: 6,
  runsConceded: 20,
  overs: "8",
};
const debut: CentralAchievement = {
  ...base,
  kind: "debut",
  participantId: "g-debut",
  displayName: "D Debut",
};
const career: CentralAchievement = {
  ...base,
  kind: "career",
  participantId: "g-star",
  displayName: "R Star",
  boardKey: "runs",
  tierIndex: 0,
  threshold: 1000,
  value: 1012,
};

const on = resolveFamilyConfig({
  engineMatchSummary: true,
  engineMilestone: true,
  engineRoundUp: false,
  matchSummaryGradeConfig: {},
});

describe("buildAchievementDrafts", () => {
  it("builds the native card inputs and source keys", () => {
    const drafts = buildAchievementDrafts(
      [century("g-star", "R Star"), fiveFor, debut, career],
      h.identity,
      on,
      (playerId, grade) => (playerId === 42 && grade === "A Grade" ? 311 : null),
    );
    expect(drafts).toEqual([
      {
        sourceKey: "feat:century:A Grade:2024:3:41",
        playerId: 41,
        grade: "A Grade",
        cardInput: {
          kind: "century",
          playerName: "R Star",
          grade: "A Grade",
          runs: 112,
          balls: 98,
          notOut: true,
          opponent: "Rivals CC",
          round: 3,
          photoUrl: null,
        },
      },
      {
        sourceKey: `feat:fiveFor:A Grade:2024:3:${centralPlayerKey("g-unmapped")}`,
        playerId: null,
        grade: "A Grade",
        cardInput: {
          kind: "fiveFor",
          playerName: "U Bowler",
          grade: "A Grade",
          wickets: 6,
          runsConceded: 20,
          overs: "8",
          figures: "6/20",
          opponent: "Rivals CC",
          round: 3,
          photoUrl: null,
        },
      },
      {
        sourceKey: "debut:A Grade:42",
        playerId: 42,
        grade: "A Grade",
        cardInput: {
          kind: "debut",
          playerName: "D Debut",
          grade: "A Grade",
          capNumber: 311,
          season: "2024/25",
          opponent: "Rivals CC",
          round: 3,
          photoUrl: null,
        },
      },
      {
        sourceKey: "milestone:41:runs:0",
        playerId: 41,
        grade: "A Grade",
        cardInput: {
          kind: "milestone",
          playerName: "R Star",
          tierLabel: "1000 Runs",
          tierIndex: 0,
          milestoneLabel: "Runs",
          currentValue: 1012,
          threshold: 1000,
        },
      },
    ]);
  });

  it("never puts a participant GUID on a draft", () => {
    const drafts = buildAchievementDrafts([fiveFor], h.identity, on);
    expect(JSON.stringify(drafts)).not.toContain("g-unmapped");
    expect(centralPlayerKey("g-unmapped")).toMatch(/^c[0-9a-f]{16}$/);
  });

  it("drops a player the crosswalk maps to a fill-in id", () => {
    expect(buildAchievementDrafts([century("g-fillin", "F Fill")], h.identity, on)).toEqual([]);
  });

  it("drafts nothing while the achievements family is off", () => {
    const off = resolveFamilyConfig({
      engineMatchSummary: true,
      engineMilestone: false,
      engineRoundUp: false,
      matchSummaryGradeConfig: {},
    });
    expect(buildAchievementDrafts([century("g-star", "R Star"), career], h.identity, off)).toEqual(
      [],
    );
  });

  it("respects a per-grade switch", () => {
    const families = { ...on, achievements: { enabled: true, grades: { "A Grade": false } } };
    const other = { ...century("g-star", "R Star"), grade: "B Grade" };
    const drafts = buildAchievementDrafts(
      [century("g-star", "R Star"), other],
      h.identity,
      families,
    );
    expect(drafts.map((d) => d.grade)).toEqual(["B Grade"]);
  });
});

describe("draftCentralAchievements", () => {
  beforeEach(() => {
    h.state.reset();
    h.centralMatchAchievements.mockReset();
    h.findDraftByKey.mockReset().mockResolvedValue(null);
    h.upsertDraftByKey.mockReset().mockResolvedValue({ action: "inserted", draft: {} });
    h.state.rows.social_settings = [
      {
        tenantId: 9,
        engineMatchSummary: true,
        engineMilestone: true,
        engineRoundUp: false,
        matchSummaryGradeConfig: {},
        familyConfig: null,
      },
    ];
  });

  it("reads nothing while the achievements family is off", async () => {
    h.state.rows.social_settings[0].engineMilestone = false;
    const r = await draftCentralAchievements(9, 77, [501], new Date());
    expect(r).toEqual({ drafted: 0, skipped: 0 });
    expect(h.centralMatchAchievements).not.toHaveBeenCalled();
    expect(h.upsertDraftByKey).not.toHaveBeenCalled();
  });

  it("upserts each card through the native engine, family and keys", async () => {
    h.centralMatchAchievements.mockResolvedValue([century("g-star", "R Star"), fiveFor]);
    const seenAt = new Date("2026-11-20T10:00:00Z");
    const r = await draftCentralAchievements(9, 77, [501], seenAt);
    expect(r).toEqual({ drafted: 2, skipped: 0 });
    expect(h.centralMatchAchievements).toHaveBeenCalledWith(
      77,
      [501],
      expect.objectContaining({ runs: expect.any(Array), dismissals: expect.any(Array) }),
    );
    expect(h.upsertDraftByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 9,
        engine: "milestone",
        family: "achievements",
        sourceKey: "feat:century:A Grade:2024:3:41",
        appPath: "/players/41",
        playerId: 41,
        sourceImportedAt: seenAt,
      }),
    );
    expect(h.upsertDraftByKey).toHaveBeenCalledWith(
      expect.objectContaining({ appPath: "/players", playerId: null }),
    );
  });

  it("never re-drafts a card the club dismissed", async () => {
    h.centralMatchAchievements.mockResolvedValue([century("g-star", "R Star")]);
    h.state.rows.social_drafts = [{ id: 1 }]; // a dismissed draft holds the key
    const r = await draftCentralAchievements(9, 77, [501], new Date());
    expect(r).toEqual({ drafted: 0, skipped: 1 });
    expect(h.upsertDraftByKey).not.toHaveBeenCalled();
  });

  it("counts an unchanged re-run as nothing drafted", async () => {
    h.centralMatchAchievements.mockResolvedValue([century("g-star", "R Star")]);
    h.findDraftByKey.mockResolvedValue({ id: 5 });
    h.upsertDraftByKey.mockResolvedValue({ action: "unchanged", draft: {} });
    const r = await draftCentralAchievements(9, 77, [501], new Date());
    expect(r).toEqual({ drafted: 0, skipped: 1 });
  });
});
