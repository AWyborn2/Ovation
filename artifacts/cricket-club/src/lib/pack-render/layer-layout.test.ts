/**
 * Format v2 layout (L1-C, T1.12–T1.17): page selection, stack groups and
 * collapse (per preset, through the real content projection), nesting depth,
 * `showWhen`, the junior rules conditions can't undo, the day and sponsors
 * rows, and text fit.
 */
import { describe, expect, it } from "vitest";
import {
  contentInput,
  resolveVisibleFields,
  type CardContent,
} from "@workspace/scorecard/card-content";
import {
  CONTENT_PRESETS,
  type PageKey,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { fitTextTarget, readTextFit, textFitAttrs, type TextFitTarget } from "./layer-fit";
import { layerShows, type LayoutContext } from "./layer-layout";

const DATA: PackCardData = {
  brand: {
    name: "Sample Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#SAMPLECC",
  sponsors: [{ name: "Coastal Plumbing", logoUrl: "https://cdn.example.org/s1.png" }],
  photoUrl: "https://cdn.example.org/photo.jpg",
};

function render(
  input: ShareCardInput,
  doc: CardAdjustments,
  opts: { size?: CardSize; junior?: boolean; page?: PageKey; data?: PackCardData } = {},
): string {
  const junior = opts.junior ?? false;
  const data = opts.data ?? DATA;
  const tokens = resolveCardTokens({ theme: null, junior, data, packId: BLANK_PACK_ID });
  return renderPackCard(
    input,
    opts.size ?? "square",
    true,
    tokens,
    junior,
    data,
    BLANK_PACK_ID,
    doc,
    { page: opts.page },
  );
}

const at = (x: number, y: number, w: number, h: number) => ({
  square: { x, y, w, h },
  portrait: { x, y, w, h },
  story: { x, y, w, h },
  landscape: { x, y, w, h },
});
const text = (id: string, content: string, extra: Partial<TemplateLayerV2> = {}) =>
  ({ id, kind: "text", content, geometry: at(0, 0, 80, 6), ...extra }) as TemplateLayerV2;
const v2 = (page: PageKey, layers: TemplateLayerV2[]): CardAdjustments =>
  ({ formatVersion: 2, pages: { [page]: { layers } } }) as CardAdjustments;
const drawn = (html: string) => [...html.matchAll(/data-layer-id="([^"]+)"/g)].map((m) => m[1]);

/** A senior fixture with every optional field's data loaded (ADR-010 content). */
const FIXTURE: CardContent = {
  kind: "matchDay",
  page: "fixture",
  fixtureId: 7,
  junior: false,
  juniorTeamName: null,
  grade: "A Grade",
  roundLabel: "ROUND 5",
  opposition: {
    name: "Rockingham",
    rawName: "Rockingham Mandurah",
    crestUrl: "https://cdn.example.org/opp.png",
    monogram: "RM",
  },
  homeAway: "HOME",
  venue: "Sample Oval",
  startAt: "2026-10-24T02:00:00Z",
  day: "2026-10-24",
  date: "SAT 24 OCT",
  startTime: "10:00 AM",
  source: {},
  ladder: { club: "2nd", opposition: "5th" },
  lastMeeting: { line: "Won by 12 runs, Jan 2026" },
  milestoneWatch: { line: "J. Smith 12 short of 1,000 runs" },
} as unknown as CardContent;

const fixtureInput = (preset: (typeof CONTENT_PRESETS)[number]) =>
  contentInput(FIXTURE, resolveVisibleFields("matchDay", { preset })) as unknown as ShareCardInput;

describe("page selection (T1.12)", () => {
  const doc = {
    formatVersion: 2,
    pages: {
      fixture: { layers: [text("fixture-layer", "{{grade}}")] },
      title: { layers: [text("title-layer", "{{weekendTitle}}")] },
      day: { layers: [text("day-layer", "{{dayHeading}}")] },
      sponsors: { layers: [text("sponsors-layer", "{{weekendTitle}}")] },
    },
  } as CardAdjustments;
  const page = (input: Record<string, unknown>) =>
    drawn(render({ ...fixtureInput("standard"), ...input } as ShareCardInput, doc));

  it("draws the page each carousel slide is", () => {
    expect(page({})).toEqual(["fixture-layer"]);
    expect(page({ carouselPage: { page: "title", title: "MATCH DAY", sponsors: [] } })).toEqual([
      "title-layer",
    ]);
    expect(page({ carouselPage: { page: "sponsors", title: "MATCH DAY", sponsors: [] } })).toEqual([
      "sponsors-layer",
    ]);
    expect(page({ junior: true, carouselDay: { heading: "SAT 24 OCT", fixtures: [] } })).toEqual([
      "day-layer",
    ]);
  });

  it("draws the page asked for over the input's", () => {
    expect(drawn(render(fixtureInput("standard"), doc, { page: "title" }))).toEqual([]);
  });

  it("draws a v1 document's one page on every slide, as before", () => {
    const v1 = { layers: [text("v1-layer", "{{grade}}")] } as CardAdjustments;
    const title = {
      ...fixtureInput("standard"),
      carouselPage: { page: "title", title: "MATCH DAY", sponsors: [] },
    } as unknown as ShareCardInput;
    expect(drawn(render(title, v1))).toEqual(["v1-layer"]);
  });
});

describe("stack groups and collapse (T1.13, T1.14)", () => {
  /** The fixture's details stacked under the opposition, each optional line its own child. */
  const details = (): TemplateLayerV2 => ({
    id: "details",
    kind: "group",
    geometry: at(10, 40, 80, 40),
    stack: { direction: "column", gap: 1.5, align: "center" },
    children: [
      text("opposition", "v {{opposition.name}}", { geometry: at(0, 0, 80, 8) }),
      text("round", "{{roundLabel}}", { geometry: at(0, 0, 60, 5) }),
      text("ground", "{{venue}} · {{startTime}}", { geometry: at(0, 0, 70, 5) }),
      text("ladder", "{{ladder.club}} v {{ladder.opposition}}", { geometry: at(0, 0, 50, 5) }),
      text("last", "Last time: {{lastMeeting}}", { geometry: at(0, 0, 80, 5) }),
    ],
  });

  it("closes up around what each preset hides", () => {
    const rows = Object.fromEntries(
      CONTENT_PRESETS.map((preset) => [
        preset,
        drawn(render(fixtureInput(preset), v2("fixture", [details()]))),
      ]),
    );
    expect(rows).toEqual({
      minimal: ["details", "opposition", "ground"],
      standard: ["details", "opposition", "round", "ground"],
      full: ["details", "opposition", "round", "ground", "ladder", "last"],
    });
  });

  it("lays the children out with flex, sized against the group's box", () => {
    const html = render(fixtureInput("full"), v2("fixture", [details()]));
    expect(html).toContain('data-stack="column"');
    expect(html).toMatch(/display:flex;flex-direction:column;gap:1\.5cqw;align-items:center/);
    // 80 % of the artboard inside an 80 %-wide, 40 %-tall group: 100 % wide, 20 % tall.
    expect(html).toMatch(
      /data-layer-id="opposition" style="position:relative;flex:none;width:100%;height:20%/,
    );
    // The children's own x and y are ignored in a stack.
    expect(html).not.toMatch(/data-layer-id="round" style="[^"]*left:/);
  });

  it("drops the whole group when every child is gone", () => {
    const optional: TemplateLayerV2 = {
      id: "extras",
      kind: "group",
      geometry: at(10, 80, 80, 10),
      stack: { direction: "row", gap: 2 },
      children: [text("ladder", "{{ladder.club}}"), text("last", "{{lastMeeting}}")],
    };
    expect(drawn(render(fixtureInput("standard"), v2("fixture", [optional])))).toEqual([]);
    expect(drawn(render(fixtureInput("full"), v2("fixture", [optional])))).toEqual([
      "extras",
      "ladder",
      "last",
    ]);
  });

  it("keeps a plain group's children at their own boxes, relative to the group", () => {
    const plain: TemplateLayerV2 = {
      id: "plain",
      kind: "group",
      geometry: at(10, 20, 50, 40),
      children: [text("inside", "{{grade}}", { geometry: at(20, 30, 25, 10) })],
    };
    const html = render(fixtureInput("standard"), v2("fixture", [plain]));
    // (20 − 10) / 50 = 20 %, (30 − 20) / 40 = 25 %, 25 / 50 = 50 %, 10 / 40 = 25 %.
    expect(html).toContain(
      'data-layer-id="inside" style="position:absolute;left:20%;top:25%;width:50%;height:25%',
    );
  });

  it("nests stacks to depth 4, and draws nothing deeper", () => {
    const nest = (depth: number): TemplateLayerV2 =>
      depth === 0
        ? text("leaf", "{{grade}}", { geometry: at(10, 10, 20, 5) })
        : {
            id: `g${depth}`,
            kind: "group",
            geometry: at(10, 10, 80, 80),
            stack: { direction: "column" },
            children: [nest(depth - 1)],
          };
    expect(drawn(render(fixtureInput("standard"), v2("fixture", [nest(4)])))).toEqual([
      "g4",
      "g3",
      "g2",
      "g1",
      "leaf",
    ]);
    // A fifth level isn't drawn, and a group left with nothing isn't drawn either.
    expect(drawn(render(fixtureInput("standard"), v2("fixture", [nest(5)])))).toEqual([]);
  });

  it("closes up around hidden layers and layers not on this size", () => {
    const group: TemplateLayerV2 = {
      id: "g",
      kind: "group",
      geometry: at(0, 0, 100, 50),
      stack: { direction: "column" },
      children: [
        text("a", "{{grade}}"),
        text("b", "{{venue}}", { hidden: true }),
        text("c", "{{date}}", { sizes: ["story"] }),
      ],
    };
    expect(drawn(render(fixtureInput("standard"), v2("fixture", [group])))).toEqual(["g", "a"]);
    expect(
      drawn(render(fixtureInput("standard"), v2("fixture", [group]), { size: "story" })),
    ).toEqual(["g", "a", "c"]);
  });
});

describe("showWhen (T1.15)", () => {
  const ctx = (over: Partial<LayoutContext> = {}): LayoutContext => ({
    kind: "matchDay",
    page: "fixture",
    size: "square",
    junior: false,
    has: () => true,
    hasPhoto: true,
    hasSponsors: true,
    ...over,
  });
  const when = (showWhen: TemplateLayerV2["showWhen"]) => text("x", "X", { showWhen });

  it("holds when every condition does", () => {
    expect(layerShows(when(undefined), ctx())).toBe(true);
    expect(layerShows(when({ photo: true }), ctx())).toBe(true);
    expect(layerShows(when({ photo: false }), ctx())).toBe(false);
    expect(layerShows(when({ photo: false }), ctx({ hasPhoto: false }))).toBe(true);
    expect(layerShows(when({ sponsors: true }), ctx({ hasSponsors: false }))).toBe(false);
    expect(layerShows(when({ junior: true }), ctx())).toBe(false);
    expect(layerShows(when({ junior: false, photo: true }), ctx())).toBe(true);
    expect(layerShows(when({ field: "roundLabel" }), ctx({ has: () => false }))).toBe(false);
  });

  it("shows a field-conditioned layer per preset", () => {
    const divider = text("divider", "—", { showWhen: { field: "roundLabel" } });
    expect(drawn(render(fixtureInput("minimal"), v2("fixture", [divider])))).toEqual([]);
    expect(drawn(render(fixtureInput("standard"), v2("fixture", [divider])))).toEqual(["divider"]);
  });

  it("swaps the photo for its no-photo art", () => {
    const doc = v2("fixture", [
      { id: "pic", kind: "photo", geometry: at(0, 0, 100, 60), showWhen: { photo: true } },
      text("art", "{{opposition.name}}", { showWhen: { photo: false } }),
    ]);
    expect(drawn(render(fixtureInput("standard"), doc))).toEqual(["pic"]);
    const noPhoto = { ...DATA, photoUrl: null };
    expect(drawn(render(fixtureInput("standard"), doc, { data: noPhoto }))).toEqual(["art"]);
  });

  it("can't reveal what the junior rules withhold", () => {
    const junior = { ...fixtureInput("full"), junior: true } as ShareCardInput;
    const doc = v2("fixture", [
      // A photo layer that insists on showing, an image token naming the photo
      // and a junior-only layer naming it: none may draw the junior's photo.
      { id: "pic", kind: "photo", geometry: at(0, 0, 100, 60), showWhen: { photo: true } },
      {
        id: "token-photo",
        kind: "image",
        content: "{{photo}}",
        geometry: at(0, 0, 50, 50),
        showWhen: { junior: true },
      },
      // Logos aren't photos: the crest and the no-photo art still show.
      { id: "crest", kind: "image", content: "{{opposition.logo}}", geometry: at(0, 0, 20, 20) },
      text("art", "{{opposition.name}}", { showWhen: { photo: false } }),
    ]);
    const html = render(junior, doc, { junior: true });
    expect(drawn(html)).toEqual(["crest", "art"]);
    expect(html).not.toContain("photo.jpg");
    // With the server's marker the junior's own photo shows.
    const allowed = { ...junior, juniorPhotoAllowed: true } as unknown as ShareCardInput;
    expect(drawn(render(allowed, doc, { junior: true }))).toEqual(["pic", "token-photo", "crest"]);
  });

  it("reads sponsor logos for the sponsors condition", () => {
    const doc = v2("fixture", [
      text("thanks", "Thanks to our sponsors", { showWhen: { sponsors: true } }),
    ]);
    expect(drawn(render(fixtureInput("standard"), doc))).toEqual(["thanks"]);
    const noSponsors = { ...DATA, sponsors: [] };
    expect(drawn(render(fixtureInput("standard"), doc, { data: noSponsors }))).toEqual([]);
  });
});

describe("day and sponsors rows (T1.16)", () => {
  const dayInput = {
    kind: "matchDay",
    roundLabel: "",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: "SAT 24 OCT",
    startTime: "",
    junior: true,
    namesResolved: true,
    carouselDay: {
      heading: "SAT 24 OCT",
      fixtures: [
        {
          grade: "U13 Blue",
          opposition: "Rockingham",
          crestUrl: "https://cdn.example.org/rock.png",
          monogram: "R",
          homeAway: "HOME",
          venue: "Sample Oval",
          startTime: "8:30",
          roundLabel: "",
        },
        {
          grade: "U15 Gold",
          opposition: "Mandurah",
          crestUrl: null,
          monogram: "M",
          homeAway: "AWAY",
          venue: "Park Oval",
          startTime: "9:00",
          roundLabel: "",
        },
      ],
    },
  } as unknown as ShareCardInput;

  const dayRows: TemplateLayerV2 = {
    id: "games",
    kind: "rows",
    geometry: at(5, 20, 90, 60),
    rows: {
      repeat: "dayRows",
      rowHeight: 10,
      gap: 1,
      cells: [
        { field: "crest", show: "logo", x: 0, w: 12 },
        { field: "monogram", fallbackFor: "crest", x: 0, w: 12 },
        { field: "grade", x: 14, w: 40 },
        { field: "opposition", x: 56, w: 30 },
        { field: "time", x: 88, w: 12 },
      ],
    },
  };

  it("draws the junior day's games, crests and all, with the monogram where a crest is missing", () => {
    const html = render(dayInput, v2("day", [dayRows]), { junior: true });
    expect(drawn(html)).toEqual(["games"]);
    expect(html).toContain("rock.png");
    expect(html.match(/data-row-cell="crest"/g)).toHaveLength(1);
    expect(html.match(/data-row-cell="monogram"/g)).toHaveLength(1);
    expect(html).toContain(">M</div>");
    expect(html).not.toContain(">R</div>");
    expect(html).toContain("U15 Gold");
  });

  it("never draws a photo through a logo cell", () => {
    const sneaky: TemplateLayerV2 = {
      id: "sneaky",
      kind: "rows",
      geometry: at(0, 0, 100, 100),
      rows: {
        repeat: "players",
        rowHeight: 10,
        cells: [{ field: "photo", show: "logo", x: 0, w: 20 }],
      },
    };
    const input = {
      kind: "teamOfWeek",
      junior: true,
      players: [{ name: "Kid", photoUrl: "https://cdn.example.org/kid.jpg" }],
    } as unknown as ShareCardInput;
    expect(render(input, v2("card", [sneaky]), { junior: true })).not.toContain("kid.jpg");
  });

  it("draws the sponsors page's sponsors, the majors in their own style", () => {
    const input = {
      kind: "matchDay",
      roundLabel: "",
      oppositionName: "",
      homeAway: "HOME",
      venue: "",
      date: "SAT 24 – SUN 25 OCT",
      startTime: "",
      namesResolved: true,
      carouselPage: {
        page: "sponsors",
        title: "MATCH DAY",
        fixtureCount: 4,
        majorCount: 1,
        sponsors: [
          { name: "Coastal Plumbing", logoUrl: "https://cdn.example.org/s1.png" },
          { name: "Harbour Motors", logoUrl: "https://cdn.example.org/s2.png" },
        ],
      },
    } as unknown as ShareCardInput;
    const grid: TemplateLayerV2 = {
      id: "grid",
      kind: "rows",
      geometry: at(5, 30, 90, 50),
      rows: {
        repeat: "sponsors",
        rowHeight: 20,
        columns: 2,
        cells: [{ field: "logo", show: "logo", x: 0, w: 100, style: { radius: 4 } }],
        variants: { major: { logo: { radius: 12 } } },
      },
    };
    const html = render(input, v2("sponsors", [grid]));
    expect(html).toContain("s1.png");
    expect(html).toContain("s2.png");
    expect(html).toContain('data-row-variant="major"');
    expect(html).toMatch(
      /data-row-variant="major"[^>]*><div data-row-cell="logo" style="[^"]*border-radius:12px/,
    );
  });
});

describe("text fit (T1.17)", () => {
  /** A fake element whose text fits once the scale and line mode allow. */
  const target = (fits: (scale: number, lines: 1 | 2) => boolean) => {
    const log: string[] = [];
    let scale = 1;
    let lines: 1 | 2 = 1;
    const t: TextFitTarget = {
      base: 5,
      apply: (s) => {
        scale = s;
      },
      lines: (n) => {
        lines = n;
        log.push(`lines:${n}`);
      },
      overflows: () => !fits(scale, lines),
      ellipsis: () => log.push("ellipsis"),
    };
    return { t, log };
  };
  const fit = { minScale: 0.6, maxLines: 2 as const, ellipsis: true };

  it("shrinks on one line first", () => {
    const { t, log } = target((s, l) => l === 1 && s <= 0.8);
    expect(fitTextTarget(t, fit)).toEqual({ scale: 0.8, lines: 1, ellipsis: false, fits: true });
    expect(log).toEqual(["lines:1"]);
  });

  it("wraps onto two lines past the minimum, at the largest scale that fits", () => {
    const { t, log } = target((s, l) => l === 2 && s <= 0.9);
    expect(fitTextTarget(t, fit)).toEqual({ scale: 0.9, lines: 2, ellipsis: false, fits: true });
    expect(log).toEqual(["lines:1", "lines:2"]);
  });

  it("ends in an ellipsis when even two lines at the minimum don't fit, if allowed", () => {
    const { t, log } = target(() => false);
    expect(fitTextTarget(t, fit)).toEqual({ scale: 0.6, lines: 2, ellipsis: true, fits: true });
    expect(log).toEqual(["lines:1", "lines:2", "ellipsis"]);
  });

  it("warns when nothing it may do fits", () => {
    const { t } = target(() => false);
    expect(fitTextTarget(t, { minScale: 0.6, maxLines: 1, ellipsis: false })).toEqual({
      scale: 0.6,
      lines: 1,
      ellipsis: false,
      fits: false,
    });
  });

  it("reads a fit safely and marks fitted text", () => {
    expect(readTextFit(undefined)).toEqual({ minScale: 0.6, maxLines: 1, ellipsis: false });
    expect(readTextFit({ minScale: 0.01, maxLines: 2 })).toEqual({
      minScale: 0.3,
      maxLines: 2,
      ellipsis: false,
    });
    expect(textFitAttrs(undefined)).toBe("");
    expect(textFitAttrs({ minScale: 0.7, maxLines: 2, ellipsis: true })).toBe(
      ' data-fit-min="0.7" data-fit-lines="2" data-fit-ellipsis="1"',
    );
    const html = render(
      fixtureInput("standard"),
      v2("fixture", [
        text("name", "{{opposition.name}}", { fit: { maxLines: 2 } } as Partial<TemplateLayerV2>),
      ]),
    );
    expect(html).toContain('data-fit-lines="2"');
    expect(html).toContain("<span data-fit-text");
  });
});
