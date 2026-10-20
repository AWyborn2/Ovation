import { describe, expect, it } from "vitest";
import { META_CAROUSEL_MAX_SLIDES, groupSlides } from "./card-sets";

/** A carousel item: id, junior flag and club day. */
type Item = { id: string; junior: boolean; day: string };
const item = (id: string, junior: boolean, day = "2026-10-10"): Item => ({ id, junior, day });

const opts = (over: Partial<Parameters<typeof groupSlides<Item>>[2]> = {}) => ({
  junior: (i: Item) => i.junior,
  dayOf: (i: Item) => i.day,
  consolidateByDay: true,
  capacity: 4,
  ...over,
});

const shape = (plan: ReturnType<typeof groupSlides<Item>>) =>
  plan.groups.map((g) => `${g.role}:${g.items.map((i) => i.id).join("+")}`);

describe("groupSlides (junior same-day slides)", () => {
  it("puts the junior items of one day on one slide", () => {
    const plan = groupSlides(
      "matchDay",
      [item("j1", true), item("j2", true), item("j3", true)],
      opts(),
    );
    expect(shape(plan)).toEqual(["day:j1+j2+j3"]);
    expect(plan.groups[0]).toMatchObject({ role: "day", junior: true, day: "2026-10-10" });
  });

  it("groups by day: Saturday's games and Sunday's games get their own slides", () => {
    const items = [
      item("sat1", true, "2026-10-10"),
      item("sun1", true, "2026-10-11"),
      item("sat2", true, "2026-10-10"),
      item("sun2", true, "2026-10-11"),
    ];
    expect(shape(groupSlides("results", items, opts()))).toEqual([
      "day:sat1+sat2",
      "day:sun1+sun2",
    ]);
  });

  it("splits a day at the capacity, as evenly as it can", () => {
    const seven = Array.from({ length: 7 }, (_, i) => item(`j${i + 1}`, true));
    expect(shape(groupSlides("matchDay", seven, opts({ capacity: 4 })))).toEqual([
      "day:j1+j2+j3+j4",
      "day:j5+j6+j7",
    ]);
    const five = seven.slice(0, 5);
    // 3 + 2, never 4 + 1.
    expect(shape(groupSlides("matchDay", five, opts({ capacity: 4 })))).toEqual([
      "day:j1+j2+j3",
      "day:j4+j5",
    ]);
  });

  it("a day with one junior game keeps the ordinary single slide", () => {
    const plan = groupSlides(
      "matchDay",
      [item("sat", true, "2026-10-10"), item("sun", true, "2026-10-11")],
      opts(),
    );
    expect(shape(plan)).toEqual(["single:sat", "single:sun"]);
    expect(plan.groups.every((g) => g.junior && g.day === null)).toBe(true);
  });

  it("never mixes senior and junior items, and keeps the admin's order", () => {
    const items = [
      item("a-grade", false),
      item("u13", true),
      item("b-grade", false),
      item("u15", true),
      item("c-grade", false),
    ];
    const plan = groupSlides("matchDay", items, opts());
    // The day's slide sits where its first junior game was; seniors keep a slide each.
    expect(shape(plan)).toEqual([
      "single:a-grade",
      "day:u13+u15",
      "single:b-grade",
      "single:c-grade",
    ]);
    for (const g of plan.groups) {
      if (g.role === "day") expect(g.items.every((i) => i.junior)).toBe(true);
      else expect(g.junior).toBe(g.items[0].junior);
    }
  });

  it("senior items on the same day are never consolidated", () => {
    const seniors = [item("a", false), item("b", false), item("c", false)];
    expect(shape(groupSlides("matchDay", seniors, opts()))).toEqual([
      "single:a",
      "single:b",
      "single:c",
    ]);
  });

  it("one item per slide when the club's switch is off", () => {
    const items = [item("j1", true), item("j2", true)];
    expect(shape(groupSlides("matchDay", items, opts({ consolidateByDay: false })))).toEqual([
      "single:j1",
      "single:j2",
    ]);
  });

  it("one item per slide for set types that don't consolidate, or a capacity of one", () => {
    const items = [item("j1", true), item("j2", true)];
    expect(shape(groupSlides("teamList", items, opts()))).toEqual(["single:j1", "single:j2"]);
    expect(shape(groupSlides("matchDay", items, opts({ capacity: 1 })))).toEqual([
      "single:j1",
      "single:j2",
    ]);
  });

  it("applies to Match Day, Results and Match Summary sets", () => {
    const items = [item("j1", true), item("j2", true)];
    for (const kind of ["matchDay", "results", "matchSummary"])
      expect(shape(groupSlides(kind, items, opts())), kind).toEqual(["day:j1+j2"]);
  });

  it("warns past Meta's ten slides, counting the reserved title and sponsors pages", () => {
    const eight = Array.from({ length: 8 }, (_, i) => item(`s${i}`, false));
    const atLimit = groupSlides("matchDay", eight, opts({ reserved: 2 }));
    expect(atLimit.slideCount).toBe(META_CAROUSEL_MAX_SLIDES);
    expect(atLimit.warning).toBeUndefined();
    const over = groupSlides("matchDay", [...eight, item("s8", false)], opts({ reserved: 2 }));
    expect(over.slideCount).toBe(11);
    expect(over.warning).toMatch(/11 slides.*at most 10/);
  });

  it("consolidation can bring a carousel back under the limit", () => {
    const juniors = Array.from({ length: 12 }, (_, i) => item(`j${i}`, true));
    const off = groupSlides("matchDay", juniors, opts({ consolidateByDay: false, reserved: 2 }));
    expect(off.warning).toBeDefined();
    const on = groupSlides("matchDay", juniors, opts({ capacity: 4, reserved: 2 }));
    expect(on.slideCount).toBe(5);
    expect(on.warning).toBeUndefined();
  });

  it("an empty carousel has no slides of its own", () => {
    expect(groupSlides("matchDay", [], opts()).groups).toEqual([]);
  });
});
