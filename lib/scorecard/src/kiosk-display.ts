import type { BoardDisplayConfig, DisplayBoardLayout, KioskLook } from "@workspace/api-zod";

/**
 * Kiosk display settings: the club defaults (Look tab, `kiosk_look`) and each
 * board's override (`board_configs`) resolved into the one set of values the
 * TV player and the settings preview both read.
 *
 * Pure: no React or DOM. Precedence, most specific first:
 *   board setting → board legacy setting → club look → club legacy timing →
 *   built-in default.
 * Legacy mapping (settings saved before the redesign):
 *   board `transition` scroll → credits, slide → pages, wrap → fit;
 *   board `textSize` sm/md/lg → S/M/L; board `columns` (lists) → columnsPerScreen;
 *   club `kioskDwellMs` → pageSecs, `kioskEndHoldMs` → hold, `kioskScrollSpeed` → speed.
 * The legacy board `fit` flag meant "full screen width" (always on now), not
 * "shrink to one screen", so it is deliberately not read.
 */

export type KioskMove = NonNullable<KioskLook["move"]>;
export type KioskTransition = NonNullable<KioskLook["trans"]>;
export type KioskDuration = NonNullable<KioskLook["dur"]>;
export type KioskTextSize = NonNullable<KioskLook["size"]>;

export const KIOSK_MOVES: readonly KioskMove[] = ["pages", "credits", "fit"];
export const KIOSK_TRANSITIONS: readonly KioskTransition[] = [
  "fade",
  "up",
  "down",
  "left",
  "right",
  "pop",
  "zoom",
  "flip",
  "wipe",
  "rows",
  "cut",
  "random",
];
export const KIOSK_DURATION_MS: Readonly<Record<KioskDuration, number>> = {
  S: 400,
  M: 800,
  L: 1400,
};
export const KIOSK_TEXT_SCALE: Readonly<Record<KioskTextSize, number>> = {
  S: 0.85,
  M: 1,
  L: 1.18,
  XL: 1.36,
};
export const KIOSK_LEADERBOARD_TOPS = [10, 20, 50] as const;

/** Club defaults with every field filled in. */
export interface ResolvedKioskLook {
  move: KioskMove;
  trans: KioskTransition;
  dur: KioskDuration;
  size: KioskTextSize;
  /** Rows per page; 0 = as many as fit the screen. */
  perPage: number;
  /** Seconds per page, or the pause before a credits roll. */
  pageSecs: number;
  /** Credits-roll speed, px/sec. */
  speed: number;
  /** Seconds held at the end of a board. */
  hold: number;
  columnsPerScreen: number;
}

/** One board's settings with every field filled in. */
export interface ResolvedKioskDisplay extends ResolvedKioskLook {
  durMs: number;
  textScale: number;
  /** Leaderboards: players shown. */
  top: number;
}

// Today's TV credit-scrolls any board without a saved fill mode, so "credits"
// is the default until a club picks one on the Look tab.
export const KIOSK_LOOK_DEFAULTS: Readonly<ResolvedKioskLook> = {
  move: "credits",
  trans: "fade",
  dur: "M",
  size: "M",
  perPage: 0,
  pageSecs: 6,
  speed: 36,
  hold: 3,
  columnsPerScreen: 4,
};

const RANGES = {
  perPage: [0, 20],
  pageSecs: [1, 60],
  speed: [5, 200],
  hold: [0, 60],
  columnsPerScreen: [1, 5],
} as const;

const LEGACY_MOVE: Record<string, KioskMove> = {
  scroll: "credits",
  slide: "pages",
  wrap: "fit",
};
const LEGACY_SIZE: Record<string, KioskTextSize> = { sm: "S", md: "M", lg: "L" };

/** The value when it is one of `allowed` (stored jsonb may hold anything). */
function oneOf<T extends string | number>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** A finite number rounded and clamped to `range`, else undefined. */
function num(value: unknown, [min, max]: readonly [number, number]): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

const msToSecs = (ms: number | null | undefined) =>
  typeof ms === "number" && Number.isFinite(ms) ? ms / 1000 : undefined;

export interface KioskLookSource {
  kioskLook?: KioskLook | null;
  kioskDwellMs?: number | null;
  kioskEndHoldMs?: number | null;
  kioskScrollSpeed?: number | null;
}

/** The club's defaults: its saved look, then its legacy kiosk timings, then built-ins. */
export function resolveClubLook(settings: KioskLookSource | null | undefined): ResolvedKioskLook {
  const look = settings?.kioskLook ?? {};
  const d = KIOSK_LOOK_DEFAULTS;
  return {
    move: oneOf(look.move, KIOSK_MOVES) ?? d.move,
    trans: oneOf(look.trans, KIOSK_TRANSITIONS) ?? d.trans,
    dur: oneOf(look.dur, keys(KIOSK_DURATION_MS)) ?? d.dur,
    size: oneOf(look.size, keys(KIOSK_TEXT_SCALE)) ?? d.size,
    perPage: num(look.perPage, RANGES.perPage) ?? d.perPage,
    pageSecs:
      num(look.pageSecs, RANGES.pageSecs) ??
      num(msToSecs(settings?.kioskDwellMs), RANGES.pageSecs) ??
      d.pageSecs,
    speed:
      num(look.speed, RANGES.speed) ?? num(settings?.kioskScrollSpeed, RANGES.speed) ?? d.speed,
    hold:
      num(look.hold, RANGES.hold) ?? num(msToSecs(settings?.kioskEndHoldMs), RANGES.hold) ?? d.hold,
    columnsPerScreen: num(look.columnsPerScreen, RANGES.columnsPerScreen) ?? d.columnsPerScreen,
  };
}

/** The parts of a board the resolver needs (a DisplayBoard satisfies it). */
export interface KioskBoardShape {
  layout: DisplayBoardLayout;
  grid?: { columnHeadings: readonly unknown[] } | null;
  columns?: readonly unknown[] | null;
}

// Columns per screen by layout. Season grids and composite column boards take
// the club default (they split into column groups); the others keep the
// default they have on today's TV unless the board sets one.
function columnRule(board: KioskBoardShape): { fallback: number | "club"; max: number } {
  switch (board.layout) {
    case "grid":
      return { fallback: "club", max: board.grid?.columnHeadings.length || 5 };
    case "columns":
      return { fallback: "club", max: board.columns?.length || 5 };
    case "list":
    case "lifeMembers":
      return { fallback: 1, max: 3 };
    case "premiership":
      return { fallback: 3, max: 5 };
    default:
      return { fallback: 1, max: 1 };
  }
}

/** One board's display: its own settings over the club look. */
export function resolveKioskDisplay(
  board: KioskBoardShape,
  config: BoardDisplayConfig | null | undefined,
  look: ResolvedKioskLook,
): ResolvedKioskDisplay {
  const c = config ?? {};
  const move = oneOf(c.move, KIOSK_MOVES) ?? LEGACY_MOVE[c.transition as string] ?? look.move;
  const size =
    oneOf(c.size, keys(KIOSK_TEXT_SCALE)) ?? LEGACY_SIZE[c.textSize as string] ?? look.size;
  const dur = oneOf(c.dur, keys(KIOSK_DURATION_MS)) ?? look.dur;

  const rule = columnRule(board);
  const max = Math.min(RANGES.columnsPerScreen[1], Math.max(1, rule.max));
  const columnsPerScreen = Math.min(
    max,
    num(c.columnsPerScreen, RANGES.columnsPerScreen) ??
      (board.layout === "list" ? num(c.columns, RANGES.columnsPerScreen) : undefined) ??
      (rule.fallback === "club" ? look.columnsPerScreen : rule.fallback),
  );

  return {
    move,
    trans: oneOf(c.trans, KIOSK_TRANSITIONS) ?? look.trans,
    dur,
    size,
    perPage: num(c.perPage, RANGES.perPage) ?? look.perPage,
    pageSecs: num(c.pageSecs, RANGES.pageSecs) ?? look.pageSecs,
    speed: num(c.speed, RANGES.speed) ?? look.speed,
    hold: num(c.hold, RANGES.hold) ?? look.hold,
    columnsPerScreen,
    durMs: KIOSK_DURATION_MS[dur],
    textScale: KIOSK_TEXT_SCALE[size],
    top: oneOf(c.top, KIOSK_LEADERBOARD_TOPS) ?? 20,
  };
}

function keys<K extends string>(record: Readonly<Record<K, unknown>>): K[] {
  return Object.keys(record) as K[];
}
