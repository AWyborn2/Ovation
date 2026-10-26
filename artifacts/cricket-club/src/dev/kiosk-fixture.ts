import type {
  BoardEntry,
  BoardGridRow,
  DisplayBoard,
  HonourDisplayBundle,
} from "@workspace/api-client-react";

/**
 * Sample honour-board data for the dev-only kiosk harness (`/__kiosk-fixture`).
 * Lets the clubroom-TV kiosk be run and checked locally without an admin login
 * or kiosk token. Names are invented; nothing here comes from a real club.
 */

const FIRST = [
  "Shane",
  "Jeff",
  "Ian",
  "Paul",
  "Peter",
  "Mark",
  "Ashley",
  "Wayne",
  "Jamie",
  "Roger",
  "Luke",
  "Ben",
];
const LAST = [
  "Whitfield",
  "Harrington",
  "O'Connell",
  "Pemberton",
  "Castellano",
  "Ashworth",
  "Brennan",
  "Morrissey",
  "Fairbanks",
  "Delaney",
  "Holloway",
  "Rutherford",
  "Kingsley",
  "Galloway",
  "Lindqvist",
  "Prendergast",
];
const GROUNDS = ["Rushton Park", "Peelwood Reserve", "Lakelands Oval", "Meadow Springs"];
const OPPONENTS = ["Rockingham", "Mandurah", "Pinjarra", "Baldivis", "Waroona"];
const GRADES = [
  "First Grade",
  "Second Grade",
  "Third Grade",
  "Fourth Grade",
  "Fifth Grade",
  "Sixth Grade",
  "Colts",
  "Women",
];

const name = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
const season = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const display = (transition: "scroll" | "slide" | "wrap" = "scroll") => ({
  columns: 1,
  transition,
  fit: false,
});

const premierships: DisplayBoard = {
  id: "premierships",
  category: "premierships",
  layout: "premiership",
  title: "Premierships",
  subtitle: "Peel Cricket Association premiership winning sides",
  entries: Array.from({ length: 9 }, (_, i): BoardEntry => {
    const captain = (i * 3) % 11;
    const ours = 150 + ((i * 37) % 90);
    return {
      season: season(2025 - i * 3),
      primaryText: ["A Grade", "B Grade", "C Grade", "Colts"][i % 4]!,
      detail: `Halls Head ${3 + (i % 6)}/${ours} def ${OPPONENTS[i % OPPONENTS.length]} ${ours - 6 - ((i * 13) % 40)}`,
      meta: {
        venue: GROUNDS[i % GROUNDS.length],
        date: `2${i % 9}/03/${2025 - i * 3}`,
        motm: i % 3 === 2 ? null : name(i * 11 + 4),
        captain: name(i * 11 + captain),
        grade: ["A Grade", "B Grade", "C Grade", "Colts"][i % 4],
      },
      squad: Array.from({ length: 11 }, (_, k) => ({
        name: name(i * 11 + k),
        isCaptain: k === captain,
      })),
    };
  }),
  display: display(),
};

// A few cells exercise the season grid's edge cases: joint holders, a note
// under the name, an over-long name and an empty cell.
const championCell = (i: number, g: number): BoardGridRow["cells"][number] => {
  if (i === 1 && g === 0) {
    return { entries: [{ text: name(3) }, { text: name(8), note: "Joint" }] };
  }
  if (i === 2 && g === 1) {
    return { entries: [{ text: "Alexander Montgomery-Fitzwilliam Jnr", note: "Premiers" }] };
  }
  if (i === 3 && g === 3) return { entries: [] };
  return { entries: [{ text: name(i * 5 + g * 3) }] };
};

const championRows: BoardGridRow[] = Array.from({ length: 24 }, (_, i) => ({
  heading: season(2025 - i),
  cells: GRADES.map((_, g) => championCell(i, g)),
}));

const champions: DisplayBoard = {
  id: "club-champions",
  category: "awards",
  layout: "grid",
  title: "Club Champions",
  subtitle: "Awarded to the season's outstanding all-round contributor",
  entries: [],
  grid: { rowHeading: "Season", columnHeadings: GRADES, rows: championRows },
  display: display(),
};

const officeBearers: DisplayBoard = {
  id: "office-bearers",
  category: "committee",
  layout: "grid",
  title: "Office Bearers",
  subtitle: "The committee that ran the club each season",
  entries: [],
  grid: {
    rowHeading: "Season",
    columnHeadings: ["President", "Vice President", "Secretary", "Treasurer"],
    rows: Array.from({ length: 20 }, (_, i) => ({
      heading: season(2025 - i),
      cells: Array.from({ length: 4 }, (_, c) => ({ entries: [{ text: name(i * 2 + c * 9) }] })),
    })),
  },
  display: display("slide"),
};

const battingRecords: DisplayBoard = {
  id: "batting-records",
  category: "records",
  layout: "list",
  title: "Highest Individual Scores",
  subtitle: "All grades",
  entries: Array.from({ length: 30 }, (_, i) => ({
    season: season(2024 - ((i * 3) % 30)),
    primaryText: name(i * 4 + 1),
    detail: `${190 - i * 3}${i % 4 === 1 ? "*" : ""} v ${OPPONENTS[i % OPPONENTS.length]}`,
    meta: { rank: i + 1, grade: GRADES[i % 4] },
  })),
  display: display(),
};

// A season-aligned composite board (several list boards side by side).
const captains: DisplayBoard = {
  id: "captains",
  category: "captains",
  layout: "columns",
  title: "Captains",
  subtitle: "Captain of each senior side",
  entries: [],
  columns: [
    {
      heading: "Season",
      entries: Array.from({ length: 16 }, (_, i) => ({
        primaryText: season(2025 - i),
        season: season(2025 - i),
      })),
    },
    ...GRADES.slice(0, 3).map((g, c) => ({
      heading: g,
      entries: Array.from({ length: 16 }, (_, i) => ({
        primaryText: name(i * 3 + c * 5 + 1),
        season: season(2025 - i),
      })),
    })),
  ],
  display: display("slide"),
};

const lifeMembers: DisplayBoard = {
  id: "life-members",
  category: "life-members",
  layout: "lifeMembers",
  title: "Life Members",
  subtitle: "Honoured for outstanding service to the club",
  entries: Array.from({ length: 18 }, (_, i) => ({
    season: season(2024 - i * 2),
    primaryText: name(i * 3 + 2),
    detail: [
      "Service as president",
      "30 years scoring",
      "Groundsman",
      "Coaching juniors",
      "Treasurer",
    ][i % 5],
  })),
  display: display("slide"),
};

// A career leaderboard (C1): rank, player, figure, seasons.
const mostRuns: DisplayBoard = {
  id: "most_runs",
  category: "most_runs",
  layout: "leaderboard",
  title: "Most Runs",
  subtitle: "Senior career runs for the club, all grades",
  figureLabel: "Runs",
  entries: Array.from({ length: 50 }, (_, i) => {
    const runs = 9840 - i * 160;
    const first = 1984 + ((i * 5) % 25);
    return {
      season: "",
      primaryText: name(i * 3 + 1),
      detail: `${runs} runs`,
      meta: {
        rank: i + 1,
        figure: runs.toLocaleString("en-AU"),
        seasonSpan: `${first}–${String((first + 9 + (i % 7)) % 100).padStart(2, "0")}`,
      },
    };
  }),
  display: display(),
};

// An achievement list (C2): season, player, figure, grade, opponent + tally.
const centuries: DisplayBoard = {
  id: "centuries",
  category: "centuries",
  layout: "achievements",
  title: "Centuries",
  subtitle: "Hundreds for the club",
  figureLabel: "Score",
  tallyLabel: "36 centuries",
  entries: Array.from({ length: 36 }, (_, i) => ({
    season: season(2025 - Math.floor(i * 0.7)),
    primaryText: name(i * 5 + 2),
    detail: `${100 + ((i * 37) % 96)}${i % 4 === 1 ? "*" : ""}`,
    meta: {
      figure: `${100 + ((i * 37) % 96)}${i % 4 === 1 ? "*" : ""}`,
      grade: GRADES[(i * 3) % 4],
      opponent: OPPONENTS[i % OPPONENTS.length],
    },
  })),
  display: display(),
};

export const KIOSK_FIXTURE: HonourDisplayBundle = {
  boards: [
    premierships,
    champions,
    captains,
    officeBearers,
    battingRecords,
    mostRuns,
    centuries,
    lifeMembers,
  ],
  brand: {
    name: "Halls Head Cricket Club",
    shortName: "Halls Head",
    monogram: "HH",
    backgroundColour: "#0e3b2e",
    primaryColour: "#d8b25e",
    juniorsColour: "#0e3b2e",
  },
  settings: {
    defaultTemplate: "p12",
    kioskSequence: [],
    kioskDwellMs: 3500,
    kioskScrollSpeed: 36,
    kioskEndHoldMs: 3000,
    kioskSponsorStrip: false,
    kioskSponsorSlides: false,
    kioskSponsorSlideEvery: 3,
    kioskAds: [],
    // Short timings so a browser check sees every movement quickly.
    kioskLook: { pageSecs: 3, hold: 1, trans: "fade", dur: "M" },
    // One board per movement, with a spread of transitions.
    boardConfigs: {
      premierships: { move: "pages", trans: "flip" },
      "club-champions": { move: "credits", trans: "wipe", speed: 120 },
      captains: { move: "pages", trans: "up" },
      "office-bearers": { move: "pages", trans: "rows", perPage: 8 },
      "batting-records": { move: "fit", trans: "pop" },
      most_runs: { move: "pages", trans: "rows", top: 20 },
      centuries: { move: "credits", trans: "fade", speed: 160 },
      "life-members": { move: "pages", trans: "left", columnsPerScreen: 1 },
    },
    composites: [],
  },
  activeSponsors: [],
};
