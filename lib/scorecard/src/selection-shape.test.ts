import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDE_SIZE,
  MAX_SIDE_SIZE,
  XI_SIZE,
  normaliseSlots,
  resolveSideSize,
  roleMemberIds,
  sideShape,
  twelfthMemberId,
} from "./selection-shape";

const filled = (n: number) => Array.from({ length: n }, (_, i) => ({ memberId: i + 1 }));

describe("sideShape", () => {
  it("is the XI plus a 12th at 12", () => {
    expect(sideShape(12)).toEqual({
      size: 12,
      xi: 11,
      extras: 1,
      twelfthLabel: true,
      twelfthIndex: 11,
      roleSlots: 11,
    });
  });

  it("is the XI plus three interchange players at 14, any of them a captain or keeper", () => {
    expect(sideShape(14)).toEqual({
      size: 14,
      xi: 11,
      extras: 3,
      twelfthLabel: false,
      twelfthIndex: null,
      roleSlots: 14,
    });
  });

  it("reads an unset or out-of-range size as 12", () => {
    for (const size of [undefined, null, 11, 15, 12.5, Number.NaN]) {
      expect(sideShape(size)).toEqual(sideShape(12));
    }
  });

  it("exports the bounds", () => {
    expect([DEFAULT_SIDE_SIZE, MAX_SIDE_SIZE, XI_SIZE]).toEqual([12, 14, 11]);
    expect(resolveSideSize(13)).toBe(13);
    expect(resolveSideSize("14")).toBe(12);
  });
});

describe("normaliseSlots", () => {
  it("pads an 11-slot side to 12 by default", () => {
    const out = normaliseSlots(filled(11));
    expect(out).toHaveLength(12);
    expect(out[11]).toEqual({ memberId: null });
  });

  it("pads to the side's size", () => {
    expect(normaliseSlots(filled(12), 14)).toHaveLength(14);
  });

  it("never cuts off filled slots", () => {
    expect(normaliseSlots(filled(14), 12).map((s) => s.memberId)).toEqual(
      filled(14).map((s) => s.memberId),
    );
  });

  it("doesn't change the input", () => {
    const input = filled(11);
    normaliseSlots(input, 14);
    expect(input).toHaveLength(11);
  });
});

describe("roleMemberIds", () => {
  it("is the XI at 12: the 12th holds no role", () => {
    expect([...roleMemberIds(filled(12), 12)]).toEqual(filled(11).map((s) => s.memberId));
  });

  it("is every slot at 14", () => {
    expect(roleMemberIds(filled(14), 14).size).toBe(14);
  });

  it("skips open slots", () => {
    expect([...roleMemberIds([{ memberId: null }, { memberId: 7 }])]).toEqual([7]);
  });
});

describe("a side of 12 where all play", () => {
  const spec = { sideSize: 12, allPlay: true };

  it("has no 12th: numbered 1–12, every slot a role slot", () => {
    expect(sideShape(spec)).toEqual({
      size: 12,
      xi: XI_SIZE,
      extras: 1,
      twelfthLabel: false,
      twelfthIndex: null,
      roleSlots: 12,
    });
    expect(roleMemberIds(filled(12), spec).size).toBe(12);
    expect(twelfthMemberId(filled(12), spec)).toBeNull();
  });

  it("is a side of 12 with a 12th when allPlay is false or absent", () => {
    expect(sideShape({ sideSize: 12, allPlay: false })).toEqual(sideShape(12));
    expect(sideShape({ sideSize: null })).toEqual(sideShape(12));
    expect(twelfthMemberId(filled(12), { sideSize: 12 })).toBe(12);
  });

  it("is ignored above 12", () => {
    expect(sideShape({ sideSize: 14, allPlay: true })).toEqual(sideShape(14));
  });
});
