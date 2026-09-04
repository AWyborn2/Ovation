/**
 * Tests for the per-match milestone detector, with `@workspace/db` replaced by
 * an in-memory fake so the real control flow runs without a database.
 *
 * The behaviour under test is the owner's requirement: a debut fires on a
 * player's first ever game in A Grade / Female A Grade, and the card carries the
 * cap number READ BACK FROM the tenant's cap register — not merely the caps this
 * one commit happened to mint.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fake @workspace/db
// ---------------------------------------------------------------------------
// Hoisted so the vi.mock factory (which vitest lifts to the top of the file) can
// close over it without hitting a temporal-dead-zone error.

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const table = (name: string) => ({
    __table: name,
    // Column stand-ins: drizzle's eq/inArray/isNotNull only stash these into an
    // un-evaluated SQL tree at build time, so plain objects are enough.
    id: { __col: `${name}.id` },
    tenantId: { __col: `${name}.tenant_id` },
    playerId: { __col: `${name}.player_id` },
    capNumber: { __col: `${name}.cap_number` },
    category: { __col: `${name}.category` },
    surname: { __col: `${name}.surname` },
    givenName: { __col: `${name}.given_name` },
    imageUrl: { __col: `${name}.image_url` },
    boardKey: { __col: `${name}.board_key` },
    value: { __col: `${name}.value` },
    payload: { __col: `${name}.payload` },
    grade: { __col: `${name}.grade` },
    games: { __col: `${name}.games` },
  });

  const playersTable = table("players");
  const milestoneEventsTable = table("milestone_events");
  const socialDraftsTable = table("social_drafts");
  const capRegisterTable = table("cap_register");
  const playerGradeStatsTable = table("player_grade_stats");

  const state = {
    rows: {} as Record<string, Row[]>,
    /** Every `.where(...)` predicate, so the tenant filter can be asserted. */
    wheres: [] as { table: string; predicate: unknown }[],
    inserts: [] as { table: string; values: Row }[],
    seq: 0,
    reset() {
      state.rows = {};
      state.wheres = [];
      state.inserts = [];
      state.seq = 0;
    },
  };

  const db = {
    select: () => ({
      from: (t: { __table: string }) => ({
        where: (predicate: unknown) => {
          state.wheres.push({ table: t.__table, predicate });
          return state.rows[t.__table] ?? [];
        },
      }),
    }),
    insert: (t: { __table: string }) => ({
      values: (values: Row) => {
        state.inserts.push({ table: t.__table, values });
        const p = Promise.resolve(undefined) as Promise<undefined> & {
          returning?: () => Promise<Row[]>;
        };
        p.returning = () => Promise.resolve([{ id: ++state.seq }]);
        return p;
      },
    }),
  };

  return {
    db,
    playersTable,
    milestoneEventsTable,
    socialDraftsTable,
    capRegisterTable,
    playerGradeStatsTable,
    state,
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  playersTable: h.playersTable,
  milestoneEventsTable: h.milestoneEventsTable,
  socialDraftsTable: h.socialDraftsTable,
  capRegisterTable: h.capRegisterTable,
  playerGradeStatsTable: h.playerGradeStatsTable,
}));

import {
  detectAndQueueMatchMilestones,
  type MatchMilestoneContext,
  type MatchMilestoneLine,
} from "./match-milestone-detector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = 4242; // deliberately distinctive, so the predicate scan can't false-positive
const DEBUTANT = 11;

/**
 * Every primitive reachable in an object graph. Used to assert a drizzle
 * predicate carries a given bound value without depending on drizzle's internal
 * SQL/Param shape, which differs between versions.
 */
function primitivesIn(o: unknown, out: unknown[] = [], seen = new Set<unknown>()): unknown[] {
  if (o === null || typeof o !== "object") {
    out.push(o);
    return out;
  }
  if (seen.has(o)) return out;
  seen.add(o);
  for (const v of Object.values(o as object)) primitivesIn(v, out, seen);
  return out;
}

function line(playerId: number, over: Partial<MatchMilestoneLine> = {}): MatchMilestoneLine {
  return {
    playerId,
    runs: null,
    balls: null,
    notOut: false,
    wickets: null,
    runsConceded: null,
    overs: null,
    ...over,
  };
}

function ctx(over: Partial<MatchMilestoneContext> = {}): MatchMilestoneContext {
  return {
    tenantId: TENANT,
    importId: 500,
    grade: "A Grade",
    season: 2025,
    round: 2,
    opponent: "Rockingham",
    abandoned: false,
    lines: [line(DEBUTANT, { runs: 24, balls: 30 })],
    createdCaps: [],
    gradeGamesBefore: new Map(),
    ...over,
  };
}

const debutEvents = () =>
  h.state.inserts.filter((i) => i.table === "milestone_events" && i.values.boardKey === "debut");
const debutDrafts = () =>
  h.state.inserts.filter(
    (i) =>
      i.table === "social_drafts" &&
      (i.values.cardInput as Record<string, unknown>).kind === "debut",
  );

beforeEach(() => {
  h.state.reset();
  h.state.rows["players"] = [
    { id: DEBUTANT, givenName: "Sam", surname: "Newman", imageUrl: null },
    { id: 90001, givenName: "Fill", surname: "In", imageUrl: null },
  ];
  h.state.rows["milestone_events"] = [];
  h.state.rows["cap_register"] = [];
});

// ---------------------------------------------------------------------------
// Cap number on the debut card (the owner's requirement)
// ---------------------------------------------------------------------------

describe("debut card cap number", () => {
  it("carries the cap number when the register row ALREADY existed", () => {
    // The regression this whole change exists for. The player is linked to a cap
    // that this commit did not mint — an admin-created link, a cap preserved
    // through a rollback, or a debut on a non-earliest match of a batch — so
    // `createdCaps` is empty and the card used to render with no cap number.
    h.state.rows["cap_register"] = [{ playerId: DEBUTANT, capNumber: 87 }];

    return detectAndQueueMatchMilestones(ctx({ createdCaps: [] })).then(() => {
      expect(debutEvents()).toHaveLength(1);
      const card = debutDrafts()[0].values.cardInput as Record<string, unknown>;
      expect(card.capNumber).toBe(87);
    });
  });

  it("carries the cap number for a cap minted by this same commit", async () => {
    // cap-sync runs inside the commit transaction, which has already closed by
    // the time post-commit social runs — so the register read sees it too.
    h.state.rows["cap_register"] = [{ playerId: DEBUTANT, capNumber: 300 }];
    await detectAndQueueMatchMilestones(
      ctx({ createdCaps: [{ capNumber: 300, category: "male", playerId: DEBUTANT }] }),
    );
    const card = debutDrafts()[0].values.cardInput as Record<string, unknown>;
    expect(card.capNumber).toBe(300);
  });

  it("falls back to this commit's freshly-minted caps if the register read misses", async () => {
    h.state.rows["cap_register"] = [];
    await detectAndQueueMatchMilestones(
      ctx({ createdCaps: [{ capNumber: 99, category: "male", playerId: DEBUTANT }] }),
    );
    const card = debutDrafts()[0].values.cardInput as Record<string, unknown>;
    expect(card.capNumber).toBe(99);
  });

  it("emits null rather than another player's number when nothing matches", async () => {
    h.state.rows["cap_register"] = [{ playerId: 77, capNumber: 500 }];
    await detectAndQueueMatchMilestones(ctx());
    const card = debutDrafts()[0].values.cardInput as Record<string, unknown>;
    expect(card.capNumber).toBeNull();
  });

  it("scopes the register read to the tenant and the grade's cap category", async () => {
    h.state.rows["cap_register"] = [{ playerId: DEBUTANT, capNumber: 87 }];
    await detectAndQueueMatchMilestones(ctx());
    const capWhere = h.state.wheres.find((w) => w.table === "cap_register");
    expect(capWhere).toBeDefined();
    const bound = primitivesIn(capWhere!.predicate);
    expect(bound).toContain(TENANT);
    expect(bound).toContain("male");
  });

  it("reads the female register for Female A Grade", async () => {
    await detectAndQueueMatchMilestones(ctx({ grade: "Female A Grade" }));
    const capWhere = h.state.wheres.find((w) => w.table === "cap_register");
    expect(primitivesIn(capWhere!.predicate)).toContain("female");
  });
});

// ---------------------------------------------------------------------------
// Which appearances count as a debut
// ---------------------------------------------------------------------------

describe("debut detection gate", () => {
  it("fires on a first-ever appearance in a cap grade", async () => {
    await detectAndQueueMatchMilestones(ctx());
    expect(debutEvents()).toHaveLength(1);
    expect(debutEvents()[0].values.tierLabel).toBe("A Grade Debut");
  });

  it("does not fire for a player who already has games in the grade", async () => {
    await detectAndQueueMatchMilestones(ctx({ gradeGamesBefore: new Map([[DEBUTANT, 34]]) }));
    expect(debutEvents()).toHaveLength(0);
  });

  it("does not fire outside the two cap grades", async () => {
    await detectAndQueueMatchMilestones(ctx({ grade: "B Grade" }));
    expect(debutEvents()).toHaveLength(0);
    expect(h.state.wheres.some((w) => w.table === "cap_register")).toBe(false);
  });

  it("does not fire for a fill-in (playerId >= 90000)", async () => {
    // Fill-ins are excluded from every stats derivation, so they read a
    // permanent 0 games and would otherwise debut on every appearance — while
    // never being issued a cap.
    await detectAndQueueMatchMilestones(ctx({ lines: [line(90001, { runs: 12 })] }));
    expect(debutEvents()).toHaveLength(0);
  });

  it("does not fire on an abandoned match", async () => {
    // An abandoned match awards no grade game and mints no cap. Firing here
    // would emit a capless card AND burn the fire-once milestone_events row,
    // permanently suppressing the player's real debut.
    await detectAndQueueMatchMilestones(ctx({ abandoned: true }));
    expect(debutEvents()).toHaveLength(0);
    expect(h.state.wheres.some((w) => w.table === "cap_register")).toBe(false);
  });

  it("still emits a century from an abandoned match (deliberately not gated)", async () => {
    await detectAndQueueMatchMilestones(
      ctx({ abandoned: true, lines: [line(DEBUTANT, { runs: 132, balls: 96 })] }),
    );
    expect(debutEvents()).toHaveLength(0);
    expect(
      h.state.inserts.filter(
        (i) => i.table === "milestone_events" && i.values.boardKey === "century",
      ),
    ).toHaveLength(1);
  });

  it("does not re-fire a debut already recorded for the same grade", async () => {
    h.state.rows["milestone_events"] = [
      {
        playerId: DEBUTANT,
        boardKey: "debut",
        value: 1,
        payload: { grade: "A Grade", season: 2024, round: 1 },
      },
    ];
    await detectAndQueueMatchMilestones(ctx());
    expect(debutEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

describe("tenant scoping", () => {
  it("stamps the committing tenant on both the milestone event and the draft", async () => {
    h.state.rows["cap_register"] = [{ playerId: DEBUTANT, capNumber: 87 }];
    await detectAndQueueMatchMilestones(ctx());
    expect(debutEvents()[0].values.tenantId).toBe(TENANT);
    expect(debutDrafts()[0].values.tenantId).toBe(TENANT);
  });

  it("scopes the fire-once de-dup read to the tenant", async () => {
    await detectAndQueueMatchMilestones(ctx());
    const dedupe = h.state.wheres.find((w) => w.table === "milestone_events");
    expect(dedupe).toBeDefined();
    expect(primitivesIn(dedupe!.predicate)).toContain(TENANT);
  });
});
