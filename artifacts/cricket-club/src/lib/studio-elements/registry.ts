/**
 * Studio element library (Club Kit plan U6–U7).
 *
 * Every visual building block of the Club Kit pack, insertable into ANY card
 * in the Studio editor — a blank canvas or on top of any pack — as a free
 * layer of kind `"element"`. Each element renders through the SAME part
 * function the pack templates use (`pack-templates/club-kit/parts.ts`), scaled
 * into the layer's own box, so an inserted element matches the pack exactly.
 *
 * Element html is trusted repo code. User input reaches it only as props:
 * text (escaped here) and newline-separated row lists (each cell escaped).
 * Colours come from the `--ck-*` palette the overlay carries, derived from the
 * club's brand — so every element is in the club's colours on every pack.
 */

import type { CardSize } from "../share-card";
import { escapeHtml } from "../pack-render/html-utils";
import {
  C,
  CK_COND,
  CK_SANS,
  background,
  clubLockup,
  display,
  eyebrow,
  gfPanel,
  gradeRow,
  hashtagBlock,
  juniorRow,
  kindChip,
  leaderRow,
  meta,
  monogram,
  premStars,
  scoreBars,
  sideFrame,
  statCell,
  supportedBy,
  topFrame,
  tradingFrame,
  tricolourDash,
  twoLineTitle,
  watermark,
  xiList,
  xiRow,
  type Unit,
} from "../pack-templates/club-kit/parts";

export type ElementCategory =
  "frames" | "brand" | "headlines" | "match" | "lists" | "collectables" | "premiership" | "juniors";

export const ELEMENT_CATEGORIES: ReadonlyArray<{ id: ElementCategory; label: string }> = [
  { id: "frames", label: "Backgrounds & frames" },
  { id: "brand", label: "Brand" },
  { id: "headlines", label: "Headlines" },
  { id: "match", label: "Match data" },
  { id: "lists", label: "Leaders & lists" },
  { id: "collectables", label: "Collectables" },
  { id: "premiership", label: "Premiership" },
  { id: "juniors", label: "Juniors" },
];

/** An editable element prop. `rows` props hold one row per line, cells split by `|`. */
export interface ElementProp {
  key: string;
  label: string;
  kind: "text" | "rows" | "image";
  sample: string;
  /** A card field this prop follows while the user has not edited it (live data). */
  bind?: string;
  /** For `rows`: the cell names, for the editor hint. */
  cells?: string[];
}

/** What an element renders with. */
export interface ElementContext {
  /** Card field values (live data). */
  values: Record<string, string>;
  /** Card repeat rows (live lists), by repeat key. */
  rows: Record<string, Array<Record<string, string>>>;
  /** The club's crest url, when it has one. */
  crestUrl?: string | null;
}

export interface ElementDef {
  id: string;
  category: ElementCategory;
  label: string;
  keywords: string;
  /** The element's design size in card cqmin (sets its scale and aspect). */
  design: { w: number; h: number };
  props: ElementProp[];
  /** Box (percent of the artboard) an inserted element starts in, per format. */
  defaultBox(size: CardSize): { x: number; y: number; w: number; h: number };
  /** Render with resolved (already escaped) props. `u` scales into the box. */
  render(u: Unit, p: Record<string, string>, ctx: ElementContext): string;
  /** Card repeat that feeds a `rows` prop, and how a live row maps to cells. */
  liveRows?: { prop: string; repeat: string; cells(row: Record<string, string>): string[] };
}

/** Parse a `rows` prop: one row per line, cells split by `|`, trimmed. */
export function parseRows(text: string, max: number): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((l) => l.split("|").map((c) => c.trim()));
}

/** "Riley Thompson" → "Riley T." (juniors privacy: first name + initial only). */
export function juniorName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1].replace(/\.$/, "");
  return `${parts[0]} ${last[0]?.toUpperCase() ?? ""}.`;
}

/** A centred box of the element's design aspect within the card. */
function box(
  size: CardSize,
  design: { w: number; h: number },
  at: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const dims = {
    square: [100, 100],
    portrait: [100, 125],
    story: [100, 177.8],
    landscape: [190.5, 100],
  }[size];
  const w = Math.min(90, (design.w / dims[0]) * 100);
  const h = Math.min(90, (design.h / dims[1]) * 100);
  return { x: Math.min(100 - w, at.x), y: Math.min(100 - h, at.y), w, h };
}

const fill = () => ({ x: 0, y: 0, w: 100, h: 100 });

function crestHtml(ctx: ElementContext, mono: string, size: number, u: Unit): string {
  return ctx.crestUrl
    ? `<img src="${escapeHtml(ctx.crestUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block" />`
    : monogram(u, mono, size);
}

function photoHtml(url: string): string {
  return url
    ? `<img src="${url}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block" />`
    : "";
}

const T = (key: string, label: string, sample: string, bind?: string): ElementProp => ({
  key,
  label,
  kind: "text",
  sample,
  ...(bind ? { bind } : {}),
});

const R = (key: string, label: string, cells: string[], sample: string): ElementProp => ({
  key,
  label,
  kind: "rows",
  cells,
  sample,
});

const IMG = (key: string, label: string): ElementProp => ({
  key,
  label,
  kind: "image",
  sample: "",
});

export const ELEMENTS: readonly ElementDef[] = [
  // ------------------------------------------------------------ frames
  {
    id: "ck.background",
    category: "frames",
    label: "Club background",
    keywords: "background gradient glow base",
    design: { w: 100, h: 100 },
    props: [],
    defaultBox: fill,
    render: () => background(),
  },
  {
    id: "ck.frame-side",
    category: "frames",
    label: "Photo frame — diagonal (side)",
    keywords: "photo frame trim jumper stripe diagonal side",
    design: { w: 50, h: 100 },
    props: [IMG("photo", "Photo")],
    defaultBox: (s) => ({
      x: s === "landscape" ? 55 : 50,
      y: 0,
      w: s === "landscape" ? 45 : 50,
      h: 100,
    }),
    render: (u, p) => sideFrame(u, photoHtml(p.photo), u(4), `calc(100cqw - ${u(4)})`),
  },
  {
    id: "ck.frame-top",
    category: "frames",
    label: "Photo frame — sloped (top)",
    keywords: "photo frame trim jumper stripe top slope",
    design: { w: 100, h: 46 },
    props: [IMG("photo", "Photo")],
    defaultBox: (s) => ({ x: 0, y: 0, w: 100, h: s === "story" ? 46 : s === "portrait" ? 31 : 40 }),
    render: (u, p) => topFrame(u, `calc(100cqh - ${u(4)})`, photoHtml(p.photo)),
  },
  {
    id: "ck.trim",
    category: "frames",
    label: "Jumper-trim stripes",
    keywords: "trim stripes jumper diagonal",
    design: { w: 20, h: 100 },
    props: [],
    defaultBox: (s) => ({ x: s === "landscape" ? 70 : 60, y: 0, w: 20, h: 100 }),
    render: (u) =>
      sideFrame(u, "", u(4), `calc(100cqw - ${u(4)})`).replace(
        /<div data-ck-frame="side"[\s\S]*$/,
        "",
      ),
  },
  {
    id: "ck.watermark",
    category: "frames",
    label: "Crest watermark",
    keywords: "crest logo watermark faint",
    design: { w: 70, h: 70 },
    props: [T("monogram", "Monogram (no crest)", "YC", "clubMonogram")],
    defaultBox: (s) => box(s, { w: 70, h: 70 }, { x: 0, y: 40 }),
    render: (u, p, ctx) =>
      watermark(u, crestHtml(ctx, p.monogram, 70, u)).replace(
        /left:[^;]+;bottom:[^;]+;/,
        "left:0;bottom:0;",
      ),
  },
  // ------------------------------------------------------------ brand
  {
    id: "ck.crest",
    category: "brand",
    label: "Crest (or monogram)",
    keywords: "crest logo monogram badge",
    design: { w: 10, h: 10 },
    props: [T("monogram", "Monogram (no crest)", "YC", "clubMonogram")],
    defaultBox: (s) => box(s, { w: 10, h: 10 }, { x: 6, y: 6 }),
    render: (u, p, ctx) => crestHtml(ctx, p.monogram, 10, u),
  },
  {
    id: "ck.club-lockup",
    category: "brand",
    label: "Club name lockup",
    keywords: "club name tagline header",
    design: { w: 44, h: 10 },
    props: [
      T("monogram", "Monogram (no crest)", "YC", "clubMonogram"),
      T("name", "Club name", "YOUR CLUB", "clubName"),
      T("tagline", "Tagline", "CRICKET CLUB · EST. YYYY", "clubTagline"),
    ],
    defaultBox: (s) => box(s, { w: 44, h: 10 }, { x: 6, y: 6 }),
    render: (u, p, ctx) =>
      `<div style="display:flex;align-items:center;gap:${u(2)};height:100%"><div style="width:${u(10)};height:${u(10)};flex:none">${crestHtml(ctx, p.monogram, 10, u)}</div>${clubLockup(u, p.name, p.tagline, false)}</div>`,
  },
  {
    id: "ck.kind-chip",
    category: "brand",
    label: "Card-type chip",
    keywords: "chip label kind tag",
    design: { w: 16, h: 5 },
    props: [T("label", "Label", "RESULT")],
    defaultBox: (s) => box(s, { w: 16, h: 5 }, { x: 78, y: 6 }),
    render: (u, p) =>
      `<div style="display:flex;justify-content:flex-end">${kindChip(u, p.label)}</div>`,
  },
  {
    id: "ck.tricolour-rule",
    category: "brand",
    label: "Tricolour rule",
    keywords: "rule line stripe tricolour divider",
    design: { w: 88, h: 0.8 },
    props: [],
    defaultBox: (s) => ({ x: 6, y: s === "story" ? 90 : 86, w: 88, h: 1 }),
    render: () =>
      `<div style="display:flex;gap:1.2%;height:100%;width:100%"><div style="flex:6;background:${C.p}"></div><div style="flex:1;background:${C.chalk}"></div><div style="flex:3;background:${C.s}"></div></div>`,
  },
  {
    id: "ck.hashtag",
    category: "brand",
    label: "Hashtag block",
    keywords: "hashtag tag footer",
    design: { w: 18, h: 4.2 },
    props: [T("text", "Hashtag", "#YOURCLUB", "clubHashtag")],
    defaultBox: (s) => box(s, { w: 18, h: 4.2 }, { x: 76, y: 90 }),
    render: (u, p) =>
      `<div style="display:flex;justify-content:flex-end">${hashtagBlock(u, p.text)}</div>`,
  },
  {
    id: "ck.sponsor-strip",
    category: "brand",
    label: "Sponsor strip",
    keywords: "sponsor supported by partners footer",
    design: { w: 50, h: 4 },
    props: [
      T("label", "Label", "SUPPORTED BY"),
      T("names", "Sponsors", "Your Sponsor", "sponsorPresentedBy"),
    ],
    defaultBox: (s) => box(s, { w: 50, h: 4 }, { x: 6, y: 90 }),
    render: (u, p) =>
      `<div style="display:flex;align-items:center;gap:${u(1.4)};height:100%">${supportedBy(u, p.label)}<span style="font-family:${CK_SANS};font-weight:700;font-size:${u(2)};white-space:nowrap;color:${C.chalk}">${p.names}</span></div>`,
  },
  // ------------------------------------------------------------ headlines
  {
    id: "ck.eyebrow",
    category: "headlines",
    label: "Eyebrow",
    keywords: "eyebrow label mono kicker",
    design: { w: 48, h: 3 },
    props: [T("text", "Text", "A GRADE · ROUND 14 · HOME")],
    defaultBox: (s) => box(s, { w: 48, h: 3 }, { x: 6, y: 24 }),
    render: (u, p) => eyebrow(u, p.text),
  },
  {
    id: "ck.headline",
    category: "headlines",
    label: "Two-line headline",
    keywords: "headline title game day premiers juniors shine xi",
    design: { w: 48, h: 28 },
    props: [T("top", "First line", "GAME"), T("bottom", "Second line (accent)", "DAY")],
    defaultBox: (s) => box(s, { w: 48, h: 28 }, { x: 6, y: 28 }),
    render: (u, p) => twoLineTitle(u, p.top, p.bottom, 14),
  },
  {
    id: "ck.result-word",
    category: "headlines",
    label: "Result word (WIN / LOSS)",
    keywords: "win loss draw result headline",
    design: { w: 48, h: 20 },
    props: [T("text", "Word", "WIN", "resultWord")],
    defaultBox: (s) => box(s, { w: 48, h: 20 }, { x: 6, y: 28 }),
    render: (u, p) => display(u, p.text, 24, `;line-height:.8;color:${C.pt}`),
  },
  {
    id: "ck.big-number",
    category: "headlines",
    label: "Milestone number",
    keywords: "milestone number stat big 1000",
    design: { w: 48, h: 32 },
    props: [
      T("value", "Number", "1,000", "currentValue"),
      T("label", "Stat label", "CLUB RUNS", "milestoneLabel"),
    ],
    defaultBox: (s) => box(s, { w: 48, h: 32 }, { x: 6, y: 26 }),
    render: (u, p) =>
      display(u, p.value, 23, `;line-height:.82;letter-spacing:-.01em;color:${C.pt}`) +
      `<div style="display:flex;align-items:center;gap:${u(2)};margin-top:${u(1.4)}">${tricolourDash(u)}${display(u, p.label, 6, "", 800)}</div>`,
  },
  {
    id: "ck.player-name",
    category: "headlines",
    label: "Player name",
    keywords: "player name big",
    design: { w: 48, h: 18 },
    props: [T("name", "Name", "SAMPLE PLAYER", "playerName")],
    defaultBox: (s) => box(s, { w: 48, h: 18 }, { x: 6, y: 58 }),
    render: (u, p) => display(u, p.name, 9, ";line-height:.9"),
  },
  {
    id: "ck.meta",
    category: "headlines",
    label: "Supporting line",
    keywords: "meta caption sentence sub",
    design: { w: 48, h: 6 },
    props: [T("text", "Text", "Cap 242 · A Grade · 48 matches")],
    defaultBox: (s) => box(s, { w: 48, h: 6 }, { x: 6, y: 76 }),
    render: (u, p) => meta(u, p.text),
  },
  // ------------------------------------------------------------ match
  {
    id: "ck.score-bars",
    category: "match",
    label: "Score bars",
    keywords: "score bars result home away innings",
    design: { w: 48, h: 16 },
    props: [
      T("homeName", "Club", "YOUR CLUB", "club.name"),
      T("homeScore", "Club score", "6/214", "club.score"),
      T("homeOvers", "Club overs", "50 OV", "club.oversLabel"),
      T("awayName", "Opposition", "OPPOSITION", "opposition.name"),
      T("awayScore", "Opposition score", "188", "opposition.score"),
      T("awayOvers", "Opposition overs", "47.2 OV", "opposition.oversLabel"),
    ],
    defaultBox: (s) => box(s, { w: 48, h: 16 }, { x: 6, y: 48 }),
    render: (u, p) =>
      scoreBars(
        u,
        { name: p.homeName, score: p.homeScore, overs: p.homeOvers },
        { name: p.awayName, score: p.awayScore, overs: p.awayOvers },
      ),
  },
  {
    id: "ck.result-line",
    category: "match",
    label: "Margin + performers",
    keywords: "margin won by performers result",
    design: { w: 48, h: 9 },
    props: [
      T("margin", "Margin", "WON BY 26 RUNS", "result"),
      T("performers", "Top performers", "B. Anderson 87 · B. Allen 4/31", "club.performers"),
    ],
    defaultBox: (s) => box(s, { w: 48, h: 9 }, { x: 6, y: 66 }),
    render: (u, p) =>
      `<div style="font-family:${CK_COND};font-weight:700;font-size:${u(4.2)};line-height:1.05;text-transform:uppercase;color:${C.chalk}">${p.margin}</div>` +
      `<div style="font-family:${CK_SANS};font-weight:700;font-size:${u(2)};margin-top:${u(1)};color:${C.chalk}">${p.performers}</div>`,
  },
  {
    id: "ck.stat-cells",
    category: "match",
    label: "Stat cells",
    keywords: "stats cells grid numbers",
    design: { w: 46, h: 6 },
    props: [
      R(
        "stats",
        "Stats",
        ["value", "label"],
        "48 | Matches\n1,294 | Runs\n61 | Wickets\n29.8 | Average",
      ),
    ],
    defaultBox: (s) => box(s, { w: 46, h: 6 }, { x: 6, y: 70 }),
    render: (u, p) =>
      `<div style="display:flex;gap:${u(0.8)};width:100%">${parseRows(p.stats, 4)
        .map((r) => statCell(u, r[0] ?? "", r[1] ?? ""))
        .join("")}</div>`,
  },
  // ------------------------------------------------------------ lists
  {
    id: "ck.leader-rows",
    category: "lists",
    label: "Leader rows with bars",
    keywords: "leaders leaderboard rows bars top performers",
    design: { w: 48, h: 37 },
    props: [
      R(
        "rows",
        "Leaders",
        ["rank", "name", "value"],
        "1 | Sample Player | 512\n2 | Second Player | 438\n3 | Third Player | 401\n4 | Fourth Player | 356\n5 | Fifth Player | 322",
      ),
    ],
    liveRows: {
      prop: "rows",
      repeat: "leaders",
      cells: (r) => [r.gradeLabel ?? "", r.playerName ?? "", r.value ?? ""],
    },
    defaultBox: (s) => box(s, { w: 48, h: 37 }, { x: 6, y: 40 }),
    render: (u, p) => {
      const rows = parseRows(p.rows, 8);
      const nums = rows.map((r) => parseFloat((r[2] ?? "").replace(/,/g, "")) || 0);
      const best = Math.max(0, ...nums);
      return rows
        .map((r, i) =>
          leaderRow(u, best > 0 && nums[i] === best, {
            rank: r[0] ?? "",
            name: r[1] ?? "",
            value: r[2] ?? "",
            pct: `${best > 0 ? Math.round((nums[i] / best) * 100) : 0}%`,
          }),
        )
        .join("");
    },
  },
  {
    id: "ck.grade-rows",
    category: "lists",
    label: "Game-day grade rows",
    keywords: "game day fixtures grades round rows",
    design: { w: 48, h: 34 },
    props: [
      R(
        "rows",
        "Fixtures",
        ["grade", "opponent", "venue", "time"],
        "A | v Opposition | Home Oval | 1:00\nB | v Opposition | Away Park | 1:00\nC | v Opposition | Home Oval 2 | 12:30\nF | v Opposition | Away Reserve | 9:00",
      ),
    ],
    defaultBox: (s) => box(s, { w: 48, h: 34 }, { x: 6, y: 44 }),
    render: (u, p) =>
      parseRows(p.rows, 5)
        .map((r) =>
          gradeRow(u, {
            grade: r[0] ?? "",
            opponent: r[1] ?? "",
            venue: r[2] ?? "",
            time: r[3] ?? "",
          }),
        )
        .join(""),
  },
  {
    id: "ck.xi-list",
    category: "lists",
    label: "Team XI list",
    keywords: "team list xi selection squad players",
    design: { w: 48, h: 34 },
    props: [
      R(
        "rows",
        "Players",
        ["no.", "name", "tag"],
        "1 | Player One | \n2 | Player Two | (c)\n3 | Player Three | \n4 | Player Four | \n5 | Player Five | wk\n6 | Player Six | \n7 | Player Seven | \n8 | Player Eight | \n9 | Player Nine | \n10 | Player Ten | \n11 | Player Eleven | \n12 | Player Twelve | 12th",
      ),
    ],
    liveRows: {
      prop: "rows",
      repeat: "players",
      cells: (r) => [r.number ?? "", r.surname ?? "", r.role ? `(${r.role})` : ""],
    },
    defaultBox: (s) => box(s, { w: 48, h: 34 }, { x: 6, y: 44 }),
    render: (u, p) =>
      xiList(
        u,
        parseRows(p.rows, 12)
          .map((r) => xiRow(u, { n: r[0] ?? "", name: r[1] ?? "", tag: r[2] ?? "" }))
          .join(""),
      ),
  },
  // ------------------------------------------------------------ collectables
  {
    id: "ck.trading-card",
    category: "collectables",
    label: "Trading card",
    keywords: "trading card collectable player cap stats",
    design: { w: 50, h: 68 },
    props: [
      IMG("photo", "Card photo"),
      T("monogram", "Monogram (no crest)", "YC", "clubMonogram"),
      T("cap", "Cap", "#242"),
      T("name", "Name", "SAMPLE PLAYER", "playerName"),
      T("role", "Role", "BATTING ALL-ROUNDER"),
      R("stats", "Stats", ["value", "label"], "48 | M\n1,294 | Runs\n61 | Wkts\n29.8 | Avg"),
    ],
    defaultBox: (s) => box(s, { w: 50, h: 68 }, { x: 25, y: 16 }),
    render: (u, p, ctx) =>
      `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">${tradingFrame(
        u,
        {
          photo: photoHtml(p.photo),
          crest: crestHtml(ctx, p.monogram, 7, u),
          cap: p.cap,
          name: p.name,
          role: p.role,
          stats: parseRows(p.stats, 4).map((r) => ({ value: r[0] ?? "", label: r[1] ?? "" })),
        },
      )}</div>`,
  },
  // ------------------------------------------------------------ premiership
  {
    id: "ck.prem-stars",
    category: "premiership",
    label: "Premiership stars",
    keywords: "stars premiers flag",
    design: { w: 14, h: 4 },
    props: [T("count", "Stars (1–5)", "3")],
    defaultBox: (s) => box(s, { w: 14, h: 4 }, { x: 6, y: 34 }),
    render: (u, p) => premStars(u, Math.max(1, Math.min(5, parseInt(p.count, 10) || 3))),
  },
  {
    id: "ck.premiers-lockup",
    category: "premiership",
    label: "PREMIERS lockup",
    keywords: "premiers champions flag season",
    design: { w: 48, h: 22 },
    props: [T("word", "Word", "PREMIERS"), T("line", "Season line", "2025/26 A GRADE")],
    defaultBox: (s) => box(s, { w: 48, h: 22 }, { x: 6, y: 40 }),
    render: (u, p) =>
      display(u, p.word, 14.5, `;line-height:.8;color:${C.pt}`) +
      display(u, p.line, 6, `;margin-top:${u(1)}`, 800),
  },
  {
    id: "ck.gf-panel",
    category: "premiership",
    label: "Grand-final panel",
    keywords: "grand final panel score premiers",
    design: { w: 48, h: 14 },
    props: [
      T("venue", "Venue", "GRAND FINAL · HOME OVAL", "competition"),
      T("score", "Score line", "Your Club 5/176 def Opposition 142", "result"),
      T("potf", "Player of the final", "Player of the final · Sample Player", "mom"),
    ],
    defaultBox: (s) => box(s, { w: 48, h: 14 }, { x: 6, y: 66 }),
    render: (u, p) => gfPanel(u, { venue: p.venue, score: p.score, potf: p.potf }),
  },
  // ------------------------------------------------------------ juniors
  {
    id: "ck.junior-rows",
    category: "juniors",
    label: "Junior highlight rows",
    keywords: "juniors highlights shine kids",
    design: { w: 48, h: 26 },
    props: [
      R(
        "rows",
        "Highlights",
        ["name", "note", "figure"],
        "Riley T. | Top score | 52*\nAva M. | Best bowling | 3/9\nNoah K. | Run out from the deep | RO",
      ),
    ],
    defaultBox: (s) => box(s, { w: 48, h: 26 }, { x: 6, y: 48 }),
    // Privacy: whatever is typed, only a first name and surname initial print.
    render: (u, p) =>
      parseRows(p.rows, 3)
        .map((r) =>
          juniorRow(u, { name: juniorName(r[0] ?? ""), note: r[1] ?? "", figure: r[2] ?? "" }),
        )
        .join(""),
  },
  {
    id: "ck.junior-privacy",
    category: "juniors",
    label: "Junior privacy note",
    keywords: "juniors privacy consent note",
    design: { w: 60, h: 3 },
    props: [],
    defaultBox: (s) => box(s, { w: 60, h: 3 }, { x: 6, y: 82 }),
    render: (u) =>
      meta(u, "First names and initials only · photos with parent consent", `;font-size:${u(1.8)}`),
  },
];

const BY_ID = new Map(ELEMENTS.map((e) => [e.id, e]));

export function getElement(id: string | undefined): ElementDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function listElements(category?: ElementCategory): readonly ElementDef[] {
  return category ? ELEMENTS.filter((e) => e.category === category) : ELEMENTS;
}

/** Search by label / keywords (case-insensitive, all words must match). */
export function searchElements(query: string): readonly ElementDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ELEMENTS;
  return ELEMENTS.filter((e) => {
    const hay = `${e.label} ${e.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** An element's stored state on a free layer. */
export interface ElementLayerState {
  id: string;
  /** User-edited props (anything absent follows the card / sample). */
  props?: Record<string, string>;
}

/**
 * Render an element layer's inner html: props resolved (edited > live card
 * data > sample), every text value escaped, inside a size container scaled so
 * the element's design fits the box.
 */
export function renderElement(state: ElementLayerState, ctx: ElementContext): string {
  const def = getElement(state.id);
  if (!def) return "";
  const p: Record<string, string> = {};
  for (const prop of def.props) {
    const edited = state.props?.[prop.key];
    let raw: string;
    if (edited !== undefined) raw = edited;
    else if (def.liveRows?.prop === prop.key && ctx.rows[def.liveRows.repeat]?.length) {
      raw = ctx.rows[def.liveRows.repeat].map((r) => def.liveRows!.cells(r).join(" | ")).join("\n");
    } else if (prop.bind && ctx.values[prop.bind]) raw = ctx.values[prop.bind];
    else raw = prop.sample;
    if (prop.kind === "image") {
      p[prop.key] = /^(https?:|data:image\/|\/)/.test(raw) ? escapeHtml(raw) : "";
    } else if (prop.kind === "rows") {
      // Escape each cell but keep the line / cell structure for parseRows.
      p[prop.key] = raw
        .split(/\r?\n/)
        .map((l) =>
          l
            .split("|")
            .map((c) => escapeHtml(c))
            .join("|"),
        )
        .join("\n");
    } else {
      p[prop.key] = escapeHtml(raw);
    }
  }
  const d = Math.min(def.design.w, def.design.h) || 1;
  const u: Unit = (n) => `calc(${n} * 100cqmin / ${d})`;
  return `<div data-element="${escapeHtml(def.id)}" style="position:relative;width:100%;height:100%;container-type:size">${def.render(u, p, ctx)}</div>`;
}
