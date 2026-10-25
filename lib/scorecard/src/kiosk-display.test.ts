import { describe, it, expect } from "vitest";
import type { BoardDisplayConfig, KioskLook } from "@workspace/api-zod";
import {
  KIOSK_LOOK_DEFAULTS,
  resolveClubLook,
  resolveKioskDisplay,
  type KioskBoardShape,
} from "./kiosk-display";

// A club that has never saved a look: the NOT NULL legacy columns at their
// column defaults (honour_display_settings).
const LEGACY_CLUB = {
  kioskLook: {},
  kioskDwellMs: 3500,
  kioskEndHoldMs: 3000,
  kioskScrollSpeed: 36,
};

const list: KioskBoardShape = { layout: "list" };
const grid = (columns: number): KioskBoardShape => ({
  layout: "grid",
  grid: { columnHeadings: Array.from({ length: columns }, (_, i) => `Grade ${i + 1}`) },
});

describe("resolveClubLook", () => {
  it("derives a never-saved look from the legacy kiosk timings", () => {
    expect(resolveClubLook(LEGACY_CLUB)).toEqual({
      ...KIOSK_LOOK_DEFAULTS,
      pageSecs: 4, // 3.5 s dwell, rounded
      hold: 3,
      speed: 36,
    });
  });

  it("keeps a club's tuned legacy timings", () => {
    const look = resolveClubLook({
      kioskLook: {},
      kioskDwellMs: 8000,
      kioskEndHoldMs: 500,
      kioskScrollSpeed: 60,
    });
    expect(look).toMatchObject({ pageSecs: 8, hold: 1, speed: 60 });
  });

  it("prefers the saved look over the legacy timings", () => {
    const kioskLook: KioskLook = { move: "pages", trans: "flip", pageSecs: 10, hold: 5, speed: 20 };
    expect(resolveClubLook({ ...LEGACY_CLUB, kioskLook })).toMatchObject(kioskLook);
  });

  it("falls back to built-ins with no settings at all", () => {
    expect(resolveClubLook(undefined)).toEqual(KIOSK_LOOK_DEFAULTS);
    expect(resolveClubLook({ kioskLook: null })).toEqual(KIOSK_LOOK_DEFAULTS);
  });

  it("ignores junk and clamps out-of-range values in stored jsonb", () => {
    const kioskLook = {
      move: "sideways",
      trans: 7,
      size: "XXL",
      perPage: -3,
      pageSecs: 999,
      hold: Number.NaN,
      columnsPerScreen: 9,
    } as unknown as KioskLook;
    expect(resolveClubLook({ ...LEGACY_CLUB, kioskLook })).toMatchObject({
      move: KIOSK_LOOK_DEFAULTS.move,
      trans: KIOSK_LOOK_DEFAULTS.trans,
      size: KIOSK_LOOK_DEFAULTS.size,
      perPage: 0,
      pageSecs: 60,
      hold: 3, // NaN look value → legacy end hold
      columnsPerScreen: 5,
    });
  });
});

describe("resolveKioskDisplay: legacy board configs", () => {
  const look = resolveClubLook(LEGACY_CLUB);

  it("plays an unconfigured board as a credits roll, as today's TV does", () => {
    const d = resolveKioskDisplay(list, undefined, look);
    expect(d).toMatchObject({ move: "credits", trans: "fade", size: "M", columnsPerScreen: 1 });
    expect(d.durMs).toBe(800);
    expect(d.textScale).toBe(1);
    expect(d.top).toBe(20);
  });

  it.each([
    ["scroll", "credits"],
    ["slide", "pages"],
    ["wrap", "fit"],
  ] as const)("maps transition %s to move %s", (transition, move) => {
    expect(resolveKioskDisplay(grid(4), { transition }, look).move).toBe(move);
  });

  it.each([
    ["sm", "S", 0.85],
    ["md", "M", 1],
    ["lg", "L", 1.18],
  ] as const)("maps textSize %s to size %s", (textSize, size, scale) => {
    const d = resolveKioskDisplay(list, { textSize }, look);
    expect(d.size).toBe(size);
    expect(d.textScale).toBe(scale);
  });

  it("does not read the legacy full-width fit flag as shrink-to-fit", () => {
    expect(resolveKioskDisplay(list, { fit: true }, look).move).toBe("credits");
    expect(resolveKioskDisplay(list, { fit: true, transition: "slide" }, look).move).toBe("pages");
  });

  it("carries a list board's legacy column count", () => {
    expect(resolveKioskDisplay(list, { columns: 3 }, look).columnsPerScreen).toBe(3);
  });

  it("ignores legacy columns on layouts that never used them", () => {
    // The old server forced every non-list layout to one column.
    expect(resolveKioskDisplay(grid(8), { columns: 2 }, look).columnsPerScreen).toBe(4);
  });

  it("resolves a typical saved legacy config", () => {
    const saved: BoardDisplayConfig = {
      columns: 2,
      transition: "slide",
      fit: true,
      wrapBlocks: 3,
      textSize: "lg",
      density: "compact",
      heading: "Club Champions",
    };
    expect(resolveKioskDisplay(list, saved, look)).toMatchObject({
      move: "pages",
      size: "L",
      columnsPerScreen: 2,
      pageSecs: 4,
      hold: 3,
      speed: 36,
    });
  });
});

describe("resolveKioskDisplay: new settings", () => {
  const look = resolveClubLook({
    ...LEGACY_CLUB,
    kioskLook: { move: "pages", trans: "wipe", dur: "L", size: "L", columnsPerScreen: 3 },
  });

  it("inherits the club look", () => {
    expect(resolveKioskDisplay(grid(8), {}, look)).toMatchObject({
      move: "pages",
      trans: "wipe",
      durMs: 1400,
      size: "L",
      columnsPerScreen: 3,
    });
  });

  it("lets the board's own setting beat its legacy setting and the look", () => {
    const d = resolveKioskDisplay(
      list,
      { move: "fit", transition: "scroll", size: "XL", textSize: "sm", trans: "cut", dur: "S" },
      look,
    );
    expect(d).toMatchObject({ move: "fit", size: "XL", trans: "cut", dur: "S", durMs: 400 });
    expect(d.textScale).toBe(1.36);
  });

  it("overrides each timing per board", () => {
    const d = resolveKioskDisplay(list, { perPage: 8, pageSecs: 12, speed: 60, hold: 0 }, look);
    expect(d).toMatchObject({ perPage: 8, pageSecs: 12, speed: 60, hold: 0 });
  });

  it("caps columns per screen at the board's own column count", () => {
    expect(resolveKioskDisplay(grid(2), {}, look).columnsPerScreen).toBe(2);
    expect(resolveKioskDisplay(grid(2), { columnsPerScreen: 5 }, look).columnsPerScreen).toBe(2);
    expect(resolveKioskDisplay(grid(8), { columnsPerScreen: 5 }, look).columnsPerScreen).toBe(5);
  });

  it("uses composite column boards' column count the same way", () => {
    const composite: KioskBoardShape = { layout: "columns", columns: [{}, {}] };
    expect(resolveKioskDisplay(composite, {}, look).columnsPerScreen).toBe(2);
  });

  it("gives each other layout its own column default and cap", () => {
    expect(resolveKioskDisplay({ layout: "premiership" }, {}, look).columnsPerScreen).toBe(5);
    expect(resolveKioskDisplay({ layout: "lifeMembers" }, {}, look).columnsPerScreen).toBe(2);
    expect(
      resolveKioskDisplay({ layout: "premiership" }, { columnsPerScreen: 2 }, look)
        .columnsPerScreen,
    ).toBe(2);
    expect(
      resolveKioskDisplay({ layout: "lifeMembers" }, { columnsPerScreen: 5 }, look)
        .columnsPerScreen,
    ).toBe(3);
    expect(
      resolveKioskDisplay({ layout: "teamOfDecade" }, { columnsPerScreen: 4 }, look)
        .columnsPerScreen,
    ).toBe(1);
  });

  it("accepts only the leaderboard sizes for top", () => {
    expect(resolveKioskDisplay(list, { top: 50 }, look).top).toBe(50);
    expect(resolveKioskDisplay(list, { top: 37 } as BoardDisplayConfig, look).top).toBe(20);
  });
});
