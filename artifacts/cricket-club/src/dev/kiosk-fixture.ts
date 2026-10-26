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
      // A full XI plus 12th man: the plaque must show every name at five across.
      squad: Array.from({ length: 12 }, (_, k) => ({
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

// Ten grades on one screen (the dense style): long real-style names and
// full grade headings, to check readability at 1920×1080.
const TEN_GRADES = [
  "First Grade",
  "Second Grade",
  "Third Grade",
  "Fourth Grade",
  "Fifth Grade",
  "Sixth Grade",
  "Women's First Grade",
  "Women's Second Grade",
  "Under 17",
  "Over 40s",
];
const LONG_NAMES = [
  "Jonathan Prendergast",
  "Bartholomew Fairweather",
  "Ashley Hollingsworth",
  "Christopher Vandenberg",
  "Mackenzie O'Donoghue",
  "Sam Lee",
  "Alexandra Whittington",
  "Benjamin Castellanos",
  "Tom Ng",
  "Maximilian Featherstone",
];
const tenGrades: DisplayBoard = {
  id: "ten-grades",
  category: "awards",
  layout: "grid",
  title: "Best and Fairest",
  entries: [],
  grid: {
    rowHeading: "Season",
    columnHeadings: TEN_GRADES,
    rows: Array.from({ length: 12 }, (_, i) => ({
      heading: season(2025 - i),
      cells: TEN_GRADES.map((_, g) => ({
        entries: [{ text: LONG_NAMES[(i + g) % LONG_NAMES.length]! }],
      })),
    })),
  },
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

// Grade record panels (C3): one panel per grade.
const gradeRecords: DisplayBoard = {
  id: "grade_records",
  category: "grade_records",
  layout: "recordPanels",
  title: "Grade Records",
  subtitle: "Leading performances in each grade",
  entries: GRADES.map((g, k) => ({
    season: "",
    primaryText: g,
    lines: [
      { label: "Most Games", value: String(180 - k * 9), holder: name(k * 3) },
      { label: "Most Runs", value: String(6400 - k * 410), holder: name(k * 3 + 4) },
      {
        label: "Highest Score",
        value: `${148 + ((k * 23) % 80)}${k % 2 ? "*" : ""}`,
        holder: name(k * 3 + 7),
      },
      { label: "Most Wickets", value: String(312 - k * 21), holder: name(k * 3 + 9) },
      {
        label: "Best Bowling",
        value: `${7 + (k % 3)}/${12 + ((k * 7) % 30)}`,
        holder: name(k * 3 + 2),
      },
      { label: "Most Catches", value: String(96 - k * 6), holder: name(k * 3 + 5) },
    ],
  })),
  display: display(),
};

// A records table (C4): the highest partnership for each wicket.
const partnershipRecords: DisplayBoard = {
  id: "partnerships_grade:First Grade",
  category: "partnership_records",
  layout: "recordsTable",
  title: "First Grade Partnerships",
  subtitle: "Highest partnership for each wicket",
  figureLabel: "Runs",
  entries: [212, 187, 176, 158, 149, 133, 121, 98, 87, 74].map((runs, i) => ({
    season: season(2024 - i * 3),
    primaryText: `${name(i * 2)} & ${name(i * 2 + 5)}`,
    meta: { wicket: i + 1, figure: String(runs), opponent: OPPONENTS[i % OPPONENTS.length] },
  })),
  display: display(),
};

export const KIOSK_FIXTURE: HonourDisplayBundle = {
  boards: [
    premierships,
    tenGrades,
    champions,
    captains,
    officeBearers,
    battingRecords,
    mostRuns,
    centuries,
    gradeRecords,
    partnershipRecords,
    lifeMembers,
  ],
  brand: {
    name: "Halls Head Cricket Club",
    shortName: "Halls Head",
    monogram: "HH",
    logoUrl: "/placeholder-club-logo.svg",
    backgroundColour: "#0e3b2e",
    primaryColour: "#d8b25e",
    juniorsColour: "#0e3b2e",
  },
  settings: {
    defaultTemplate: "p12",
    // Every board in order, with the photo slideshow after the plaques.
    kioskSequence: [
      "premierships",
      "photos:fixture",
      "ten-grades",
      "club-champions",
      "captains",
      "office-bearers",
      "batting-records",
      "most_runs",
      "centuries",
      "grade_records",
      "partnerships_grade:First Grade",
      "life-members",
    ],
    kioskDwellMs: 3500,
    kioskScrollSpeed: 36,
    kioskEndHoldMs: 3000,
    kioskSponsorStrip: false,
    kioskSponsorSlides: false,
    kioskSponsorSlideEvery: 3,
    kioskAds: [],
    kioskPhotoSlideshows: [
      {
        id: "photos:fixture",
        name: "Clubroom photos",
        library: "senior",
        source: "all",
        order: "newest",
        perPass: 3,
        secondsPerPhoto: 3,
        captions: true,
      },
    ],
    // Short timings so a browser check sees every movement quickly.
    kioskLook: { pageSecs: 3, hold: 1, trans: "fade", dur: "M" },
    // One board per movement, with a spread of transitions.
    boardConfigs: {
      premierships: { move: "pages", trans: "flip", columnsPerScreen: 5 },
      "club-champions": { move: "credits", trans: "wipe", speed: 120 },
      "ten-grades": { move: "pages", trans: "fade", columnsPerScreen: 10 },
      captains: { move: "pages", trans: "up" },
      "office-bearers": { move: "pages", trans: "rows", perPage: 8 },
      "batting-records": { move: "fit", trans: "pop" },
      most_runs: { move: "pages", trans: "rows", top: 20 },
      centuries: { move: "credits", trans: "fade", speed: 160 },
      grade_records: { move: "pages", trans: "flip", columnsPerScreen: 4 },
      "partnerships_grade:First Grade": { move: "fit", trans: "wipe" },
      "life-members": {
        move: "pages",
        trans: "left",
        columnsPerScreen: 1,
        photoBackground: { slideshowId: "photos:fixture", dim: "light" },
      },
    },
    composites: [],
  },
  activeSponsors: [],
  // A wide photo, a missing one (skipped) and a tall one.
  photoSlideshows: [
    {
      id: "photos:fixture",
      photos: [
        { url: "/opengraph.jpg", width: 1200, height: 630, caption: "First Grade · 2025/26" },
        { url: "/missing-photo.jpg", width: 800, height: 600, caption: "Never shown" },
        { url: "/mockup/broadcast-current-square.jpg", width: 1080, height: 1080, caption: null },
      ],
    },
  ],
};
