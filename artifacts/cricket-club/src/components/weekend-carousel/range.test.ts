import { describe, it, expect } from "vitest";
import { rangeForSet } from "./model";
describe("carousel default weekends in Perth", () => {
  it("offers current/upcoming lists and the last completed results weekend", () => {
    const thursday = new Date("2026-10-08T02:00:00Z");
    expect(rangeForSet("teamList", thursday)).toEqual({ from: "2026-10-09", to: "2026-10-11" });
    expect(rangeForSet("results", thursday)).toEqual({ from: "2026-10-02", to: "2026-10-04" });
    expect(rangeForSet("matchSummary", new Date("2026-10-11T15:59:59Z"))).toEqual({ from: "2026-10-02", to: "2026-10-04" });
    expect(rangeForSet("matchSummary", new Date("2026-10-11T16:00:00Z"))).toEqual({ from: "2026-10-09", to: "2026-10-11" });
  });
});
