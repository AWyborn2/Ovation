/**
 * Team List looks on every committed bundle, every size (Ash's round 3
 * retest, Nov 2026), read from the bundle files on disk:
 * - a side of 14 (the most a list draws, squeezed to fit its box when it holds
 *   fewer) keeps clear of the photo and the card's other foreground;
 * - every other list (Team of the Week, results, match summaries, fixtures,
 *   ladders, leaders, sponsor tiles), filled to its box's capacity, keeps
 *   clear of the same and of the page's other lists.
 *
 * The bundle fit check measures the same rule on the drawn card in Chrome
 * (`rows-overlap` in `template-fit.ts`); this is its geometry, so a bundle
 * edit that runs a list into its photo fails the web tests too.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  layerTokens,
  pageRepeatCapacities,
  rowsColumns,
  tileGrid,
  MAX_SPONSORS_PER_SLIDE,
  type PageKey,
  type RowsLayerV2,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import { SIZES, type CardSize } from "@/lib/share-card/types";
import { ROWS_PHOTO_CLEARANCE, paintsOver, rectMeetsPolygon, veils } from "./template-fit";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIDE = 14;
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];

type Box = { x: number; y: number; w: number; h: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type Pt = [number, number];

/** Every committed bundle whose file matches: look, kind, document and whether it's listed. */
function bundlesMatching(
  files: RegExp,
): Array<{ name: string; doc: TemplateDocumentV2; listed: boolean }> {
  const out: Array<{ name: string; doc: TemplateDocumentV2; listed: boolean }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (file === "look.json" || !files.test(file)) continue;
      const { document, listed } = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        document: TemplateDocumentV2;
        listed?: boolean;
      };
      if (!document?.pages) continue;
      out.push({
        name: `${look}/${file.replace(/\.json$/, "")}`,
        doc: document,
        listed: listed !== false,
      });
    }
  }
  return out;
}

/** Every committed Team List bundle (`teamList`, `teamListRound`). */
const teamListBundles = () => bundlesMatching(/^teamList\w*\.json$/);

/** Every listed bundle that draws a list (rows repeated from its data). */
const listBundles = () =>
  bundlesMatching(/\.json$/).filter(
    (b) =>
      b.listed &&
      Object.values(b.doc.pages).some((p) =>
        flattenLayers(p?.layers ?? []).some((l) => l.kind === "rows"),
      ),
  );

/**
 * A layer drawn on `size` with the sponsors on, on a senior or a junior card,
 * with the photo (a junior's is approved junior stock) or without it.
 */
type Card = { junior: boolean; photo: boolean };
const SENIOR: Card = { junior: false, photo: true };
/** The cards a list is drawn on: senior and junior, with and without the photo. */
const CARDS: Card[] = [
  SENIOR,
  { junior: false, photo: false },
  { junior: true, photo: true },
  { junior: true, photo: false },
];

function drawn(l: TemplateLayerV2, size: CardSize, card: Card = SENIOR): Box | null {
  if (l.hidden || (l.sizes && !l.sizes.includes(size))) return null;
  if (l.showWhen?.sponsors === false) return null;
  if (typeof l.showWhen?.photo === "boolean" && l.showWhen.photo !== card.photo) return null;
  if (typeof l.showWhen?.junior === "boolean" && l.showWhen.junior !== card.junior) return null;
  if (!card.photo && l.kind === "photo") return null;
  return (l.geometry as Partial<Record<CardSize, Box>>)[size] ?? null;
}

const px = (b: Box, size: CardSize): Rect => {
  const { w, h } = SIZES[size];
  return {
    left: (b.x / 100) * w,
    top: (b.y / 100) * h,
    right: ((b.x + b.w) / 100) * w,
    bottom: ((b.y + b.h) / 100) * h,
  };
};

/**
 * Where `count` rows draw (a side of 14 by default): the box's width, as tall
 * as its longest column (at most the box).
 */
function rowsExtent(l: RowsLayerV2, box: Box, size: CardSize, count = SIDE): Rect {
  const spec = l.rows;
  if (spec.layout === "tiles") {
    // A sponsor tile grid, centred in its box: as far as any count up to `count` reaches.
    const r = px(box, size);
    const art = SIZES[size].w;
    const tiles = Array.from({ length: count }, (_, i) =>
      tileGrid({
        count: i + 1,
        majors: 0,
        width: r.right - r.left,
        height: r.bottom - r.top,
        gap: (Number(spec.gap ?? 0) / 100) * art,
        maxTileHeight: (Number(spec.rowHeight ?? 7) / 100) * art,
      }),
    ).flat();
    if (tiles.length === 0) return { ...r, bottom: r.top };
    return {
      left: r.left + Math.min(...tiles.map((t) => t.x)),
      top: r.top + Math.min(...tiles.map((t) => t.y)),
      right: r.left + Math.max(...tiles.map((t) => t.x + t.w)),
      bottom: r.top + Math.max(...tiles.map((t) => t.y + t.h)),
    };
  }
  const perColumn = Math.ceil(count / rowsColumns(spec));
  const rowHeight = Number(spec.rowHeight ?? 7);
  const gap = Number(spec.gap ?? 0);
  const { w, h } = SIZES[size];
  const tall = (((perColumn * rowHeight + (perColumn - 1) * gap) / 100) * w * 100) / h;
  return px({ ...box, h: Math.min(box.h, tall) }, size);
}

/** A layer's painted area in card pixels: its box, cut to its clip polygon. */
function area(l: TemplateLayerV2, r: Rect): Pt[] {
  const poly = (l.style as { clip?: { polygon?: Pt[] } } | undefined)?.clip?.polygon;
  if (!Array.isArray(poly) || poly.length < 3)
    return [
      [r.left, r.top],
      [r.right, r.top],
      [r.right, r.bottom],
      [r.left, r.bottom],
    ];
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  return poly.map(([x, y]) => [r.left + (x / 100) * w, r.top + (y / 100) * h]);
}

const holds = (outer: Rect, inner: Rect) =>
  outer.left <= inner.left + 1 &&
  outer.top <= inner.top + 1 &&
  outer.right >= inner.right - 1 &&
  outer.bottom >= inner.bottom - 1;

/**
 * How many rows a list draws at its worst: a Team List side of 14 (squeezed
 * into its box), any other list filled to its box's capacity.
 */
function worstRows(
  doc: TemplateDocumentV2,
  page: string,
  list: RowsLayerV2,
  size: CardSize,
  teamList: boolean,
): number {
  const repeat = list.rows?.repeat ?? "";
  if (teamList && repeat === "players") return SIDE;
  return pageRepeatCapacities(doc, page as PageKey, size)[repeat] ?? 0;
}

/**
 * Fields bound from the same data as another, so empty whenever it is: the
 * sponsors page's next home match and its date (`bind.ts`, `page.nextHome`).
 */
const EMPTY_WITH: Record<string, string> = { nextHomeWhen: "nextHomeMatch" };

/**
 * Two layers that never draw together: one needs a field the other needs
 * empty, or one prints only the field the other is drawn without.
 */
function exclusive(a: TemplateLayerV2, b: TemplateLayerV2): boolean {
  const [sa, sb] = [a.showWhen ?? {}, b.showWhen ?? {}];
  if ((sa.field && sa.field === sb.noField) || (sb.field && sb.field === sa.noField)) return true;
  const only = (l: TemplateLayerV2, field?: string) => {
    const tokens = layerTokens(l);
    return (
      !!field && tokens.length > 0 && tokens.every((t) => t === field || EMPTY_WITH[t] === field)
    );
  };
  return only(b, sa.noField) || only(a, sb.noField);
}

/**
 * What a side of 14 runs into on a bundle's pages, as readable lines. With
 * `every`, every list on the page (Team of the Week, results, match
 * summaries, fixtures, ladders, leaders...) filled to its worst, and other
 * lists drawn beside it count too: rows must not run into each other. (Layers
 * of the same list, each drawing a part of every row, do share its rows.)
 */
function overlaps(
  name: string,
  doc: TemplateDocumentV2,
  card: Card = SENIOR,
  every = false,
): string[] {
  const out: string[] = [];
  const teamList = /\/teamList/.test(name);
  const at =
    card === SENIOR
      ? ""
      : ` (${card.junior ? "junior" : "senior"}, ${card.photo ? "photo" : "no photo"})`;
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    const layers = flattenLayers(p?.layers ?? []);
    for (const [li, list] of layers.entries()) {
      if (list.kind !== "rows" || (!every && list.rows?.repeat !== "players")) continue;
      for (const size of SIZE_KEYS) {
        const box = drawn(list, size, card);
        if (!box) continue;
        const count = worstRows(doc, page, list, size, teamList);
        if (count < 1) continue;
        const rows = rowsExtent(list, box, size, count);
        const short = Math.min(SIZES[size].w, SIZES[size].h);
        for (const [oi, other] of layers.entries()) {
          let ob = oi === li ? null : drawn(other, size, card);
          if (!ob || (ob.w >= 90 && ob.h >= 90)) continue;
          if (every && exclusive(list, other)) continue;
          const opacity = (other.style as { opacity?: unknown } | undefined)?.opacity;
          if (typeof opacity === "number" && opacity <= 0.3) continue;
          const photo = other.kind === "photo";
          const data =
            layerTokens(other).length > 0 && (other.kind === "image" || other.kind === "text");
          const list2 =
            every && other.kind === "rows" && other.rows?.repeat !== list.rows?.repeat
              ? other
              : null;
          if (!photo && !data && !list2) continue;
          if (list2) {
            // Another list: where its own worst rows draw.
            const n = worstRows(doc, page, list2, size, teamList);
            if (n < 1) continue;
            const r = rowsExtent(list2, ob, size, n);
            const { w, h } = SIZES[size];
            ob = {
              x: (r.left / w) * 100,
              y: (r.top / h) * 100,
              w: ((r.right - r.left) / w) * 100,
              h: ((r.bottom - r.top) / h) * 100,
            };
          }
          // A panel or scrim drawn over the layer but under the list hides it
          // there: under the whole list, or (any list) wherever the two meet.
          const o = px(ob, size);
          const meet = {
            left: Math.max(o.left, rows.left),
            top: Math.max(o.top, rows.top),
            right: Math.min(o.right, rows.right),
            bottom: Math.min(o.bottom, rows.bottom),
          };
          if (
            oi < li &&
            layers
              .slice(oi + 1, li)
              .some(
                (s) =>
                  (every ? veils(s) : paintsOver(s)) &&
                  drawn(s, size, card) &&
                  holds(px(drawn(s, size, card)!, size), every ? meet : rows),
              )
          )
            continue;
          const pad = photo ? ROWS_PHOTO_CLEARANCE * short : -1;
          const grown = {
            left: rows.left - pad,
            top: rows.top - pad,
            right: rows.right + pad,
            bottom: rows.bottom + pad,
          };
          if (rectMeetsPolygon(grown, area(other, px(ob, size))))
            out.push(`${name} ${page} ${size}${at}: ${list.id} into ${other.id}`);
        }
      }
    }
  }
  return out;
}

describe("Team List rows clear of the photo", () => {
  const bundles = teamListBundles();

  it("reads every committed Team List bundle", () => {
    expect(bundles.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps a side of 14 clear of the photo, logos and data text at every size", () => {
    // Clubhouse's Team List is unlisted (a raw conversion: its list starts at
    // the photo's edge), so it doesn't ship and isn't held to the rule yet.
    const listed = bundles.filter(
      (b) =>
        (
          JSON.parse(readFileSync(path.join(BUNDLES, `${b.name}.json`), "utf8")) as {
            listed?: boolean;
          }
        ).listed !== false,
    );
    expect(listed.flatMap((b) => overlaps(b.name, b.doc))).toEqual([]);
  });

  it("holds a junior side to the same rule, with approved stock and with no photo", () => {
    // A junior Team List draws the senior layout (Ash, retest 3): the same
    // list, clear of the same photo slot, logos and data text.
    const listed = bundles.filter(
      (b) =>
        (
          JSON.parse(readFileSync(path.join(BUNDLES, `${b.name}.json`), "utf8")) as {
            listed?: boolean;
          }
        ).listed !== false,
    );
    expect(
      CARDS.slice(1).flatMap((card) => listed.flatMap((b) => overlaps(b.name, b.doc, card))),
    ).toEqual([]);
  });

  it("would catch Bold Type's story list as it was (26 px above the photo)", () => {
    const bold = bundles.find((b) => b.name === "bold-type/teamList")!;
    const was = structuredClone(bold.doc);
    for (const l of flattenLayers(was.pages.team!.layers))
      if (l.id === "team-l7-story") (l.geometry as Record<string, Box>).story!.y = 59;
    expect(overlaps("bold-type/teamList", was)).toEqual([
      "bold-type/teamList team story: team-l28 into team-l7-story",
    ]);
  });
});

// ── Shirt number and name on one line (Bold Type story, round 4 retest) ─────

/**
 * How far apart (in % of the row's height) a row's shirt number and name may
 * sit: cells centre their text vertically, so equal cell centres put the
 * number and name on one line.
 */
const ROW_CENTRE_TOLERANCE = 1.5;

/** The name cells a Team List row prints. */
const ROW_NAME_FIELDS = ["listName", "surname", "name", "playerName", "broadcastName"];

/** Every player list's number and name cell centres, per size it draws on. */
function numberNameCentres(doc: TemplateDocumentV2) {
  const out: Array<{ id: string; size: CardSize; number: number; name: number }> = [];
  for (const p of Object.values(doc.pages))
    for (const l of flattenLayers(p?.layers ?? [])) {
      if (l.kind !== "rows" || l.rows.repeat !== "players") continue;
      const centre = (c: { y?: number; h?: number }) => Number(c.y ?? 0) + Number(c.h ?? 100) / 2;
      const text = l.rows.cells.filter((c) => !c.show);
      const name = text.find((c) => ROW_NAME_FIELDS.includes(c.field));
      if (!name) continue;
      for (const num of text.filter((c) => c.field === "number"))
        for (const size of SIZE_KEYS)
          if (drawn(l, size)) out.push({ id: l.id, size, number: centre(num), name: centre(name) });
    }
  return out;
}

describe("Team List shirt number and name on one line", () => {
  const listed = teamListBundles().filter((b) => b.listed);

  it("Bold Type has a numbered list at every size", () => {
    const doc = listed.find((b) => b.name === "bold-type/teamList")!.doc;
    expect([...new Set(numberNameCentres(doc).map((c) => c.size))].sort()).toEqual(
      [...SIZE_KEYS].sort(),
    );
  });

  for (const { name, doc } of listed)
    for (const c of numberNameCentres(doc))
      it(`${name} ${c.size}: ${c.id}'s number and name share a row centre`, () => {
        expect(
          Math.abs(c.number - c.name),
          `number centre ${c.number.toFixed(2)}% vs name ${c.name.toFixed(2)}% of the row`,
        ).toBeLessThanOrEqual(ROW_CENTRE_TOLERANCE);
      });

  it("would catch Bold Type's story row as it was (the number 20% of a row above the name)", () => {
    const doc = structuredClone(listed.find((b) => b.name === "bold-type/teamList")!.doc);
    for (const l of flattenLayers(doc.pages.team!.layers))
      if (l.kind === "rows" && l.sizes?.includes("story"))
        for (const cell of l.rows.cells) if (cell.field === "number" && !cell.show) cell.y = 12.44;
    const story = numberNameCentres(doc).find((c) => c.size === "story")!;
    expect(Math.abs(story.number - story.name)).toBeGreaterThan(ROW_CENTRE_TOLERANCE);
  });
});

// ── Broadcast Dark landscape names readable (round 4 retest) ────────────────

describe("Broadcast Dark landscape Team List names", () => {
  /** The name size a side of `players` draws at on the landscape card, in px. */
  function namePx(players: number): { px: number; squeeze: number } {
    const doc = teamListBundles().find((b) => b.name === "broadcast-dark/teamList")!.doc;
    const { w: W, h: H } = SIZES.landscape;
    const list = flattenLayers(doc.pages.team!.layers).find(
      (l): l is RowsLayerV2 => l.kind === "rows" && !!drawn(l, "landscape"),
    )!;
    const box = drawn(list, "landscape")!;
    const spec = list.rows;
    const perColumn = Math.ceil(players / rowsColumns(spec));
    // The renderer's squeeze: a side over the box's capacity draws smaller.
    const needed =
      ((perColumn * Number(spec.rowHeight ?? 7) + (perColumn - 1) * Number(spec.gap ?? 0)) / 100) *
      W;
    const squeeze = Math.min(1, ((box.h / 100) * H + 0.5) / needed);
    const name = spec.cells.find((c) => c.field === "listName" && !c.show)!;
    return { px: (Number(name.style?.fontSize ?? 5) / 100) * W * squeeze, squeeze };
  }

  it("draws a side of 12 at full size, names 18 px or more (round 5: about 13 px)", () => {
    expect(namePx(12).squeeze).toBe(1);
    expect(namePx(11).squeeze).toBe(1);
    expect(namePx(12).px).toBeGreaterThanOrEqual(18);
  });

  it("shrinks only a longer side, a side of 14 still 16 px or more (was about 8 px)", () => {
    expect(namePx(SIDE).squeeze).toBeLessThan(1);
    expect(namePx(SIDE).px).toBeGreaterThanOrEqual(16);
  });
});

// ── The round label above the grade heading (Broadcast Dark landscape) ──────

/**
 * The least space between the round label ("ROUND 6") and the grade heading
 * under it ("A GRADE"): 0.75% of the card's shorter side (8 px on a 1080 card,
 * about 5 px on a 630-high landscape one).
 */
const MIN_HEADING_GAP = 0.0075;

type TextStyle = { fontSize?: number; lineHeight?: number };

/**
 * Where a one-line text box's line is drawn, top to bottom in card pixels:
 * its box, or a line taller than its box, centred on it (text is centred
 * vertically in its box and spills both ways).
 */
function lineExtent(l: TemplateLayerV2, b: Box, size: CardSize): [number, number] {
  const { w: W, h: H } = SIZES[size];
  const st = (l.style ?? {}) as TextStyle;
  const line = (Number(st.fontSize ?? 5) / 100) * W * Number(st.lineHeight ?? 1.2);
  const top = (b.y / 100) * H;
  const height = (b.h / 100) * H;
  const tall = Math.max(height, line);
  const mid = top + height / 2;
  return [mid - tall / 2, mid + tall / 2];
}

/** The round label and grade heading of a Team List page on each size, where it has both. */
function headingPairs(doc: TemplateDocumentV2) {
  const layers = flattenLayers(doc.pages.team?.layers ?? []);
  const on = (token: string, size: CardSize) =>
    layers.find(
      (l) =>
        l.kind === "text" &&
        String(l.content ?? "").includes(token) &&
        !l.hidden &&
        (!l.sizes || l.sizes.includes(size)) &&
        (l.geometry as Partial<Record<CardSize, Box>>)[size],
    );
  return SIZE_KEYS.flatMap((size) => {
    const round = on("{{broadcastRoundLabel}}", size);
    const grade = on("{{gradeHeading}}", size);
    return round && grade ? [{ size, round, grade }] : [];
  });
}

describe("Team List round label and grade heading", () => {
  const box = (l: TemplateLayerV2, size: CardSize) => (l.geometry as Record<string, Box>)[size]!;

  it("Broadcast Dark has both at every size", () => {
    const doc = teamListBundles().find((b) => b.name === "broadcast-dark/teamList")!.doc;
    expect(headingPairs(doc).map((p) => p.size)).toEqual(SIZE_KEYS);
  });

  for (const { name, doc } of teamListBundles())
    for (const { size, round, grade } of headingPairs(doc))
      it(`${name} ${size}: "ROUND 6" sits clear above "A GRADE"`, () => {
        const r = box(round, size);
        const g = box(grade, size);
        // The boxes themselves don't overlap, and the round comes first.
        expect(r.y + r.h, `${round.id} ends below ${grade.id} starts`).toBeLessThanOrEqual(g.y);
        // Nor do the lines as drawn, with room between them.
        const [, roundBottom] = lineExtent(round, r, size);
        const [gradeTop] = lineExtent(grade, g, size);
        const { w, h } = SIZES[size];
        expect(gradeTop - roundBottom).toBeGreaterThanOrEqual(MIN_HEADING_GAP * Math.min(w, h));
      });
});

/**
 * Round 3 retest (junior headings): the venue · date · time line sits clear
 * under the grade heading at every size, as drawn. On set 973 the line ran
 * through the heading.
 */
function headingVenuePairs(doc: TemplateDocumentV2) {
  const layers = flattenLayers(doc.pages.team?.layers ?? []);
  const on = (token: string, size: CardSize) =>
    layers.find(
      (l) =>
        l.kind === "text" &&
        String(l.content ?? "").includes(token) &&
        !l.hidden &&
        (!l.sizes || l.sizes.includes(size)) &&
        (l.geometry as Partial<Record<CardSize, Box>>)[size],
    );
  return SIZE_KEYS.flatMap((size) => {
    const grade = on("{{gradeHeading}}", size);
    const venue = on("{{venueDateTime}}", size);
    return grade && venue ? [{ size, grade, venue }] : [];
  });
}

describe("Team List grade heading and venue line", () => {
  const box = (l: TemplateLayerV2, size: CardSize) => (l.geometry as Record<string, Box>)[size]!;

  it("Broadcast Dark has both at every size", () => {
    const doc = teamListBundles().find((b) => b.name === "broadcast-dark/teamList")!.doc;
    expect(headingVenuePairs(doc).map((p) => p.size)).toEqual(SIZE_KEYS);
  });

  for (const { name, doc } of teamListBundles())
    for (const { size, grade, venue } of headingVenuePairs(doc))
      it(`${name} ${size}: the venue line sits clear of the heading`, () => {
        const g = box(grade, size);
        const v = box(venue, size);
        // Only a venue line under the heading, sharing its width, is checked
        // (some looks set it above or beside the heading).
        if (v.y < g.y || v.x >= g.x + g.w || g.x >= v.x + v.w) return;
        const [, headingBottom] = lineExtent(grade, g, size);
        const [venueTop] = lineExtent(venue, v, size);
        const { w, h } = SIZES[size];
        expect(
          venueTop - headingBottom,
          `${venue.id} starts ${Math.round(venueTop - headingBottom)} px after ${grade.id} ends`,
        ).toBeGreaterThanOrEqual(MIN_HEADING_GAP * Math.min(w, h));
      });
});

// ── Every list kind, every look ──────────────────────────────────────────────

describe("List rows clear of the photo, data and each other on every list kind", () => {
  const bundles = listBundles();

  it("reads every listed bundle with a list", () => {
    const names = bundles.map((b) => b.name);
    for (const n of [
      "club-kit/teamOfWeek",
      "club-kit/resultsSummary",
      "duotone/matchSummary",
      "omg-clean/matchSummary",
      "bold-type/ladder",
    ])
      expect(names).toContain(n);
  });

  for (const { name, doc } of bundles)
    it(`${name}: every list at its worst keeps clear at every size, senior and junior`, () => {
      expect(CARDS.flatMap((card) => overlaps(name, doc, card, true))).toEqual([]);
    });

  it("would catch Club Kit's Team of the Week as it was (third row over the sponsor logos)", () => {
    const totw = bundles.find((b) => b.name === "club-kit/teamOfWeek")!;
    const was = structuredClone(totw.doc);
    for (const l of flattenLayers(was.pages.card!.layers))
      if (l.id === "card-l33" && l.kind === "rows") {
        (l.geometry as Record<string, Box>).square!.h = 79.91;
        l.rows.rowHeight = 26.1;
      }
    expect(overlaps("club-kit/teamOfWeek", was, SENIOR, true)).toEqual(
      expect.arrayContaining(["club-kit/teamOfWeek card square: card-l33 into card-l42"]),
    );
  });
});

// ── Sponsor tiles inside their sheet (round 5 retest) ───────────────────────

/** The sponsor counts a sponsors page is held to: 1, 3, 7, 8, 12 and the most a slide holds. */
const SPONSOR_COUNTS = [1, 3, 7, 8, 12, MAX_SPONSORS_PER_SLIDE];

/**
 * The optional fields a sponsors page draws with or without: its layers'
 * `showWhen.field` / `noField` (the next home game, the call to action).
 */
type Fields = Record<string, boolean>;

/** Every on/off combination of the fields a page's layers are conditioned on. */
function fieldStates(layers: TemplateLayerV2[]): Fields[] {
  const keys = [
    ...new Set(layers.flatMap((l) => [l.showWhen?.field, l.showWhen?.noField]).filter(Boolean)),
  ] as string[];
  return keys.reduce<Fields[]>(
    (states, key) =>
      states.flatMap((s) => [
        { ...s, [key]: true },
        { ...s, [key]: false },
      ]),
    [{}],
  );
}

/** A layer drawn on `size` for `card` with these fields set or empty. */
function drawnWith(l: TemplateLayerV2, size: CardSize, card: Card, fields: Fields): Box | null {
  const { field, noField } = l.showWhen ?? {};
  if (field && fields[field] === false) return null;
  if (noField && fields[noField] === true) return null;
  return drawn(l, size, card);
}

/** Where `count` tiles draw in a tile list's box, in card pixels. */
function tilesExtent(l: RowsLayerV2, box: Box, size: CardSize, count: number): Rect | null {
  const r = px(box, size);
  const art = SIZES[size].w;
  const tiles = tileGrid({
    count,
    majors: 0,
    width: r.right - r.left,
    height: r.bottom - r.top,
    gap: (Number(l.rows.gap ?? 0) / 100) * art,
    maxTileHeight: (Number(l.rows.rowHeight ?? 7) / 100) * art,
  });
  if (tiles.length === 0) return null;
  return {
    left: r.left + Math.min(...tiles.map((t) => t.x)),
    top: r.top + Math.min(...tiles.map((t) => t.y)),
    right: r.left + Math.max(...tiles.map((t) => t.x + t.w)),
    bottom: r.top + Math.max(...tiles.map((t) => t.y + t.h)),
  };
}

/**
 * Sponsor tiles that run out of the sheet they sit on (Ash's round 5 retest:
 * with 7 sponsors and no next home game, Duotone's and Clubhouse's bottom row
 * of tiles hung below the sheet). A tile list's sheet is the last panel of one
 * solid colour (not the card's background, not a gradient scrim) drawn before
 * it under its top row; every tile, at every count in {@link SPONSOR_COUNTS},
 * must lie inside it. A list drawn straight on the card's ground has no sheet
 * to keep inside.
 */
function tilesOutsideSheet(
  name: string,
  doc: TemplateDocumentV2,
  counts: readonly number[] = SPONSOR_COUNTS,
): string[] {
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    const layers = flattenLayers(p?.layers ?? []);
    for (const fields of fieldStates(layers))
      for (const card of CARDS)
        for (const size of SIZE_KEYS)
          for (const [li, list] of layers.entries()) {
            if (list.kind !== "rows" || list.rows.layout !== "tiles") continue;
            const box = drawnWith(list, size, card, fields);
            if (!box) continue;
            for (const count of counts) {
              const tiles = tilesExtent(list, box, size, count);
              if (!tiles) continue;
              const top: Pt = [(tiles.left + tiles.right) / 2, tiles.top + 1];
              const sheet = layers
                .slice(0, li)
                .map((l) => ({ l, b: drawnWith(l, size, card, fields) }))
                .filter(
                  ({ l, b }) =>
                    b && solidPanel(l) && !(b.w >= 90 && b.h >= 90) && holdsPoint(px(b, size), top),
                )
                .pop();
              if (!sheet) continue;
              if (!holds(px(sheet.b!, size), tiles)) {
                const state = Object.entries(fields)
                  .map(([k, on]) => `${on ? "" : "no "}${k}`)
                  .join(", ");
                const at =
                  `${card.junior ? "junior" : "senior"}, ${card.photo ? "photo" : "no photo"}` +
                  (state ? `, ${state}` : "");
                out.push(
                  `${name} ${page} ${size} (${at}): ${count} sponsors' tiles run out of ${sheet.l.id}`,
                );
              }
            }
          }
  }
  return [...new Set(out)];
}

/** A panel of one solid colour (a sheet a list sits on), not a gradient scrim. */
const solidPanel = (l: TemplateLayerV2) =>
  paintsOver(l) && typeof (l.style as { fill?: unknown } | undefined)?.fill === "string";

const holdsPoint = (r: Rect, [x, y]: Pt) =>
  r.left <= x && x <= r.right && r.top <= y && y <= r.bottom;

describe("Sponsor tiles inside their sheet with 1, 3, 7, 8, 12 and the most sponsors", () => {
  const pages = bundlesMatching(/^matchDay\.json$/).filter((b) => b.listed && b.doc.pages.sponsors);

  it("reads every look's sponsors page", () => {
    expect(pages.map((b) => b.name)).toEqual(
      expect.arrayContaining(["duotone/matchDay", "clubhouse/matchDay", "bold-type/matchDay"]),
    );
  });

  // Clubhouse's sponsors page is being rebuilt on another branch (#676; it was
  // a Duotone copy): until then it is held to round 5's counts (7, 8, 16).
  const countsFor = (name: string) =>
    name === "clubhouse/matchDay" ? [7, 8, MAX_SPONSORS_PER_SLIDE] : SPONSOR_COUNTS;
  for (const { name, doc } of pages)
    it(`${name}: every sponsor tile stays on its sheet at every size, game or no game`, () => {
      expect(tilesOutsideSheet(name, doc, countsFor(name))).toEqual([]);
    });

  it("would catch Duotone's sponsors page as it was (one sheet, the no-game grid below it)", () => {
    const duo = pages.find((b) => b.name === "duotone/matchDay")!;
    const was = structuredClone(duo.doc);
    const layers = was.pages.sponsors!.layers;
    // Round 4's page: one sheet whatever the grid, sized for the game's grid.
    was.pages.sponsors!.layers = layers.filter((l) => l.id !== "sponsors-l9-tall");
    for (const l of was.pages.sponsors!.layers) if (l.id === "sponsors-l9") delete l.showWhen;
    expect(tilesOutsideSheet("duotone/matchDay", was)).toEqual(
      expect.arrayContaining([
        "duotone/matchDay sponsors portrait (senior, photo, no nextHomeMatch): 7 sponsors' tiles run out of sponsors-l9",
      ]),
    );
  });
});

// ── Club Kit Team of the Week: title clear of the header (round 5 retest) ───

/** How tall a line's letters stand, capitals to descenders, as a share of its font size. */
const GLYPH_HEIGHT = 0.8;

/**
 * Where a layer's ink is, in card pixels: an image's box; a text layer's
 * letters, centred in its box (text is centred vertically), as many lines as
 * the box holds when it may wrap (no one-line fit), else one, spilling past
 * the box when a line is taller than it.
 */
function textExtent(l: TemplateLayerV2, b: Box, size: CardSize): Rect {
  const r = px(b, size);
  if (l.kind !== "text") return r;
  const st = (l.style ?? {}) as TextStyle;
  const font = (Number(st.fontSize ?? 5) / 100) * SIZES[size].w;
  const line = font * Number(st.lineHeight ?? 1.05);
  const oneLine = (l as { fit?: { maxLines?: number } }).fit?.maxLines === 1;
  const lines = oneLine ? 1 : Math.max(1, Math.floor((r.bottom - r.top + 0.5) / line));
  const ink = (lines - 1) * line + GLYPH_HEIGHT * font;
  const mid = (r.top + r.bottom) / 2;
  return { ...r, top: mid - ink / 2, bottom: mid + ink / 2 };
}

const meets = (a: Rect, b: Rect) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

/** The club header and the date a Team of the Week title must keep clear of. */
const TITLE_CLEAR_OF = ["clubLogo", "clubName", "clubTagline", "dateLabel"];

/**
 * Where a Team of the Week's title runs into its club header (crest, name,
 * tagline) or its date (Ash's round 5 retest: Club Kit's square title sat on
 * the club name, under the date). A faint watermark crest doesn't count.
 */
function titleOverlaps(name: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    const layers = flattenLayers(p?.layers ?? []);
    for (const size of SIZE_KEYS)
      for (const title of layers) {
        const tb = drawn(title, size);
        if (!tb || title.kind !== "text" || !String(title.content ?? "").includes("{{title}}"))
          continue;
        for (const other of layers) {
          const ob = other === title ? null : drawn(other, size);
          if (!ob || !layerTokens(other).some((t) => TITLE_CLEAR_OF.includes(t))) continue;
          const opacity = (other.style as { opacity?: unknown } | undefined)?.opacity;
          if (typeof opacity === "number" && opacity <= 0.3) continue;
          if (meets(textExtent(title, tb, size), textExtent(other, ob, size)))
            out.push(`${name} ${page} ${size}: ${title.id} runs into ${other.id}`);
        }
      }
  }
  return out;
}

describe("Team of the Week title clear of the club header and date", () => {
  const bundles = bundlesMatching(/^teamOfWeek\.json$/).filter((b) => b.listed);

  it("reads every listed Team of the Week", () => {
    expect(bundles.map((b) => b.name)).toEqual(
      expect.arrayContaining([
        "broadcast-classic/teamOfWeek",
        "club-kit/teamOfWeek",
        "clubhouse/teamOfWeek",
      ]),
    );
  });

  for (const { name, doc } of bundles)
    it(`${name}: the title keeps clear of the crest, club name, tagline and date at every size`, () => {
      expect(titleOverlaps(name, doc)).toEqual([]);
    });

  it("would catch Club Kit's square title as it was (over the club name)", () => {
    const totw = bundles.find((b) => b.name === "club-kit/teamOfWeek")!;
    const was = structuredClone(totw.doc);
    for (const l of flattenLayers(was.pages.card!.layers)) {
      const g = l.geometry as Record<string, Box>;
      if (l.id === "card-l28") g.square!.y = 3.71;
      if (l.id === "card-l30" && l.kind === "text") {
        g.square = { x: 6, y: 6.12, w: 45.85, h: 12.74 };
        (l.style as { fontSize?: number }).fontSize = 6;
      }
    }
    expect(titleOverlaps("club-kit/teamOfWeek", was)).toEqual(
      expect.arrayContaining([
        "club-kit/teamOfWeek card square: card-l30 runs into card-l50",
        "club-kit/teamOfWeek card square: card-l30 runs into card-l51",
      ]),
    );
  });
});

// ── Results day rows: the result label clear of the text beside it ─────────

/** The space kept between a result row's label ("WON", "RESULT") and the text beside it, in px. */
const RESULT_LABEL_GAP = 10;

type Cell = RowsLayerV2["rows"]["cells"][number];
const isText = (c: Cell) => c.show === undefined || c.show === "text";
/** Two cells on the same line of the row (their bands overlap by more than a sliver). */
const sameLine = (a: Cell, b: Cell) =>
  Math.min((a.y ?? 0) + (a.h ?? 100), (b.y ?? 0) + (b.h ?? 100)) - Math.max(a.y ?? 0, b.y ?? 0) >
  0.5;

/**
 * Each results day row whose result label runs into the text beside it (Ash,
 * dev retest 6, set 992: Duotone's "RESULT" ran into "Year 8"): the label's
 * cell must sit on its pill (where it has one) and end at least
 * {@link RESULT_LABEL_GAP} px before any text cell on its line to its right,
 * on every size the list draws.
 */
function resultLabelCollisions(name: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  for (const layer of flattenLayers(doc.pages.day?.layers ?? [])) {
    if (layer.kind !== "rows") continue;
    const spec = (layer as RowsLayerV2).rows;
    const cells = spec.cells;
    // A row is one column's width: a landscape day draws two side by side.
    const columns = rowsColumns(spec);
    const colW = (100 - (spec.columnGap ?? 0) * (columns - 1)) / columns;
    for (const size of SIZE_KEYS) {
      if (layer.sizes && !layer.sizes.includes(size)) continue;
      const box = (layer.geometry as Partial<Record<CardSize, Box>> | undefined)?.[size];
      if (!box) continue;
      const rowPx = (((box.w / 100) * SIZES[size].w) / 100) * colW;
      for (const word of cells.filter((c) => c.field === "word" && isText(c))) {
        const pill = cells.find(
          (c) => c.field === "word" && c.show === "backdrop" && c.w >= 2 && sameLine(c, word),
        );
        if (pill && (word.x < pill.x - 0.01 || word.x + word.w > pill.x + pill.w + 0.01))
          out.push(`${name} day ${size}: ${layer.id} result label runs off its pill`);
        const right = word.x + word.w;
        for (const other of cells) {
          if (other === word || !isText(other) || !sameLine(word, other)) continue;
          if (other.x < right - 0.01) continue; // starts under the label: another line's text
          const gap = ((other.x - right) / 100) * rowPx;
          if (gap < RESULT_LABEL_GAP)
            out.push(
              `${name} day ${size}: ${layer.id} result label ${Math.round(gap)} px from ${other.field}`,
            );
        }
      }
    }
  }
  return out;
}

describe("Results day rows: the result label clear of the grade and team", () => {
  const bundles = bundlesMatching(/^matchSummary\.json$/).filter(
    (b) => b.listed && !!b.doc.pages.day,
  );

  it("reads every look's results day page", () => {
    expect(bundles.map((b) => b.name)).toContain("duotone/matchSummary");
    expect(bundles.length).toBeGreaterThanOrEqual(10);
  });

  for (const { name, doc } of bundles)
    it(`${name}: the result label keeps ${RESULT_LABEL_GAP} px from the text beside it, every size`, () => {
      expect(resultLabelCollisions(name, doc)).toEqual([]);
    });

  it("would catch Duotone's rows as they were (set 992: RESULT into Year 8)", () => {
    const duotone = bundles.find((b) => b.name === "duotone/matchSummary")!;
    const was = structuredClone(duotone.doc);
    for (const l of flattenLayers(was.pages.day!.layers))
      if (l.id === "day-l20" && l.kind === "rows") {
        const cells = (l as RowsLayerV2).rows.cells;
        const word = cells.find((c) => c.field === "word" && isText(c))!;
        const grade = cells.find((c) => c.field === "grade" && isText(c))!;
        word.w = 9.26;
        word.style = { ...word.style, align: "left" };
        grade.x = 9.26;
      }
    expect(resultLabelCollisions("duotone/matchSummary", was)).toEqual(
      expect.arrayContaining([
        "duotone/matchSummary day square: day-l20 result label runs off its pill",
        "duotone/matchSummary day square: day-l20 result label 0 px from grade",
      ]),
    );
  });
});

// ── Bold Type's sponsors slide: the tiles spread to fill it (retest 6) ─────

/** How far the tile group's centre may sit from its area's centre, as a share of the card's height. */
const SPREAD_CENTRE_TOLERANCE = 0.02;
/** With no photo, the slide's content reaches this close to the footer (share of the card's height). */
const SPREAD_FOOT_GAP = 0.04;

/** A layer that prints data (a `{{token}}`), drawn on this card. */
const dataText = (l: TemplateLayerV2) => l.kind === "text" && layerTokens(l).length > 0;

/**
 * How Bold Type's sponsors slide lays its tiles out (Ash, retest 6, set 980:
 * the tiles sat in the top half, the bottom half empty): for each size, card
 * (photo or not, senior or junior), next home game or not, and 1, 3, 7, 12
 * and 16 sponsors, the tile group is centred (within
 * {@link SPREAD_CENTRE_TOLERANCE}) in the area between the header above it
 * and whatever is drawn below it (the call to action, the photo, the
 * footer); no tile is taller than the list's cap (its `rowHeight`, so one to
 * three sponsors don't grow giant); and with no photo the slide's content
 * runs down to just above the footer, leaving no empty half.
 */
function sponsorSpread(name: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  const layers = flattenLayers(doc.pages.sponsors?.layers ?? []);
  for (const fields of fieldStates(layers))
    for (const card of CARDS)
      for (const size of SIZE_KEYS) {
        const H = SIZES[size].h;
        const on = layers
          .map((l) => ({ l, b: drawnWith(l, size, card, fields) }))
          .filter((d): d is { l: TemplateLayerV2; b: Box } => !!d.b);
        const list = on.find(
          (d) => d.l.kind === "rows" && (d.l as RowsLayerV2).rows.layout === "tiles",
        );
        if (!list) continue;
        const box = px(list.b, size);
        const footer = on
          .filter((d) => d.l.kind === "shape" && d.b.y > 80 && d.b.w >= 80 && d.b.h < 10)
          .map((d) => px(d.b, size).top)
          .reduce((a, b) => Math.min(a, b), H);
        // The header: the lowest data line wholly above the tiles.
        const head = on
          .filter((d) => dataText(d.l) && px(d.b, size).bottom <= box.top + 1)
          .map((d) => px(d.b, size).bottom)
          .reduce((a, b) => Math.max(a, b), 0);
        // Below: the first data line, photo or footer under the tiles, across them.
        const below = on
          .filter((d) => {
            const r = px(d.b, size);
            return (
              (dataText(d.l) || d.l.kind === "photo") &&
              r.top >= box.bottom - 1 &&
              r.left < box.right &&
              r.right > box.left
            );
          })
          .map((d) => px(d.b, size).top)
          .reduce((a, b) => Math.min(a, b), footer);
        const at = `${size} (${card.junior ? "junior" : "senior"}, ${card.photo ? "photo" : "no photo"}${Object.entries(
          fields,
        )
          .map(([k, v]) => `, ${v ? "" : "no "}${k}`)
          .join("")})`;
        const spec = (list.l as RowsLayerV2).rows;
        const cap = (Number(spec.rowHeight ?? 7) / 100) * SIZES[size].w;
        for (const count of [1, 3, 7, 12, MAX_SPONSORS_PER_SLIDE]) {
          const tiles = tilesExtent(list.l as RowsLayerV2, list.b, size, count);
          if (!tiles) continue;
          const centre = (tiles.top + tiles.bottom) / 2;
          const area = (head + below) / 2;
          if (Math.abs(centre - area) > SPREAD_CENTRE_TOLERANCE * H)
            out.push(
              `${name} ${at}: ${count} sponsors centred ${Math.round(centre)} px, their area's centre ${Math.round(area)} px`,
            );
          const tallest = tileGrid({
            count,
            majors: 0,
            width: box.right - box.left,
            height: box.bottom - box.top,
            gap: (Number(spec.gap ?? 0) / 100) * SIZES[size].w,
            maxTileHeight: cap,
          }).reduce((m, t) => Math.max(m, t.h), 0);
          if (tallest > cap + 0.5) out.push(`${name} ${at}: ${count} sponsors' tiles over the cap`);
        }
        if (!card.photo) {
          const foot = on
            .filter(
              (d) => (dataText(d.l) || d.l.kind === "rows") && px(d.b, size).bottom <= footer + 1,
            )
            .map((d) => px(d.b, size).bottom)
            .reduce((a, b) => Math.max(a, b), 0);
          if (footer - foot > SPREAD_FOOT_GAP * H)
            out.push(
              `${name} ${at}: the slide ends ${Math.round(footer - foot)} px above the footer (an empty band)`,
            );
        }
      }
  return [...new Set(out)];
}

describe("Bold Type's sponsors slide: tiles spread to fill it (set 980)", () => {
  const bold = bundlesMatching(/^matchDay\.json$/).find((b) => b.name === "bold-type/matchDay")!;

  it("centres 1 to 16 sponsors between the header and what's below, capped, and fills the slide", () => {
    expect(sponsorSpread("bold-type/matchDay", bold.doc)).toEqual([]);
  });

  it("would catch the slide as it was (no photo: tiles in the top half, an empty band below)", () => {
    const was = structuredClone(bold.doc);
    was.pages.sponsors!.layers = was.pages.sponsors!.layers.filter(
      (l) => l.id !== "sponsors-tiles-tall" && !l.id.endsWith("-low"),
    );
    for (const l of was.pages.sponsors!.layers)
      if (l.showWhen?.photo === true) delete l.showWhen.photo;
    expect(sponsorSpread("bold-type/matchDay", was)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^bold-type\/matchDay story \(senior, no photo.*empty band\)$/),
      ]),
    );
  });
});
