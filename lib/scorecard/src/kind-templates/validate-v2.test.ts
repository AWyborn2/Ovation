/**
 * Format v2 validation (ADR-011 §1, T1.7–T1.8): page keys, page tokens,
 * stack groups and depth, conditions, fit, motion, the extended style,
 * vectors and the size limits. v1 documents keep v1's rules
 * (`validate.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { templateDocumentErrors, MAX_PAGE_LAYERS, MAX_V2_DOCUMENT_LAYERS } from "./validate";

const box = { x: 10, y: 10, w: 80, h: 20 };
const geometry = { square: box, portrait: box, story: box, landscape: box };
const layer = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: "text",
  content: "{{clubName}}",
  geometry,
  ...over,
});
const doc = (pages: Record<string, unknown[]>, over: Record<string, unknown> = {}) => ({
  formatVersion: 2,
  pages: Object.fromEntries(Object.entries(pages).map(([k, layers]) => [k, { layers }])),
  ...over,
});

/** A Match Day template that uses most of v2. */
const matchDay = () =>
  doc(
    {
      fixture: [
        {
          id: "stage",
          kind: "shape",
          geometry,
          style: {
            fill: {
              type: "linear",
              angle: 160,
              stops: [{ color: "var(--ink)" }, { color: "#000000cc", at: 100 }],
            },
            overlay: { kind: "grain", opacity: 0.2 },
            blend: "multiply",
          },
        },
        {
          id: "photo",
          kind: "photo",
          geometry,
          showWhen: { photo: true, junior: false },
          style: {
            filter: [{ preset: "duotone", dark: "var(--ink)", light: "var(--gold, #FBAC27)" }],
          },
        },
        {
          id: "slash",
          kind: "vector",
          geometry,
          svg: '<svg viewBox="0 0 10 10"><path d="M0 10L5 0H8L3 10Z" fill="var(--gold)"/></svg>',
          motion: { in: { preset: "rise", delayMs: 100, durationMs: 600, easing: "ease-out" } },
        },
        {
          id: "facts",
          kind: "group",
          geometry,
          stack: { direction: "column", gap: 1, align: "start", justify: "space-evenly" },
          children: [
            layer("round", { content: "{{roundLabel}}", showWhen: { field: "roundLabel" } }),
            layer("opposition", {
              content: "{{opposition.name}}",
              fit: { minScale: 0.6, maxLines: 2, ellipsis: true },
              style: {
                textFill: {
                  type: "radial",
                  shape: "circle",
                  at: { x: 50, y: 40 },
                  stops: [{ color: "#fff" }, { color: "var(--gold)" }],
                },
                textShadow: [{ x: 0, y: 0.2, blur: 1, color: "#00000080" }],
                lineHeight: 1.1,
              },
            }),
            {
              id: "live",
              kind: "group",
              geometry,
              stack: { direction: "row" },
              children: [
                layer("dot", {
                  kind: "shape",
                  content: undefined,
                  motion: { loop: { preset: "pulse", periodMs: 1400 } },
                }),
                layer("venue", { content: "{{venue}} · {{startTime}}" }),
              ],
            },
          ],
        },
      ],
      title: [
        layer("title", {
          content: "{{weekendTitle}}",
          style: { border: { width: 0.4, color: "#fff", style: "dotted" } },
        }),
      ],
      day: [
        {
          id: "day-rows",
          kind: "rows",
          geometry,
          rows: { repeat: "dayRows", rowHeight: 7, cells: [{ field: "opposition", x: 0, w: 60 }] },
        },
      ],
      sponsors: [
        {
          id: "sponsor-rows",
          kind: "rows",
          geometry,
          style: {
            boxShadow: [{ x: 0, y: 0.5, blur: 2, spread: 0, color: "#0008", inset: false }],
          },
          rows: {
            repeat: "sponsors",
            rowHeight: 10,
            cells: [{ field: "logo", x: 0, w: 100, show: "image" }],
            variants: { major: { name: { color: "var(--gold)" } } },
          },
        },
      ],
    },
    {
      palettes: ["club-kit", "duotone"],
      sponsorLock: true,
      timeline: { durationMs: 6000, loop: true },
    },
  );

describe("format v2 validation", () => {
  it("accepts a document that uses pages, stacks, conditions, styles, vectors and motion", () => {
    expect(templateDocumentErrors(matchDay(), "matchDay")).toEqual([]);
  });

  it("keeps v1's rules for v1 documents (no v2 style on a v1 layer)", () => {
    const v1 = { layers: [layer("t", { style: { fill: "#fff" } })] };
    expect(templateDocumentErrors(v1, "century")).toEqual([
      'Layer 1.style has an unknown setting "fill".',
    ]);
  });

  it("checks pages against the kind, and the format version", () => {
    expect(templateDocumentErrors(doc({ fixture: [layer("a")] }), "ladder")).toEqual([
      "fixture isn't a page of this card.",
    ]);
    expect(
      templateDocumentErrors({ formatVersion: 3, pages: { card: { layers: [] } } }, "century"),
    ).toContain("formatVersion must be 2.");
    expect(templateDocumentErrors(doc({}), "century")).toEqual([
      "A template needs at least one page.",
    ]);
  });

  it("checks tokens and lists against the page they're on, naming the page and layer", () => {
    expect(
      templateDocumentErrors(
        doc({ fixture: [layer("t", { content: "{{weekendTitle}}" })] }),
        "matchDay",
      ),
    ).toEqual(["fixture/t.content uses a field this card doesn't have: {{weekendTitle}}."]);
    expect(
      templateDocumentErrors(
        doc({
          title: [
            {
              id: "r",
              kind: "rows",
              geometry,
              rows: { repeat: "dayRows", rowHeight: 7, cells: [] },
            },
          ],
        }),
        "matchDay",
      ),
    ).toEqual(["title/r.rows.repeat isn't a list this card has."]);
    expect(
      templateDocumentErrors(
        doc({ card: [layer("t", { showWhen: { field: "roundLabel" } })] }),
        "milestone",
      ),
    ).toEqual(["card/t.showWhen.field isn't a field this page has."]);
  });

  it("finds problems inside groups by their path", () => {
    const nested = doc({
      card: [
        {
          id: "g",
          kind: "group",
          geometry,
          children: [layer("inner", { style: { fontSize: 500 } })],
        },
      ],
    });
    expect(templateDocumentErrors(nested, "milestone")).toEqual([
      "card/g/inner.style.fontSize must be a number from 0.2 to 80.",
    ]);
  });

  it("limits stack groups to four levels", () => {
    const deep = (n: number): Record<string, unknown> =>
      n === 0 ? layer(`leaf`) : { id: `g${n}`, kind: "group", geometry, children: [deep(n - 1)] };
    expect(templateDocumentErrors(doc({ card: [deep(4)] }), "milestone")).toEqual([]);
    expect(templateDocumentErrors(doc({ card: [deep(5)] }), "milestone")).toEqual([
      "card/g5/g4/g3/g2/g1 nests groups deeper than 4 levels.",
    ]);
  });

  it.each([
    [
      "children on a non-group",
      layer("t", { children: [] }),
      "isn't a group, so it can't hold layers",
    ],
    [
      "a stack on a non-group",
      layer("t", { stack: { direction: "row" } }),
      "isn't a group, so it can't stack",
    ],
    ["a group without children", { id: "g", kind: "group", geometry }, "needs a children list"],
    [
      "a text fit on a shape",
      { id: "s", kind: "shape", geometry, fit: { maxLines: 2 } },
      "isn't text",
    ],
    ["three lines", layer("t", { fit: { maxLines: 3 } }), "fit.maxLines must be one of: 1, 2"],
    [
      "a loop that isn't in R1",
      layer("t", { motion: { loop: { preset: "glow" } } }),
      "loop.preset must be one of: pulse, shine",
    ],
    [
      "an entrance that isn't a preset",
      layer("t", { motion: { in: { preset: "zoom" } } }),
      "in.preset must be one of",
    ],
    [
      "a too-short entrance",
      layer("t", { motion: { in: { preset: "fade", durationMs: 10 } } }),
      "durationMs must be a number from 100",
    ],
    [
      "an unknown colour token",
      layer("t", { style: { fill: "var(--accent)" } }),
      "names a colour token cards don't have",
    ],
    [
      "rgba() in a v2 colour",
      layer("t", { style: { border: { width: 1, color: "rgba(0,0,0,.5)" } } }),
      "must be a hex colour or var(--token)",
    ],
    [
      "a one-stop gradient",
      layer("t", { style: { fill: { type: "linear", stops: [{ color: "#fff" }] } } }),
      "stops must be 2 to 8 stops",
    ],
    [
      "a conic gradient",
      layer("t", { style: { fill: { type: "conic", stops: [] } } }),
      "type must be linear or radial",
    ],
    [
      "a blend mode outside the list",
      layer("t", { style: { blend: "plus-lighter" } }),
      "blend must be one of",
    ],
    [
      "a heavy blur",
      layer("t", { style: { filter: [{ preset: "blur", px: 40 }] } }),
      "px must be a number from 0 to 20",
    ],
    [
      "a repeated filter",
      layer("t", { style: { filter: [{ preset: "grayscale" }, { preset: "grayscale" }] } }),
      "repeats the grayscale filter",
    ],
    [
      "five shadows",
      layer("t", { style: { boxShadow: Array(5).fill({ x: 0, y: 0, blur: 1, color: "#000" }) } }),
      "at most 4 shadows",
    ],
    [
      "an inset text shadow",
      layer("t", { style: { textShadow: [{ x: 0, y: 0, blur: 1, color: "#000", inset: true }] } }),
      'unknown setting "inset"',
    ],
    [
      "an unknown overlay",
      layer("t", { style: { overlay: { kind: "noise" } } }),
      "overlay.kind must be one of: grain, halftone",
    ],
    [
      "a vector with a script",
      { id: "v", kind: "vector", geometry, svg: "<svg><script/></svg>" },
      "card/v.svg: The SVG uses an element",
    ],
    ["a vector without markup", { id: "v", kind: "vector", geometry }, "A vector needs SVG markup"],
    ["SVG on a text layer", layer("t", { svg: "<svg/>" }), "isn't a vector, so it can't hold SVG"],
    [
      "an unknown condition",
      layer("t", { showWhen: { weekend: true } }),
      'unknown setting "weekend"',
    ],
    [
      "a layer kind outside v2",
      layer("t", { kind: "chart" }),
      "is a kind of layer templates can't hold",
    ],
  ])("refuses %s", (_label, bad, message) => {
    const errors = templateDocumentErrors(doc({ card: [bad] }), "milestone");
    expect(errors.join("\n")).toContain(message);
  });

  it("accepts a link and a design signature, and refuses malformed ones", () => {
    const ok = layer("a", { link: "card-l3", sig: "text:0a1b2c3d4e5f6g" });
    expect(templateDocumentErrors(doc({ card: [ok] }), "milestone")).toEqual([]);
    const errors = templateDocumentErrors(
      doc({ card: [layer("b", { link: "a b", sig: "<script>" })] }),
      "milestone",
    );
    expect(errors).toEqual([
      "card/b.link needs a simple id.",
      "card/b.sig must be a design signature (kind:hash).",
    ]);
  });

  it("refuses ids repeated across pages, and unknown document settings", () => {
    const errors = templateDocumentErrors(
      doc({ fixture: [layer("same")], title: [layer("same")] }, { palette: "foil" }),
      "matchDay",
    );
    expect(errors).toEqual([
      'The template has an unknown setting "palette".',
      "title/same repeats the id of another layer.",
    ]);
    expect(
      templateDocumentErrors(doc({ card: [layer("a")] }, { palettes: ["foil"] }), "milestone"),
    ).toEqual(["palettes must list club-kit or duotone or match once each."]);
  });

  it("caps layers per page and per document, children included", () => {
    const many = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => layer(`${prefix}${i}`));
    const group = { id: "g", kind: "group", geometry, children: many("c", MAX_PAGE_LAYERS) };
    expect(templateDocumentErrors(doc({ card: [group] }), "milestone")).toEqual([
      `card has ${MAX_PAGE_LAYERS + 1} layers; a page can hold at most ${MAX_PAGE_LAYERS}.`,
    ]);
    const full = doc({
      fixture: many("f", 300),
      title: many("t", 300),
      day: many("d", 1),
    });
    expect(templateDocumentErrors(full, "matchDay")).toEqual([
      `A template can hold at most ${MAX_V2_DOCUMENT_LAYERS} layers; this one has 601.`,
    ]);
  });

  it("caps a document at 1 MB", () => {
    // Each vector is under the 64 KB layer cap; eighteen of them pass 1 MB together.
    const svg = `<svg><path d="${"M0 0L1 1".repeat(7500)}"/></svg>`;
    const vectors = Array.from({ length: 18 }, (_, i) => ({
      id: `v${i}`,
      kind: "vector",
      geometry,
      svg,
    }));
    expect(templateDocumentErrors(doc({ card: vectors.slice(0, 2) }), "milestone")).toEqual([]);
    expect(templateDocumentErrors(doc({ card: vectors }), "milestone")).toEqual([
      "A template can be at most 1 MB.",
    ]);
  });
});

describe("clips and brightness (converter fidelity)", () => {
  const shape = (style: Record<string, unknown>) =>
    doc({ card: [{ id: "s", kind: "shape", geometry, style }] });

  it("accepts a clip polygon and a brightness filter", () => {
    expect(
      templateDocumentErrors(
        shape({
          fill: "var(--gold)",
          clip: {
            polygon: [
              [14.81, 0],
              [100, 0],
              [100, 100],
              [0, 75],
            ],
          },
        }),
        "player",
      ),
    ).toEqual([]);
    expect(
      templateDocumentErrors(
        doc({
          card: [
            {
              id: "p",
              kind: "photo",
              geometry,
              style: { filter: [{ preset: "brightness", amount: 0.6 }] },
            },
          ],
        }),
        "player",
      ),
    ).toEqual([]);
  });

  it("refuses a clip that isn't 3 to 32 points of numbers in range", () => {
    for (const clip of [
      {
        polygon: [
          [0, 0],
          [100, 0],
        ],
      },
      { polygon: Array.from({ length: 33 }, (_, i) => [i, i]) },
      {
        polygon: [
          [0, 0],
          [100, 0],
          [100, "x"],
        ],
      },
      {
        polygon: [
          [0, 0],
          [100, 0],
          [500, 100],
        ],
      },
      { path: "M0 0" },
      "polygon(0 0, 1 0, 0 1)",
    ])
      expect(
        templateDocumentErrors(shape({ clip }), "player").length,
        JSON.stringify(clip),
      ).toBeGreaterThan(0);
  });

  it("refuses a brightness outside 0 to 3", () => {
    expect(
      templateDocumentErrors(
        doc({
          card: [
            {
              id: "p",
              kind: "photo",
              geometry,
              style: { filter: [{ preset: "brightness", amount: 4 }] },
            },
          ],
        }),
        "player",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("rows that fill across (Club Kit polish)", () => {
  const tiles = (flow: unknown) => ({
    id: "t",
    kind: "rows",
    geometry,
    rows: {
      repeat: "players",
      rowHeight: 18,
      columns: 3,
      flow,
      cells: [{ field: "name", x: 0, w: 100 }],
    },
  });

  it("accepts flow across or down on a v2 list", () => {
    expect(templateDocumentErrors(doc({ card: [tiles("across")] }), "teamOfWeek")).toEqual([]);
    expect(templateDocumentErrors(doc({ card: [tiles("down")] }), "teamOfWeek")).toEqual([]);
  });

  it("refuses another flow, and flow on a v1 document", () => {
    expect(templateDocumentErrors(doc({ card: [tiles("diagonal")] }), "teamOfWeek")).toEqual([
      "card/t.rows.flow must be down or across.",
    ]);
    expect(templateDocumentErrors({ layers: [tiles("across")] }, "teamOfWeek")).toEqual([
      "Layer 1.rows.flow is a format v2 option.",
    ]);
  });
});

describe("a list's row choice (full draft editor, stage 4)", () => {
  const list = (repeat: string, pick: unknown, field = "name") => ({
    id: "p",
    kind: "rows",
    geometry,
    rows: { repeat, rowHeight: 7, pick, cells: [{ field, x: 0, w: 100 }] },
  });
  const errors = (repeat: string, pick: unknown) =>
    templateDocumentErrors(doc({ result: [list(repeat, pick)] }), "matchSummary");

  it("accepts whose, how many and sort on a performance list", () => {
    expect(errors("performances.batting", { side: "club", count: 3, sort: "runs" })).toEqual([]);
    expect(errors("performances.bowling", { side: "both", count: 0, sort: "figures" })).toEqual([]);
    expect(errors("performances.bowling", { count: 30, sort: "wickets" })).toEqual([]);
    // An innings list takes a choice too (its side is ignored).
    expect(errors("innings1.batting", { count: 1, sort: "runs" })).toEqual([]);
    // A performance row can show its team.
    expect(
      templateDocumentErrors(
        doc({ result: [list("performances.batting", { count: 1 }, "team")] }),
        "matchSummary",
      ),
    ).toEqual([]);
  });

  it("refuses unknown values, counts out of range and stray keys", () => {
    expect(errors("performances.batting", { side: "mine" })).toEqual([
      "result/p.rows.pick.side must be club, opposition or both.",
    ]);
    expect(errors("performances.batting", { count: 31 })).toEqual([
      "result/p.rows.pick.count must be a whole number from 0 to 30.",
    ]);
    expect(errors("performances.batting", { count: 2.5 })).toEqual([
      "result/p.rows.pick.count must be a whole number from 0 to 30.",
    ]);
    expect(errors("performances.batting", { sort: "economy" })).toEqual([
      "result/p.rows.pick.sort must be runs, balls, strike rate, wickets or figures on a batting list.",
    ]);
    expect(errors("performances.bowling", { sort: "strikeRate" })).toEqual([
      "result/p.rows.pick.sort must be wickets, figures, economy or runs on a bowling list.",
    ]);
    expect(errors("performances.batting", { top: 3 })).toEqual([
      "result/p.rows.pick.top isn't a list choice.",
    ]);
    expect(errors("performances.batting", "club")).toEqual([
      "result/p.rows.pick must be an object.",
    ]);
  });

  it("accepts stage 5's sorts and filters on their own stat's lists", () => {
    expect(
      errors("performances.batting", {
        sort: "strikeRate",
        minRuns: 20,
        notOutOnly: true,
      }),
    ).toEqual([]);
    expect(errors("performances.batting", { sort: "balls", minRuns: 0 })).toEqual([]);
    expect(errors("performances.bowling", { sort: "economy", minWickets: 2 })).toEqual([]);
    expect(errors("innings2.bowling", { sort: "economy", minWickets: 1, count: 3 })).toEqual([]);
  });

  it("refuses a filter on the other stat's list, and values out of range", () => {
    expect(errors("performances.bowling", { minRuns: 10, notOutOnly: true })).toEqual([
      "result/p.rows.pick.minRuns is for a batting list.",
      "result/p.rows.pick.notOutOnly is for a batting list.",
    ]);
    expect(errors("performances.batting", { minWickets: 2 })).toEqual([
      "result/p.rows.pick.minWickets is for a bowling list.",
    ]);
    expect(errors("performances.batting", { minRuns: 401 })).toEqual([
      "result/p.rows.pick.minRuns must be a whole number from 0 to 400.",
    ]);
    expect(errors("performances.bowling", { minWickets: 11 })).toEqual([
      "result/p.rows.pick.minWickets must be a whole number from 0 to 10.",
    ]);
    expect(errors("performances.batting", { notOutOnly: "yes" })).toEqual([
      "result/p.rows.pick.notOutOnly must be true or false.",
    ]);
  });

  it("refuses a choice on another list, and on a v1 document", () => {
    const pairs = list("innings1.pairs", { count: 3 }, "batName");
    expect(templateDocumentErrors(doc({ result: [pairs] }), "matchSummary")).toEqual([
      "result/p.rows.pick is only for a result's batting and bowling lists.",
    ]);
    const players = {
      id: "p",
      kind: "rows",
      geometry,
      rows: {
        repeat: "players",
        rowHeight: 7,
        pick: { count: 3 },
        cells: [{ field: "name", x: 0, w: 100 }],
      },
    };
    expect(templateDocumentErrors({ layers: [players] }, "teamOfWeek")).toEqual([
      "Layer 1.rows.pick is a format v2 option.",
    ]);
  });
});

describe("what the converter dropped (B4)", () => {
  const styled = (kind: string, style: Record<string, unknown>) =>
    doc({
      card: [{ id: "s", kind, geometry, ...(kind === "text" ? { content: "8" } : {}), style }],
    });
  const errors = (kind: string, style: Record<string, unknown>) =>
    templateDocumentErrors(styled(kind, style), "player");

  it("accepts side borders, a text stroke, skew, backdrop blur and drop shadows", () => {
    expect(
      errors("shape", {
        border: { width: 0.2, color: "#ffffff38", style: "dashed", sides: ["top", "bottom"] },
        skew: { x: -12 },
        backdropBlur: 18,
        dropShadow: [{ x: 0, y: 0, blur: 2.4, color: "#d3175ab3" }],
        clip: {
          polygon: [
            [10, 0],
            [100, 0],
            [90, 100],
            [0, 100],
          ],
        },
      }),
    ).toEqual([]);
    expect(
      errors("text", { color: "transparent", textStroke: { width: 0.19, color: "#ffffff38" } }),
    ).toEqual([]);
    // The match graphics' type: italic scoreboards, Archivo at 125% (M10).
    expect(errors("text", { italic: true, stretch: 125 })).toEqual([]);
  });

  it("refuses them out of range or misshapen, naming the setting", () => {
    expect(errors("shape", { border: { width: 1, color: "#fff", sides: [] } })).toEqual([
      "card/s.style.border.sides must be 1 to 4 of top, right, bottom, left.",
    ]);
    expect(errors("shape", { border: { width: 1, color: "#fff", sides: ["top", "top"] } })).toEqual(
      ["card/s.style.border.sides repeats top."],
    );
    expect(errors("shape", { border: { width: 1, color: "#fff", sides: ["middle"] } }).length).toBe(
      1,
    );
    expect(errors("text", { textStroke: { width: 9, color: "#fff" } }).length).toBe(1);
    expect(errors("text", { textStroke: { width: 0.2, color: "white" } }).length).toBe(1);
    expect(errors("shape", { skew: { x: 89 } }).length).toBe(1);
    expect(errors("shape", { skew: { z: 4 } }).length).toBe(1);
    expect(errors("shape", { backdropBlur: 40 }).length).toBe(1);
    expect(errors("text", { italic: "yes" }).length).toBe(1);
    expect(errors("text", { stretch: 250 }).length).toBe(1);
    expect(
      errors("shape", {
        dropShadow: Array.from({ length: 5 }, () => ({ x: 0, y: 0, blur: 1, color: "#000" })),
      }),
    ).toEqual(["card/s.style.dropShadow must be a list of at most 4 shadows."]);
    expect(
      errors("shape", { dropShadow: [{ x: 0, y: 0, blur: 1, spread: 1, color: "#000" }] }).length,
    ).toBe(1);
  });

  it("keeps them out of v1 documents", () => {
    for (const style of [
      { textStroke: { width: 0.2, color: "#fff" } },
      { skew: { x: 10 } },
      { backdropBlur: 4 },
      { dropShadow: [{ x: 0, y: 0, blur: 1, color: "#000" }] },
      { italic: true },
      { stretch: 125 },
    ])
      expect(
        templateDocumentErrors({ layers: [{ id: "a", kind: "shape", geometry, style }] }, "player"),
        JSON.stringify(style),
      ).toEqual([`Layer 1.style has an unknown setting "${Object.keys(style)[0]}".`]);
  });
});

describe("page colours", () => {
  const doc = (background: unknown) => ({
    formatVersion: 2,
    pages: { card: { layers: [layer("a")], background } },
  });

  it("accepts a hex colour or a card colour token", () => {
    expect(templateDocumentErrors(doc("#FFFFFF"), "newSigning")).toEqual([]);
    expect(templateDocumentErrors(doc("#0b1f3acc"), "newSigning")).toEqual([]);
    expect(templateDocumentErrors(doc("var(--gold)"), "newSigning")).toEqual([]);
  });

  it("refuses anything else", () => {
    for (const bad of ["red", "url(x)", "var(--evil)", "#12", 5]) {
      expect(templateDocumentErrors(doc(bad), "newSigning").join(" ")).toMatch(/background/);
    }
  });
});
