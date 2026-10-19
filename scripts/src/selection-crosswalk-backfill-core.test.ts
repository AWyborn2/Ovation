import { describe, it, expect } from "vitest";
import {
  parseBackfillArgs,
  planCrosswalkBackfill,
  type BackfillMember,
} from "./selection-crosswalk-backfill-core";

/** The Selection Hub crosswalk backfill's rules (ADR-008 §4). Pure — no database. */

const member = (
  id: number,
  firstName: string,
  lastName: string,
  extra: Partial<BackfillMember> = {},
): BackfillMember => ({
  id,
  firstName,
  lastName,
  preferredName: null,
  linkedPlayerId: null,
  active: true,
  gradeHint: null,
  section: "senior",
  ...extra,
});

const G = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const MEMBERS = [
  member(1, "Adam", "Smith", { linkedPlayerId: 41 }),
  member(2, "Priya", "Patel", { linkedPlayerId: 42 }),
  member(3, "Sam", "Lee"),
  member(4, "Sam", "Lee"),
  member(5, "Ben", "Cole", { linkedPlayerId: 50 }),
  member(6, "Ben", "Cole Jr", { linkedPlayerId: 50 }),
];

describe("planCrosswalkBackfill", () => {
  it("seeds a GUID whose rows resolve to one member, by name or by link", () => {
    const plan = planCrosswalkBackfill({
      members: MEMBERS,
      existing: new Map(),
      lists: [
        {
          fixtureId: 1,
          grade: "A Grade",
          players: [
            { order: 1, displayName: "Adam Smith", participantId: G(1).toUpperCase() },
            { order: 2, displayName: "Private Player", playerId: 42, participantId: G(2) },
          ],
        },
        {
          fixtureId: 2,
          grade: "B Grade",
          players: [{ order: 1, displayName: "Adam Smith", playerId: 41, participantId: G(1) }],
        },
      ],
    });
    expect(plan.rows).toEqual([
      expect.objectContaining({
        participantId: G(1),
        action: "insert",
        memberId: 1,
        memberName: "Adam Smith",
        rows: 2,
        grades: ["A Grade", "B Grade"],
        via: ["matcher"],
      }),
      expect.objectContaining({
        participantId: G(2),
        action: "insert",
        memberId: 2,
        via: ["link"],
      }),
    ]);
    expect(plan.counts).toEqual({ insert: 2, already: 0, conflict: 0, conflict_existing: 0 });
  });

  it("leaves an ambiguous name, a shared link, a fill-in id and a row with no GUID unresolved", () => {
    const plan = planCrosswalkBackfill({
      members: MEMBERS,
      existing: new Map(),
      lists: [
        {
          fixtureId: 1,
          grade: "A Grade",
          players: [
            { order: 1, displayName: "Sam Lee", participantId: G(3) },
            { order: 2, displayName: "Private Player", playerId: 50, participantId: G(5) },
            { order: 3, displayName: "Private Player", playerId: 90_001, participantId: G(6) },
            { order: 4, displayName: "Private Player", participantId: G(7) },
            { order: 5, displayName: "Adam Smith" },
          ],
        },
      ],
    });
    expect(plan.rows).toEqual([]);
    expect(plan.unresolvedRows).toBe(4);
    expect(plan.participants).toBe(4);
  });

  it("never seeds a GUID whose rows disagree, nor overwrites an existing row", () => {
    const plan = planCrosswalkBackfill({
      members: MEMBERS,
      existing: new Map([
        [G(2), 2],
        [G(8), 1],
      ]),
      lists: [
        {
          fixtureId: 1,
          grade: "A Grade",
          players: [
            { order: 1, displayName: "Adam Smith", participantId: G(9) },
            { order: 2, displayName: "Priya Patel", participantId: G(9) },
            { order: 3, displayName: "Priya Patel", participantId: G(2) },
            { order: 4, displayName: "Priya Patel", participantId: G(8) },
          ],
        },
      ],
    });
    const byGuid = new Map(plan.rows.map((r) => [r.participantId, r]));
    expect(byGuid.get(G(9))).toMatchObject({ action: "conflict", memberIds: [1, 2] });
    expect(byGuid.get(G(2))).toMatchObject({ action: "already", existingMemberId: 2 });
    expect(byGuid.get(G(8))).toMatchObject({ action: "conflict_existing", existingMemberId: 1 });
    expect(plan.counts.insert).toBe(0);
  });

  it("prefers the senior record for a name on both registers", () => {
    const plan = planCrosswalkBackfill({
      members: [member(10, "Eve", "Lee", { section: "junior" }), member(11, "Eve", "Lee")],
      existing: new Map(),
      lists: [
        {
          fixtureId: 1,
          grade: "A Grade",
          players: [{ order: 1, displayName: "Eve Lee", participantId: G(10) }],
        },
      ],
    });
    expect(plan.rows[0]).toMatchObject({ memberId: 11, action: "insert" });
  });
});

describe("parseBackfillArgs", () => {
  it("needs a tenant, previews by default and writes only with --apply", () => {
    expect(parseBackfillArgs(["--tenant=3"])).toEqual({ tenantId: 3, apply: false, out: null });
    expect(parseBackfillArgs(["--tenant=3", "--apply", "--yes", "--out=/tmp/x"])).toEqual({
      tenantId: 3,
      apply: true,
      out: "/tmp/x",
    });
    expect(parseBackfillArgs([])).toHaveProperty("error");
    expect(parseBackfillArgs(["--tenant=0"])).toHaveProperty("error");
    expect(parseBackfillArgs(["--tenant=3", "--commit"])).toHaveProperty("error");
  });
});
