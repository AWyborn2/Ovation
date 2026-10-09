import type { TemplateSize, TemplateTextStyle } from "../document";
import type { StarterDocument, StarterSet } from "../starters";
import {
  CARD,
  element,
  rows,
  shape,
  stack,
  text,
  type Box,
  type PerSize,
  type StarterLayer,
} from "./layout";

/**
 * Club Kit starter designs, one per card kind (plan U6, KTD3), rebuilt from
 * the Club Kit pack (Club Colours handoff) out of template layers: the pack's
 * own library pieces for the frame and decoration, and text boxes with
 * `{{field}}` tokens for everything that carries data — so an empty field
 * simply disappears instead of showing sample wording.
 *
 * Layout follows the pack: 6-unit margins; a crest + club-name header with
 * the card-type chip; the photo in a diagonal frame on the right (square,
 * landscape) or a sloped frame across the top (portrait, story) with the
 * jumper-trim stripes; the body copy beside or below it; a tricolour rule over
 * the sponsor and hashtag footer. Colours are the club's `--ck-*` palette, so
 * every club sees its own colours.
 *
 * Kinds not designed yet fall back to the placeholder starter.
 */

const COND = "'Barlow Condensed','Arial Narrow',sans-serif";
const SANS = "'IBM Plex Sans',system-ui,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace";

const C = {
  p: "var(--ck-p,var(--gold,#FBAC27))",
  pt: "var(--ck-pt,var(--gold,#FBAC27))",
  onp: "var(--ck-onp,var(--accent-ink,#10151B))",
  chalk: "var(--ck-chalk,#F2F5F8)",
  chalk2: "var(--ck-chalk2,rgba(242,245,248,.68))",
  panel: "var(--ck-panel,rgba(242,245,248,.07))",
} as const;

type Style = TemplateTextStyle & { fontSize: number };
const tall = (s: TemplateSize) => s === "portrait" || s === "story";

// ---------------------------------------------------------------------------
// The body column, per size
// ---------------------------------------------------------------------------

const HEADER_BOTTOM = 19;
const FOOTER_TOP = (s: TemplateSize) => CARD[s].h - 14;

/** Where the body copy sits: beside the frame (flat sizes) or under it (tall). */
function column(s: TemplateSize) {
  if (s === "square")
    return { x: 6, w: 44, at: (HEADER_BOTTOM + FOOTER_TOP(s)) / 2, anchor: "center" as const };
  if (s === "landscape")
    return { x: 6, w: 92, at: (HEADER_BOTTOM + FOOTER_TOP(s)) / 2, anchor: "center" as const };
  return { x: 6, w: 88, at: FOOTER_TOP(s) - 3, anchor: "bottom" as const };
}

/** A piece of the body: its height and gap above on each size, and its layers. */
type Block = {
  key: string;
  h: (s: TemplateSize) => number;
  gap?: (s: TemplateSize) => number;
  make: (boxes: PerSize<Box>) => StarterLayer[];
};

const fixed = (n: number) => () => n;

function eyebrow(key: string, content: string, color: string = C.pt, gap = 0): Block {
  return {
    key,
    // The square's narrow column gets room for a second line.
    h: (s) => (s === "square" ? 5.6 : 3.2),
    gap: fixed(gap),
    make: (b) =>
      text(key, "Eyebrow", content, b, () => ({
        fontFamily: MONO,
        fontSize: 1.8,
        fontWeight: 600,
        letterSpacing: 0.22,
        uppercase: true,
        color,
        align: "left",
      })),
  };
}

/** The big number or word, in the club's colour. */
function hero(
  key: string,
  name: string,
  content: string,
  size: (s: TemplateSize) => number,
  gap = 0,
): Block {
  return {
    key,
    h: (s) => size(s) * 0.98,
    gap: fixed(gap),
    make: (b) =>
      text(key, name, content, b, (s) => ({
        fontFamily: COND,
        fontSize: size(s),
        fontWeight: 900,
        letterSpacing: -0.01,
        uppercase: true,
        color: C.pt,
        align: "left",
      })),
  };
}

/** A hero number with a small aside after it ("112 (98)"). */
/** `chars` is the number's usual width in characters ("112" → 3), so the aside sits beside it. */
function heroWithAside(
  key: string,
  name: string,
  main: string,
  aside: string,
  size: (s: TemplateSize) => number,
  chars: number,
): Block {
  return {
    key,
    h: (s) => size(s) * 0.98,
    make: (b) => {
      const mainBoxes: PerSize<Box> = {};
      const asideBoxes: PerSize<Box> = {};
      for (const [s, box] of Object.entries(b) as Array<[TemplateSize, Box]>) {
        const w = Math.min(box.w * 0.7, size(s) * chars * 0.42);
        mainBoxes[s] = { ...box, w };
        asideBoxes[s] = { x: box.x + w + 1.6, y: box.y + box.h - 7, w: box.w - w - 1.6, h: 6 };
      }
      return [
        ...text(key, name, main, mainBoxes, (s) => ({
          fontFamily: COND,
          fontSize: size(s),
          fontWeight: 900,
          uppercase: true,
          color: C.pt,
          align: "left",
        })),
        ...text(`${key}-aside`, `${name} detail`, aside, asideBoxes, () => ({
          fontFamily: COND,
          fontSize: 5,
          fontWeight: 700,
          uppercase: true,
          color: C.chalk2,
          align: "left",
        })),
      ];
    },
  };
}

/** A tricolour dash then a label ("— CENTURY"). */
function dashLabel(key: string, content: string, gap = 1.4): Block {
  return {
    key,
    h: fixed(6.6),
    gap: fixed(gap),
    make: (b) => {
      const dash: PerSize<Box> = {};
      const label: PerSize<Box> = {};
      for (const [s, box] of Object.entries(b) as Array<[TemplateSize, Box]>) {
        dash[s] = { x: box.x, y: box.y + box.h / 2 - 0.4, w: 9, h: 0.8 };
        label[s] = { x: box.x + 11, y: box.y, w: box.w - 11, h: box.h };
      }
      return [
        element(`${key}-dash`, "Tricolour dash", "ck.tricolour-rule", dash),
        ...text(key, "Label", content, label, () => ({
          fontFamily: COND,
          fontSize: 6,
          fontWeight: 800,
          uppercase: true,
          color: C.chalk,
          align: "left",
        })),
      ];
    },
  };
}

/** A display line in chalk (player names, titles); room for two lines. */
function displayLine(
  key: string,
  name: string,
  content: string,
  size: number,
  lines: number | ((s: TemplateSize) => number) = 2,
  gap = 2.2,
): Block {
  const n = typeof lines === "number" ? () => lines : lines;
  return {
    key,
    h: (s) => size * 1.06 * n(s),
    gap: fixed(gap),
    make: (b) =>
      text(key, name, content, b, () => ({
        fontFamily: COND,
        fontSize: size,
        fontWeight: 900,
        uppercase: true,
        color: C.chalk,
        align: "left",
      })),
  };
}

function metaLine(key: string, content: string, gap = 1.6): Block {
  return {
    key,
    h: fixed(6),
    gap: fixed(gap),
    make: (b) =>
      text(key, "Supporting line", content, b, () => ({
        fontFamily: SANS,
        fontSize: 2.2,
        fontWeight: 500,
        color: C.chalk2,
        align: "left",
      })),
  };
}

/** A filled badge ("CAP 123"). */
function badge(key: string, content: string, gap = 2.2): Block {
  return {
    key,
    h: fixed(6.4),
    gap: fixed(gap),
    make: (b) => {
      const boxes: PerSize<Box> = {};
      for (const [s, box] of Object.entries(b) as Array<[TemplateSize, Box]>)
        boxes[s] = { ...box, w: 24 };
      return [
        shape(`${key}-fill`, "Badge", boxes, C.p),
        ...text(key, "Badge text", content, boxes, () => ({
          fontFamily: COND,
          fontSize: 4,
          fontWeight: 900,
          uppercase: true,
          color: C.onp,
          align: "center",
        })),
      ];
    },
  };
}

/** The two score bars: the club's (filled) over the opposition's. */
function scoreBars(key: string, gap = 2.4): Block {
  const BAR = 7;
  const bar = (
    side: "club" | "opposition",
    boxes: PerSize<Box>,
    top: number,
    fill: string,
    ink: string,
  ): StarterLayer[] => {
    const barBox: PerSize<Box> = {};
    const nameBox: PerSize<Box> = {};
    const scoreBox: PerSize<Box> = {};
    for (const [s, box] of Object.entries(boxes) as Array<[TemplateSize, Box]>) {
      const y = box.y + top;
      barBox[s] = { x: box.x, y, w: box.w, h: BAR };
      nameBox[s] = { x: box.x + 2, y, w: box.w * 0.58 - 2, h: BAR };
      scoreBox[s] = { x: box.x + box.w * 0.58, y, w: box.w * 0.42 - 2, h: BAR };
    }
    return [
      shape(`${key}-${side}-bar`, `${side === "club" ? "Club" : "Opposition"} bar`, barBox, fill),
      ...text(
        `${key}-${side}-name`,
        `${side === "club" ? "Club" : "Opposition"} name`,
        `{{${side}.barName}}`,
        nameBox,
        () => ({
          fontFamily: COND,
          fontSize: 3.2,
          fontWeight: 800,
          uppercase: true,
          color: ink,
          align: "left",
        }),
      ),
      ...text(
        `${key}-${side}-score`,
        `${side === "club" ? "Club" : "Opposition"} score`,
        `{{${side}.score}}`,
        scoreBox,
        () => ({
          fontFamily: COND,
          fontSize: 4.6,
          fontWeight: 900,
          color: ink,
          align: "right",
        }),
      ),
    ];
  };
  return {
    key,
    h: fixed(BAR * 2 + 1.2),
    gap: fixed(gap),
    make: (b) => [
      ...bar("club", b, 0, C.p, C.onp),
      ...bar("opposition", b, BAR + 1.2, C.panel, C.chalk),
    ],
  };
}

// ---------------------------------------------------------------------------
// The card frame: background, crest watermark, photo frame, header, footer
// ---------------------------------------------------------------------------

/** The tall sizes' sloped photo frame never gets shorter than this (cqmin). */
const FRAME_MIN: Record<"hero" | "list", { portrait: number; story: number }> = {
  hero: { portrait: 38.75, story: 81.8 },
  list: { portrait: 30, story: 81.8 },
};

function frame(
  chip: string,
  bodyTop: PerSize<number>,
  depth: "hero" | "list",
  photo: boolean,
): StarterLayer[] {
  const all = (f: (s: TemplateSize) => Box): PerSize<Box> => ({
    square: f("square"),
    portrait: f("portrait"),
    story: f("story"),
    landscape: f("landscape"),
  });
  const layers: StarterLayer[] = [
    element(
      "background",
      "Club background",
      "ck.background",
      all((s) => ({ x: 0, y: 0, ...CARD[s] })),
    ),
    element(
      "watermark",
      "Crest watermark",
      "ck.watermark",
      all((s) => ({ x: 0, y: CARD[s].h - 70, w: 70, h: 70 })),
    ),
  ];
  if (photo) {
    layers.push(
      element(
        "photo-frame-side",
        "Photo frame",
        "ck.frame-side",
        {
          square: { x: 50, y: 0, w: 50, h: 100 },
          landscape: { x: 99.5, y: 0, w: 91, h: 100 },
        },
        { photo: "{{photo}}" },
      ),
      element(
        "photo-frame-top",
        "Photo frame",
        "ck.frame-top",
        {
          portrait: {
            x: 0,
            y: 0,
            w: 100,
            h: Math.max(FRAME_MIN[depth].portrait, (bodyTop.portrait ?? 0) - 5),
          },
          story: {
            x: 0,
            y: 0,
            w: 100,
            h: Math.max(FRAME_MIN[depth].story, (bodyTop.story ?? 0) - 5),
          },
        },
        { photo: "{{photo}}" },
      ),
    );
  }
  const chipW = 16;
  layers.push(
    element(
      "crest",
      "Crest",
      "ck.crest",
      all(() => ({ x: 6, y: 6, w: 10, h: 10 })),
    ),
    ...text(
      "club-name",
      "Club name",
      "{{clubName}}",
      all((s) => ({ x: 18, y: 6.4, w: CARD[s].w - 18 - chipW - 8, h: 5.2 })),
      () => ({
        fontFamily: COND,
        fontSize: 4,
        fontWeight: 900,
        letterSpacing: 0.02,
        uppercase: true,
        color: C.chalk,
        align: "left",
      }),
    ),
    ...text(
      "club-tagline",
      "Club tagline",
      "{{clubTagline}}",
      all((s) => ({ x: 18, y: 11.8, w: CARD[s].w - 18 - chipW - 8, h: 3 })),
      () => ({
        fontFamily: MONO,
        fontSize: 1.5,
        fontWeight: 600,
        letterSpacing: 0.18,
        uppercase: true,
        color: C.chalk2,
        align: "left",
      }),
    ),
    element(
      "chip",
      "Card-type chip",
      "ck.kind-chip",
      all((s) => ({ x: CARD[s].w - 6 - chipW, y: 8.5, w: chipW, h: 5 })),
      { label: chip },
    ),
    element(
      "rule",
      "Tricolour rule",
      "ck.tricolour-rule",
      all((s) => ({ x: 6, y: CARD[s].h - 13, w: CARD[s].w - 12, h: 0.8 })),
    ),
    ...text(
      "sponsor",
      "Sponsor",
      "{{sponsorPresentedBy}}",
      all((s) => ({ x: 6, y: CARD[s].h - 10.4, w: (CARD[s].w - 12) * 0.58, h: 4.4 })),
      () => ({
        fontFamily: SANS,
        fontSize: 2,
        fontWeight: 700,
        color: C.chalk,
        align: "left",
      }),
    ),
    ...text(
      "hashtag",
      "Hashtag",
      "{{clubHashtag}}",
      all((s) => ({ x: CARD[s].w - 6 - 34, y: CARD[s].h - 10.4, w: 34, h: 4.4 })),
      () => ({
        fontFamily: COND,
        fontSize: 2.8,
        fontWeight: 900,
        uppercase: true,
        color: C.pt,
        align: "right",
      }),
    ),
  );
  return layers;
}

type Design = { chip: string; depth?: "hero" | "list"; photo?: boolean; blocks: Block[] };

/** Lay the body out on every size and wrap it in the frame. */
function build(d: Design): StarterDocument {
  const boxesByKey = new Map<string, PerSize<Box>>();
  const bodyTop: PerSize<number> = {};
  for (const s of ["square", "portrait", "story", "landscape"] as const) {
    const boxes = stack(
      column(s),
      d.blocks.map((b) => ({ h: b.h(s), gap: b.gap?.(s) ?? 0 })),
    );
    bodyTop[s] = boxes[0]?.y ?? 0;
    d.blocks.forEach((b, i) => {
      const m = boxesByKey.get(b.key) ?? {};
      m[s] = boxes[i];
      boxesByKey.set(b.key, m);
    });
  }
  return {
    layers: [
      ...frame(d.chip, bodyTop, d.depth ?? "hero", d.photo ?? true),
      ...d.blocks.flatMap((b) => b.make(boxesByKey.get(b.key) ?? {})),
    ] as StarterDocument["layers"],
  };
}

const heroSize = (flat: number, tallSize: number) => (s: TemplateSize) =>
  tall(s) ? tallSize : flat;
const MATCH_LINE = "{{grade}} · vs {{opponent}} · RD {{round}}";

// ---------------------------------------------------------------------------
// The designs
// ---------------------------------------------------------------------------

const matchSummary = build({
  chip: "SCORECARD",
  blocks: [
    eyebrow("match-title", "{{matchTitle}}"),
    hero(
      "result-word",
      "Result word",
      "{{resultWord}}",
      (s) => (s === "square" ? 16 : s === "landscape" ? 18 : 24),
      1,
    ),
    scoreBars("scores"),
    {
      key: "result",
      h: fixed(9.4),
      gap: fixed(2.4),
      make: (b) =>
        text("result", "Result", "{{result}}", b, () => ({
          fontFamily: COND,
          fontSize: 4.2,
          fontWeight: 700,
          uppercase: true,
          color: C.chalk,
          align: "left",
        })),
    },
    {
      key: "performers",
      h: fixed(5.6),
      gap: fixed(1),
      make: (b) =>
        text("performers", "Top performers", "{{club.performers}}", b, () => ({
          fontFamily: SANS,
          fontSize: 2,
          fontWeight: 700,
          color: C.chalk,
          align: "left",
        })),
    },
  ],
});

const milestone = build({
  chip: "MILESTONE",
  blocks: [
    eyebrow("tier", "{{tierLabel}}"),
    hero("value", "Milestone number", "{{currentValue}}", heroSize(23, 30)),
    dashLabel("label", "{{milestoneLabel}}"),
    displayLine("player", "Player name", "{{playerName}}", 9),
    metaLine("headline", "{{headline}}"),
  ],
});

const century = build({
  chip: "CENTURY",
  blocks: [
    eyebrow("raised", "RAISED THE BAT"),
    heroWithAside("runs", "Runs", "{{runs}}", "({{balls}})", heroSize(23, 30), 3.4),
    dashLabel("label", "CENTURY"),
    displayLine("player", "Player name", "{{playerName}}", 9),
    eyebrow("match", MATCH_LINE, C.chalk2, 1.4),
  ],
});

const fiveFor = build({
  chip: "FIVE-FOR",
  blocks: [
    eyebrow("wickets", "{{wickets}} WICKETS"),
    heroWithAside("figures", "Figures", "{{figures}}", "({{overs}})", heroSize(20, 26), 4.8),
    dashLabel("label", "FIVE-FOR"),
    displayLine("player", "Player name", "{{playerName}}", 9),
    eyebrow("match", MATCH_LINE, C.chalk2, 1.4),
  ],
});

const debut = build({
  chip: "DEBUT",
  blocks: [
    eyebrow("debut", "FIRST GRADE DEBUT · {{grade}} · {{season}}"),
    displayLine("player", "Player name", "{{playerName}}", 10, 2, 1.4),
    metaLine("tribute", "Round {{round}} · vs {{opponent}} — {{tributeLine}}"),
    badge("cap", "CAP {{capNumber}}"),
  ],
});

/** Ladder columns, as percent of the table's width. */
const LADDER_COLS = [
  { field: "pos", x: 0, w: 9, head: "#" },
  { field: "team", x: 9, w: 47, head: "TEAM" },
  { field: "played", x: 56, w: 11, head: "P" },
  { field: "won", x: 67, w: 11, head: "W" },
  { field: "lost", x: 78, w: 11, head: "L" },
  { field: "points", x: 89, w: 11, head: "PTS" },
] as const;
const LADDER_ROW = 4.6;
const LADDER_GAP = 0.6;
const ladderRows = (s: TemplateSize) => (s === "landscape" ? 5 : s === "story" ? 10 : 8);

function ladderCell(field: string, base: Style): Style {
  if (field === "pos")
    return {
      ...base,
      fontFamily: COND,
      fontWeight: 900,
      fontSize: 2.8,
      color: C.pt,
      align: "center",
    };
  if (field === "team") return { ...base, align: "left" };
  if (field === "points")
    return { ...base, fontFamily: COND, fontWeight: 900, fontSize: 2.8, align: "center" };
  return { ...base, color: C.chalk2, align: "center" };
}

const ladder = build({
  chip: "LADDER",
  depth: "list",
  blocks: [
    eyebrow("competition", "{{competitionName}} · {{asOfLabel}}"),
    displayLine("title", "Title", "{{gradeLabel}} LADDER", 9, (s) => (s === "square" ? 2 : 1), 1),
    {
      key: "table-head",
      h: fixed(3),
      gap: fixed(1.4),
      make: (b) =>
        LADDER_COLS.flatMap((col) => {
          const boxes: PerSize<Box> = {};
          for (const [s, box] of Object.entries(b) as Array<[TemplateSize, Box]>) {
            boxes[s] = {
              x: box.x + (box.w * col.x) / 100,
              y: box.y,
              w: (box.w * col.w) / 100,
              h: box.h,
            };
          }
          return text(`head-${col.field}`, `Heading ${col.head}`, col.head, boxes, () => ({
            fontFamily: MONO,
            fontSize: 1.4,
            fontWeight: 600,
            letterSpacing: 0.14,
            color: C.chalk2,
            align: col.field === "team" ? "left" : "center",
          }));
        }),
    },
    {
      key: "table",
      h: (s) => ladderRows(s) * (LADDER_ROW + LADDER_GAP),
      gap: fixed(0.6),
      make: (b) =>
        rows("ladder-rows", "Ladder rows", b, () => {
          const base: Style = {
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: 2.1,
            color: C.chalk,
            background: C.panel,
          };
          return {
            repeat: "rows",
            rowHeight: LADDER_ROW,
            gap: LADDER_GAP,
            cells: LADDER_COLS.map((c) => ({
              field: c.field,
              x: c.x,
              w: c.w,
              style: ladderCell(c.field, base),
            })),
            // The club's own row, in its colours.
            variants: {
              club: Object.fromEntries(
                LADDER_COLS.map((c) => [c.field, { background: C.p, color: C.onp }]),
              ),
            },
          };
        }),
    },
  ],
});

export const CLUB_KIT_STARTERS: StarterSet = {
  matchSummary,
  milestone,
  century,
  fiveFor,
  debut,
  ladder,
};
