import { GridBoard } from "@workspace/cricket-club";

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: null,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
  juniorsColour: "#42342b",
};

const seasonGrid = {
  id: "office-bearers",
  category: "Honour Boards",
  layout: "grid",
  title: "Office Bearers",
  subtitle: "Committee and champions by season",
  entries: [],
  grid: {
    rowHeading: "Season",
    columnHeadings: ["President", "Club Champion", "A Grade Premiers"],
    rows: [
      {
        heading: "2025/26",
        cells: [
          { entries: [{ text: "P. Lindqvist", playerId: null }] },
          { entries: [{ text: "S. Duarte", playerId: 102 }] },
          { entries: [] },
        ],
      },
      {
        heading: "2024/25",
        cells: [
          { entries: [{ text: "P. Lindqvist", playerId: null }] },
          { entries: [{ text: "T. Nguyen", playerId: 103 }] },
          { entries: [] },
        ],
      },
      {
        heading: "2023/24",
        cells: [
          { entries: [{ text: "A. Fitzgerald", playerId: 108 }] },
          {
            entries: [
              { text: "R. Callaghan", playerId: 101 },
              { text: "M. Osei", playerId: 105, note: "joint" },
            ],
          },
          { entries: [{ text: "Premiers", note: "def. Dunes CC" }] },
        ],
      },
      {
        heading: "2022/23",
        cells: [
          { entries: [{ text: "A. Fitzgerald", playerId: 108 }] },
          { entries: [{ text: "M. Osei", playerId: 105 }] },
          { entries: [] },
        ],
      },
      {
        heading: "2021/22",
        cells: [
          { entries: [{ text: "G. Bramley", playerId: null }] },
          { entries: [{ text: "K. Te Rangi", playerId: 106 }] },
          { entries: [{ text: "Runners-up" }] },
        ],
      },
      {
        heading: "2020/21",
        cells: [
          { entries: [{ text: "G. Bramley", playerId: null }] },
          { entries: [{ text: "J. Whitfield", playerId: 104 }] },
          { entries: [] },
        ],
      },
    ],
  },
  display: { columns: 1, transition: "slide", fit: false },
};

// "wrap" fill mode: rows split into side-by-side year-blocks, header repeated.
const wrapGrid = {
  ...seasonGrid,
  id: "captains-grid",
  title: "A Grade Captains",
  subtitle: "Split into two blocks (wrap fill mode)",
  grid: {
    rowHeading: "Season",
    columnHeadings: ["Captain"],
    rows: [
      ["2025/26", "S. Duarte"],
      ["2024/25", "M. Osei"],
      ["2023/24", "M. Osei"],
      ["2022/23", "R. Callaghan"],
      ["2021/22", "R. Callaghan"],
      ["2020/21", "J. Whitfield"],
      ["2019/20", "R. Callaghan"],
      ["2018/19", "G. Bramley"],
    ].map(([season, name], i) => ({
      heading: season,
      cells: [{ entries: [{ text: name, playerId: 400 + i }] }],
    })),
  },
  display: { columns: 1, transition: "wrap", fit: false, wrapBlocks: 2 },
};

export function SeasonGrid() {
  return (
    <div className="hb" style={{ maxWidth: 900, padding: 8 }}>
      <GridBoard board={seasonGrid as any} brand={brand as any} />
    </div>
  );
}

export function WrappedYearBlocks() {
  return (
    <div className="hb" style={{ maxWidth: 900, padding: 8 }}>
      <GridBoard board={wrapGrid as any} brand={brand as any} />
    </div>
  );
}
