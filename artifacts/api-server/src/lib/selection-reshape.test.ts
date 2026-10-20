import { describe, expect, it } from "vitest";
import type { SelectionSlot } from "@workspace/db";
import { reshapeDraft } from "./selection-reshape";

/** A draft's slots: ids 1..n filled, then open slots up to `size`. */
const slots = (n: number, size = n): SelectionSlot[] =>
  Array.from({ length: size }, (_, i) => ({ memberId: i < n ? i + 1 : null }));

const draft = (over: Partial<Parameters<typeof reshapeDraft>[0]> = {}) => ({
  slots: slots(12),
  sideSize: 12 as number | null,
  allPlay: false,
  captainMemberId: 1 as number | null,
  keeperMemberId: 2 as number | null,
  state: "draft" as const,
  ...over,
});

describe("reshapeDraft", () => {
  it("leaves a draft that already matches its grade", () => {
    expect(reshapeDraft(draft(), { sideSize: 12, allPlay: false })).toBeNull();
    expect(reshapeDraft(draft({ sideSize: null }), { sideSize: 12, allPlay: false })).toBeNull();
  });

  it("never touches a finalised side", () => {
    expect(reshapeDraft(draft({ state: "final" }), { sideSize: 14, allPlay: false })).toBeNull();
  });

  it("grows a side of 12 to 14: the same players, two open slots, roles kept", () => {
    const next = reshapeDraft(draft(), { sideSize: 14, allPlay: false })!;
    expect(next.sideSize).toBe(14);
    expect(next.allPlay).toBe(false);
    expect(next.slots.map((s) => s.memberId)).toEqual([
      ...slots(12).map((s) => s.memberId),
      null,
      null,
    ]);
    expect(next.captainMemberId).toBe(1);
    expect(next.keeperMemberId).toBe(2);
    expect(next.from).toEqual({ sideSize: 12, allPlay: false });
    expect(next.rolesCleared).toEqual([]);
  });

  it("switches a side of 12 to numbered 1–12 without moving anyone", () => {
    const next = reshapeDraft(draft(), { sideSize: 12, allPlay: true })!;
    expect(next).toMatchObject({ sideSize: 12, allPlay: true });
    expect(next.slots).toEqual(slots(12));
  });

  it("back to XI + 12th: a captain or keeper in slot 12 loses the role", () => {
    const next = reshapeDraft(draft({ allPlay: true, keeperMemberId: 12 }), {
      sideSize: 12,
      allPlay: false,
    })!;
    expect(next.allPlay).toBe(false);
    expect(next.keeperMemberId).toBeNull();
    expect(next.captainMemberId).toBe(1);
    expect(next.rolesCleared).toEqual([{ role: "keeper", memberId: 12, twelfth: true }]);
  });

  it("shrinks a side of 14 to 12 when its last slots are empty", () => {
    const next = reshapeDraft(draft({ sideSize: 14, slots: slots(12, 14) }), {
      sideSize: 12,
      allPlay: false,
    })!;
    expect(next.sideSize).toBe(12);
    expect(next.slots).toEqual(slots(12));
  });

  it("never drops a player: a full side of 14 keeps its size when the grade goes to 12", () => {
    expect(
      reshapeDraft(draft({ sideSize: 14, slots: slots(14) }), { sideSize: 12, allPlay: false }),
    ).toBeNull();
  });

  it("keeps a slot holding a PlayHQ gap", () => {
    const withGap = slots(12, 14);
    withGap[13] = { memberId: null, gap: { name: "Private Player", reason: "not_on_register" } };
    expect(
      reshapeDraft(draft({ sideSize: 14, slots: withGap }), { sideSize: 13, allPlay: false }),
    ).toBeNull();
  });

  it("reads a legacy 11-slot draft as 12 and grows it", () => {
    const next = reshapeDraft(draft({ sideSize: null, slots: slots(11) }), {
      sideSize: 13,
      allPlay: false,
    })!;
    expect(next.slots).toHaveLength(13);
  });
});
