import { describe, expect, it } from "vitest";
import {
  heldLinkMayMint,
  lineupCandidates,
  missingLineupCandidates,
  planHeldLinks,
  planLineupInserts,
  type ExistingShirtEntry,
} from "./shirt-number-sync";
import { cleanShirtNumberName, numberAfterDuplicatePolicy } from "../shirt-numbers";
import type { TeamListPlayer } from "../schema/fixtures";

/**
 * PlayHQ lineup integration for the season shirt-number register
 * (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, U5 / KTD9).
 * The planners are pure: the ingest reads the rows, the planners decide, the
 * ingest writes. DB wiring (tenant selection, inserts, links, mint) is covered
 * by CI against Postgres in artifacts/api-server/src/lib/shirt-number-sync.db.test.ts.
 */

const P = "aaaaaaaa-0000-4000-8000-000000000001";
const Q = "bbbbbbbb-0000-4000-8000-000000000002";
const R = "cccccccc-0000-4000-8000-000000000003";

const SEPT_2026 = new Date("2026-09-19T01:30:00Z");
const MAY_2026 = new Date("2026-05-02T01:30:00Z");

function row(p: Partial<TeamListPlayer> & { displayName: string }): TeamListPlayer {
  return { order: 1, ...p };
}

describe("lineupCandidates", () => {
  it("derives the season from the fixture date: September 2026 is season 2026, not 2025", () => {
    const c = lineupCandidates(
      [{ startAt: SEPT_2026, players: [row({ displayName: "Pat New", participantId: P })] }],
      new Map(),
    );
    expect(c).toEqual([{ season: 2026, participantId: P, name: "Pat New", playerId: null }]);
    const may = lineupCandidates(
      [{ startAt: MAY_2026, players: [row({ displayName: "Pat New", participantId: P })] }],
      new Map(),
    );
    expect(may[0]!.season).toBe(2025);
  });

  it("resolves the player through the tenant's crosswalk, lowercasing ids", () => {
    const c = lineupCandidates(
      [
        {
          startAt: SEPT_2026,
          players: [row({ displayName: "Linked", participantId: P.toUpperCase() })],
        },
      ],
      new Map([[P, 42]]),
    );
    expect(c).toEqual([{ season: 2026, participantId: P, name: "Linked", playerId: 42 }]);
  });

  it("skips rows without a participant, fill-ins, and repeats across fixtures; trims and caps names", () => {
    const long = "x".repeat(200);
    const c = lineupCandidates(
      [
        {
          startAt: SEPT_2026,
          players: [
            row({ displayName: "No Id" }),
            row({ displayName: "Fill In", participantId: Q, playerId: 90004 }),
            row({ displayName: `  ${long}  `, participantId: R }),
          ],
        },
        { startAt: SEPT_2026, players: [row({ displayName: "Again", participantId: R })] },
      ],
      new Map([[Q, 90004]]),
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.participantId).toBe(R);
    expect(c[0]!.name).toHaveLength(120);
  });
});

describe("planLineupInserts", () => {
  const candidate = { season: 2026, participantId: P, name: "Pat New", playerId: 42 };

  it("adds a lineup player missing from the season and carries last season's number under carry", () => {
    const inserts = planLineupInserts({
      tenantId: 7,
      candidates: [candidate],
      existing: [],
      carried: new Map([[`2026:${P}`, "23"]]),
      duplicatePolicy: "warn",
    }).inserts;
    expect(inserts).toEqual([
      {
        tenantId: 7,
        season: 2026,
        name: "Pat New",
        participantId: P,
        playerId: 42,
        number: "23",
        source: "lineup",
      },
    ]);
  });

  it("adds an unmapped player as a held entry (no playerId), unnumbered without a carried number", () => {
    const inserts = planLineupInserts({
      tenantId: 7,
      candidates: [{ ...candidate, playerId: null }],
      existing: [],
      carried: new Map(),
      duplicatePolicy: "warn",
    }).inserts;
    expect(inserts).toEqual([expect.objectContaining({ playerId: null, number: null })]);
  });

  it("is idempotent: a person already on the season's register (by participant or player) is skipped", () => {
    const existing: ExistingShirtEntry[] = [
      { season: 2026, participantId: P, playerId: null, number: "23" },
    ];
    expect(
      planLineupInserts({
        tenantId: 7,
        candidates: [candidate],
        existing,
        carried: new Map([[`2026:${P}`, "23"]]),
        duplicatePolicy: "warn",
      }).inserts,
    ).toEqual([]);
    expect(
      planLineupInserts({
        tenantId: 7,
        candidates: [candidate],
        existing: [{ season: 2026, participantId: null, playerId: 42, number: null }],
        carried: new Map(),
        duplicatePolicy: "warn",
      }).inserts,
    ).toEqual([]);
    // A different season is not "already present".
    expect(
      planLineupInserts({
        tenantId: 7,
        candidates: [candidate],
        existing: [{ season: 2025, participantId: P, playerId: 42, number: "23" }],
        carried: new Map(),
        duplicatePolicy: "warn",
      }).inserts,
    ).toHaveLength(1);
  });

  it("under block, leaves off a carried number another entry already wears and creates the entry unnumbered", () => {
    const inserts = planLineupInserts({
      tenantId: 7,
      candidates: [candidate],
      existing: [{ season: 2026, participantId: Q, playerId: 9, number: "23" }],
      carried: new Map([[`2026:${P}`, "23"]]),
      duplicatePolicy: "block",
    }).inserts;
    expect(inserts).toEqual([expect.objectContaining({ participantId: P, number: null })]);
  });

  it("under warn, keeps the carried duplicate (the admin sees the warning later)", () => {
    const inserts = planLineupInserts({
      tenantId: 7,
      candidates: [candidate],
      existing: [{ season: 2026, participantId: Q, playerId: 9, number: "23" }],
      carried: new Map([[`2026:${P}`, "23"]]),
      duplicatePolicy: "warn",
    }).inserts;
    expect(inserts[0]!.number).toBe("23");
  });

  it("under block, two new entries carrying the same number: only the first keeps it", () => {
    const inserts = planLineupInserts({
      tenantId: 7,
      candidates: [candidate, { season: 2026, participantId: R, name: "Ray", playerId: null }],
      existing: [],
      carried: new Map([
        [`2026:${P}`, "5"],
        [`2026:${R}`, "5"],
      ]),
      duplicatePolicy: "block",
    }).inserts;
    expect(inserts.map((i) => i.number)).toEqual(["5", null]);
  });
});

describe("planLineupInserts: name-only held entries (upload rows for people who had not played)", () => {
  const candidate = { season: 2026, participantId: P, name: "Pat New", playerId: 42 };
  const nameOnly = (id: number, name: string, number: string | null): ExistingShirtEntry => ({
    id,
    season: 2026,
    name,
    participantId: null,
    playerId: null,
    number,
  });

  it("attaches the lineup participant to a unique same-name held entry instead of inserting", () => {
    const plan = planLineupInserts({
      tenantId: 7,
      candidates: [candidate],
      existing: [nameOnly(11, "  PAT  new", "14")],
      carried: new Map([[`2026:${P}`, "23"]]),
      duplicatePolicy: "warn",
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.attaches).toEqual([{ entryId: 11, participantId: P, playerId: 42 }]);
  });

  it("matches names accent- and punctuation-insensitively, and attaches an unmapped player held", () => {
    const plan = planLineupInserts({
      tenantId: 7,
      candidates: [{ season: 2026, participantId: Q, name: "José O'Neil", playerId: null }],
      existing: [nameOnly(12, "Jose ONeil", "8")],
      carried: new Map(),
      duplicatePolicy: "block",
    });
    expect(plan.attaches).toEqual([{ entryId: 12, participantId: Q, playerId: null }]);
    expect(plan.inserts).toEqual([]);
  });

  it("inserts a new entry when two name-only held entries share the name (ambiguous)", () => {
    const plan = planLineupInserts({
      tenantId: 7,
      candidates: [candidate],
      existing: [nameOnly(11, "Pat New", "14"), nameOnly(13, "Pat New", "15")],
      carried: new Map(),
      duplicatePolicy: "warn",
    });
    expect(plan.attaches).toEqual([]);
    expect(plan.inserts).toEqual([expect.objectContaining({ participantId: P, number: null })]);
  });

  it("inserts both when two lineup players share the one held entry's name (ambiguous)", () => {
    const plan = planLineupInserts({
      tenantId: 7,
      candidates: [candidate, { season: 2026, participantId: R, name: "Pat New", playerId: null }],
      existing: [nameOnly(11, "Pat New", "14")],
      carried: new Map(),
      duplicatePolicy: "warn",
    });
    expect(plan.attaches).toEqual([]);
    expect(plan.inserts.map((i) => i.participantId)).toEqual([P, R]);
  });

  it("ignores held entries in another season, with ids, or with a different name", () => {
    const plan = planLineupInserts({
      tenantId: 7,
      candidates: [candidate],
      existing: [
        { ...nameOnly(11, "Pat New", "14"), season: 2025 },
        { ...nameOnly(12, "Pat New", "15"), participantId: Q },
        nameOnly(13, "Pat Newer", "16"),
      ],
      carried: new Map(),
      duplicatePolicy: "warn",
    });
    expect(plan.attaches).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });
});

describe("heldLinkMayMint (native vs crosswalk tenants)", () => {
  it("never mints for Halls Head while it reads native stats (its ids are native players.id)", () => {
    expect(heldLinkMayMint({ id: 1, readsFromCentral: false })).toBe(false);
  });

  it("mints for a crosswalk tenant: Halls Head once cut over to central, and every other tenant", () => {
    expect(heldLinkMayMint({ id: 1, readsFromCentral: true })).toBe(true);
    expect(heldLinkMayMint({ id: 7, readsFromCentral: true })).toBe(true);
    expect(heldLinkMayMint({ id: 7, readsFromCentral: false })).toBe(true);
  });
});

describe("missingLineupCandidates", () => {
  it("returns only the candidates not yet on their season's register", () => {
    const missing = missingLineupCandidates(
      [
        { season: 2026, participantId: P, name: "P", playerId: 1 },
        { season: 2026, participantId: Q, name: "Q", playerId: null },
      ],
      [{ season: 2026, participantId: P, playerId: null, number: null }],
    );
    expect(missing.map((m) => m.participantId)).toEqual([Q]);
  });
});

describe("numberAfterDuplicatePolicy", () => {
  it("keeps the number under warn, drops a taken one under block, and passes null through", () => {
    const taken = new Set(["7"]);
    expect(numberAfterDuplicatePolicy("7", taken, "warn")).toBe("7");
    expect(numberAfterDuplicatePolicy("7", taken, "block")).toBeNull();
    expect(numberAfterDuplicatePolicy("07", taken, "block")).toBe("07");
    expect(numberAfterDuplicatePolicy(null, taken, "block")).toBeNull();
  });
});

describe("cleanShirtNumberName", () => {
  it("trims, collapses whitespace and caps at 120 characters", () => {
    expect(cleanShirtNumberName("  Pat   New ")).toBe("Pat New");
    expect(cleanShirtNumberName("y".repeat(300))).toHaveLength(120);
    expect(cleanShirtNumberName(null)).toBe("");
  });
});

describe("planHeldLinks", () => {
  const held = { id: 1, tenantId: 7, season: 2026, participantId: P };

  it("links a held entry once its participant has played for the club (F2 / AE2), keeping its number", () => {
    const plan = planHeldLinks({
      tenantId: 7,
      held: [held],
      appeared: new Set([P]),
      playerIdOf: new Map([[P, 42]]),
      linked: [],
    });
    expect(plan).toEqual({ links: [{ entryId: 1, playerId: 42 }], unmapped: [] });
  });

  it("reports an appeared participant with no crosswalk row as needing a mint", () => {
    const plan = planHeldLinks({
      tenantId: 7,
      held: [held],
      appeared: new Set([P]),
      playerIdOf: new Map(),
      linked: [],
    });
    expect(plan).toEqual({ links: [], unmapped: [P] });
  });

  it("leaves an entry held when its participant was only selected (no scorecard or roster row)", () => {
    const plan = planHeldLinks({
      tenantId: 7,
      held: [held],
      appeared: new Set(),
      playerIdOf: new Map([[P, 42]]),
      linked: [],
    });
    expect(plan).toEqual({ links: [], unmapped: [] });
  });

  it("only links the tenant's own entries, through the tenant's own crosswalk", () => {
    const plan = planHeldLinks({
      tenantId: 7,
      held: [held, { id: 2, tenantId: 8, season: 2026, participantId: P }],
      appeared: new Set([P]),
      playerIdOf: new Map([[P, 42]]),
      linked: [],
    });
    expect(plan.links).toEqual([{ entryId: 1, playerId: 42 }]);
  });

  it("never links to a fill-in id, nor to a player already linked in that season", () => {
    expect(
      planHeldLinks({
        tenantId: 7,
        held: [held],
        appeared: new Set([P]),
        playerIdOf: new Map([[P, 90001]]),
        linked: [],
      }).links,
    ).toEqual([]);
    expect(
      planHeldLinks({
        tenantId: 7,
        held: [held],
        appeared: new Set([P]),
        playerIdOf: new Map([[P, 42]]),
        linked: [{ season: 2026, playerId: 42 }],
      }).links,
    ).toEqual([]);
  });

  it("compares participant ids case-insensitively", () => {
    const plan = planHeldLinks({
      tenantId: 7,
      held: [{ ...held, participantId: P.toUpperCase() }],
      appeared: new Set([P]),
      playerIdOf: new Map([[P, 42]]),
      linked: [],
    });
    expect(plan.links).toEqual([{ entryId: 1, playerId: 42 }]);
  });
});
