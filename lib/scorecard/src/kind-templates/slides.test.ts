import { describe, expect, it } from "vitest";
import type { TemplateLayerBase } from "./document";
import {
  evenParts,
  layoutBlocksAutomation,
  MAX_CAROUSEL_SLIDES,
  PERFORMANCE_ROWS_KEY,
  planTemplateSlides,
} from "./slides";
import type { MatchSummaryInnings } from "../match-summary-types";

/** A square rows layer holding `capacity` 10%-high rows. */
const doc = (capacity: number, repeat = "matches") => ({
  layers: [
    {
      id: "results",
      kind: "rows",
      geometry: { square: { x: 0, y: 0, w: 100, h: capacity * 10 } },
      rows: { repeat, rowHeight: 10, cells: [] },
    } satisfies TemplateLayerBase,
  ],
});

const rows = (n: number, junior = false) =>
  Array.from({ length: n }, (_, i) => ({
    grade: `G${i + 1}`,
    ...(junior ? { junior: true } : {}),
  }));

describe("evenParts", () => {
  it("splits into sizes that differ by at most one", () => {
    expect(evenParts(9, 2)).toEqual([5, 4]);
    expect(evenParts(10, 3)).toEqual([4, 3, 3]);
  });
});

describe("planTemplateSlides (KTD13)", () => {
  it("keeps a card whose list fits on one slide, unchanged", () => {
    const input = { kind: "weekendWrap", matches: rows(4) };
    const plan = planTemplateSlides(input, doc(5), "square");
    expect(plan.slides).toEqual([{ key: "single", input, page: 1, of: 1 }]);
    expect(plan.warning).toBeUndefined();
  });

  it("spills nine rows at capacity five onto two even slides (AE3)", () => {
    const plan = planTemplateSlides({ kind: "weekendWrap", matches: rows(9) }, doc(5), "square");
    expect(plan.slides.map((s) => (s.input.matches as unknown[]).length)).toEqual([5, 4]);
    expect(plan.slides.map((s) => [s.page, s.of])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("plans a page-based design (format v2) from the page the card draws on", () => {
    const v2 = { formatVersion: 2, pages: { card: doc(5) } };
    const plan = planTemplateSlides(
      { kind: "weekendWrap", matches: rows(9) },
      v2 as unknown as Parameters<typeof planTemplateSlides>[1],
      "square",
    );
    expect(plan.slides.map((s) => (s.input.matches as unknown[]).length)).toEqual([5, 4]);
  });

  it("never puts junior and senior rows on one slide", () => {
    const input = { kind: "weekendWrap", matches: [...rows(3), ...rows(3, true)] };
    const plan = planTemplateSlides(input, doc(5), "square");
    expect(plan.slides).toHaveLength(2);
    expect(plan.slides[0].input.junior).toBeUndefined();
    expect(plan.slides[1].input.junior).toBe(true);
    expect(
      (plan.slides[1].input.matches as Array<{ junior?: boolean }>).every((r) => r.junior),
    ).toBe(true);
  });

  it("caps at ten slides and warns when more were needed", () => {
    const plan = planTemplateSlides({ kind: "ladder", rows: rows(56) }, doc(5, "rows"), "square");
    expect(plan.slides).toHaveLength(MAX_CAROUSEL_SLIDES);
    expect(plan.warning).toMatchObject({ reason: "slides", size: "square", layerId: "results" });
  });

  it("splits junior rows by their grade label, even when the list fits", () => {
    const input = {
      kind: "roundFixtures",
      matches: [{ grade: "A Grade" }, { grade: "Colts" }, { gradeLabel: "Under 13" }],
    };
    const plan = planTemplateSlides(input, doc(5), "square");
    expect(plan.slides).toHaveLength(2);
    expect((plan.slides[0].input.matches as unknown[]).length).toBe(2);
    expect(plan.slides[0].input.junior).toBeUndefined();
    expect(plan.slides[1].input.junior).toBe(true);
  });

  it("marks an all-junior list that fits as a junior card", () => {
    const plan = planTemplateSlides(
      { kind: "roundFixtures", matches: [{ grade: "U15s" }] },
      doc(5),
      "square",
    );
    expect(plan.slides).toHaveLength(1);
    expect(plan.slides[0].input.junior).toBe(true);
  });

  it("warns when not even one row fits the list's box", () => {
    const plan = planTemplateSlides({ kind: "weekendWrap", matches: rows(3) }, doc(0), "square");
    expect(plan.warning).toMatchObject({ reason: "overflow", layerId: "results" });
  });

  it("is one slide when the template has no rows layer on that size", () => {
    const plan = planTemplateSlides({ kind: "weekendWrap", matches: rows(9) }, doc(5), "story");
    expect(plan.slides).toHaveLength(1);
  });
});

describe("planTemplateSlides: performance lists (full draft editor, D8)", () => {
  /** A v2 result page holding performance lists of `capacity` rows each. */
  const perfDoc = (lists: Array<{ repeat: string; capacity: number; pick?: object }>) => ({
    formatVersion: 2,
    pages: {
      result: {
        layers: lists.map((l, i) => ({
          id: `list${i + 1}`,
          kind: "rows",
          geometry: { square: { x: 0, y: 0, w: 100, h: l.capacity * 10 } },
          rows: { repeat: l.repeat, rowHeight: 10, cells: [], ...(l.pick ? { pick: l.pick } : {}) },
        })),
      },
    },
  });
  const batters = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `${prefix}${i + 1}`, runs: i * 10, balls: 20 }));
  const innings = (club: number, opp: number): MatchSummaryInnings[] => [
    {
      teamKey: "club",
      inningsNum: 1,
      totalRuns: "200",
      wickets: "8",
      overs: "50",
      topBatters: [],
      topBowlers: [],
      batters: batters("C", club),
      bowlers: [{ name: "Opp bowler", wickets: 3, runs: 30, overs: "10" }],
    },
    {
      teamKey: "opposition",
      inningsNum: 2,
      totalRuns: "150",
      wickets: "10",
      overs: "45",
      topBatters: [],
      topBowlers: [],
      batters: batters("O", opp),
      bowlers: [{ name: "Club bowler", wickets: 4, runs: 25, overs: "9.2" }],
    },
  ];
  const input = (club: number, opp: number, extra: object = {}) => ({
    kind: "matchSummary",
    innings: innings(club, opp),
    ...extra,
  });
  const plan = (i: Record<string, unknown>, d: ReturnType<typeof perfDoc>) =>
    planTemplateSlides(i, d as unknown as Parameters<typeof planTemplateSlides>[1], "square");
  const shares = (p: ReturnType<typeof plan>, repeat = "performances.batting") =>
    p.slides.map(
      (s) => (s.input[PERFORMANCE_ROWS_KEY] as Record<string, number[]> | undefined)?.[repeat],
    );

  it("keeps a list that fits on one slide, unchanged", () => {
    const i = input(3, 2);
    const p = plan(i, perfDoc([{ repeat: "performances.batting", capacity: 6 }]));
    expect(p.slides).toEqual([{ key: "single", input: i, page: 1, of: 1 }]);
  });

  it("continues every performance on extra slides, each carrying its share in order", () => {
    // Unfiltered: both teams, scorecard order, 11 rows at 5 a slide.
    const p = plan(input(6, 5), perfDoc([{ repeat: "performances.batting", capacity: 5 }]));
    expect(shares(p)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10],
    ]);
    expect(p.slides.map((s) => [s.key, s.page, s.of])).toEqual([
      ["rows:1", 1, 3],
      ["rows:2", 2, 3],
      ["rows:3", 3, 3],
    ]);
    expect(p.warning).toBeUndefined();
  });

  it("splits the rows the list's choice draws, sorted, and never past its count", () => {
    const sorted = plan(
      input(6, 0),
      perfDoc([
        { repeat: "performances.batting", capacity: 2, pick: { side: "club", sort: "runs" } },
      ]),
    );
    // The club's six, most runs first: C6 (index 5) down to C1 (index 0).
    expect(shares(sorted)).toEqual([
      [5, 4],
      [3, 2],
      [1, 0],
    ]);
    const capped = plan(
      input(6, 5),
      perfDoc([{ repeat: "performances.batting", capacity: 2, pick: { count: 3 } }]),
    );
    expect(shares(capped)).toEqual([[0, 1], [2]]);
    const fits = plan(
      input(6, 5),
      perfDoc([{ repeat: "performances.batting", capacity: 3, pick: { count: 3 } }]),
    );
    expect(fits.slides).toHaveLength(1);
    expect(fits.slides[0].input[PERFORMANCE_ROWS_KEY]).toBeUndefined();
  });

  it("splits a bowling list from both innings' bowlers", () => {
    const p = plan(input(1, 1), perfDoc([{ repeat: "performances.bowling", capacity: 1 }]));
    expect(shares(p, "performances.bowling")).toEqual([[0], [1]]);
  });

  it("lets the first list decide; a second list draws its whole choice on every slide", () => {
    const p = plan(
      input(4, 4),
      perfDoc([
        { repeat: "performances.batting", capacity: 4 },
        { repeat: "performances.bowling", capacity: 1 },
      ]),
    );
    expect(shares(p)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
    expect(shares(p, "performances.bowling")).toEqual([undefined, undefined]);
  });

  it("keeps a junior card junior on every slide (its input names only the club's players)", () => {
    const p = plan(
      input(5, 0, { junior: true }),
      perfDoc([{ repeat: "performances.batting", capacity: 2 }]),
    );
    expect(p.slides).toHaveLength(3);
    expect(p.slides.every((s) => s.input.junior === true)).toBe(true);
  });

  it("caps at ten slides and warns, and warns when no row fits", () => {
    const many = plan(input(15, 15), perfDoc([{ repeat: "performances.batting", capacity: 1 }]));
    expect(many.slides).toHaveLength(MAX_CAROUSEL_SLIDES);
    expect(many.warning).toMatchObject({ reason: "slides", layerId: "list1" });
    expect(many.warning?.detail).toBe("30 slides needed; only 10 can post");
    const none = plan(input(2, 0), perfDoc([{ repeat: "performances.batting", capacity: 0 }]));
    expect(none.slides).toHaveLength(1);
    expect(none.warning).toMatchObject({ reason: "overflow", layerId: "list1" });
  });

  it("is one slide when the choice draws nothing, or the input has no innings", () => {
    const empty = plan(
      input(0, 4),
      perfDoc([{ repeat: "performances.batting", capacity: 1, pick: { side: "club" } }]),
    );
    expect(empty.slides).toHaveLength(1);
    expect(empty.warning).toBeUndefined();
    expect(
      plan({ kind: "matchSummary" }, perfDoc([{ repeat: "performances.batting", capacity: 1 }]))
        .slides,
    ).toHaveLength(1);
  });
});

describe("layoutBlocksAutomation (KTD10)", () => {
  it("never blocks a pack draft", () => {
    expect(
      layoutBlocksAutomation({
        templateVersion: null,
        layoutCheckPending: true,
        layoutWarnings: null,
      }),
    ).toBe(false);
  });

  it("blocks a templated draft until it has been checked", () => {
    expect(
      layoutBlocksAutomation({
        templateVersion: 2,
        layoutCheckPending: true,
        layoutWarnings: null,
      }),
    ).toBe(true);
  });

  it("blocks a templated draft with a warning on any size, and not one without", () => {
    expect(
      layoutBlocksAutomation({
        templateVersion: 2,
        layoutCheckPending: false,
        layoutWarnings: { square: [], story: [{}] },
      }),
    ).toBe(true);
    expect(
      layoutBlocksAutomation({
        templateVersion: 2,
        layoutCheckPending: false,
        layoutWarnings: { square: [] },
      }),
    ).toBe(false);
  });
});
