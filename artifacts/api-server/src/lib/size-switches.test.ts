import { describe, expect, it } from "vitest";
import { checkSizeSwitches, type SizeSwitchState } from "./size-switches";

const club = (over: Partial<SizeSwitchState> = {}): SizeSwitchState => ({
  sizeSquare: false,
  sizePortrait: true,
  sizeStory: true,
  sizeLandscape: false,
  ...over,
});

const BOOLS = [false, true] as const;

describe("checkSizeSwitches (portrait and story sizes plan, Stage 6)", () => {
  it("refuses an older size coming back on, allows it staying on or going off", () => {
    expect(checkSizeSwitches(club(), { sizeSquare: true })).toHaveProperty("error");
    expect(checkSizeSwitches(club(), { sizeLandscape: true })).toHaveProperty("error");
    expect(checkSizeSwitches(club({ sizeSquare: true }), { sizeSquare: true })).toEqual({
      columns: { sizeSquare: true },
    });
    expect(checkSizeSwitches(club({ sizeLandscape: true }), { sizeLandscape: false })).toEqual({
      columns: { sizeLandscape: false },
    });
  });

  it("Portrait and Story switch freely while a feed size stays", () => {
    expect(checkSizeSwitches(club(), { sizeStory: false })).toEqual({
      columns: { sizeStory: false },
    });
    expect(
      checkSizeSwitches(club({ sizePortrait: false, sizeSquare: true }), { sizePortrait: true }),
    ).toEqual({ columns: { sizePortrait: true } });
  });

  it("no save ever leaves a club without a feed size", () => {
    // Every stored combination of the four switches, every patch of them.
    const states: SizeSwitchState[] = [];
    for (const sizeSquare of BOOLS)
      for (const sizePortrait of BOOLS)
        for (const sizeStory of BOOLS)
          for (const sizeLandscape of BOOLS)
            states.push({ sizeSquare, sizePortrait, sizeStory, sizeLandscape });
    const patchValues = [undefined, false, true] as const;
    for (const current of states) {
      if (!current.sizeSquare && !current.sizePortrait) continue; // no feed size to keep
      for (const sizeSquare of patchValues)
        for (const sizePortrait of patchValues)
          for (const sizeStory of patchValues)
            for (const sizeLandscape of patchValues) {
              const out = checkSizeSwitches(current, {
                sizeSquare,
                sizePortrait,
                sizeStory,
                sizeLandscape,
              });
              if ("error" in out) continue;
              const after = { ...current, ...out.columns };
              expect(after.sizeSquare || after.sizePortrait).toBe(true);
              expect(after.sizeSquare && !current.sizeSquare).toBe(false);
              expect(after.sizeLandscape && !current.sizeLandscape).toBe(false);
            }
    }
  });

  it("Square going off with Portrait off switches Portrait on", () => {
    expect(
      checkSizeSwitches(club({ sizeSquare: true, sizePortrait: false }), { sizeSquare: false }),
    ).toEqual({ columns: { sizeSquare: false, sizePortrait: true } });
  });

  it("refuses Portrait off while Square is off", () => {
    expect(checkSizeSwitches(club(), { sizePortrait: false })).toEqual({
      error: "Portrait is your feed size, so it stays on.",
    });
  });
});
