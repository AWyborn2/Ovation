import type { TemplateSize, TemplateTextStyle } from "../document";
import type { StarterDocument } from "../starters";
import { kindFields } from "../fields";
import { rows, shape, stack, text, type Box, type PerSize, type StarterLayer } from "./layout";

/**
 * The shared building blocks for starter designs (plan U6). A starter is a
 * card kind's body — a column of blocks (eyebrow, hero number, name, list…) —
 * laid out per size and wrapped in a look's frame. The bodies live in
 * `bodies.ts`, once per kind; each look (Club Kit, Broadcast) is a `Theme`:
 * its type, colours, where the body column sits and the frame around it.
 */

export type Style = TemplateTextStyle & { fontSize: number };
export const SIZES = ["square", "portrait", "story", "landscape"] as const;
export const tall = (s: TemplateSize) => s === "portrait" || s === "story";

/** Where a body column sits on one size (card cqmin). */
export type Column = { x: number; w: number; at: number; anchor: "center" | "bottom" };

/** A piece of the body: its height and gap above on each size, and its layers. */
export type Block = {
  key: string;
  h: (s: TemplateSize) => number;
  gap?: (s: TemplateSize) => number;
  /** The block's widest, in card cqmin (narrower than a wide column). */
  maxW?: number;
  /** Data (a list): beside the title on a look that splits landscape. */
  data?: boolean;
  make: (boxes: PerSize<Box>) => StarterLayer[];
};

export type Design = {
  /** The card kind (set by `buildKind`). */
  kind?: string;
  chip: string;
  /** How far down the tall sizes' photo reaches: a hero card, or a list. */
  depth?: "hero" | "list";
  photo?: boolean;
  blocks: Block[];
};

export type Theme = {
  font: {
    /** Hero numbers and titles. */
    display: string;
    displayWeight: number;
    /** Display sizes are multiplied by this (a wide display face sets smaller). */
    displayScale?: number;
    /** How tall one display line's glyphs stand, in em (a tall face like Anton needs more). */
    displayAscent?: number;
    /** A display digit's width, in em (where an aside starts after a number). */
    displayCharWidth?: number;
    /** Labels, names, list text. */
    cond: string;
    sans: string;
    mono: string;
  };
  color: {
    /** Accent type (the club colour, readable on the stage). */
    accent: string;
    /** Accent fills (badges, the club's row). */
    fill: string;
    /** Type on an accent fill. */
    onFill: string;
    ink: string;
    muted: string;
    panel: string;
  };
  /** The accent mark before a label (a tricolour dash, an accent bar). */
  dash: (id: string, boxes: PerSize<Box>) => StarterLayer[];
  /** Lists scaled up on a size where this look gives them more room. */
  listScale?: (s: TemplateSize) => number;
  /** The body column on one size. */
  column: (s: TemplateSize, d: Design) => Column;
  /** Landscape title-beside-data columns, when the look splits a list card. */
  split?: (d: Design) => { head: Column; data: Column } | null;
  /** Background, photo, header and footer; `bodyTop` is where the body starts. */
  frame: (d: Design, bodyTop: PerSize<number>) => StarterLayer[];
};

export const fixed = (n: number) => () => n;
const each = (b: PerSize<Box>) => Object.entries(b) as Array<[TemplateSize, Box]>;

/** The blocks of one look. Every block keeps its key as its layer id. */
export function makeKit(t: Theme) {
  const F = t.font;
  const C = t.color;
  /** A display size in this look. */
  const ds = (n: number) => +(n * (F.displayScale ?? 1)).toFixed(2);
  /** Room a display line of `size` needs: its line, plus any glyph overhang. */
  const lineRoom = (size: number, lines = 1) =>
    size * (lines === 1 && !F.displayAscent ? 0.98 : 1.06 * lines) +
    size * Math.max(0, (F.displayAscent ?? 1.06) - 1.06);

  function eyebrow(key: string, content: string, color: string = C.accent, gap = 0): Block {
    return {
      key,
      // The square's narrow column gets room for a second line.
      h: (s) => (s === "square" ? 5.6 : 3.2),
      gap: fixed(gap),
      make: (b) =>
        text(key, "Eyebrow", content, b, () => ({
          fontFamily: F.mono,
          fontSize: 1.8,
          fontWeight: 600,
          letterSpacing: 0.22,
          uppercase: true,
          color,
          align: "left",
        })),
    };
  }

  /** The big number or word, in the accent. */
  function hero(
    key: string,
    name: string,
    content: string,
    size: (s: TemplateSize) => number,
    gap = 0,
    color: string = C.accent,
  ): Block {
    return {
      key,
      h: (s) => lineRoom(ds(size(s))),
      gap: fixed(gap),
      make: (b) =>
        text(key, name, content, b, (s) => ({
          fontFamily: F.display,
          fontSize: ds(size(s)),
          fontWeight: F.displayWeight,
          letterSpacing: -0.01,
          uppercase: true,
          color,
          align: "left",
        })),
    };
  }

  /**
   * A hero number with a small aside after it ("112 (98)"). `chars` is the
   * number's usual width in characters ("112" → 3), so the aside sits beside it.
   */
  function heroWithAside(
    key: string,
    name: string,
    main: string,
    aside: string,
    size: (s: TemplateSize) => number,
    chars: number,
    gap = 0,
  ): Block {
    return {
      key,
      h: (s) => lineRoom(ds(size(s))),
      gap: fixed(gap),
      make: (b) => {
        const mainBoxes: PerSize<Box> = {};
        const asideBoxes: PerSize<Box> = {};
        for (const [s, box] of each(b)) {
          const w = Math.min(box.w * 0.7, ds(size(s)) * chars * (F.displayCharWidth ?? 0.42));
          mainBoxes[s] = { ...box, w };
          asideBoxes[s] = { x: box.x + w + 1.6, y: box.y + box.h - 7, w: box.w - w - 1.6, h: 6 };
        }
        return [
          ...text(key, name, main, mainBoxes, (s) => ({
            fontFamily: F.display,
            fontSize: ds(size(s)),
            fontWeight: F.displayWeight,
            uppercase: true,
            color: C.accent,
            align: "left",
          })),
          ...text(`${key}-aside`, `${name} detail`, aside, asideBoxes, () => ({
            fontFamily: F.cond,
            fontSize: 5,
            fontWeight: 700,
            uppercase: true,
            color: C.muted,
            align: "left",
          })),
        ];
      },
    };
  }

  /** The look's dash, then a label ("— CENTURY"). */
  function dashLabel(key: string, content: string, gap = 1.4, size = 6): Block {
    const h = Math.max(6.6, size * 1.1);
    return {
      key,
      h: fixed(h),
      gap: fixed(gap),
      make: (b) => {
        const dash: PerSize<Box> = {};
        const label: PerSize<Box> = {};
        for (const [s, box] of each(b)) {
          dash[s] = { x: box.x, y: box.y + box.h / 2 - 0.4, w: 9, h: 0.8 };
          label[s] = { x: box.x + 11, y: box.y, w: box.w - 11, h: box.h };
        }
        return [
          ...t.dash(`${key}-dash`, dash),
          ...text(key, "Label", content, label, () => ({
            fontFamily: F.cond,
            fontSize: size,
            fontWeight: 800,
            uppercase: true,
            color: C.ink,
            align: "left",
          })),
        ];
      },
    };
  }

  /** A display line (player names, titles); `lines` lines of room. */
  function displayLine(
    key: string,
    name: string,
    content: string,
    size: number | ((s: TemplateSize) => number),
    lines: number | ((s: TemplateSize) => number) = 2,
    gap = 2.2,
    color: string = C.ink,
  ): Block {
    const n = typeof lines === "number" ? () => lines : lines;
    const sz = typeof size === "number" ? () => size : size;
    return {
      key,
      h: (s) => (F.displayAscent ? lineRoom(ds(sz(s)), n(s)) : ds(sz(s)) * 1.06 * n(s)),
      gap: fixed(gap),
      make: (b) =>
        text(key, name, content, b, (s) => ({
          fontFamily: F.display,
          fontSize: ds(sz(s)),
          fontWeight: F.displayWeight,
          uppercase: true,
          color,
          align: "left",
        })),
    };
  }

  /** A two-line title: the first line in ink, the second in the accent. */
  function twoLine(
    key: string,
    top: string,
    bottom: string,
    size: number | ((s: TemplateSize) => number),
    gap = 1,
  ): Block[] {
    return [
      displayLine(`${key}-top`, "Title line 1", top, size, 1, gap),
      displayLine(`${key}-bottom`, "Title line 2", bottom, size, 1, 0, C.accent),
    ];
  }

  function metaLine(key: string, content: string, gap = 1.6, name = "Supporting line"): Block {
    return {
      key,
      h: fixed(6),
      gap: fixed(gap),
      make: (b) =>
        text(key, name, content, b, () => ({
          fontFamily: F.sans,
          fontSize: 2.2,
          fontWeight: 500,
          color: C.muted,
          align: "left",
        })),
    };
  }

  /** A filled badge ("CAP 123"). */
  function badge(key: string, content: string, gap = 2.2, w = 24): Block {
    return {
      key,
      h: fixed(6.4),
      gap: fixed(gap),
      make: (b) => {
        const boxes: PerSize<Box> = {};
        for (const [s, box] of each(b)) boxes[s] = { ...box, w };
        return [
          shape(`${key}-fill`, "Badge", boxes, C.fill),
          ...text(key, "Badge text", content, boxes, () => ({
            fontFamily: F.cond,
            fontSize: 4,
            fontWeight: 900,
            uppercase: true,
            color: C.onFill,
            align: "center",
          })),
        ];
      },
    };
  }

  /**
   * A pill that only shows when its field has a value: one text box with the
   * accent fill, so an empty field takes the fill with it.
   */
  function pill(key: string, name: string, content: string, gap = 1.6, w = 0.6): Block {
    return {
      key,
      h: fixed(5.4),
      gap: fixed(gap),
      make: (b) => {
        const boxes: PerSize<Box> = {};
        for (const [s, box] of each(b)) boxes[s] = { ...box, w: box.w * w };
        return text(key, name, content, boxes, () => ({
          fontFamily: F.cond,
          fontSize: 2.8,
          fontWeight: 800,
          uppercase: true,
          color: C.onFill,
          background: C.fill,
          align: "center",
        }));
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
      for (const [s, box] of each(boxes)) {
        const y = box.y + top;
        barBox[s] = { x: box.x, y, w: box.w, h: BAR };
        nameBox[s] = { x: box.x + 2, y, w: box.w * 0.58 - 2, h: BAR };
        scoreBox[s] = { x: box.x + box.w * 0.58, y, w: box.w * 0.42 - 2, h: BAR };
      }
      const label = side === "club" ? "Club" : "Opposition";
      return [
        shape(`${key}-${side}-bar`, `${label} bar`, barBox, fill),
        ...text(`${key}-${side}-name`, `${label} name`, `{{${side}.barName}}`, nameBox, () => ({
          fontFamily: F.cond,
          fontSize: 3.2,
          fontWeight: 800,
          uppercase: true,
          color: ink,
          align: "left",
        })),
        ...text(`${key}-${side}-score`, `${label} score`, `{{${side}.score}}`, scoreBox, () => ({
          fontFamily: F.cond,
          fontSize: 4.6,
          fontWeight: 900,
          color: ink,
          align: "right",
        })),
      ];
    };
    return {
      key,
      h: fixed(BAR * 2 + 1.2),
      gap: fixed(gap),
      make: (b) => [
        ...bar("club", b, 0, C.fill, C.onFill),
        ...bar("opposition", b, BAR + 1.2, C.panel, C.ink),
      ],
    };
  }

  /** A row of stat cells: each a panel with a big value over a small label. */
  function statCells(
    key: string,
    cells: Array<{ value: string; label: string }>,
    gap = 2.4,
    height = 11,
  ): Block {
    return {
      key,
      h: fixed(height),
      gap: fixed(gap),
      make: (b) =>
        cells.flatMap((cell, i) => {
          const panel: PerSize<Box> = {};
          const value: PerSize<Box> = {};
          const label: PerSize<Box> = {};
          for (const [s, box] of each(b)) {
            const w = (box.w - (cells.length - 1) * 0.8) / cells.length;
            const x = box.x + i * (w + 0.8);
            panel[s] = { x, y: box.y, w, h: box.h };
            value[s] = { x: x + 1, y: box.y + 1, w: w - 2, h: box.h * 0.58 };
            label[s] = { x: x + 1, y: box.y + box.h * 0.62, w: w - 2, h: box.h * 0.3 };
          }
          const n = i + 1;
          return [
            shape(`${key}-${n}-panel`, `Stat ${n} panel`, panel, C.panel),
            ...text(`${key}-${n}-value`, `Stat ${n} value`, cell.value, value, () => ({
              fontFamily: F.display,
              fontSize: ds(5.6),
              fontWeight: F.displayWeight,
              color: C.accent,
              align: "left",
            })),
            ...text(`${key}-${n}-label`, `Stat ${n} label`, cell.label, label, () => ({
              fontFamily: F.mono,
              fontSize: 1.5,
              fontWeight: 600,
              letterSpacing: 0.14,
              uppercase: true,
              color: C.muted,
              align: "left",
            })),
          ];
        }),
    };
  }

  type PanelLine = {
    key: string;
    name: string;
    content: string;
    font: "display" | "cond" | "sans" | "mono";
    size: number;
    h: number;
    color?: string;
    weight?: number;
    gap?: number;
    /** Right-aligned beside the previous line instead of under it. */
    right?: boolean;
  };

  /** A panel (with an accent edge) holding a few lines. */
  function panel(key: string, name: string, lines: PanelLine[], gap = 2.2): Block {
    const PAD = 1.6;
    const height = lines.reduce((h, l) => (l.right ? h : h + l.h + (l.gap ?? 0)), 0) + PAD * 2;
    return {
      key,
      h: fixed(height),
      gap: fixed(gap),
      make: (b) => {
        const fill: PerSize<Box> = {};
        const edge: PerSize<Box> = {};
        const placedLines = lines.map(() => ({}) as PerSize<Box>);
        for (const [s, box] of each(b)) {
          fill[s] = box;
          edge[s] = { x: box.x, y: box.y, w: 1, h: box.h };
          let y = box.y + PAD;
          let last: Box | null = null;
          lines.forEach((l, i) => {
            const x = box.x + 1 + PAD;
            const w = box.w - 1 - PAD * 2;
            const slot = placedLines[i];
            if (!slot) return;
            if (l.right && last) {
              slot[s] = { x: x + w * 0.5, y: last.y, w: w * 0.5, h: last.h };
              return;
            }
            y += l.gap ?? 0;
            last = { x, y, w: lines[i + 1]?.right ? w * 0.5 : w, h: l.h };
            slot[s] = last;
            y += l.h;
          });
        }
        return [
          shape(`${key}-fill`, name, fill, C.panel),
          shape(`${key}-edge`, `${name} edge`, edge, C.fill),
          ...lines.flatMap((l, i) =>
            text(`${key}-${l.key}`, l.name, l.content, placedLines[i] ?? {}, () => ({
              fontFamily: F[l.font],
              fontSize: l.font === "display" ? ds(l.size) : l.size,
              fontWeight: l.weight ?? (l.font === "display" ? F.displayWeight : 700),
              uppercase: l.font !== "sans",
              color: l.color ?? (l.font === "sans" || l.font === "mono" ? C.muted : C.ink),
              align: l.right ? "right" : "left",
            })),
          ),
        ];
      },
    };
  }

  type Cell = {
    field: string;
    /** Left edge and width, percent of the row. */
    x: number;
    w: number;
    style: Partial<Style> & { fontSize: number };
    /** 0 = the full row (default), 1 = its upper line, 2 = its lower line. */
    line?: 0 | 1 | 2;
  };

  /**
   * A list: one row per data row, `count(s)` rows on each size before it spills
   * to another slide. Cells on line 1/2 sit in the row's upper/lower part (a
   * second rows layer per line, on the same pitch); the full-row layer comes
   * first, so it sets how many rows a slide takes.
   */
  function list(
    key: string,
    name: string,
    repeat: string,
    count: (s: TemplateSize) => number,
    rowHeight: number,
    rowGap: number,
    cells: Cell[],
    opts: {
      gap?: number;
      split?: number;
      /** Rows, gaps and type scaled per size (bigger rows where there's room). */
      scale?: (s: TemplateSize) => number;
      maxW?: number;
      variants?: Record<string, Record<string, Partial<Style>>>;
    } = {},
  ): Block {
    const k = (s: TemplateSize) => (opts.scale?.(s) ?? 1) * (t.listScale?.(s) ?? 1);
    const pitch = (s: TemplateSize) => (rowHeight + rowGap) * k(s);
    const upper = (s: TemplateSize) => rowHeight * k(s) * (opts.split ?? 0.56);
    const style = (c: Cell, s: TemplateSize): Style => ({
      fontFamily: F.cond,
      fontWeight: 700,
      color: C.ink,
      align: "left",
      ...c.style,
      fontSize: +(c.style.fontSize * k(s)).toFixed(2),
    });
    if (!cells.some((c) => (c.line ?? 0) === 0))
      throw new Error(`list ${key}: needs a full-row cell`);
    return {
      key,
      data: true,
      maxW: opts.maxW,
      // A little slack so rounding never costs a row.
      h: (s) => count(s) * pitch(s) - rowGap * k(s) + 0.3,
      gap: fixed(opts.gap ?? 1.6),
      make: (b) => {
        const out: StarterLayer[] = [];
        // The full-row layer first: it sets how many rows a slide takes.
        for (const line of [0, 1, 2] as const) {
          const lineCells = cells.filter((c) => (c.line ?? 0) === line);
          if (lineCells.length === 0) continue;
          const h = (s: TemplateSize) =>
            line === 0 ? rowHeight * k(s) : line === 1 ? upper(s) : rowHeight * k(s) - upper(s);
          const boxes: PerSize<Box> = {};
          for (const [s, box] of each(b))
            boxes[s] = line === 2 ? { ...box, y: box.y + upper(s), h: box.h - upper(s) } : box;
          const variants = opts.variants
            ? Object.fromEntries(
                Object.entries(opts.variants).map(([v, byField]) => [
                  v,
                  Object.fromEntries(
                    Object.entries(byField).filter(([f]) => lineCells.some((c) => c.field === f)),
                  ),
                ]),
              )
            : undefined;
          out.push(
            ...rows(line === 0 ? key : `${key}-${line}`, name, boxes, (s) => ({
              repeat,
              rowHeight: +h(s).toFixed(3),
              gap: +(pitch(s) - h(s)).toFixed(3),
              cells: lineCells.map((c) => ({ field: c.field, x: c.x, w: c.w, style: style(c, s) })),
              ...(variants
                ? { variants: variants as Record<string, Record<string, TemplateTextStyle>> }
                : {}),
            })),
          );
        }
        return out;
      },
    };
  }

  /** Column headings over a list (percent of the row, like its cells). */
  function headings(
    key: string,
    cols: Array<{ x: number; w: number; label: string; align?: "left" | "center" | "right" }>,
    gap = 1.4,
  ): Block {
    return {
      key,
      data: true,
      h: fixed(3),
      gap: fixed(gap),
      make: (b) =>
        cols.flatMap((col, i) => {
          const boxes: PerSize<Box> = {};
          for (const [s, box] of each(b))
            boxes[s] = {
              x: box.x + (box.w * col.x) / 100,
              y: box.y,
              w: (box.w * col.w) / 100,
              h: box.h,
            };
          return text(`${key}-${i + 1}`, `Heading ${col.label}`, col.label, boxes, () => ({
            fontFamily: F.mono,
            fontSize: 1.4,
            fontWeight: 600,
            letterSpacing: 0.14,
            color: C.muted,
            align: col.align ?? "center",
          }));
        }),
    };
  }

  return {
    theme: t,
    C,
    F,
    eyebrow,
    hero,
    heroWithAside,
    dashLabel,
    displayLine,
    twoLine,
    metaLine,
    badge,
    pill,
    scoreBars,
    statCells,
    panel,
    list,
    headings,
  };
}

export type Kit = ReturnType<typeof makeKit>;

/** Lay a design's body out on every size and wrap it in the look's frame. */
export function build(t: Theme, d: Design): StarterDocument {
  const boxesByKey = new Map<string, PerSize<Box>>();
  const bodyTop: PerSize<number> = {};
  const place = (
    s: TemplateSize,
    col: { x: number; w: number; at: number; anchor: "center" | "bottom" },
    blocks: Block[],
  ) => {
    const boxes = stack(
      col,
      blocks.map((b, i) => ({
        h: b.h(s),
        gap: i === 0 ? 0 : (b.gap?.(s) ?? 0),
        w: b.maxW === undefined ? undefined : Math.min(b.maxW, col.w),
      })),
    );
    blocks.forEach((b, i) => {
      const m = boxesByKey.get(b.key) ?? {};
      m[s] = boxes[i];
      boxesByKey.set(b.key, m);
    });
    return boxes;
  };
  for (const s of SIZES) {
    const split = s === "landscape" ? t.split?.(d) : null;
    if (split && d.blocks.some((b) => b.data)) {
      const head = place(
        s,
        split.head,
        d.blocks.filter((b) => !b.data),
      );
      place(
        s,
        split.data,
        d.blocks.filter((b) => b.data),
      );
      bodyTop[s] = head[0]?.y ?? 0;
    } else {
      const boxes = place(s, t.column(s, d), d.blocks);
      bodyTop[s] = boxes[0]?.y ?? 0;
    }
  }
  return {
    layers: [
      ...t.frame(d, bodyTop),
      ...d.blocks.flatMap((b) => b.make(boxesByKey.get(b.key) ?? {})),
    ] as StarterDocument["layers"],
  };
}

/** The hashtag token a kind's footer shows: its club hashtag, else its hashtag footer. */
export function hashtagToken(kind: string | undefined): string {
  const keys = new Set((kind ? kindFields(kind)?.fields : undefined)?.map((f) => f.key) ?? []);
  if (keys.has("clubHashtag")) return "{{clubHashtag}}";
  if (keys.has("hashtags")) return "{{hashtags}}";
  return "";
}
