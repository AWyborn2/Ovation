import type { TemplateSize } from "../document";
import type { StarterSet } from "../starters";
import type { TemplateCardKind } from "../fields";
import { BODIES } from "./bodies";
import { build, hashtagToken, makeKit, type Design, type Theme } from "./kit";
import { CARD, element, text, type Box, type PerSize, type StarterLayer } from "./layout";

/**
 * Club Kit starter designs, one per card kind (plan U6, KTD3), rebuilt from
 * the Club Kit pack (Club Colours handoff) out of template layers: the pack's
 * own library pieces for the frame and decoration, and text boxes with
 * `{{field}}` tokens for everything that carries data (bodies in `bodies.ts`).
 *
 * Layout follows the pack: 6-unit margins; a crest + club-name header with
 * the card-type chip; the photo in a diagonal frame on the right (square,
 * landscape) or a sloped frame across the top (portrait, story) with the
 * jumper-trim stripes; the body copy beside or below it; a tricolour rule over
 * the sponsor and hashtag footer. Colours are the club's `--ck-*` palette, so
 * every club sees its own colours.
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

/** The tall sizes' sloped photo frame never gets shorter than this (cqmin). */
const FRAME_MIN: Record<"hero" | "list", { portrait: number; story: number }> = {
  hero: { portrait: 38.75, story: 81.8 },
  list: { portrait: 30, story: 81.8 },
};

function ckFrame(
  chip: string,
  bodyTop: PerSize<number>,
  depth: "hero" | "list",
  photo: boolean,
  hashtag: string,
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
      hashtag,
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

const THEME: Theme = {
  font: { display: COND, displayWeight: 900, cond: COND, sans: SANS, mono: MONO },
  color: { accent: C.pt, fill: C.p, onFill: C.onp, ink: C.chalk, muted: C.chalk2, panel: C.panel },
  dash: (id, boxes) => [element(id, "Tricolour dash", "ck.tricolour-rule", boxes)],
  column,
  frame: (d: Design, bodyTop) =>
    ckFrame(d.chip, bodyTop, d.depth ?? "hero", d.photo ?? true, hashtagToken(d.kind)),
};

const kit = makeKit(THEME);

export const CLUB_KIT_STARTERS: StarterSet = Object.fromEntries(
  (Object.keys(BODIES) as TemplateCardKind[]).map((kind) => [
    kind,
    build(THEME, { ...BODIES[kind](kit), kind }),
  ]),
);
