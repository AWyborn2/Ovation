import { describe, expect, it } from "vitest";
import {
  CONTENT_FIELDS,
  combinedRoundLabel,
  contentInput,
  dateRangeLabel,
  defaultCardContentSettings,
  matchDayDraftInput,
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
  readCardContent,
  readCardContentSettings,
  readContentOverride,
  resolveVisibleFields,
  type MatchDayFixtureLike,
} from "./index";

const CORE = CONTENT_FIELDS.matchDay.filter((f) => f.tier === "core").map((f) => f.key);
const OPTIONAL = CONTENT_FIELDS.matchDay.filter((f) => f.tier === "optional").map((f) => f.key);

describe("content field catalogue", () => {
  it("keys are unique, slide-prefixed, and core fields are in every preset", () => {
    const keys = CONTENT_FIELDS.matchDay.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of CONTENT_FIELDS.matchDay) {
      expect(f.key.startsWith(`${f.slide}.`)).toBe(true);
      if (f.tier === "core") expect([...f.presets].sort()).toEqual(["full", "minimal", "standard"]);
    }
  });

  it("Minimal is core only; Standard and Full show every field built so far", () => {
    expect([...presetFields("matchDay", "minimal")].sort()).toEqual([...CORE].sort());
    expect([...presetFields("matchDay", "standard")].sort()).toEqual([...CORE, ...OPTIONAL].sort());
    expect([...presetFields("matchDay", "full")].sort()).toEqual([...CORE, ...OPTIONAL].sort());
  });
});

describe("resolveVisibleFields", () => {
  it("defaults to Standard", () => {
    expect(resolveVisibleFields("matchDay")).toEqual(presetFields("matchDay", "standard"));
  });

  it("core fields stay on whatever the choices say", () => {
    const off = Object.fromEntries(CORE.map((k) => [k, false]));
    const v = resolveVisibleFields("matchDay", { preset: "minimal", fields: off }, { fields: off });
    for (const k of CORE) expect(v.has(k)).toBe(true);
  });

  it("the club's per-field choices sit on top of its preset", () => {
    const v = resolveVisibleFields("matchDay", {
      preset: "minimal",
      fields: { "fixture.oppositionCrest": true },
    });
    expect(v.has("fixture.oppositionCrest")).toBe(true);
    expect(v.has("fixture.photo")).toBe(false);
    const w = resolveVisibleFields("matchDay", {
      preset: "standard",
      fields: { "fixture.photo": false },
    });
    expect(w.has("fixture.photo")).toBe(false);
    expect(w.has("fixture.round")).toBe(true);
  });

  it("a carousel override wins over the club's choices", () => {
    const club = { preset: "standard" as const, fields: { "fixture.photo": false } };
    expect(resolveVisibleFields("matchDay", club, { fields: { "fixture.photo": true } })).toEqual(
      presetFields("matchDay", "standard"),
    );
  });

  it("an override preset starts again from that preset, dropping the club's field choices", () => {
    const club = { preset: "standard" as const, fields: { "fixture.round": false } };
    const v = resolveVisibleFields("matchDay", club, {
      preset: "full",
      fields: { "fixture.photo": false },
    });
    expect(v.has("fixture.round")).toBe(true);
    expect(v.has("fixture.photo")).toBe(false);
  });

  it("an unknown kind shows nothing", () => {
    expect(resolveVisibleFields("ladder").size).toBe(0);
  });
});

describe("readCardContentSettings / readContentOverride", () => {
  it("fills defaults: Standard, junior consolidation on", () => {
    expect(readCardContentSettings(null)).toEqual(defaultCardContentSettings());
    expect(readCardContentSettings({})).toEqual({
      matchDay: { preset: "standard", fields: {}, juniorConsolidateByDay: true },
    });
  });

  it("drops unknown kinds, presets, core keys and non-boolean choices", () => {
    expect(
      readCardContentSettings({
        matchDay: {
          preset: "huge",
          fields: { "fixture.photo": false, "fixture.venue": false, nope: true, "title.round": 1 },
          juniorConsolidateByDay: false,
        },
        ladder: { preset: "full" },
      }),
    ).toEqual({
      matchDay: {
        preset: "standard",
        fields: { "fixture.photo": false },
        juniorConsolidateByDay: false,
      },
    });
  });

  it("an empty or invalid override is no override", () => {
    expect(readContentOverride("matchDay", {})).toBeNull();
    expect(readContentOverride("matchDay", { preset: "x", fields: { y: true } })).toBeNull();
    expect(readContentOverride("ladder", { preset: "full" })).toBeNull();
    expect(readContentOverride("matchDay", { preset: "minimal" })).toEqual({ preset: "minimal" });
  });

  it("keeps swapped photos (an id, or null for no photo) and drops anything else (P4)", () => {
    expect(
      readContentOverride("matchDay", {
        photos: {
          cover: null,
          fixtures: { "12": 7, "13": null, "0": 4, x: 5, "14": -1, "15": 1.5, "16": "8" },
          extra: 1,
        },
      }),
    ).toEqual({ photos: { cover: null, fixtures: { "12": 7, "13": null } } });
    expect(readContentOverride("matchDay", { photos: { cover: 9 } })).toEqual({
      photos: { cover: 9 },
    });
    expect(readContentOverride("matchDay", { photos: { cover: "9", fixtures: [] } })).toBeNull();
    // Photo swaps never change which fields a carousel shows.
    const club = { preset: "standard" as const, fields: {} };
    expect(resolveVisibleFields("matchDay", club, { photos: { cover: null } })).toEqual(
      resolveVisibleFields("matchDay", club),
    );
  });
});

const fixture = (over: Partial<MatchDayFixtureLike> = {}): MatchDayFixtureLike => ({
  id: 42,
  grade: "A Grade",
  roundLabel: "Round 5",
  opponentName: "White Knights Baldivis Cricket Club Inc",
  opponentLogoUrl: null,
  venue: "  Halls Head Oval ",
  // 12:30 PM Saturday 12 Oct 2024 in Perth (UTC+8).
  startAt: new Date("2024-10-12T04:30:00Z"),
  isHome: false,
  ...over,
});

/** The sweep's input before the content pipeline (engines/match-day.ts, Oct 2026). */
function legacySweepInput(f: MatchDayFixtureLike): Record<string, unknown> {
  const timeZone = "Australia/Perth";
  return {
    kind: "matchDay",
    roundLabel: (f.roundLabel ?? "").toUpperCase(),
    oppositionName: f.opponentName,
    oppositionLogoUrl: f.opponentLogoUrl ?? null,
    homeAway: f.isHome ? "HOME" : "AWAY",
    venue: f.venue ?? "",
    date: f.startAt
      .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone })
      .replace(/,/g, "")
      .toUpperCase(),
    startTime: f.startAt
      .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
      .toUpperCase(),
    grade: f.grade,
  };
}

describe("matchDayFixtureContent", () => {
  it("resolves names, crest, round, club-time date and time", () => {
    const c = matchDayFixtureContent(fixture(), {
      names: {
        teams: { "white knights baldivis cricket club inc": "Knights" },
        crests: { "white knights baldivis cricket club inc": "https://x/crest.png" },
        competitions: { "a grade": "A Grade Wyllie Cup" },
      },
    });
    expect(c).toMatchObject({
      page: "fixture",
      fixtureId: 42,
      junior: false,
      grade: "A Grade Wyllie Cup",
      roundLabel: "ROUND 5",
      opposition: {
        name: "Knights",
        rawName: "White Knights Baldivis Cricket Club Inc",
        crestUrl: "https://x/crest.png",
        monogram: "KN",
      },
      homeAway: "AWAY",
      venue: "Halls Head Oval",
      day: "2024-10-12",
      date: "SAT 12 OCT",
      startTime: "12:30 PM",
    });
  });

  it("falls back to the automatic short name and never says TBC", () => {
    const c = matchDayFixtureContent(fixture({ venue: null, roundLabel: null }));
    expect(c.opposition.name).toBe("White Knights Baldivis");
    expect(c.venue).toBe("");
    expect(c.roundLabel).toBe("");
    expect(JSON.stringify(c)).not.toMatch(/TBC/);
  });

  it("the fixture's own logo wins over the names map", () => {
    const c = matchDayFixtureContent(fixture({ opponentLogoUrl: "https://own" }), {
      names: { crests: { "white knights baldivis cricket club inc": "https://map" } },
    });
    expect(c.opposition.crestUrl).toBe("https://own");
  });

  it("the sweep's draft input is exactly what the sweep saved before (existing drafts unchanged)", () => {
    for (const f of [
      fixture(),
      fixture({ venue: null, roundLabel: null, isHome: true, opponentLogoUrl: "https://l" }),
      fixture({ startAt: new Date("2024-10-12T16:30:00Z"), roundLabel: "r3" }),
    ]) {
      const content = matchDayFixtureContent(f, { names: { teams: { x: "y" } } });
      expect(matchDayDraftInput(content)).toEqual(legacySweepInput(f));
    }
  });

  it("a junior-looking grade in the senior fixtures is treated as junior (fail closed)", () => {
    expect(matchDayFixtureContent(fixture({ grade: "Under 16" })).junior).toBe(true);
    expect(matchDayFixtureContent(fixture({ grade: "Colts" })).junior).toBe(false);
  });

  it("a junior fixture carries its junior flags and grade label", () => {
    const c = matchDayFixtureContent(fixture(), {
      junior: true,
      juniorTeamName: "Blue",
      gradeLabel: "Under 13 — Blue",
    });
    expect(c).toMatchObject({ junior: true, juniorTeamName: "Blue", grade: "Under 13 — Blue" });
  });
});

describe("bookends", () => {
  it("round labels combine like the carousel title always has", () => {
    expect(combinedRoundLabel(["5", "R5", "Round 5"])).toBe("ROUND 5");
    expect(combinedRoundLabel(["5", "6"])).toBe("MIXED ROUNDS");
    expect(combinedRoundLabel(["5", ""])).toBe("");
    expect(combinedRoundLabel([])).toBe("");
    expect(combinedRoundLabel(["Semi Final"])).toBe("SEMI FINAL");
  });

  it("title and sponsors content", () => {
    const opts = {
      heading: " ",
      from: "2024-10-11",
      to: "2024-10-13",
      roundLabels: ["5"],
      fixtureCount: 3,
    };
    expect(dateRangeLabel("2024-10-11", "2024-10-13")).toBe("FRI 11 OCT – SUN 13 OCT");
    expect(matchDayTitleContent(opts)).toEqual({
      kind: "matchDay",
      page: "title",
      heading: "This weekend",
      dateRange: "FRI 11 OCT – SUN 13 OCT",
      roundLabel: "ROUND 5",
      fixtureCount: 3,
    });
    expect(
      matchDaySponsorsContent({ ...opts, sponsors: [{ name: "Acme", logoUrl: "https://a" }] }),
    ).toMatchObject({ page: "sponsors", sponsors: [{ name: "Acme", logoUrl: "https://a" }] });
  });
});

describe("contentInput", () => {
  const standard = presetFields("matchDay", "standard");
  const minimal = presetFields("matchDay", "minimal");
  const c = matchDayFixtureContent(fixture({ opponentLogoUrl: "https://crest" }));

  it("Standard binds every field, marked as already resolved", () => {
    expect(contentInput(c, standard)).toEqual({
      kind: "matchDay",
      grade: "A Grade",
      roundLabel: "ROUND 5",
      oppositionName: "White Knights Baldivis",
      oppositionLogoUrl: "https://crest",
      homeAway: "AWAY",
      venue: "Halls Head Oval",
      date: "SAT 12 OCT",
      startTime: "12:30 PM",
      junior: false,
      namesResolved: true,
    });
  });

  it("a hidden field is blanked so the template drops its box", () => {
    const input = contentInput(c, minimal);
    expect(input.roundLabel).toBe("");
    expect(input.oppositionLogoUrl).toBeNull();
    expect(input.oppositionName).toBe("White Knights Baldivis");
  });

  it("bookends become the carousel page input", () => {
    const title = matchDayTitleContent({
      heading: "Round 5",
      from: "2024-10-11",
      to: "2024-10-13",
      roundLabels: ["5"],
      fixtureCount: 2,
    });
    expect(contentInput(title, standard, { hasCoverPhoto: true })).toMatchObject({
      roundLabel: "ROUND 5",
      date: "FRI 11 OCT – SUN 13 OCT",
      carouselPage: { page: "title", title: "Round 5", fixtureCount: 2, hasCoverPhoto: true },
    });
    const bare = contentInput(title, minimal, { hasCoverPhoto: true });
    expect(bare.roundLabel).toBe("");
    expect(bare.carouselPage).not.toHaveProperty("hasCoverPhoto");
  });
});

describe("readCardContent", () => {
  it("accepts well-formed content and rejects anything else", () => {
    const c = matchDayFixtureContent(fixture());
    expect(readCardContent(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(readCardContent({ ...c, homeAway: "NEUTRAL" })).toBeNull();
    expect(readCardContent({ ...c, opposition: { name: "x" } })).toBeNull();
    expect(readCardContent({ ...c, kind: "ladder" })).toBeNull();
    const t = matchDayTitleContent({
      heading: "x",
      from: "2024-10-11",
      to: "2024-10-12",
      roundLabels: [],
      fixtureCount: 0,
    });
    expect(readCardContent(t)).toEqual(t);
    expect(readCardContent({ ...t, page: "sponsors" })).toBeNull();
    expect(
      readCardContent({ ...t, page: "sponsors", sponsors: [{ name: "a", logoUrl: "b" }] }),
    ).not.toBeNull();
  });
});
