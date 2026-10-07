/**
 * Season shirt numbers on player-centric drafts (shirt numbers plan U8, KTD11):
 * the pure stamping decision `upsertDraftByKey` applies before it compares card
 * inputs. No database — the DB-backed upsert scenarios live in
 * draft-upsert.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  SHIRT_NUMBER_DRAFT_KINDS,
  needsShirtNumberLookup,
  shirtNumberSeasonFor,
  stampShirtNumber,
  stampShirtNumberForUpsert,
  type DraftShirtNumberFacts,
} from "./draft-upsert";

const numbered: DraftShirtNumberFacts = { enabled: true, number: "9", isPrivate: false };

const milestone = { kind: "milestone", playerName: "Sam Keeper", tierLabel: "1000 Runs" };

describe("stampShirtNumber", () => {
  it("stamps the number on each player-centric kind", () => {
    for (const kind of ["century", "fiveFor", "milestone", "player", "tradingCard"]) {
      expect(stampShirtNumber({ kind, playerName: "X" }, numbered)).toEqual({
        kind,
        playerName: "X",
        shirtNumber: "9",
      });
    }
    expect([...SHIRT_NUMBER_DRAFT_KINDS].sort()).toEqual(
      ["century", "fiveFor", "milestone", "player", "tradingCard"].sort(),
    );
  });

  it("(AE4) never stamps the debut cap card, and strips a stray number from it", () => {
    const debut = { kind: "debut", playerName: "X", capNumber: 142 };
    expect(stampShirtNumber(debut, numbered)).toEqual(debut);
    expect(stampShirtNumber({ ...debut, shirtNumber: "9" }, numbered)).toEqual(debut);
  });

  it("leaves no shirtNumber with the feature off, even on a previously stamped input", () => {
    const off = { enabled: false, number: "9", isPrivate: false };
    expect(stampShirtNumber(milestone, off)).toEqual(milestone);
    expect(stampShirtNumber({ ...milestone, shirtNumber: "9" }, off)).toEqual(milestone);
  });

  it("(R15) a player with no number this season gets no shirtNumber key", () => {
    const out = stampShirtNumber(
      { kind: "century", runs: 104 },
      { enabled: true, number: null, isPrivate: false },
    );
    expect(out).toEqual({ kind: "century", runs: 104 });
    expect("shirtNumber" in out).toBe(false);
  });

  it("a private player's draft carries no shirtNumber", () => {
    expect(stampShirtNumber(milestone, { ...numbered, isPrivate: true })).toEqual(milestone);
  });

  it("without facts (no player, or the lookup failed) ensures the key is absent", () => {
    expect(stampShirtNumber({ ...milestone, shirtNumber: "9" }, null)).toEqual(milestone);
  });

  it("keeps the number verbatim (leading zeros) and replaces a stale one", () => {
    expect(
      stampShirtNumber({ ...milestone, shirtNumber: "4" }, { ...numbered, number: "07" })
        .shirtNumber,
    ).toBe("07");
  });

  it("does not mutate the caller's input", () => {
    const input = { ...milestone, shirtNumber: "4" };
    stampShirtNumber(input, numbered);
    stampShirtNumber(input, null);
    expect(input.shirtNumber).toBe("4");
  });

  it("is idempotent, so an unchanged event stays unchanged on the next sweep", () => {
    const once = stampShirtNumber(milestone, numbered);
    expect(stampShirtNumber(once, numbered)).toEqual(once);
  });
});

describe("needsShirtNumberLookup", () => {
  it("looks up only player-centric kinds with a player", () => {
    expect(needsShirtNumberLookup({ kind: "century" }, 41)).toBe(true);
    expect(needsShirtNumberLookup({ kind: "century" }, null)).toBe(false);
    expect(needsShirtNumberLookup({ kind: "century" }, undefined)).toBe(false);
    expect(needsShirtNumberLookup({ kind: "debut" }, 41)).toBe(false);
    expect(needsShirtNumberLookup({ kind: "teamList" }, 41)).toBe(false);
    expect(needsShirtNumberLookup({ kind: "matchSummary" }, 41)).toBe(false);
  });
});

describe("shirtNumberSeasonFor", () => {
  it("uses the caller's match season when given", () => {
    // A June match processed in August keeps its own (previous) season.
    expect(shirtNumberSeasonFor(2025, new Date("2026-08-10T02:00:00Z"))).toBe(2025);
  });

  it("falls back to the season of `now` only without match context", () => {
    expect(shirtNumberSeasonFor(undefined, new Date("2026-08-10T02:00:00Z"))).toBe(2026);
    expect(shirtNumberSeasonFor(null, new Date("2026-06-10T02:00:00Z"))).toBe(2025);
  });
});

describe("stampShirtNumberForUpsert (lookup failure vs no number)", () => {
  it("on a failed lookup, keeps the existing draft's number so the refresh is not a content change", () => {
    const existing = { ...milestone, shirtNumber: "9" };
    const out = stampShirtNumberForUpsert(milestone, "failed", existing);
    expect(out).toEqual(existing);
  });

  it("on a failed lookup with an existing draft that had no number, stays unnumbered", () => {
    const out = stampShirtNumberForUpsert({ ...milestone, shirtNumber: "4" }, "failed", milestone);
    expect(out).toEqual(milestone);
    expect("shirtNumber" in out).toBe(false);
  });

  it("on a failed lookup for a new draft (no existing), omits the number (fail closed)", () => {
    expect(stampShirtNumberForUpsert({ ...milestone, shirtNumber: "4" }, "failed", null)).toEqual(
      milestone,
    );
  });

  it("never carries a number onto a kind that does not show one, even on failure", () => {
    const debut = { kind: "debut", playerName: "X", capNumber: 142 };
    expect(stampShirtNumberForUpsert(debut, "failed", { ...debut, shirtNumber: "9" })).toEqual(
      debut,
    );
  });

  it("a successful lookup decides on its own: no number clears, a new number replaces", () => {
    const existing = { ...milestone, shirtNumber: "9" };
    expect(
      stampShirtNumberForUpsert(
        milestone,
        { enabled: true, number: null, isPrivate: false },
        existing,
      ),
    ).toEqual(milestone);
    expect(stampShirtNumberForUpsert(milestone, { ...numbered, number: "12" }, existing)).toEqual({
      ...milestone,
      shirtNumber: "12",
    });
    expect(stampShirtNumberForUpsert(milestone, null, existing)).toEqual(milestone);
  });
});
