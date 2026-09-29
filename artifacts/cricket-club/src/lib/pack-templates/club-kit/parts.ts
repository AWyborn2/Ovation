/**
 * Club Kit parts — the visual building blocks of the Club Kit pack (Club
 * Colours handoff, `docs/design-handoffs/club-colours-pack/Handoff.md`).
 *
 * Every part is a pure function returning html. Sizes go through a unit
 * function `u`, so the SAME part serves two consumers (KTD2):
 *
 *  - the pack templates, where `u(n)` is `n` cqmin of the card, and
 *  - Studio elements (`lib/studio-elements`), where `u(n)` scales into the
 *    element's own box, so an inserted element looks exactly like the piece on
 *    the card.
 *
 * Colours are only ever `--ck-*` custom properties (see
 * `pack-render/club-kit-vars.ts`), each with a neutral fallback, so a part
 * renders legibly for any club and never carries one club's colours.
 */

/** Unit function: a handoff size (card cqmin) → a CSS length. */
export type Unit = (n: number) => string;

/** Card cqmin — the pack templates' unit. */
export const cq: Unit = (n) => `${n}cqmin`;

export const CK_COND = "'Barlow Condensed','Arial Narrow',sans-serif";
export const CK_SANS = "'IBM Plex Sans',system-ui,sans-serif";
export const CK_MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace";

/** The palette, as variable references with neutral fallbacks. */
export const C = {
  base: "var(--ck-base,#10151B)",
  base2: "var(--ck-base2,#1B232B)",
  p: "var(--ck-p,var(--gold,#FBAC27))",
  s: "var(--ck-s,#333F48)",
  onp: "var(--ck-onp,var(--accent-ink,#10151B))",
  pt: "var(--ck-pt,var(--gold,#FBAC27))",
  glowc: "var(--ck-glowc,rgba(251,172,39,.16))",
  chalk: "var(--ck-chalk,#F2F5F8)",
  chalk2: "var(--ck-chalk2,rgba(242,245,248,.68))",
  panel: "var(--ck-panel,rgba(242,245,248,.07))",
  line: "var(--ck-line,rgba(242,245,248,.14))",
  base35: "var(--ck-base-35,rgba(16,21,27,.35))",
  base55: "var(--ck-base-55,rgba(16,21,27,.55))",
  base70: "var(--ck-base-70,rgba(16,21,27,.7))",
  p22: "var(--ck-p-22,rgba(251,172,39,.22))",
} as const;

// ---------------------------------------------------------------------------
// Backgrounds, frames and trim (handoff §2–§3)
// ---------------------------------------------------------------------------

/** Card background: base → base2 gradient with the primary glow bottom-left. */
export function background(): string {
  return `<div style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 0% 100%,${C.glowc},transparent 60%),linear-gradient(160deg,${C.base} 0%,${C.base2} 100%)"></div>`;
}

/** Jumper-trim bands, outermost first: secondary, chalk, primary. */
export const TRIM: ReadonlyArray<readonly [number, string]> = [
  [3.8, C.s],
  [2.8, C.chalk],
  [2, C.p],
];

/**
 * Side frame (square / landscape): a diagonal left edge down the right of the
 * card, with the trim running down the diagonal. `photo` is the frame's inner
 * html (a photo slot, or nothing). Geometry is in container units of the
 * nearest size container (the card, or an element's box).
 */
export function sideFrame(u: Unit, photo: string, left = "54cqw", width = "46cqw"): string {
  const bands = TRIM.map(
    ([d, c]) =>
      `<div style="position:absolute;left:calc(${left} - ${u(d)});top:0;width:calc(${width} + ${u(d)});height:100cqh;background:${c};clip-path:polygon(calc(${width} * .24 + ${u(d)}) 0,100% 0,100% 100%,0 100%)"></div>`,
  ).join("");
  return (
    bands +
    `<div data-ck-frame="side" style="position:absolute;left:${left};top:0;width:${width};height:100cqh;overflow:hidden;clip-path:polygon(24% 0,100% 0,100% 100%,0 100%);background:linear-gradient(160deg,${C.base2},${C.s})">` +
    photo +
    `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,${C.base35} 0%,transparent 40%)"></div>` +
    `</div>`
  );
}

/**
 * Top frame (portrait / story): full width, `h` tall (a CSS length such as
 * `46cqh`), with a sloped bottom edge that rises to the right and the trim
 * along it. Top and bottom fades keep the header and body legible.
 */
export function topFrame(u: Unit, h: string, photo: string): string {
  const bands = TRIM.map(
    ([d, c]) =>
      `<div style="position:absolute;left:0;top:0;width:100cqw;height:calc(${h} + ${u(d)});background:${c};clip-path:polygon(0 0,100% 0,100% calc(${h} * .78 + ${u(d)}),0 100%)"></div>`,
  ).join("");
  return (
    bands +
    `<div data-ck-frame="top" style="position:absolute;left:0;top:0;width:100cqw;height:${h};overflow:hidden;clip-path:polygon(0 0,100% 0,100% 78%,0 100%);background:linear-gradient(160deg,${C.base2},${C.s})">` +
    photo +
    `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,${C.base55} 0%,transparent 40%),linear-gradient(180deg,${C.base70} 0%,transparent 30%)"></div>` +
    `</div>`
  );
}

/** Watermark crest, bottom-left, faint and desaturated. `crest` is the crest html. */
export function watermark(u: Unit, crest: string): string {
  return `<div style="position:absolute;left:${u(-14)};bottom:${u(-16)};width:${u(70)};height:${u(70)};opacity:.07;filter:grayscale(1) brightness(3);pointer-events:none">${crest}</div>`;
}

/** Monogram disc (the crest stand-in for a club with no logo). */
export function monogram(u: Unit, text: string, size = 10): string {
  return `<div style="width:${u(size)};height:${u(size)};border-radius:50%;background:${C.p};color:${C.onp};display:flex;align-items:center;justify-content:center;font-family:${CK_COND};font-weight:900;font-size:${u(size * 0.46)};line-height:1;letter-spacing:.02em">${text}</div>`;
}

// ---------------------------------------------------------------------------
// Header / footer pieces (handoff §2)
// ---------------------------------------------------------------------------

/** Club name + tagline lockup. */
export function clubLockup(u: Unit, name: string, tagline: string, fit = true): string {
  const size = fit ? `calc(${u(4.6)} * var(--fit,1))` : u(4.6);
  return (
    `<div style="min-width:0">` +
    `<div${fit ? ' data-fit="26"' : ""} style="font-family:${CK_COND};font-weight:800;font-size:${size};line-height:.95;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk}">${name}</div>` +
    `<div style="font-family:${CK_MONO};font-weight:500;font-size:${u(1.5)};line-height:1.2;letter-spacing:.22em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk2};margin-top:${u(0.7)}">${tagline}</div>` +
    `</div>`
  );
}

/** Kind chip: a secondary notch, then the label on a primary block. */
export function kindChip(u: Unit, label: string): string {
  return (
    `<div style="display:flex;align-items:stretch;flex:none">` +
    `<div style="width:${u(1.2)};background:${C.s}"></div>` +
    `<div style="font-family:${CK_COND};font-weight:800;font-size:${u(2.5)};line-height:1;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;padding:${u(1)} ${u(2.2)};background:${C.p};color:${C.onp}">${label}</div>` +
    `</div>`
  );
}

/** Tricolour rule: primary / chalk / secondary at 6 / 1 / 3. */
export function tricolourRule(u: Unit, height = 0.8): string {
  return (
    `<div data-ck-rule="1" style="display:flex;gap:${u(0.6)};height:${u(height)};width:100%">` +
    `<div style="flex:6;background:${C.p}"></div><div style="flex:1;background:${C.chalk}"></div><div style="flex:3;background:${C.s}"></div>` +
    `</div>`
  );
}

/** Short tricolour dash (milestone). */
export function tricolourDash(u: Unit): string {
  return (
    `<div style="display:flex;width:${u(10)};height:${u(1.6)};flex:none">` +
    `<div style="flex:60;background:${C.p}"></div><div style="flex:15;background:${C.chalk}"></div><div style="flex:25;background:${C.s}"></div>` +
    `</div>`
  );
}

/** Hashtag on a solid primary block (legible over photos). */
export function hashtagBlock(u: Unit, text: string): string {
  return `<div style="flex:none;font-family:${CK_COND};font-weight:800;font-size:${u(2.9)};line-height:1;letter-spacing:.04em;white-space:nowrap;padding:${u(0.6)} ${u(1.6)};background:${C.p};color:${C.onp}">${text}</div>`;
}

/** "SUPPORTED BY" label. */
export function supportedBy(u: Unit, label = "SUPPORTED BY"): string {
  return `<span style="font-family:${CK_MONO};font-weight:500;font-size:${u(1.7)};letter-spacing:.18em;white-space:nowrap;color:${C.chalk2}">${label}</span>`;
}

/** Sponsor names in the footer strip. */
export function sponsorNames(u: Unit, names: string): string {
  return `<span style="font-family:${CK_SANS};font-weight:700;font-size:${u(2)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;color:${C.chalk}">${names}</span>`;
}

// ---------------------------------------------------------------------------
// Body pieces (handoff §5)
// ---------------------------------------------------------------------------

/** Mono eyebrow, primary-as-text by default. */
export function eyebrow(u: Unit, text: string, color: string = C.pt, extra = ""): string {
  return `<div style="font-family:${CK_MONO};font-weight:600;font-size:${u(1.8)};line-height:1.3;letter-spacing:.22em;text-transform:uppercase;color:${color}${extra}">${text}</div>`;
}

/** Barlow display line. */
export function display(u: Unit, text: string, size: number, extra = "", weight = 900): string {
  return `<div style="font-family:${CK_COND};font-weight:${weight};font-size:${u(size)};line-height:.88;text-transform:uppercase;color:${C.chalk}${extra}">${text}</div>`;
}

/** Two-line title with the second line in primary-as-text ("GAME / DAY"). */
export function twoLineTitle(u: Unit, top: string, bottom: string, size: number): string {
  return display(
    u,
    `${top}<br><span style="color:${C.pt}">${bottom}</span>`,
    size,
    ";line-height:.84",
  );
}

/** Supporting line. */
export function meta(u: Unit, text: string, extra = ""): string {
  return `<div style="font-family:${CK_SANS};font-size:${u(2.2)};line-height:1.4;font-weight:500;color:${C.chalk2}${extra}">${text}</div>`;
}

/** A match-result score bar. `home` = the club's own bar (primary block). */
export function scoreBar(
  u: Unit,
  name: string,
  score: string,
  overs: string,
  home: boolean,
): string {
  const box = home
    ? `background:${C.p};color:${C.onp}`
    : `background:${C.panel};color:${C.chalk2};border-left:${u(1.2)} solid ${C.s}`;
  return (
    `<div style="display:flex;align-items:baseline;gap:${u(1.6)};padding:${u(1.6)} ${u(2.4)};${box};min-width:0">` +
    `<div style="flex:1;min-width:0;font-family:${CK_COND};font-weight:800;font-size:${u(4.2)};line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>` +
    `<div style="flex:none;font-family:${CK_COND};font-weight:900;font-size:${u(6)};line-height:.9">${score}</div>` +
    `<div style="flex:none;font-family:${CK_MONO};font-weight:500;font-size:${u(1.6)};opacity:.75;white-space:nowrap">${overs}</div>` +
    `</div>`
  );
}

/** Home + opposition score bars. */
export function scoreBars(
  u: Unit,
  home: { name: string; score: string; overs: string },
  away: { name: string; score: string; overs: string },
): string {
  return (
    `<div style="display:flex;flex-direction:column;gap:${u(0.8)};width:100%">` +
    scoreBar(u, home.name, home.score, home.overs, true) +
    scoreBar(u, away.name, away.score, away.overs, false) +
    `</div>`
  );
}

/**
 * A leader row with a value bar behind it. `top` rows sit on a full primary
 * bar (type on primary); others on a faint primary bar. `pct` is a CSS
 * percentage string or a placeholder.
 */
export function leaderRow(
  u: Unit,
  top: boolean,
  cells: { rank: string; name: string; value: string; pct: string },
  attrs = "",
): string {
  const ink = top ? C.onp : C.chalk;
  return (
    `<div${attrs} style="position:relative;display:flex;align-items:center;gap:${u(2)};height:${u(6.4)};padding:0 ${u(2)};margin-top:${u(1)};background:${C.panel};overflow:hidden">` +
    `<div style="position:absolute;left:0;top:0;bottom:0;width:${top ? "100%" : cells.pct};background:${top ? C.p : C.p22}"></div>` +
    `<div style="position:relative;flex:none;min-width:${u(5)};font-family:${CK_COND};font-weight:900;font-size:${u(3.6)};line-height:1;color:${top ? C.onp : C.pt}">${cells.rank}</div>` +
    `<div style="position:relative;flex:1;min-width:0;font-family:${CK_SANS};font-weight:700;font-size:${u(2.4)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${ink}">${cells.name}</div>` +
    `<div style="position:relative;flex:none;font-family:${CK_COND};font-weight:900;font-size:${u(4)};line-height:1;color:${ink}">${cells.value}</div>` +
    `</div>`
  );
}

/** A game-day grade row: grade tile, "v Opponent" over the venue, start time. */
export function gradeRow(
  u: Unit,
  cells: { grade: string; opponent: string; venue: string; time: string },
  attrs = "",
): string {
  return (
    `<div${attrs} style="display:grid;grid-template-columns:${u(6)} 1fr auto;align-items:center;gap:${u(2)};padding:${u(1)} ${u(1.6)} ${u(1)} ${u(1)};margin-top:${u(0.8)};background:${C.panel}">` +
    `<div style="height:${u(6)};display:flex;align-items:center;justify-content:center;background:${C.p};color:${C.onp};font-family:${CK_COND};font-weight:900;font-size:${u(3.4)};line-height:1">${cells.grade}</div>` +
    `<div style="min-width:0"><div style="font-family:${CK_COND};font-weight:800;font-size:${u(3.4)};line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk}">${cells.opponent}</div>` +
    `<div style="font-family:${CK_SANS};font-size:${u(1.8)};line-height:1.3;margin-top:${u(0.4)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk2}">${cells.venue}</div></div>` +
    `<div style="font-family:${CK_COND};font-weight:800;font-size:${u(3.6)};line-height:1;white-space:nowrap;color:${C.pt}">${cells.time}</div>` +
    `</div>`
  );
}

/** One row of the team XI list. */
export function xiRow(u: Unit, cells: { n: string; name: string; tag: string }): string {
  return (
    `<div style="display:flex;align-items:center;gap:${u(1.4)};height:${u(5)};border-bottom:${u(0.15)} solid ${C.line};min-width:0">` +
    `<span style="flex:none;min-width:${u(3.4)};font-family:${CK_COND};font-weight:900;font-size:${u(3)};color:${C.pt}">${cells.n}</span>` +
    `<span style="flex:1;min-width:0;font-family:${CK_SANS};font-weight:600;font-size:${u(2.3)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk}">${cells.name}</span>` +
    `<span style="flex:none;font-family:${CK_MONO};font-weight:500;font-size:${u(1.5)};color:${C.chalk2}">${cells.tag}</span>` +
    `</div>`
  );
}

/** Two-column XI list container (`rows` is the row html, repeated or literal). */
export function xiList(u: Unit, rows: string, attrs = ""): string {
  return `<div${attrs} style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,auto);grid-auto-flow:column;column-gap:${u(2.4)};row-gap:${u(0.7)};width:100%">${rows}</div>`;
}

const STAR =
  "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

/** Three premiership stars. */
export function premStars(u: Unit, count = 3): string {
  const star = `<div style="width:${u(4)};height:${u(4)};background:${C.p};clip-path:${STAR}"></div>`;
  return `<div style="display:flex;gap:${u(1)}">${star.repeat(count)}</div>`;
}

/** Grand-final panel: venue eyebrow, score line, player of the final. */
export function gfPanel(u: Unit, cells: { venue: string; score: string; potf: string }): string {
  return (
    `<div style="display:flex;background:${C.panel};width:100%">` +
    `<div style="width:${u(1.4)};flex:none;background:${C.p}"></div>` +
    `<div style="padding:${u(1.8)} ${u(2.4)};min-width:0">` +
    eyebrow(u, cells.venue, C.chalk2) +
    `<div style="font-family:${CK_COND};font-weight:800;font-size:${u(4)};line-height:1.05;text-transform:uppercase;margin-top:${u(0.8)};color:${C.chalk}">${cells.score}</div>` +
    `<div style="font-family:${CK_SANS};font-size:${u(2)};line-height:1.35;margin-top:${u(0.8)};color:${C.chalk2}">${cells.potf}</div>` +
    `</div></div>`
  );
}

/** Junior highlight row: name + note on the left, figure on the right. */
export function juniorRow(
  u: Unit,
  cells: { name: string; note: string; figure: string },
  attrs = "",
): string {
  return (
    `<div${attrs} style="display:flex;align-items:center;gap:${u(2)};padding:${u(1.4)} ${u(2.2)};margin-top:${u(1)};background:${C.panel};border-left:${u(1.2)} solid ${C.p}">` +
    `<div style="flex:1;min-width:0"><div style="font-family:${CK_COND};font-weight:800;font-size:${u(3.8)};line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.chalk}">${cells.name}</div>` +
    `<div style="font-family:${CK_SANS};font-size:${u(1.8)};line-height:1.3;margin-top:${u(0.4)};color:${C.chalk2}">${cells.note}</div></div>` +
    `<div style="flex:none;font-family:${CK_COND};font-weight:900;font-size:${u(5)};line-height:1;color:${C.pt}">${cells.figure}</div>` +
    `</div>`
  );
}

/** A stat cell (trading card / player spotlight): value over a small label. */
export function statCell(u: Unit, value: string, label: string): string {
  return (
    `<div style="flex:1;min-width:0;background:${C.panel};border-top:${u(0.4)} solid ${C.p};padding:${u(1)} ${u(0.8)};text-align:center">` +
    `<div style="font-family:${CK_COND};font-weight:800;font-size:${u(3)};line-height:1;color:${C.chalk}">${value}</div>` +
    `<div style="font-family:${CK_MONO};font-weight:500;font-size:${u(1.1)};letter-spacing:.12em;text-transform:uppercase;margin-top:${u(0.5)};color:${C.chalk2}">${label}</div>` +
    `</div>`
  );
}

/**
 * Trading-card inner frame: a 5:7 card with a primary border, rotated −3°,
 * with the photo, a top trim strip, the cap tile, crest, name, role and a
 * 4-up stat grid.
 */
export function tradingFrame(
  u: Unit,
  cells: {
    photo: string;
    crest: string;
    cap: string;
    name: string;
    role: string;
    stats: Array<{ value: string; label: string }>;
  },
): string {
  return (
    `<div style="width:${u(46)};aspect-ratio:5/7;padding:${u(1.2)};background:${C.p};transform:rotate(-3deg);box-shadow:0 ${u(3)} ${u(6)} ${u(-2)} rgba(0,0,0,.6);box-sizing:border-box;flex:none">` +
    `<div style="position:relative;width:100%;height:100%;overflow:hidden;background:linear-gradient(160deg,${C.base2},${C.s})">` +
    `<div style="position:absolute;inset:0">${cells.photo}</div>` +
    `<div style="position:absolute;inset:0;background:linear-gradient(0deg,${C.base} 0%,transparent 55%)"></div>` +
    `<div style="position:absolute;left:0;right:0;top:0;height:${u(2.4)};display:flex"><div style="flex:3;background:${C.s}"></div><div style="flex:1;background:${C.chalk}"></div><div style="flex:3;background:${C.s}"></div></div>` +
    `<div style="position:absolute;left:${u(2)};top:${u(4)};font-family:${CK_COND};font-weight:900;font-size:${u(3.6)};line-height:1;padding:${u(0.4)} ${u(1)};background:${C.s};color:${C.chalk}">${cells.cap}</div>` +
    `<div style="position:absolute;right:${u(2)};top:${u(3.6)};width:${u(7)};height:${u(7)}">${cells.crest}</div>` +
    `<div style="position:absolute;left:${u(2)};right:${u(2)};bottom:${u(2)}">` +
    `<div style="font-family:${CK_COND};font-weight:900;font-size:${u(5.4)};line-height:.9;text-transform:uppercase;color:${C.chalk};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${cells.name}</div>` +
    `<div style="font-family:${CK_MONO};font-weight:600;font-size:${u(1.3)};letter-spacing:.14em;text-transform:uppercase;margin-top:${u(0.8)};color:${C.pt}">${cells.role}</div>` +
    `<div style="display:flex;gap:${u(0.6)};margin-top:${u(1.4)}">${cells.stats.map((s) => statCell(u, s.value, s.label)).join("")}</div>` +
    `</div></div></div>`
  );
}
