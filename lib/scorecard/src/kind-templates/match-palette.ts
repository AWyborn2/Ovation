/**
 * The `match` derived palette (Ovation Match Graphics, plan 2026-10-23, M5–M8):
 * both teams' colours on a match card, by role, so a converted match graphic
 * takes on whichever clubs played.
 *
 * A token names a role, a colour slot, and optionally a shade and an alpha:
 *
 *   --mt-<role>-<slot>[-l<NN>|-d<NN>][-a<NN>]
 *
 *   role   i1, i2 (the teams in batting order), win, lose (the result's
 *          sides), comp (the competition)
 *   slot   a team's TeamTokens colour: colour, on, ondark, dark, bright, sec,
 *          onsec; the competition's colour and accent
 *   l / d  lighten toward white / darken toward black by NN % (the design's
 *          `shade(hex, ±0.NN)`)
 *   a      at NN % opacity
 *
 * Any name in that grammar resolves, so the renderer emits only the tokens a
 * document uses. The shade arithmetic is the design system's own (`mix`,
 * `shade`), so a converted shade is the same colour the design drew.
 *
 * Pure: no DOM. The renderer (`pack-render`) and the converter share it.
 */

export const MATCH_PALETTE_PREFIX = "--mt-";

export const MATCH_TEAM_ROLES = ["i1", "i2", "win", "lose"] as const;
export type MatchTeamRole = (typeof MATCH_TEAM_ROLES)[number];

export const MATCH_TEAM_SLOTS = [
  "colour",
  "on",
  "ondark",
  "dark",
  "bright",
  "sec",
  "onsec",
] as const;
export type MatchTeamSlot = (typeof MATCH_TEAM_SLOTS)[number];

export const MATCH_COMP_SLOTS = ["colour", "accent"] as const;
export type MatchCompSlot = (typeof MATCH_COMP_SLOTS)[number];

/** A team's colour slots (the design system's `TeamTokens`, colours only). */
export type MatchTeamColours = Record<MatchTeamSlot, string>;

/** Every colour a match card's palette resolves from. */
export type MatchColours = Record<MatchTeamRole, MatchTeamColours> & {
  comp: Record<MatchCompSlot, string>;
};

const TOKEN_RE =
  /^--mt-(i1|i2|win|lose|comp)-(colour|on|ondark|dark|bright|sec|onsec|accent)(?:-([ld])(\d{2}))?(?:-a(\d{2}))?$/;

export type MatchToken = {
  role: MatchTeamRole | "comp";
  slot: string;
  /** −0.99 … 0.99: negative darkens. */
  shade: number;
  /** 0 … 1. */
  alpha: number;
};

/** A token's parts, or null for a name outside the grammar. */
export function parseMatchToken(name: string): MatchToken | null {
  const m = TOKEN_RE.exec(name);
  if (!m) return null;
  const role = m[1] as MatchToken["role"];
  const slot = m[2]!;
  if (role === "comp" ? !(MATCH_COMP_SLOTS as readonly string[]).includes(slot) : slot === "accent")
    return null;
  const amount = m[4] ? Number(m[4]) / 100 : 0;
  return {
    role,
    slot,
    shade: m[3] === "d" ? -amount : amount,
    alpha: m[5] ? Number(m[5]) / 100 : 1,
  };
}

const two = (n: number) =>
  String(Math.min(99, Math.max(0, Math.round(Math.abs(n) * 100)))).padStart(2, "0");

/** A token's name: `matchTokenName("win", "colour", 0.18, 0.5)` → `--mt-win-colour-l18-a50`. */
export function matchTokenName(
  role: MatchToken["role"],
  slot: string,
  shade = 0,
  alpha = 1,
): string {
  const s = shade === 0 ? "" : `-${shade > 0 ? "l" : "d"}${two(shade)}`;
  const a = alpha >= 1 ? "" : `-a${two(alpha)}`;
  return `${MATCH_PALETTE_PREFIX}${role}-${slot}${s}${a}`;
}

// ── The design system's colour arithmetic ───────────────────────────────────

const HEX6 = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parse(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const hex2 = (v: number) => clamp255(v).toString(16).padStart(2, "0");

/** `a` moved toward `b` by `t` (0–1): the design's `mix`. */
export function mixHex(a: string, b: string, t: number): string {
  const A = parse(a);
  const B = parse(b);
  return `#${A.map((v, i) => hex2(v + (B[i]! - v) * t)).join("")}`;
}

/** Lighten toward white (t > 0) or darken toward black (t < 0): the design's `shade`. */
export const shadeHex = (hex: string, t: number): string =>
  t >= 0 ? mixHex(hex, "#ffffff", t) : mixHex(hex, "#000000", -t);

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The design's dark text (`ink`). */
export const MATCH_INK = "#1e1f22";

/** White or the design's ink, whichever reads better on `hex` (`readableOn`). */
export const readableOn = (hex: string): string =>
  contrast(hex, "#ffffff") >= contrast(hex, MATCH_INK) ? "#ffffff" : MATCH_INK;

/** The darkest panels a team colour is read on (Clean's glass, the Digital Scoreboard's navy). */
const DARK_PANELS = ["#1c2026", "#0e1c45", "#0b0b0b"];

/** `hex` lifted toward white until it clears `ratio` on every one of `grounds`. */
function liftedOn(hex: string, grounds: readonly string[], ratio: number): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = shadeHex(hex, t);
    if (grounds.every((g) => contrast(c, g) >= ratio)) return c;
  }
  return "#ffffff";
}

/** A strict `#rrggbb`, or null. */
export function normaliseHex(value: unknown): string | null {
  if (typeof value !== "string" || !HEX6.test(value.trim())) return null;
  const [r, g, b] = parse(value.trim());
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/**
 * A team's colour slots from its two brand colours (decision M6): `identity`
 * is the colour the club is known by (bars, the result fill), `base` its
 * other colour (headers, tiles).
 */
export function teamColours(identity: string, base: string): MatchTeamColours {
  const id = normaliseHex(identity) ?? "#333f48";
  const other = normaliseHex(base) ?? shadeHex(id, -0.55);
  const [dark, light] = luminance(id) <= luminance(other) ? [id, other] : [other, id];
  // A dark bar needs a dark colour: a club with two light colours gets its identity darkened.
  const bar = luminance(dark) > 0.18 ? shadeHex(dark, -0.6) : dark;
  return {
    colour: id,
    on: readableOn(id),
    ondark: liftedOn(id, DARK_PANELS, 4.5),
    dark: bar,
    bright: liftedOn(light === bar ? id : light, [bar], 4.5),
    sec: other,
    onsec: contrast(other, id) >= 3 ? id : readableOn(other),
  };
}

/** A palette's colour for one token, as `#rrggbb` or `#rrggbbaa`; null outside the grammar. */
export function matchTokenColour(colours: MatchColours, name: string): string | null {
  const t = parseMatchToken(name);
  if (!t) return null;
  const base =
    t.role === "comp"
      ? colours.comp[t.slot as MatchCompSlot]
      : colours[t.role][t.slot as MatchTeamSlot];
  if (!base) return null;
  const shaded = t.shade === 0 ? base : shadeHex(base, t.shade);
  return t.alpha >= 1 ? shaded : `${shaded}${hex2(t.alpha * 255)}`;
}

/** Every `--mt-*` token named in `text` (a document's JSON), once each. */
export function matchTokensIn(text: string): string[] {
  return [...new Set(text.match(/--mt-[a-z0-9-]+/g) ?? [])].filter(
    (n) => parseMatchToken(n) !== null,
  );
}

/** The CSS declarations for the tokens a document uses: `--mt-win-colour:#…;…`. */
export function matchVars(colours: MatchColours, names: readonly string[]): string {
  return names
    .map((n) => {
      const c = matchTokenColour(colours, n);
      return c ? `${n}:${c}` : "";
    })
    .filter(Boolean)
    .join(";");
}

/** A side of a match: its two brand colours. */
export type MatchSide = { identity: string; base: string };

/**
 * A card's match colours (decision M7): the teams in batting order, and the
 * result's winner and loser. On a draw, a tie or no result the club takes the
 * winner's role.
 */
export function matchColours(opts: {
  club: MatchSide;
  opposition: MatchSide;
  /** Which side batted first. */
  firstInnings: "club" | "opposition";
  winner: "club" | "opposition" | "draw";
  /** The competition's colour and accent (decision M8: the club's own). */
  competition: { colour: string; accent: string };
}): MatchColours {
  const club = teamColours(opts.club.identity, opts.club.base);
  const opp = teamColours(opts.opposition.identity, opts.opposition.base);
  const clubFirst = opts.firstInnings === "club";
  const clubWon = opts.winner !== "opposition";
  return {
    i1: clubFirst ? club : opp,
    i2: clubFirst ? opp : club,
    win: clubWon ? club : opp,
    lose: clubWon ? opp : club,
    comp: {
      colour: normaliseHex(opts.competition.colour) ?? club.dark,
      accent: normaliseHex(opts.competition.accent) ?? club.colour,
    },
  };
}
