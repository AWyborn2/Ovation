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
  it("draws a side of 14 at 13 px or more (was about 8 px, squeezed)", () => {
    const doc = teamListBundles().find((b) => b.name === "broadcast-dark/teamList")!.doc;
    const { w: W, h: H } = SIZES.landscape;
    const list = flattenLayers(doc.pages.team!.layers).find(
      (l): l is RowsLayerV2 => l.kind === "rows" && !!drawn(l, "landscape"),
    )!;
    const box = drawn(list, "landscape")!;
    const spec = list.rows;
    const perColumn = Math.ceil(SIDE / rowsColumns(spec));
    // The renderer's squeeze: a side over the box's capacity draws smaller.
    const needed =
      ((perColumn * Number(spec.rowHeight ?? 7) + (perColumn - 1) * Number(spec.gap ?? 0)) / 100) *
      W;
    const squeeze = Math.min(1, ((box.h / 100) * H + 0.5) / needed);
    const name = spec.cells.find((c) => c.field === "listName" && !c.show)!;
    const px = (Number(name.style?.fontSize ?? 5) / 100) * W * squeeze;
    expect(px).toBeGreaterThanOrEqual(13);
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
