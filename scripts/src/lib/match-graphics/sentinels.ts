/**
 * What the converter draws the Ovation Match Graphics components with (plan
 * 2026-10-23, M2, M5, M9): sentinel data whose every text field shows the
 * page token it binds (`[[innings1.team]]`), whose rows hold unique real
 * looking values, whose images name their slot, and whose colours come in two
 * palettes, so a colour that moves with them is a `--mt-*` token.
 *
 * Palette A has the first-innings side winning and palette B the second, so a
 * colour the design reads from `winner` (a result fill, Classic's stripes)
 * tells itself apart from one it reads from an innings' team.
 */
import {
  MATCH_COMP_SLOTS,
  MATCH_TEAM_ROLES,
  MATCH_TEAM_SLOTS,
  matchTokenColour,
  matchTokenName,
  type MatchColours,
  type MatchTeamColours,
} from "@workspace/scorecard/match-palette";
import { fieldMarker } from "@workspace/scorecard/pack-capture";

export type Palette = "A" | "B";

/** An image sentinel: a tiny SVG whose data URL names its slot (`sentinel:innings1.logo`). */
export function sentinelImage(slot: string, fill = "#7f7f7f"): string {
  // Double quotes: encoded, they keep the URL whole for the walker's `sentinel:` match.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><!-- sentinel:${slot} --><rect width="100" height="100" fill="${fill}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Sentinel colours for one team's slots: hues no look prints, lightness as
 * the design expects each slot (a dark bar, a bright highlight), so a look's
 * own light-or-dark choices draw the same branch they would for a club.
 */
const TEAM_SLOTS: Record<Palette, Record<"x" | "y", MatchTeamColours>> = {
  A: {
    x: {
      colour: "#b5176f",
      on: "#fdf3f8",
      ondark: "#ef7cbd",
      dark: "#4b0b2f",
      bright: "#f6ec57",
      sec: "#f1e3cf",
      onsec: "#2a1407",
    },
    y: {
      colour: "#d9771c",
      on: "#160b02",
      ondark: "#f2a057",
      dark: "#18324f",
      bright: "#9be3ff",
      sec: "#243a1d",
      onsec: "#c9f27a",
    },
  },
  B: {
    x: {
      colour: "#2b7fd3",
      on: "#f2f8fe",
      ondark: "#7cbaf5",
      dark: "#0f2c4d",
      bright: "#ffd23c",
      sec: "#e6f0d8",
      onsec: "#122a06",
    },
    y: {
      colour: "#3aa35b",
      on: "#03140a",
      ondark: "#7fd89b",
      dark: "#3d1846",
      bright: "#ffb4e9",
      sec: "#45200b",
      onsec: "#f7c27a",
    },
  },
};

const COMP: Record<Palette, MatchColours["comp"]> = {
  A: { colour: "#7a1c8c", accent: "#46c9b4" },
  B: { colour: "#8c5a1c", accent: "#c94676" },
};

/** The palette's colours by role: innings 1 is `x`; A has `x` win, B has `y` win. */
export function sentinelColours(palette: Palette): MatchColours {
  const { x, y } = TEAM_SLOTS[palette];
  const xWins = palette === "A";
  return {
    i1: x,
    i2: y,
    win: xWins ? x : y,
    lose: xWins ? y : x,
    comp: COMP[palette],
  };
}

/** The shade steps the looks use (`shade(hex, ±t)`), and the alphas they draw colours at. */
export const SHADES = [
  0, 0.03, 0.06, 0.08, 0.09, 0.1, 0.12, 0.15, 0.18, 0.2, 0.25, 0.3, 0.32, 0.35, 0.4, 0.45, 0.5,
].flatMap((t) => (t === 0 ? [0] : [t, -t]));
export const ALPHAS = [
  1, 0.05, 0.08, 0.1, 0.12, 0.15, 0.16, 0.18, 0.2, 0.22, 0.25, 0.28, 0.3, 0.35, 0.4, 0.45, 0.5,
  0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
];

/** Every `--mt-*` token a look may draw, with its colour in `palette`. */
export function candidateTokens(palette: Palette): Record<string, string> {
  const colours = sentinelColours(palette);
  const out: Record<string, string> = {};
  const add = (role: Parameters<typeof matchTokenName>[0], slot: string) => {
    for (const shade of SHADES)
      for (const alpha of ALPHAS) {
        const name = matchTokenName(role, slot, shade, alpha);
        const c = matchTokenColour(colours, name);
        if (c) out[name] = c;
      }
  };
  for (const role of MATCH_TEAM_ROLES) for (const slot of MATCH_TEAM_SLOTS) add(role, slot);
  for (const slot of MATCH_COMP_SLOTS) add("comp", slot);
  return out;
}

// ── The match ────────────────────────────────────────────────────────────────

const m = fieldMarker;

/** A team's TeamTokens as the design system takes them, its text and logo marked. */
function teamTokens(n: 1 | 2, id: string, colours: MatchTeamColours) {
  return {
    id,
    name: m(`innings${n}.team`),
    short: m(`innings${n}.short`),
    colour: colours.colour,
    onColour: colours.on,
    colourOnDark: colours.ondark,
    dark: colours.dark,
    bright: colours.bright,
    secondary: colours.sec,
    onSecondary: colours.onsec,
    logo: sentinelImage(`innings${n}.logo`),
    logoOnDark: sentinelImage(`innings${n}.logo`),
  };
}

/** The design's TeamTokens for both sides, in a palette. */
export function sentinelTeams(palette: Palette): Record<string, unknown> {
  const { x, y } = TEAM_SLOTS[palette];
  return { X: teamTokens(1, "X", x), Y: teamTokens(2, "Y", y) };
}

/**
 * The competition (decision M8): its name is the grade, its association
 * the club's name, its logo the club's crest.
 */
export function sentinelCompetition(palette: Palette) {
  return {
    name: m("competition"),
    association: m("clubName"),
    logo: sentinelImage("clubLogo"),
    colour: COMP[palette].colour,
    accent: COMP[palette].accent,
  };
}

/** One innings' batters and bowlers: unique names and figures, so each row is found again. */
const BATTING: Array<Array<{ name: string; runs: number; balls: number; notOut?: boolean }>> = [
  [
    { name: "Aldo Brennick", runs: 87, balls: 131 },
    { name: "Corin Delvaux", runs: 54, balls: 77 },
    { name: "Ewan Fairleigh", runs: 39, balls: 48, notOut: true },
    { name: "Gideon Halvorsen", runs: 17, balls: 26 },
  ],
  [
    { name: "Ira Jessamine", runs: 92, balls: 104, notOut: true },
    { name: "Kip Lindqvist", runs: 63, balls: 58 },
    { name: "Milo Northcote", runs: 28, balls: 35 },
    { name: "Otis Pemberton", runs: 11, balls: 19 },
  ],
];
const BOWLING: Array<Array<{ name: string; wickets: number; runs: number; overs: string }>> = [
  [
    { name: "Quill Rasmussen", wickets: 4, runs: 31, overs: "9.2" },
    { name: "Silas Thornbury", wickets: 3, runs: 44, overs: "8.4" },
    { name: "Ulric Vantongeren", wickets: 2, runs: 27, overs: "7" },
    { name: "Wade Xenakis", wickets: 1, runs: 36, overs: "6" },
  ],
  [
    { name: "Yuri Zabrowski", wickets: 5, runs: 22, overs: "8.3" },
    { name: "Abel Bramwell", wickets: 2, runs: 39, overs: "9" },
    { name: "Cyrus Dunmore", wickets: 1, runs: 47, overs: "7.1" },
    { name: "Dov Eastwick", wickets: 1, runs: 58, overs: "5" },
  ],
];

/** The match: markers for every field, real rows, and the winner by palette. */
export function sentinelMatch(palette: Palette) {
  return {
    home: "X",
    away: "Y",
    grade: m("competition"),
    venue: m("venue"),
    date: m("date"),
    winner: palette === "A" ? "X" : "Y",
    result: m("result"),
    innings: [1, 2].map((n) => ({
      team: n === 1 ? "X" : "Y",
      overs: m(`innings${n}.overs`),
      // Rewritten to `[[inningsN.score]]` (W/R) or `[[inningsN.scoreDash]]` (W-R) after capture.
      runs: m(`innings${n}.runs`),
      wickets: m(`innings${n}.wickets`),
      batting: BATTING[n - 1],
      bowling: BOWLING[n - 1],
    })),
  };
}

/** `[[innings1.wickets]]/[[innings1.runs]]` → `[[innings1.score]]`; with "-", `scoreDash`. */
export function joinScores(text: string): string {
  return text.replace(
    /\[\[innings(\d)\.wickets\]\]\s*([/-])\s*\[\[innings\1\.runs\]\]/g,
    (_all, n: string, sep: string) => m(`innings${n}.${sep === "/" ? "score" : "scoreDash"}`),
  );
}

const initialName = (name: string, sep = " ") => {
  const p = name.split(" ");
  return p.length < 2 ? name : `${p[0]![0]}${sep}${p.slice(1).join(" ")}`;
};
const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;

/** A batting row's values, as `bindInput` gives them (M9). */
function batterValues(b: (typeof BATTING)[number][number]): Record<string, string> {
  return {
    name: b.name,
    initialName: initialName(b.name),
    initialDotName: initialName(b.name, "."),
    surname: surname(b.name),
    runs: `${b.runs}${b.notOut ? "*" : ""}`,
    runsOnly: String(b.runs),
    notOut: b.notOut ? "*" : "",
    balls: String(b.balls),
  };
}

function bowlerValues(b: (typeof BOWLING)[number][number]): Record<string, string> {
  return {
    name: b.name,
    initialName: initialName(b.name),
    initialDotName: initialName(b.name, "."),
    surname: surname(b.name),
    figures: `${b.wickets}/${b.runs}`,
    figuresDash: `${b.wickets}-${b.runs}`,
    overs: b.overs,
  };
}

const prefixed = (prefix: string, row: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [`${prefix}${k[0]!.toUpperCase()}${k.slice(1)}`, v]),
  );

/** How a look lays out its players: two lists per innings, or a batter and a bowler per row. */
export type RowStyle = "lists" | "pairs";

/** The bound rows a capture records, for the converter to find each list again. */
export function sentinelRows(
  style: RowStyle,
): Record<string, Array<{ values: Record<string, string> }>> {
  const out: Record<string, Array<{ values: Record<string, string> }>> = {};
  for (const n of [1, 2] as const) {
    const bat = BATTING[n - 1]!.map(batterValues);
    const bowl = BOWLING[n - 1]!.map(bowlerValues);
    if (style === "lists") {
      out[`innings${n}.batting`] = bat.map((values) => ({ values }));
      out[`innings${n}.bowling`] = bowl.map((values) => ({ values }));
    } else {
      out[`innings${n}.pairs`] = bat.map((b, k) => ({
        values: { ...prefixed("bat", b), ...prefixed("bowl", bowl[k] ?? {}) },
      }));
    }
  }
  return out;
}

// ── The worst case ───────────────────────────────────────────────────────────

/**
 * Long real values for each field: the worst-case render that sizes every text
 * box (the sentinel's short `[[markers]]` would size them too small). The
 * keys are the page tokens, so the converter matches each box to its marker.
 */
export const WORST_FIELDS: Record<string, string> = {
  "innings1.team": "Rockingham-Mandurah",
  "innings1.short": "RMCC",
  "innings2.team": "Baldivis Secret Harbour",
  "innings2.short": "BSHCC",
  competition: "A Grade: Peel Premier Cup",
  // One word: the Ground Scoreboard splits a name of several words over two lines.
  clubName: "Rockinghamshire",
  venue: "Rushton Park Recreation Reserve",
  date: "17 Oct 2026",
  result: "Baldivis Secret Harbour won by 157 runs",
  "innings1.overs": "49.4",
  "innings2.overs": "47.3",
  "innings1.score": "10/168",
  "innings1.scoreDash": "10-168",
  "innings2.score": "9/325",
  "innings2.scoreDash": "9-325",
};

/**
 * Text with each field's long value put back as its marker, longest first and
 * only where it stands alone (`50` in `50`, not in `150`): what turns the
 * real-text render into a sentinel capture with the real layout.
 */
export function markFields(text: string): string {
  let out = text;
  for (const [key, value] of Object.entries(WORST_FIELDS).sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![A-Za-z0-9.])${esc}(?![A-Za-z0-9])`, "g"), fieldMarker(key));
  }
  return out;
}

/**
 * The render the captures are made from: long real values (so grids and flex
 * rows lay out as they do for a real match), in a palette's colours.
 */
export function worstProps(palette: Palette = "A"): {
  teams: Record<string, unknown>;
  match: Record<string, unknown>;
  competition: Record<string, unknown>;
} {
  const teams = sentinelTeams(palette) as Record<string, Record<string, unknown>>;
  for (const [id, n] of [
    ["X", 1],
    ["Y", 2],
  ] as const) {
    teams[id]!.name = WORST_FIELDS[`innings${n}.team`];
    teams[id]!.short = WORST_FIELDS[`innings${n}.short`];
  }
  const match = sentinelMatch(palette) as Record<string, unknown> & {
    innings: Array<Record<string, unknown>>;
  };
  match.grade = WORST_FIELDS.competition;
  match.venue = WORST_FIELDS.venue;
  match.date = WORST_FIELDS.date;
  match.result = WORST_FIELDS.result;
  match.innings.forEach((inn, i) => {
    const [w, r] = WORST_FIELDS[`innings${i + 1}.score`]!.split("/");
    inn.wickets = Number(w);
    inn.runs = Number(r);
    inn.overs = WORST_FIELDS[`innings${i + 1}.overs`];
  });
  const competition = {
    ...sentinelCompetition(palette),
    name: WORST_FIELDS.competition,
    association: WORST_FIELDS.clubName,
  };
  return { teams, match, competition };
}
