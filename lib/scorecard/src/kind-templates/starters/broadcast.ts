import type { TemplateSize } from "../document";
import type { TemplateCardKind } from "../fields";
import type { StarterSet } from "../starters";
import { BODIES, type Body } from "./bodies";
import { build, hashtagToken, makeKit, type Column, type Design, type Theme } from "./kit";
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
 * Broadcast starter designs, one per card kind (plan U6, KTD3), after the
 * Broadcast Dark pack: the club's stage colour edge to edge, the photo on the
 * right feathered into it, two accent slashes top right, a crest + club-name
 * header with the card-type tag under it, and the body bottom-anchored over
 * the photo's fade. Lists and live cards play on the plain stage with the
 * body across the card (the title beside the list on landscape), as the pack
 * does. Bodies are shared with Club Kit (`bodies.ts`).
 */

const DISP = "var(--disp,'Anton'),'Barlow Condensed',sans-serif";
const COND = "'Barlow Condensed','Arial Narrow',sans-serif";
const SANS = "'IBM Plex Sans',system-ui,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace";

const STAGE = "var(--ink,#101216)";
const ACC = "var(--gold,#FBAC27)";
const ACC_INK = "var(--accent-ink,#10151B)";
const INK = "#F2F5F8";
const MUTED = "rgba(242,245,248,.64)";
const PANEL = "rgba(255,255,255,.07)";
const LINE = "rgba(255,255,255,.14)";

const HEADER_BOTTOM = 25;
const FOOTER_TOP = (s: TemplateSize) => CARD[s].h - 14;

/** Whether this look shows the photo on a card. */
const hasPhoto = (d: Design) =>
  d.photo !== false && !(d as Body).plain && (d.depth ?? "hero") === "hero";

/** The photo's box: the right 62% of the card. */
const photoBox = (s: TemplateSize): Box => ({
  x: CARD[s].w * 0.38,
  y: 0,
  w: CARD[s].w * 0.62,
  h: CARD[s].h,
});

function column(s: TemplateSize, d: Design): Column {
  const bottom = FOOTER_TOP(s) - 3;
  if (hasPhoto(d)) {
    // Over the photo's fade: the left column, or the full width on the story.
    const w = s === "story" ? 88 : s === "landscape" ? CARD[s].w * 0.38 - 4 : 56;
    return { x: 6, w, at: bottom, anchor: "bottom" };
  }
  return {
    x: 6,
    w: CARD[s].w - 12,
    at: (HEADER_BOTTOM + bottom) / 2,
    anchor: "center",
  };
}

const all = (f: (s: TemplateSize) => Box): PerSize<Box> => ({
  square: f("square"),
  portrait: f("portrait"),
  story: f("story"),
  landscape: f("landscape"),
});

/** An accent slash: a thin bar leaning right, off the top edge. */
function slash(id: string, right: number, w: number, h: number, opacity?: number): StarterLayer {
  const geometry: Record<string, unknown> = {};
  for (const s of ["square", "portrait", "story", "landscape"] as const)
    geometry[s] = { ...pct({ x: CARD[s].w - right - w, y: -4, w, h }, s), rotate: 22 };
  return {
    id,
    kind: "shape",
    name: "Accent slash",
    style: opacity === undefined ? { background: ACC } : { background: ACC, opacity },
    geometry,
  } as StarterLayer;
}

function frame(d: Design): StarterLayer[] {
  const layers: StarterLayer[] = [
    shape(
      "stage",
      "Stage",
      all((s) => ({ x: 0, y: 0, ...CARD[s] })),
      STAGE,
    ),
  ];
  if (hasPhoto(d)) {
    const photo = all(photoBox);
    layers.push(
      { id: "photo", kind: "photo", name: "Photo", ...placedAll(photo) } as StarterLayer,
      shape(
        "photo-fade-side",
        "Photo fade (side)",
        photo,
        `linear-gradient(90deg,${STAGE} 0%,transparent 70%)`,
      ),
      shape(
        "photo-fade-bottom",
        "Photo fade (bottom)",
        all((s) => ({ x: 0, y: 0, ...CARD[s] })),
        `linear-gradient(0deg,${STAGE} 12%,transparent 58%)`,
      ),
    );
  }
  layers.push(
    slash("slash-1", 14, 3, 18),
    slash("slash-2", 9, 1.4, 13, 0.55),
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
      all((s) => ({ x: 18, y: 6.4, w: CARD[s].w - 18 - 26, h: 5.2 })),
      () => ({
        fontFamily: COND,
        fontSize: 4,
        fontWeight: 800,
        letterSpacing: 0.02,
        uppercase: true,
        color: INK,
        align: "left",
      }),
    ),
    ...text(
      "club-tagline",
      "Club tagline",
      "{{clubTagline}}",
      all((s) => ({ x: 18, y: 11.8, w: CARD[s].w - 18 - 26, h: 3 })),
      () => ({
        fontFamily: MONO,
        fontSize: 1.5,
        fontWeight: 600,
        letterSpacing: 0.18,
        uppercase: true,
        color: MUTED,
        align: "left",
      }),
    ),
    // The card-type tag: the accent chip under the header.
    ...text(
      "chip",
      "Card-type tag",
      d.chip,
      all(() => ({ x: 6, y: 18.4, w: 22, h: 4.6 })),
      () => ({
        fontFamily: COND,
        fontSize: 2.6,
        fontWeight: 800,
        letterSpacing: 0.08,
        uppercase: true,
        color: ACC_INK,
        background: ACC,
        radius: 2,
        align: "center",
      }),
    ),
    shape(
      "rule",
      "Footer rule",
      all((s) => ({ x: 6, y: CARD[s].h - 12.6, w: CARD[s].w - 12, h: 0.25 })),
      LINE,
    ),
    ...text(
      "sponsor",
      "Sponsor",
      "{{sponsorPresentedBy}}",
      all((s) => ({ x: 6, y: CARD[s].h - 10.4, w: (CARD[s].w - 12) * 0.58, h: 4.4 })),
      () => ({
        fontFamily: MONO,
        fontSize: 1.8,
        fontWeight: 600,
        letterSpacing: 0.12,
        uppercase: true,
        color: MUTED,
        align: "left",
      }),
    ),
    ...text(
      "hashtag",
      "Hashtag",
      hashtagToken(d.kind),
      all((s) => ({ x: CARD[s].w - 6 - 34, y: CARD[s].h - 10.4, w: 34, h: 4.4 })),
      () => ({
        fontFamily: COND,
        fontSize: 2.8,
        fontWeight: 800,
        uppercase: true,
        color: ACC,
        align: "right",
      }),
    ),
  );
  return layers;
}

/** Geometry for a layer on every size (no `sizes` list needed). */
function placedAll(boxes: PerSize<Box>) {
  const geometry: Record<string, unknown> = {};
  for (const [s, b] of Object.entries(boxes) as Array<[TemplateSize, Box]>) geometry[s] = pct(b, s);
  return { geometry };
}

const THEME: Theme = {
  font: {
    display: DISP,
    displayWeight: 400,
    displayScale: 0.76,
    displayAscent: 1.26,
    displayCharWidth: 0.4,
    cond: COND,
    sans: SANS,
    mono: MONO,
  },
  color: { accent: ACC, fill: ACC, onFill: ACC_INK, ink: INK, muted: MUTED, panel: PANEL },
  // A short accent bar.
  dash: (id, boxes) => [shape(id, "Accent bar", boxes, ACC)],
  // Lists run the full card width here (beside the title on landscape), so
  // every size but the square takes bigger rows.
  listScale: (s) => (s === "portrait" ? 1.2 : s === "story" ? 1.5 : s === "landscape" ? 1.4 : 1),
  column,
  split: (d) =>
    hasPhoto(d)
      ? null
      : {
          head: {
            x: 6,
            w: 70,
            at: (HEADER_BOTTOM + FOOTER_TOP("landscape") - 3) / 2,
            anchor: "center",
          },
          data: {
            x: 82,
            w: CARD.landscape.w - 88,
            at: (HEADER_BOTTOM + FOOTER_TOP("landscape") - 3) / 2,
            anchor: "center",
          },
        },
  frame,
};

const kit = makeKit(THEME);

export const BROADCAST_STARTERS: StarterSet = Object.fromEntries(
  (Object.keys(BODIES) as TemplateCardKind[]).map((kind) => [
    kind,
    build(THEME, { ...BODIES[kind](kit), kind }),
  ]),
);
