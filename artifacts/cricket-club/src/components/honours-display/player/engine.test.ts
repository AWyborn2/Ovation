import { describe, it, expect } from "vitest";
import { resolveClubLook } from "@workspace/scorecard/kiosk-display";
import type { KioskAd, Sponsor } from "@workspace/api-client-react";
import type { DisplayBoard } from "../types";
import {
  boardColumnHeadings,
  columnGroupLabel,
  sliceBoardColumns,
  splitColumnGroups,
} from "./column-groups";
import { boardRowCount, pageRanges, rowsThatFit, sliceBoardRows } from "./pages";
import {
  creditsDurationMs,
  findFitScale,
  fitToBody,
  overflowsBody,
  FIT_MIN_SCALE,
} from "./movement";
import { pickTransition, RANDOM_TRANSITIONS, transitionSpec } from "./transitions";
import { buildRotation, slideshowPass } from "./rotation";

const display = { columns: 1, transition: "scroll" as const, fit: false };
const GRADES = ["First Grade", "Second Grade", "Third Grade", "Fourth Grade", "Fifth Grade"];

const grid = (cols: string[], rows: number): DisplayBoard => ({
  id: "champions",
  category: "awards",
  layout: "grid",
  title: "Club Champions",
  entries: [],
  grid: {
    rowHeading: "Season",
    columnHeadings: cols,
    rows: Array.from({ length: rows }, (_, r) => ({
      heading: `${2025 - r}/${26 - r}`,
      cells: cols.map((c) => ({ entries: [{ text: `${c} ${r}` }] })),
    })),
  },
  display,
});
const list = (n: number, layout: DisplayBoard["layout"] = "list"): DisplayBoard => ({
  id: `b-${layout}`,
  category: "records",
  layout,
  title: "Records",
  entries: Array.from({ length: n }, (_, i) => ({ primaryText: `P${i}`, season: "2024/25" })),
  display,
});

describe("column groups", () => {
  it.each([
    [8, 4, [4, 4]],
    [5, 4, [3, 2]],
    [7, 3, [3, 2, 2]],
    [4, 4, [4]],
    [3, 5, [3]],
  ])("splits %i columns at %i per screen into %j", (total, per, sizes) => {
    const groups = splitColumnGroups(total, per);
    expect(groups.map((g) => g.count)).toEqual(sizes);
    expect(groups.map((g) => g.start)).toEqual(
      sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0)),
    );
  });

  it("names each group's range, saying a shared Grade suffix once", () => {
    expect(columnGroupLabel(GRADES, { start: 0, count: 4 })).toBe("First to Fourth Grade");
    expect(
      columnGroupLabel(["President", "Vice President", "Secretary"], { start: 0, count: 3 }),
    ).toBe("President to Secretary");
    expect(columnGroupLabel(GRADES, { start: 4, count: 1 })).toBe("Fifth Grade");
  });

  it("slices a season grid's headings and cells, keeping the season", () => {
    const sliced = sliceBoardColumns(grid(GRADES, 2), { start: 3, count: 2 });
    expect(sliced.grid!.columnHeadings).toEqual(["Fourth Grade", "Fifth Grade"]);
    expect(sliced.grid!.rows[1]!.heading).toBe("2024/25");
    expect(sliced.grid!.rows[1]!.cells.map((c) => c.entries[0]!.text)).toEqual([
      "Fourth Grade 1",
      "Fifth Grade 1",
    ]);
  });

  it("keeps a composite board's Season column on every screen", () => {
    const composite: DisplayBoard = {
      ...list(0, "columns"),
      columns: ["Season", "A", "B", "C"].map((h) => ({ heading: h, entries: [] })),
    };
    expect(boardColumnHeadings(composite)).toEqual(["A", "B", "C"]);
    const sliced = sliceBoardColumns(composite, { start: 1, count: 2 });
    expect(sliced.columns!.map((c) => c.heading)).toEqual(["Season", "B", "C"]);
  });

  it("has no groups for layouts without columns", () => {
    expect(boardColumnHeadings(list(5))).toEqual([]);
  });
});

describe("pages", () => {
  it("counts rows by layout", () => {
    expect(boardRowCount(grid(GRADES, 24), 4)).toBe(24);
    expect(boardRowCount(list(30), 2)).toBe(15); // two list columns per line
    expect(boardRowCount(list(9, "premiership"), 5)).toBe(2); // rows of plaques
  });

  it("slices rows by layout", () => {
    expect(sliceBoardRows(grid(GRADES, 24), 10, 20, 4).grid!.rows).toHaveLength(10);
    const plaques = sliceBoardRows(list(9, "premiership"), 1, 2, 5);
    expect(plaques.entries.map((e) => e.primaryText)).toEqual(["P5", "P6", "P7", "P8"]);
  });

  it("splits rows into page ranges", () => {
    expect(pageRanges(24, 10)).toEqual([
      [0, 10],
      [10, 20],
      [20, 24],
    ]);
    expect(pageRanges(5, 10)).toEqual([[0, 5]]);
    expect(pageRanges(0, 10)).toEqual([[0, 0]]);
  });

  it("counts the whole rows that fit, grouping items that share a top", () => {
    const rows = [0, 40, 80, 120].map((top) => ({ top, bottom: top + 40 }));
    expect(rowsThatFit(rows, 130)).toBe(3);
    expect(rowsThatFit(rows, 160)).toBe(4);
    // Plaques side by side: the tallest in a row decides whether it fits.
    const plaques = [
      { top: 0, bottom: 300 },
      { top: 0.5, bottom: 340 },
      { top: 360, bottom: 700 },
    ];
    expect(rowsThatFit(plaques, 600)).toBe(1);
    // A row taller than the screen still gets a page of its own.
    expect(rowsThatFit([{ top: 0, bottom: 900 }], 600)).toBe(1);
  });

  it("scales a page down when one row of plaques is taller than the body", () => {
    // Five plaques across, each 900px tall at full size, in a 600px body:
    // one row per page, and that page is fitted rather than clipped.
    const plaques = [0, 0.4, 0, 0.2, 0].map((top) => ({ top, bottom: top + 900 }));
    expect(rowsThatFit(plaques, 600)).toBe(1);
    let scale = 1;
    const body = {
      clientHeight: 600,
      get scrollHeight() {
        return 900 * scale;
      },
    };
    const inner = { style: { setProperty: (_: string, v: string) => void (scale = Number(v)) } };
    expect(overflowsBody(body)).toBe(true);
    const fit = fitToBody({ body, inner }, 1);
    expect(fit.scale).toBeLessThanOrEqual(600 / 900);
    expect(fit.scale).toBeGreaterThan(600 / 900 - 0.05); // the largest that fits
    expect(scale).toBe(fit.scale); // left applied to the page
    expect(overflowsBody(body)).toBe(false);
  });

  it("leaves a page that already fits at its size", () => {
    const set: string[] = [];
    const fit = fitToBody(
      {
        body: { clientHeight: 600, scrollHeight: 580 },
        inner: { style: { setProperty: (_, v) => void set.push(v) } },
      },
      1.18,
    );
    expect(fit).toEqual({ scale: 1.18, readable: true });
    expect(set.at(-1)).toBe("1.18");
  });
});

describe("movement", () => {
  it("fits by stepping the text scale down until the board fits", () => {
    const fit = findFitScale((s) => s <= 0.8, 1);
    expect(fit.scale).toBeCloseTo(0.8, 5);
    expect(fit.readable).toBe(true);
  });

  it("flags a fit below 0.7 as hard to read, and never goes under the floor", () => {
    expect(findFitScale((s) => s <= 0.6, 1)).toMatchObject({ readable: false });
    expect(findFitScale(() => false, 1).scale).toBeGreaterThanOrEqual(FIT_MIN_SCALE);
  });

  it("keeps a board that already fits at its own size", () => {
    expect(findFitScale(() => true, 1.18)).toEqual({ scale: 1.18, readable: true });
  });

  it("times a credits roll by speed, scaled to the screen width", () => {
    expect(creditsDurationMs(360, 36, 1280)).toBe(10_000);
    expect(creditsDurationMs(360, 36, 1920)).toBeCloseTo(6_667, 0);
    expect(creditsDurationMs(0, 36, 1280)).toBe(0);
  });
});

describe("transitions", () => {
  it("resolves random from the showy set", () => {
    expect(pickTransition("random", { random: () => 0 })).toBe(RANDOM_TRANSITIONS[0]);
    expect(pickTransition("random", { random: () => 0.999 })).toBe(
      RANDOM_TRANSITIONS[RANDOM_TRANSITIONS.length - 1],
    );
  });

  it("turns everything but Cut into a Fade for reduced motion", () => {
    expect(pickTransition("flip", { reducedMotion: true })).toBe("fade");
    expect(pickTransition("random", { reducedMotion: true })).toBe("fade");
    expect(pickTransition("cut", { reducedMotion: true })).toBe("cut");
  });

  it("animates only transform, opacity and clip-path", () => {
    const allowed = new Set(["transform", "opacity", "clipPath", "offset"]);
    for (const t of [...RANDOM_TRANSITIONS, "rows", "cut"] as const) {
      const spec = transitionSpec(t);
      if (t === "cut") {
        expect(spec).toBeNull();
        continue;
      }
      for (const frame of [...spec!.incoming, ...spec!.outgoing]) {
        for (const key of Object.keys(frame)) expect(allowed.has(key)).toBe(true);
      }
    }
  });
});

describe("rotation", () => {
  const look = resolveClubLook({ kioskLook: {} });
  const settings = {
    kioskSequence: [] as string[],
    boardConfigs: {},
    kioskSponsorSlideEvery: 2,
    kioskSponsorSlideStyle: "grid" as const,
  };
  const sponsors = [
    { id: 1, name: "A" },
    { id: 2, name: "B" },
  ] as Sponsor[];
  const boards = [grid(GRADES, 3), { ...list(4), id: "l1" }, { ...list(4), id: "l2" }];

  it("plays every board in order when no sequence is set", () => {
    const items = buildRotation({
      boards,
      settings,
      look,
      sponsors,
      ads: [],
      sponsorSlides: false,
    });
    expect(items.map((i) => i.kind === "board" && i.board.id)).toEqual(["champions", "l1", "l2"]);
  });

  it("resolves each board's display and splits its columns into groups", () => {
    const items = buildRotation({
      boards,
      settings: {
        ...settings,
        boardConfigs: { champions: { columnsPerScreen: 3, move: "pages" } },
      },
      look,
      sponsors,
      ads: [],
      sponsorSlides: false,
    });
    const first = items[0]!;
    expect(first.kind).toBe("board");
    if (first.kind !== "board") return;
    expect(first.display.move).toBe("pages");
    expect(first.groups.map((g) => g.count)).toEqual([3, 2]);
  });

  it("follows the admin sequence with sponsor and ad tokens", () => {
    const ad = { id: "ad:x", name: "Ad", imageUrl: "/x.png" } as KioskAd;
    const items = buildRotation({
      boards,
      settings: { ...settings, kioskSequence: ["l2", "sponsor", "ad:x", "missing", "l1"] },
      look,
      sponsors,
      ads: [ad],
      sponsorSlides: false,
    });
    expect(items.map((i) => i.kind)).toEqual(["board", "sponsor", "ad", "board"]);
  });

  it("inserts a sponsor slide after every N boards when slides are on", () => {
    const items = buildRotation({ boards, settings, look, sponsors, ads: [], sponsorSlides: true });
    expect(items.map((i) => i.kind)).toEqual(["board", "board", "sponsor", "board"]);
  });

  it("shows each sponsor on its own slide in the single style", () => {
    const items = buildRotation({
      boards: boards.slice(0, 1),
      settings: { ...settings, kioskSponsorSlideStyle: "single" },
      look,
      sponsors,
      ads: [],
      sponsorSlides: true,
    });
    expect(items.map((i) => (i.kind === "sponsor" ? i.sponsor?.name : i.kind))).toEqual([
      "board",
      "A",
      "B",
    ]);
  });
});

describe("photo slideshow passes", () => {
  const photos = ["a", "b", "c", "d", "e"].map((u) => ({ url: u, width: 1, height: 1 }));
  const item = (order: "random" | "newest", perPass: number) => ({
    kind: "photos" as const,
    key: "k",
    photos,
    slideshow: {
      id: "photos:x",
      name: "x",
      library: "senior" as const,
      source: "all" as const,
      order,
      perPass,
      secondsPerPhoto: 5,
      captions: false,
    },
  });
  const urls = (p: { url: string }[]) => p.map((x) => x.url);

  it("works down the newest photos pass by pass, wrapping round", () => {
    expect(urls(slideshowPass(item("newest", 2), 0))).toEqual(["a", "b"]);
    expect(urls(slideshowPass(item("newest", 2), 2))).toEqual(["c", "d"]);
    expect(urls(slideshowPass(item("newest", 2), 4))).toEqual(["e", "a"]);
    // An interlude shows one photo, carrying on from where the slideshow got to.
    expect(urls(slideshowPass({ ...item("newest", 2), interlude: true }, 3))).toEqual(["d"]);
    expect(urls(slideshowPass(item("newest", 9), 0))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("places an interlude after every N boards from a slideshow that has photos", () => {
    const look = resolveClubLook({});
    const slideshow = (id: string, interludeEvery: number | null) => ({
      ...item("random", 5).slideshow,
      id,
      interludeEvery,
    });
    const items = buildRotation({
      boards: ["a", "b", "c", "d", "e"].map((id) => ({ ...list(1), id, title: id })),
      settings: {
        kioskSequence: [],
        boardConfigs: {},
        kioskSponsorSlideEvery: 3,
        kioskSponsorSlideStyle: "grid",
      },
      look,
      sponsors: [],
      ads: [],
      slideshows: [
        slideshow("photos:x", 2),
        slideshow("photos:empty", 1),
        slideshow("photos:off", null),
      ],
      slideshowPhotos: { "photos:x": photos, "photos:off": photos },
      sponsorSlides: false,
    });
    expect(
      items.map((i) =>
        i.kind === "board" ? i.board.id : i.kind === "photos" && i.interlude ? "+" : "?",
      ),
    ).toEqual(["a", "b", "+", "c", "d", "+", "e"]);
  });

  it("picks a random set without repeats", () => {
    const pick = urls(slideshowPass(item("random", 3), 0, () => 0));
    expect(pick).toHaveLength(3);
    expect(new Set(pick).size).toBe(3);
  });
});
