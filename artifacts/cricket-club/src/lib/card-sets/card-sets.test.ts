import { describe, expect, it } from "vitest";
import { evenSizes, planRows } from "./balance";
import { groupOfGrade, sectionOfGrade } from "./groups";
import { planCardSet, slidesForSize } from "./plan";
import {
  PACK_DEFAULT_TOKENS,
  renderPackCard,
  slideAdjustments,
  withSlideAdjustments,
  type CardAdjustments,
} from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";
import type { ShareCardInput } from "../share-card";

/** Balanced card sets: the even split, sections, group breaks and the set planner. */

describe("evenSizes", () => {
  it("matches the plan's table", () => {
    expect(evenSizes(6, 5)).toEqual([3, 3]);
    expect(evenSizes(7, 5)).toEqual([4, 3]);
    expect(evenSizes(8, 5)).toEqual([4, 4]);
    expect(evenSizes(11, 5)).toEqual([4, 4, 3]);
    expect(evenSizes(9, 4)).toEqual([3, 3, 3]);
    expect(evenSizes(5, 5)).toEqual([5]);
    expect(evenSizes(0, 5)).toEqual([]);
  });

  it("never differs by more than one row, never overfills, uses every row (n 1–30, cap 1–6)", () => {
    for (let cap = 1; cap <= 6; cap++) {
      for (let n = 1; n <= 30; n++) {
        const sizes = evenSizes(n, cap);
        const ctx = `n=${n} cap=${cap}: ${sizes.join("+")}`;
        expect(
          sizes.reduce((a, b) => a + b, 0),
          ctx,
        ).toBe(n);
        expect(Math.max(...sizes) - Math.min(...sizes), ctx).toBeLessThanOrEqual(1);
        expect(Math.max(...sizes), ctx).toBeLessThanOrEqual(cap);
        expect(sizes.length, ctx).toBe(Math.ceil(n / cap));
        // Fullest first.
        expect(
          [...sizes].sort((a, b) => b - a),
          ctx,
        ).toEqual(sizes);
      }
    }
  });
});

describe("planRows", () => {
  it("keeps sections apart and balances each one", () => {
    const rows = ["A", "B", "U15", "C", "D", "U13", "FA", "FB", "T20", "U17", "V"];
    const cards = planRows(rows, { cap: 5, sectionOf: sectionOfGrade });
    expect(cards.map((c) => c.rows)).toEqual([
      ["A", "B", "C", "D"],
      ["FA", "FB", "T20", "V"],
      ["U15", "U13", "U17"],
    ]);
    expect(cards.map((c) => c.section)).toEqual(["senior", "senior", "junior"]);
  });

  it("prefers a men / women boundary only when it keeps the split even", () => {
    // 7 rows → 4+3 or 3+4. Men are 3, so 3+4 puts the break on the boundary.
    const rows = ["A", "B", "C", "FA", "FB", "T20", "V"];
    const cards = planRows(rows, { cap: 5, groupOf: groupOfGrade });
    expect(cards.map((c) => c.rows.length)).toEqual([3, 4]);
    expect(cards[0].rows).toEqual(["A", "B", "C"]);
    // Without a better boundary, the default (fullest first) stands.
    const plain = planRows(["A", "B", "C", "D", "E", "F", "G"], { cap: 5, groupOf: groupOfGrade });
    expect(plain.map((c) => c.rows.length)).toEqual([4, 3]);
  });

  it("never lets a group preference break the even split", () => {
    const grades = ["A", "B", "C", "D", "E", "FA", "FB", "T20", "V", "U15", "U13", "U17", "FC"];
    for (let n = 1; n <= grades.length; n++) {
      for (const cap of [3, 4, 5]) {
        const rows = grades.slice(0, n);
        const cards = planRows(rows, { cap, sectionOf: sectionOfGrade, groupOf: groupOfGrade });
        for (const section of ["senior", "junior"]) {
          const sizes = cards.filter((c) => c.section === section).map((c) => c.rows.length);
          if (sizes.length === 0) continue;
          expect(Math.max(...sizes) - Math.min(...sizes), `${n}/${cap}`).toBeLessThanOrEqual(1);
          expect(Math.max(...sizes)).toBeLessThanOrEqual(cap);
        }
        expect(cards.flatMap((c) => c.rows).sort()).toEqual([...rows].sort());
      }
    }
  });
});

describe("groups", () => {
  it("classifies grade labels", () => {
    expect(groupOfGrade("A Grade")).toBe("men");
    expect(groupOfGrade("Female A Grade")).toBe("women");
    expect(groupOfGrade("FA")).toBe("women");
    expect(groupOfGrade("Women's T20")).toBe("women");
    expect(groupOfGrade("T20")).toBe("other");
    expect(groupOfGrade("Vets")).toBe("other");
    expect(groupOfGrade("Under 15")).toBe("junior");
    expect(sectionOfGrade("U13s")).toBe("junior");
    expect(sectionOfGrade("Colts")).toBe("senior");
  });
});

const fixtures = (grades: string[]) =>
  grades.map((grade) => ({ grade, opponent: "Opp", venue: "Oval", startTime: "1:00 PM" }));

function gameDay(grades: string[]): ShareCardInput {
  return {
    kind: "roundFixtures",
    roundLabel: "ROUND 15",
    date: "SAT 14 FEB",
    fixtures: fixtures(grades),
  };
}

describe("planCardSet", () => {
  it("leaves a round that fits as one card", () => {
    const slides = planCardSet(gameDay(["A", "B", "C"]));
    expect(slides).toHaveLength(1);
    expect(slides[0].role).toBe("single");
    expect(slides[0].input).toMatchObject({ density: "standard" });
  });

  it("turns 8 senior + 3 junior grades into a cover and three even detail cards", () => {
    const slides = planCardSet(
      gameDay(["A", "B", "C", "D", "FA", "FB", "T20", "V", "U17", "U15", "U13"]),
    );
    expect(slides.map((s) => s.role)).toEqual(["cover", "detail", "detail", "detail"]);
    const counts = slides
      .slice(1)
      .map((s) => (s.input as Extract<ShareCardInput, { kind: "roundFixtures" }>).fixtures.length);
    expect(counts).toEqual([4, 4, 3]);
    expect(slides[1].input).toMatchObject({ setPage: "2/4" });
    expect(slides[3].input).toMatchObject({ setPage: "4/4", junior: true });
    expect(slides[2].input).not.toHaveProperty("junior");
    expect(slides[0].input).toMatchObject({ setRole: "cover" });
    // Cover carries the full list (for its summary line).
    expect(
      (slides[0].input as Extract<ShareCardInput, { kind: "roundFixtures" }>).fixtures,
    ).toHaveLength(11);
    // One row size for the whole set.
    expect(new Set(slides.slice(1).map((s) => (s.input as { density?: string }).density))).toEqual(
      new Set(["standard"]),
    );
  });

  it("uses spotlight rows when every detail card holds two rows or fewer", () => {
    const slides = planCardSet(gameDay(["A", "U15", "U13"]));
    expect(slides.slice(1).map((s) => (s.input as { density?: string }).density)).toEqual([
      "spotlight",
      "spotlight",
    ]);
  });

  it("respects the cover switch", () => {
    const grades = ["A", "B", "C", "D", "E", "F", "G"];
    expect(planCardSet(gameDay(grades), { cover: false }).map((s) => s.role)).toEqual([
      "detail",
      "detail",
    ]);
    expect(planCardSet(gameDay(["A"]), { cover: true }).map((s) => s.role)).toEqual([
      "cover",
      "detail",
    ]);
  });

  it("splits 7 weekend results 4 + 3 under a cover", () => {
    const base = sampleCardInput("weekendWrap") as Extract<ShareCardInput, { kind: "weekendWrap" }>;
    const matches = Array.from({ length: 7 }, (_, i) => ({
      ...base.matches[0],
      gradeLabel: `${"ABCDEFG"[i]} GRADE`,
    }));
    const slides = planCardSet({ ...base, matches });
    expect(slides.map((s) => s.role)).toEqual(["cover", "detail", "detail"]);
    expect(
      slides
        .slice(1)
        .map((s) => (s.input as Extract<ShareCardInput, { kind: "weekendWrap" }>).matches.length),
    ).toEqual([4, 3]);
  });

  it("posts a round-results wrap as its cover plus each match's own result card", () => {
    const base = sampleCardInput("weekendWrap") as Extract<ShareCardInput, { kind: "weekendWrap" }>;
    const result = sampleCardInput("matchSummary");
    const results = base.matches.map(() => result);
    const slides = planCardSet({ ...base, results });
    expect(slides.map((s) => s.role)).toEqual([
      "cover",
      ...base.matches.map(() => "detail" as const),
    ]);
    expect(slides[0].input).toMatchObject({ kind: "weekendWrap", setRole: "cover" });
    expect(slides.slice(1).every((s) => s.input.kind === "matchSummary")).toBe(true);
    expect(slides[1]).toMatchObject({ key: `detail:senior:${base.matches[0].gradeLabel}` });
    expect(slides[1].input).toMatchObject({ setPage: `2/${slides.length}` });
    // One match: just its result card.
    expect(
      planCardSet({ ...base, matches: base.matches.slice(0, 1), results: [result] }).map(
        (s) => s.input.kind,
      ),
    ).toEqual(["matchSummary"]);
  });

  it("posts a round of team lists as a cover plus one team card each, juniors last", () => {
    const base = sampleCardInput("teamListRound") as Extract<
      ShareCardInput,
      { kind: "teamListRound" }
    >;
    const junior = { ...base.teams[0], grade: "Under 15", gradeRound: "U15 · ROUND 15" };
    const slides = planCardSet({ ...base, teams: [base.teams[0], junior, ...base.teams.slice(1)] });
    expect(slides.map((s) => s.role)).toEqual(["cover", "detail", "detail", "detail", "detail"]);
    expect(slides.slice(1).every((s) => s.input.kind === "teamList")).toBe(true);
    expect(slides[4].input).toMatchObject({ gradeRound: "U15 · ROUND 15", junior: true });
    expect(slides[1].input).toMatchObject({ setPage: "2/5" });
    // One team: just that team's card.
    expect(planCardSet({ ...base, teams: [base.teams[0]] }).map((s) => s.input.kind)).toEqual([
      "teamList",
    ]);
  });

  it("gives every other kind a single slide", () => {
    expect(planCardSet(sampleCardInput("milestone"))).toHaveLength(1);
  });

  it("keys detail slides by content, so edits follow their rows", () => {
    const keys = planCardSet(gameDay(["A", "B", "C", "D", "E", "F"])).map((s) => s.key);
    expect(keys).toEqual(["cover", "detail:senior:A", "detail:senior:D"]);
  });
});

describe("per-slide edits", () => {
  it("keeps each slide's edits apart from the card's own", () => {
    let root: CardAdjustments = { fields: { headline: "Card" }, set: { cover: true } };
    root = withSlideAdjustments(root, "detail:senior:A", { fields: { headline: "Slide" } });
    expect(slideAdjustments(root, "single")).toBe(root);
    expect(slideAdjustments(root, "detail:senior:A")).toEqual({ fields: { headline: "Slide" } });
    expect(slideAdjustments(root, "cover")).toBeNull();
    // Editing the single card never drops the set's options or slide edits.
    const next = withSlideAdjustments(root, "single", { fields: { headline: "New" } });
    expect(next.set).toEqual({ cover: true });
    expect(next.slides?.["detail:senior:A"]).toBeDefined();
  });

  it("keeps a slide's edits when a row is added after the slide's first row", () => {
    const before = planCardSet(gameDay(["A", "B", "C", "D", "E", "F"])).map((s) => s.key);
    const after = planCardSet(gameDay(["A", "B", "C", "D", "E", "F", "G"])).map((s) => s.key);
    expect(after).toContain(before[1]);
  });
});

describe("unplanned set inputs", () => {
  it("render as the post's first slide, never one overfull card", () => {
    const input = gameDay(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const html = renderPackCard(
      input,
      "square",
      true,
      PACK_DEFAULT_TOKENS,
      false,
      null,
      "club-kit-v1",
    );
    const cover = planCardSet(input)[0]!.input;
    expect(html).toBe(
      renderPackCard(cover, "square", true, PACK_DEFAULT_TOKENS, false, null, "club-kit-v1"),
    );
  });

  it("leave a round that fits on one card unchanged", () => {
    const input = gameDay(["A", "B"]);
    const html = renderPackCard(
      input,
      "square",
      true,
      PACK_DEFAULT_TOKENS,
      false,
      null,
      "club-kit-v1",
    );
    expect(html).toContain("ROUND 15");
  });

  it("exports one landscape summary card for a long round", () => {
    const slides = slidesForSize(gameDay(["A", "B", "C", "D", "E", "F", "G"]), "landscape");
    expect(slides).toHaveLength(1);
    expect(slides[0]!.input).toMatchObject({ setRole: "cover" });
  });
});
