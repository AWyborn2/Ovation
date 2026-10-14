import type { TemplateSize } from "../document";
import type { TemplateCardKind } from "../fields";
import type { StarterSet } from "../starters";
import { BODIES, type Body } from "./bodies";
import {
  build,
  fixed,
  hashtagToken,
  makeKit,
  tall,
  type Block,
  type Column,
  type Design,
  type Kit,
  type Theme,
} from "./kit";
import {
  CARD,
  element,
  pct,
  shape,
  text,
  type Box,
  type PerSize,
  type StarterLayer,
} from "./layout";

/**
 * Clubhouse starter designs, one per card kind (plan 2026-10-14-001), after
 * the White Knights Baldivis social templates: the club's own dark colour as
 * the stage with its ground photo behind (tinted toward the stage), the crest
 * and club name up top, heavy slab titles in white over the club colour,
 * brush-lettered hero numbers and names, and lists as white plates with the
 * club colour's chips. Title cards carry glowing corner brackets.
 *
 * Colours are the club's: the stage is its background colour darkened until
 * white reads on it (`--ck-stage`), the accent its primary (`--ck-p`). The
 * ground photo is the club's own upload (`{{groundPhoto}}`); without one the
 * stage shows plain. Shared bodies come from `bodies.ts`; the cards whose
 * templates differ from them are redrawn below.
 */

const SLAB = "'Alfa Slab One',Georgia,serif";
const BRUSH = "'Permanent Marker','Alfa Slab One',cursive";
const COND = "'Barlow Condensed','Arial Narrow',sans-serif";
const SANS = "'IBM Plex Sans',system-ui,sans-serif";
const LOCKUP = "'Cinzel',Georgia,serif";

const STAGE = "var(--ck-stage,#16206B)";
const GOLD = "var(--ck-p,var(--gold,#F5B400))";
const GOLD_TEXT = "var(--ck-pt,var(--gold,#F5B400))";
const ON_GOLD = "var(--ck-onp,#10151B)";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,.74)";
const PLATE = "#FFFFFF";

const HEADER_BOTTOM = 20;
const FOOTER_TOP = (s: TemplateSize) => CARD[s].h - 11;

/** Cards with the player photo (hero cards); lists and title cards play on the ground. */
const hasPhoto = (d: Design) =>
  d.photo !== false && !(d as Body).plain && (d.depth ?? "hero") === "hero";
/** Title cards (set covers): the slab title in corner brackets. */
const isTitleCard = (d: Design) => (d as ClubhouseBody).brackets === true;

type ClubhouseBody = Body & {
  brackets?: boolean;
  /** The photo on the left with the body beside it (the team selection). */
  photoLeft?: boolean;
};

/**
 * The player photo's box on a hero card. On the tall sizes it fills the room
 * above the body (`top`, where the body starts), so the two never overlap.
 */
function photoBox(s: TemplateSize, d: Design, top: number): Box {
  const c = CARD[s];
  const above = Math.max(c.h * 0.3, top - 1);
  if ((d as ClubhouseBody).photoLeft) {
    if (s === "landscape") return { x: 0, y: 22, w: 80, h: c.h - 22 };
    if (s === "square") return { x: 0, y: 34, w: 48, h: c.h - 34 };
    return { x: 0, y: 17, w: 66, h: above - 17 };
  }
  if (s === "landscape") return { x: c.w * 0.5, y: 0, w: c.w * 0.5, h: c.h };
  if (s === "square") return { x: 44, y: 16, w: 56, h: 84 };
  // Tall: the player down the right, beside the body.
  return { x: 38, y: 17, w: 62, h: c.h - 17 };
}

function column(s: TemplateSize, d: Design): Column {
  const c = CARD[s];
  const bottom = FOOTER_TOP(s) - 2;
  if ((d as ClubhouseBody).photoLeft) {
    if (s === "landscape")
      return { x: 84, w: c.w - 90, at: (HEADER_BOTTOM + bottom) / 2, anchor: "center" };
    if (s === "square")
      return { x: 48, w: 47, at: (HEADER_BOTTOM + bottom) / 2 + 2, anchor: "center" };
    return { x: 6, w: 88, at: bottom, anchor: "bottom" };
  }
  if (hasPhoto(d)) {
    if (s === "landscape")
      return { x: 6, w: c.w * 0.5 - 6, at: (HEADER_BOTTOM + bottom) / 2, anchor: "center" };
    // Beside the player; on the tall sizes, low on the card.
    if (s === "square") return { x: 6, w: 44, at: (HEADER_BOTTOM + bottom) / 2, anchor: "center" };
    return { x: 6, w: 50, at: bottom - 4, anchor: "bottom" };
  }
  return { x: 6, w: c.w - 12, at: (HEADER_BOTTOM + bottom) / 2, anchor: "center" };
}

const all = (f: (s: TemplateSize) => Box): PerSize<Box> => ({
  square: f("square"),
  portrait: f("portrait"),
  story: f("story"),
  landscape: f("landscape"),
});

/** A shape on every size with a rotation (paint strokes). */
function stroke(
  id: string,
  f: (s: TemplateSize) => Box,
  rotate: number,
  opacity: number,
): StarterLayer {
  const geometry: Record<string, unknown> = {};
  for (const s of ["square", "portrait", "story", "landscape"] as const)
    geometry[s] = { ...pct(f(s), s), rotate };
  return {
    id,
    kind: "shape",
    name: "Paint stroke",
    style: { background: GOLD, opacity },
    geometry,
  } as StarterLayer;
}

/** Glowing corner brackets around a title card (eight thin bars). */
function brackets(): StarterLayer[] {
  const L = 26;
  const T = 0.9;
  const I = 3;
  const bars: Array<[string, (s: TemplateSize) => Box]> = [
    ["tl-h", () => ({ x: I, y: I, w: L, h: T })],
    ["tl-v", () => ({ x: I, y: I, w: T, h: L * 0.7 })],
    ["tr-h", (s) => ({ x: CARD[s].w - I - L, y: I, w: L, h: T })],
    ["tr-v", (s) => ({ x: CARD[s].w - I - T, y: I, w: T, h: L * 0.7 })],
    ["bl-h", (s) => ({ x: I, y: CARD[s].h - I - T, w: L, h: T })],
    ["bl-v", (s) => ({ x: I, y: CARD[s].h - I - L * 0.7, w: T, h: L * 0.7 })],
    ["br-h", (s) => ({ x: CARD[s].w - I - L, y: CARD[s].h - I - T, w: L, h: T })],
    ["br-v", (s) => ({ x: CARD[s].w - I - T, y: CARD[s].h - I - L * 0.7, w: T, h: L * 0.7 })],
  ];
  return bars.map(([id, f]) => shape(`bracket-${id}`, "Corner bracket", all(f), GOLD, 2));
}

function frame(d: Design, bodyTop: PerSize<number>): StarterLayer[] {
  const full = all((s) => ({ x: 0, y: 0, ...CARD[s] }));
  // Hero cards stand the player in front of the whole ground; lists and title
  // cards show it across the top, fading into the stage the rows sit on.
  const hero = hasPhoto(d) || isTitleCard(d);
  const DEPTH: Record<TemplateSize, number> = {
    square: 0.62,
    portrait: 0.55,
    story: 0.46,
    landscape: 1,
  };
  const ground = hero ? full : all((s) => ({ x: 0, y: 0, w: CARD[s].w, h: CARD[s].h * DEPTH[s] }));
  const layers: StarterLayer[] = [
    shape("stage", "Stage", full, STAGE),
    // The club's ground, tinted toward the stage so type reads over it.
    {
      id: "ground",
      kind: "image",
      name: "Ground photo",
      content: "{{groundPhoto}}",
      geometry: geometryOf(ground),
    } as StarterLayer,
    shape(
      "ground-tint",
      "Ground tint",
      ground,
      hero
        ? "linear-gradient(180deg,var(--ck-stage-55) 0%,var(--ck-stage-80) 60%,var(--ck-stage) 100%)"
        : "linear-gradient(180deg,var(--ck-stage-55) 0%,var(--ck-stage-55) 45%,var(--ck-stage) 100%)",
    ),
    // Gold paint strokes, bottom left and top right.
    stroke("stroke-1", (s) => ({ x: -8, y: CARD[s].h - 10, w: 30, h: 2.2 }), -38, 0.85),
    stroke("stroke-2", (s) => ({ x: -4, y: CARD[s].h - 6, w: 22, h: 1.2 }), -38, 0.6),
    stroke("stroke-3", (s) => ({ x: CARD[s].w - 20, y: 4, w: 26, h: 1.6 }), -38, 0.55),
  ];
  if (hasPhoto(d)) {
    const photo = all((s) => photoBox(s, d, bodyTop[s] ?? CARD[s].h / 2));
    layers.push(
      {
        id: "photo",
        kind: "photo",
        name: "Player photo",
        geometry: geometryOf(photo),
      } as StarterLayer,
      shape(
        "photo-fade",
        "Photo fade",
        photo,
        "linear-gradient(0deg,var(--ck-stage) 0%,var(--ck-stage-0) 30%)",
      ),
      shape(
        "photo-fade-side",
        "Photo fade (side)",
        photo,
        "linear-gradient(90deg,var(--ck-stage-55) 0%,var(--ck-stage-0) 30%)",
      ),
    );
  }
  if (isTitleCard(d)) layers.push(...brackets());
  layers.push(
    element(
      "crest",
      "Crest",
      "ck.crest",
      all(() => ({ x: 6, y: 5, w: 11, h: 11 })),
    ),
    ...text(
      "club-name",
      "Club name",
      "{{clubName}}",
      all((s) => ({ x: 19, y: 5, w: CARD[s].w - 25, h: 6.4 })),
      () => ({
        fontFamily: LOCKUP,
        fontSize: 4.4,
        fontWeight: 700,
        color: WHITE,
        align: "left",
      }),
    ),
    ...text(
      "club-tagline",
      "Club tagline",
      "{{clubTagline}}",
      all((s) => ({ x: 19, y: 11.4, w: CARD[s].w - 25, h: 4 })),
      () => ({
        fontFamily: LOCKUP,
        fontSize: 2.6,
        fontWeight: 600,
        color: WHITE,
        align: "left",
      }),
    ),
    ...text(
      "sponsor",
      "Sponsor",
      "{{sponsorPresentedBy}}",
      all((s) => ({ x: 6, y: CARD[s].h - 8.4, w: (CARD[s].w - 12) * 0.58, h: 4.4 })),
      () => ({
        fontFamily: COND,
        fontSize: 2.4,
        fontWeight: 700,
        letterSpacing: 0.08,
        uppercase: true,
        color: MUTED,
        align: "left",
      }),
    ),
    ...text(
      "hashtag",
      "Hashtag",
      hashtagToken(d.kind),
      all((s) => ({ x: CARD[s].w - 6 - 40, y: CARD[s].h - 8.4, w: 40, h: 4.4 })),
      () => ({
        fontFamily: COND,
        fontSize: 3,
        fontWeight: 800,
        uppercase: true,
        color: GOLD_TEXT,
        align: "right",
      }),
    ),
  );
  return layers;
}

/** Geometry for a layer on every size (no `sizes` list needed). */
function geometryOf(boxes: PerSize<Box>) {
  const geometry: Record<string, unknown> = {};
  for (const [s, b] of Object.entries(boxes) as Array<[TemplateSize, Box]>) geometry[s] = pct(b, s);
  return geometry;
}

const THEME: Theme = {
  font: {
    display: SLAB,
    displayWeight: 400,
    displayScale: 0.74,
    displayAscent: 1.3,
    displayCharWidth: 0.52,
    cond: COND,
    sans: SANS,
    mono: COND,
  },
  color: {
    accent: GOLD_TEXT,
    fill: GOLD,
    onFill: ON_GOLD,
    ink: WHITE,
    muted: MUTED,
    panel: PLATE,
    panelInk: STAGE,
    panelMuted: "rgba(16,21,27,.66)",
    panelAccent: STAGE,
  },
  dash: (id, boxes) => [shape(id, "Gold bar", boxes, GOLD)],
  listScale: (s) => (s === "portrait" ? 1.2 : s === "story" ? 1.5 : s === "landscape" ? 1.3 : 1),
  column,
  split: (d) =>
    hasPhoto(d) || (d as ClubhouseBody).photoLeft
      ? null
      : {
          head: {
            x: 6,
            w: 70,
            at: (HEADER_BOTTOM + FOOTER_TOP("landscape") - 2) / 2,
            anchor: "center",
          },
          data: {
            x: 82,
            w: CARD.landscape.w - 88,
            at: (HEADER_BOTTOM + FOOTER_TOP("landscape") - 2) / 2,
            anchor: "center",
          },
        },
  frame,
};

const kit = makeKit(THEME);

// ---------------------------------------------------------------------------
// Bodies redrawn for this look
// ---------------------------------------------------------------------------

/** Brush-lettered type in the club colour ("150 GAMES", "ROD GRAHAM"). */
function brush(
  key: string,
  name: string,
  content: string,
  size: (s: TemplateSize) => number,
  lines = 1,
  gap = 0,
): Block {
  return {
    key,
    h: (s) => size(s) * (1.12 * lines + 0.2),
    gap: fixed(gap),
    make: (b) =>
      text(key, name, content, b, (s) => ({
        fontFamily: BRUSH,
        fontSize: size(s),
        fontWeight: 400,
        uppercase: true,
        color: GOLD_TEXT,
        align: "left",
      })),
  };
}

/** A tracked date line between gold rules ("— SATURDAY 10TH OCTOBER 2026 —"). */
function dateRule(key: string, content: string, gap = 0): Block {
  return {
    key,
    h: fixed(5),
    gap: fixed(gap),
    make: (b) => {
      const left: PerSize<Box> = {};
      const right: PerSize<Box> = {};
      const mid: PerSize<Box> = {};
      for (const [s, box] of Object.entries(b) as Array<[TemplateSize, Box]>) {
        const rule = box.w * 0.14;
        left[s] = { x: box.x, y: box.y + box.h / 2 - 0.3, w: rule, h: 0.6 };
        right[s] = { x: box.x + box.w - rule, y: box.y + box.h / 2 - 0.3, w: rule, h: 0.6 };
        mid[s] = { x: box.x + rule + 1.5, y: box.y, w: box.w - rule * 2 - 3, h: box.h };
      }
      return [
        shape(`${key}-rule-l`, "Gold rule", left, GOLD),
        shape(`${key}-rule-r`, "Gold rule", right, GOLD),
        ...text(key, "Date", content, mid, () => ({
          fontFamily: COND,
          fontSize: 3,
          fontWeight: 500,
          letterSpacing: 0.28,
          uppercase: true,
          color: WHITE,
          align: "center",
        })),
      ];
    },
  };
}

/** A two-line slab title: white over the club colour ("WEEKLY / FIXTURES"). */
function slabTitle(
  key: string,
  top: string,
  bottom: string,
  size: (s: TemplateSize) => number,
  gap = 1,
): Block[] {
  return [
    kit.displayLine(`${key}-top`, "Title line 1", top, size, 1, gap, WHITE),
    kit.displayLine(`${key}-bottom`, "Title line 2", bottom, size, 1, 0, GOLD_TEXT),
  ];
}

const brushHero = (flat: number, tallSize: number) => (s: TemplateSize) =>
  tall(s) ? tallSize : s === "landscape" ? flat * 1.1 : flat;
const MATCH_LINE = "{{grade}} · vs {{opponent}} · RD {{round}}";

const OWN_BODIES: Partial<Record<TemplateCardKind, (k: Kit) => ClubhouseBody>> = {
  milestone: (k) => ({
    chip: "MILESTONE",
    blocks: [
      k.eyebrow("tier", "{{tierLabel}}", WHITE),
      brush("value", "Milestone number", "{{currentValue}}", brushHero(17, 20), 1, 0.6),
      brush("label", "Milestone", "{{milestoneLabel}}", brushHero(5.4, 6), 1, 0),
      brush("player", "Player name", "{{playerName}}", brushHero(8, 9), 2, 2),
      k.metaLine("headline", "{{headline}}", 1, "Headline"),
    ],
  }),

  century: (k) => ({
    chip: "CENTURY",
    blocks: [
      k.eyebrow("raised", "RAISED THE BAT", WHITE),
      brush("runs", "Runs", "{{runs}} ({{balls}})", brushHero(13, 15), 1, 0.6),
      brush("player", "Player name", "{{playerName}}", brushHero(8, 9), 2, 1.6),
      k.eyebrow("match", MATCH_LINE, MUTED, 1.4),
    ],
  }),

  fiveFor: (k) => ({
    chip: "FIVE-FOR",
    blocks: [
      k.eyebrow("wickets", "{{wickets}} WICKETS", WHITE),
      brush("figures", "Figures", "{{figures}}", brushHero(15, 17), 1, 0.6),
      brush("player", "Player name", "{{playerName}}", brushHero(8, 9), 2, 1.6),
      k.eyebrow("match", "({{overs}} OVERS) · " + MATCH_LINE, MUTED, 1.4),
    ],
  }),

  teamList: (k) => ({
    chip: "TEAM LIST",
    depth: "hero",
    photoLeft: true,
    blocks: [
      k.displayLine(
        "grade",
        "Team grade",
        "{{gradeHeading}}",
        (s) => (s === "square" ? 9 : 11),
        1,
        0,
        GOLD_TEXT,
      ),
      k.list(
        "players",
        "Players",
        "players",
        () => 12,
        4.2,
        1.2,
        [
          {
            field: "number",
            x: 0,
            w: 20,
            style: {
              fontFamily: SLAB,
              fontWeight: 400,
              fontSize: 2.6,
              color: ON_GOLD,
              background: GOLD,
              align: "center",
            },
          },
          {
            field: "surname",
            x: 22,
            w: 64,
            style: {
              fontSize: 2.4,
              fontWeight: 800,
              uppercase: true,
              color: STAGE,
              background: PLATE,
              align: "left",
            },
          },
          // The captain's / keeper's tag, the plate's right end.
          {
            field: "role",
            x: 86,
            w: 14,
            style: {
              fontSize: 2,
              fontWeight: 800,
              color: STAGE,
              background: PLATE,
              align: "center",
            },
          },
        ],
        { gap: 2, columns: 2, columnGap: 6 },
      ),
      {
        key: "when",
        h: fixed(9),
        gap: fixed(1.6),
        make: (b) =>
          text("when", "Date, time and ground", "{{venueDateTime}}", b, () => ({
            fontFamily: COND,
            fontSize: 3.4,
            fontWeight: 800,
            uppercase: true,
            color: WHITE,
            align: "left",
          })),
      },
    ],
  }),

  teamListRound: (k) => ({
    chip: "TEAM LISTS",
    brackets: true,
    plain: true,
    blocks: [
      ...slabTitle("title", "TEAM", "SELECTIONS", (s) => (s === "square" ? 12 : tall(s) ? 15 : 14)),
      dateRule("date", "{{coverDate}}", 2.4),
      k.metaLine("list", "{{coverList}}", 1.4, "Summary line"),
    ],
  }),

  roundFixtures: (k) => ({
    ...BODIES.roundFixtures(k),
    blocks: [
      dateRule("date", "{{date}} · {{roundLabel}}"),
      ...BODIES.roundFixtures(k).blocks.filter((b) => b.key !== "eyebrow"),
    ],
  }),

  weekendWrap: (k) => ({
    ...BODIES.weekendWrap(k),
    blocks: [
      dateRule("date", "{{roundLabel}} · {{dateRange}}"),
      ...BODIES.weekendWrap(k).blocks.filter((b) => b.key !== "eyebrow"),
    ],
  }),
};

export const CLUBHOUSE_STARTERS: StarterSet = Object.fromEntries(
  (Object.keys(BODIES) as TemplateCardKind[]).map((kind) => [
    kind,
    build(THEME, { ...(OWN_BODIES[kind] ?? BODIES[kind])(kit), kind }),
  ]),
);
