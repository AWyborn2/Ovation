import { ColumnsBoard } from "@workspace/cricket-club";

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: null,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
  juniorsColour: "#42342b",
};

const seasons = ["2021/22", "2022/23", "2023/24", "2024/25", "2025/26"];
const captains = [
  ["R. Callaghan", null],
  ["R. Callaghan", null],
  ["M. Osei", null],
  ["M. Osei", null],
  ["S. Duarte", null],
];
const champions = [
  ["K. Te Rangi", "455 runs · 24 dism."],
  ["M. Osei", "512 runs · 28 wkts"],
  ["R. Callaghan", "689 runs"],
  ["T. Nguyen", "41 wkts @ 14.2"],
  ["S. Duarte", "812 runs"],
];

// Season-aligned composite: a leading Season column plus two source boards
// rendered side-by-side, index-aligned by season (the physical honour-board
// look).
const board = {
  id: "composite:club-board",
  category: "Honour Boards",
  layout: "columns",
  title: "Club Honour Board",
  subtitle: "Captains and club champions by season",
  entries: [],
  columns: [
    {
      heading: "Season",
      entries: seasons.map((s) => ({ season: "", primaryText: s })),
    },
    {
      heading: "A Grade Captain",
      entries: captains.map(([name, detail], i) => ({
        season: "",
        primaryText: name,
        detail,
        playerId: 300 + i,
      })),
    },
    {
      heading: "Club Champion",
      entries: champions.map(([name, detail], i) => ({
        season: "",
        primaryText: name,
        detail,
        playerId: 320 + i,
      })),
    },
  ],
  display: { columns: 1, transition: "slide", fit: false },
};

export function SeasonAlignedColumns() {
  return (
    <div className="hb" style={{ maxWidth: 900, padding: 8 }}>
      <ColumnsBoard board={board as any} brand={brand as any} />
    </div>
  );
}
