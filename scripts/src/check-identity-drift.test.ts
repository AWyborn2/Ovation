import { describe, expect, it } from "vitest";
import {
  computeIdentityDrift,
  driftCandidates,
  type IdentityDriftInput,
} from "../../artifacts/api-server/src/lib/identity-drift";
import {
  DRIFT_CSV_HEADER,
  driftCsvRows,
  parseDriftArgs,
  summariseDrift,
  type TenantDriftResult,
} from "./check-identity-drift-core";

/**
 * Identity drift check (hybrid stats plan U17; R9, R10, R16; KTD2, KTD7).
 * Pure rules only — no database. The runner (check-identity-drift.ts) and the
 * admin endpoint (GET /club-identity-drift) both load a tenant's crosswalk,
 * curation and the central participants who appeared for its club, then hand
 * them to `computeIdentityDrift` — the function under test here.
 */

const KEEPER = "11111111-1111-4111-8111-111111111111";
const DUPLICATE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const SYNTHETIC = "club:44444444-4444-4444-8444-444444444444";

const input = (over: Partial<IdentityDriftInput> = {}): IdentityDriftInput => ({
  crosswalk: [
    { participantId: KEEPER, playerId: 12 },
    { participantId: DUPLICATE, playerId: 13 },
    { participantId: OTHER, playerId: 14 },
    { participantId: SYNTHETIC, playerId: 15 },
  ],
  curation: [
    {
      participantId: DUPLICATE,
      overrideDisplayName: null,
      mergedIntoParticipantId: KEEPER,
      mergeStatus: "confirmed",
    },
  ],
  present: new Set([KEEPER, DUPLICATE, OTHER]),
  centralNames: new Map(),
  curated: [
    { table: "award_winners", rowId: 5, playerId: 12, label: "Club Champion (2019)" },
    { table: "cap_register", rowId: 7, playerId: 12, label: "male cap #41", personName: "Ann A" },
    { table: "life_members", rowId: 9, playerId: 14, label: "Olive Other" },
    {
      table: "premiership_players",
      rowId: 3,
      playerId: null,
      participantId: KEEPER,
      label: "A Grade 2018",
    },
    { table: "club_roles", rowId: 2, playerId: 15, label: "President 1988 Syd Synthetic" },
  ],
  corrections: [
    { id: 31, participantId: KEEPER, playhqMatchId: "phq-1", field: "runs" },
    { id: 32, participantId: OTHER, playhqMatchId: "phq-2", field: "wickets" },
  ],
  ...over,
});

describe("computeIdentityDrift", () => {
  it("reports nothing when every GUID still appears for the club", () => {
    expect(computeIdentityDrift(input())).toEqual([]);
    expect(driftCandidates(input().crosswalk, input().curation, input().present)).toEqual([]);
  });

  it("reports a missing keeper GUID together with the curated rows and corrections that depend on it", () => {
    const items = computeIdentityDrift(input({ present: new Set([DUPLICATE, OTHER]) }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      participantId: KEEPER,
      kind: "keeper",
      playerId: 12,
      stillInCentral: false,
      mergedIntoParticipantId: null,
      mergedFrom: [DUPLICATE],
    });
    // By the crosswalk's player id (award, cap) and by GUID (premiership).
    expect(items[0]!.curatedRows).toEqual([
      { table: "award_winners", rowId: 5, label: "Club Champion (2019)" },
      { table: "cap_register", rowId: 7, label: "male cap #41" },
      { table: "premiership_players", rowId: 3, label: "A Grade 2018" },
    ]);
    expect(items[0]!.corrections).toEqual([{ id: 31, playhqMatchId: "phq-1", field: "runs" }]);
    // No name left in central: the curated row's own name is the fallback.
    expect(items[0]!.displayName).toBe("Ann A");
  });

  it("reports a confirmed merge whose merged-away GUID has disappeared", () => {
    const items = computeIdentityDrift(
      input({
        present: new Set([KEEPER, OTHER]),
        centralNames: new Map([
          [KEEPER, { displayName: "A Able", isPrivate: false }],
          [DUPLICATE, { displayName: "Ann Able", isPrivate: false }],
        ]),
      }),
    );
    expect(items).toEqual([
      {
        participantId: DUPLICATE,
        kind: "merged_away",
        playerId: 13,
        displayName: "Ann Able",
        // Still a row in central.players, but no appearance for this club.
        stillInCentral: true,
        mergedIntoParticipantId: KEEPER,
        mergedIntoDisplayName: "A Able",
        mergeStatus: "confirmed",
        mergedFrom: [],
        curatedRows: [],
        corrections: [],
      },
    ]);
  });

  it("reports a merge whose keeper GUID is missing even without a crosswalk row", () => {
    const items = computeIdentityDrift(
      input({
        crosswalk: [{ participantId: DUPLICATE, playerId: 13 }],
        present: new Set([DUPLICATE]),
      }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        participantId: KEEPER,
        kind: "keeper",
        playerId: null,
        mergedFrom: [DUPLICATE],
      }),
    ]);
  });

  it("ignores synthetic club:<uuid> keys and rejected merges", () => {
    const items = computeIdentityDrift(
      input({
        present: new Set([KEEPER, OTHER]),
        curation: [
          {
            participantId: DUPLICATE,
            overrideDisplayName: null,
            mergedIntoParticipantId: "99999999-9999-4999-8999-999999999999",
            mergeStatus: "rejected",
          },
          {
            participantId: SYNTHETIC,
            overrideDisplayName: "Syd Synthetic",
            mergedIntoParticipantId: null,
            mergeStatus: null,
          },
        ],
      }),
    );
    // DUPLICATE is still a crosswalk GUID that vanished; its rejected merge
    // target and the synthetic player are not GUIDs central ever had.
    expect(items.map((i) => [i.participantId, i.kind])).toEqual([[DUPLICATE, "keeper"]]);
  });

  it("uses the club's own name for a renamed player and lists the most-depended-on first", () => {
    const items = computeIdentityDrift(
      input({
        present: new Set(),
        curation: [
          {
            participantId: OTHER,
            overrideDisplayName: "Olive Other",
            mergedIntoParticipantId: null,
            mergeStatus: null,
          },
        ],
      }),
    );
    expect(items.map((i) => i.participantId)).toEqual([KEEPER, OTHER, DUPLICATE]);
    expect(items.find((i) => i.participantId === OTHER)).toMatchObject({
      displayName: "Olive Other",
      curatedRows: [{ table: "life_members", rowId: 9, label: "Olive Other" }],
      corrections: [{ id: 32, playhqMatchId: "phq-2", field: "wickets" }],
    });
  });
});

describe("check-identity-drift CLI rules", () => {
  it("accepts --tenant, --out and --help, and refuses anything implying a write", () => {
    expect(parseDriftArgs([])).toEqual({ tenantId: null, out: null, help: false });
    expect(parseDriftArgs(["--tenant=2", "--out=/tmp/x"])).toEqual({
      tenantId: 2,
      out: "/tmp/x",
      help: false,
    });
    expect(parseDriftArgs(["--help"])).toMatchObject({ help: true });
    for (const bad of ["--commit", "--fix", "--apply=1", "--write"]) {
      expect(parseDriftArgs([bad])).toEqual({ error: expect.stringMatching(/READ-ONLY/) });
    }
    expect(parseDriftArgs(["--tenant=abc"])).toEqual({ error: expect.stringMatching(/--tenant/) });
    expect(parseDriftArgs(["--tenant=0"])).toEqual({ error: expect.stringMatching(/--tenant/) });
    expect(parseDriftArgs(["--bogus"])).toEqual({ error: expect.stringMatching(/Unknown flag/) });
    expect(parseDriftArgs(["stray"])).toEqual({ error: expect.stringMatching(/positional/) });
  });

  const result = (over: Partial<TenantDriftResult> = {}): TenantDriftResult => ({
    tenantId: 1,
    slug: "hallshead",
    centralClubId: 1,
    checked: { crosswalkGuids: 3, syntheticKeys: 1, curationRows: 1, centralParticipants: 2 },
    centralEmpty: false,
    items: computeIdentityDrift(input({ present: new Set([DUPLICATE, OTHER]) })),
    ...over,
  });

  it("writes one CSV row per dependent row, and one bare row for a GUID with none", () => {
    const rows = driftCsvRows(result());
    expect(rows.every((r) => r.length === DRIFT_CSV_HEADER.length)).toBe(true);
    const col = (name: string) => DRIFT_CSV_HEADER.indexOf(name);
    expect(rows.map((r) => [r[col("dependent_type")], r[col("dependent_table")]])).toEqual([
      ["curated", "award_winners"],
      ["curated", "cap_register"],
      ["curated", "premiership_players"],
      ["correction", "club_corrections"],
    ]);
    expect(rows[0]![col("participant_id")]).toBe(KEEPER);
    expect(rows[0]![col("tenant_id")]).toBe(1);
    expect(rows[3]![col("dependent_row_id")]).toBe(31);

    const bare = driftCsvRows(
      result({ items: computeIdentityDrift(input({ present: new Set([KEEPER, OTHER]) })) }),
    );
    expect(bare).toHaveLength(1);
    expect(bare[0]![col("kind")]).toBe("merged_away");
    expect(bare[0]![col("dependent_type")]).toBe("");
  });

  it("summarises counts per tenant and overall", () => {
    const clean = result({ tenantId: 2, slug: "mandurah", centralClubId: 7, items: [] });
    const empty = result({
      tenantId: 3,
      slug: "new",
      centralClubId: 9,
      items: [],
      centralEmpty: true,
    });
    const summary = summariseDrift([result(), clean, empty]);
    expect(summary.totals).toEqual({
      tenantsChecked: 3,
      tenantsWithDrift: 1,
      tenantsSkippedCentralEmpty: 1,
      missingGuids: 1,
      missingKeepers: 1,
      missingMergedAway: 0,
      dependentCuratedRows: 3,
      dependentCorrections: 1,
    });
    expect(summary.tenants.map((t) => [t.tenantId, t.missingGuids])).toEqual([
      [1, 1],
      [2, 0],
      [3, 0],
    ]);
    expect(summary.tenants[0]).toMatchObject({ slug: "hallshead", centralClubId: 1 });
  });
});
