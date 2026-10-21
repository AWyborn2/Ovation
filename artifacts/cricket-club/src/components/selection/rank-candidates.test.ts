import { describe, it, expect } from "vitest";
import type { SelectionMember, SelectionSide } from "@workspace/api-client-react";
import { rankCandidates } from "./rank-candidates";

const member = (
  id: number,
  displayName: string,
  status: SelectionMember["status"] = "yes",
  lastGrade: string | null = "C Grade",
): SelectionMember =>
  ({
    id,
    displayName,
    status,
    note: null,
    lastGrade,
    junior: false,
    section: "senior",
    isPrivate: false,
    repliedAt: null,
    late: false,
  }) as SelectionMember;

const side = (id: number, grade: string, memberIds: number[]): SelectionSide =>
  ({
    id,
    fixture: { grade },
    slots: [
      ...memberIds.map((memberId) => ({ memberId, member: null, gap: null })),
      { memberId: null, member: null, gap: null },
    ],
  }) as unknown as SelectionSide;

const names = (c: ReturnType<typeof rankCandidates>) => c.map((x) => x.member.displayName);

describe("rankCandidates", () => {
  it("orders by status: available, maybe, no reply, unavailable", () => {
    const pool = [
      member(1, "Nora", "no"),
      member(2, "Mia", "maybe"),
      member(3, "Ned", "none"),
      member(4, "Yas", "yes"),
    ];
    expect(names(rankCandidates(pool, [side(10, "B Grade", [])], 10))).toEqual([
      "Yas",
      "Mia",
      "Ned",
      "Nora",
    ]);
  });

  it("puts players not yet picked ahead of those in another side, and reports where", () => {
    const pool = [member(1, "Alf"), member(2, "Bob")];
    const sides = [side(10, "B Grade", []), side(11, "C Grade", [1])];
    const r = rankCandidates(pool, sides, 10);
    expect(names(r)).toEqual(["Bob", "Alf"]);
    expect(r[1].alsoIn).toEqual(["C Grade"]);
  });

  it("prefers who last played this grade, then by name", () => {
    const pool = [
      member(1, "Cal", "yes", "A Grade"),
      member(2, "Dan", "yes", "B Grade"),
      member(3, "Abe"),
    ];
    expect(names(rankCandidates(pool, [side(10, "B Grade", [])], 10))).toEqual([
      "Dan",
      "Abe",
      "Cal",
    ]);
  });

  it("leaves out players already in this side and filters by name", () => {
    const pool = [member(1, "Matthew Guyton"), member(2, "Matthew Loon"), member(3, "Sam Dix")];
    const sides = [side(10, "B Grade", [2])];
    expect(names(rankCandidates(pool, sides, 10, "matt"))).toEqual(["Matthew Guyton"]);
  });

  it("caps the list", () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      member(i + 1, `P${String(i).padStart(2, "0")}`),
    );
    expect(rankCandidates(pool, [side(10, "B Grade", [])], 10)).toHaveLength(8);
  });
});
