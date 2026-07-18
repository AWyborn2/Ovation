import { ListBoard } from "@workspace/cricket-club";

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: null,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
  juniorsColour: "#42342b",
};

const champions = {
  id: "club-champions",
  category: "Honour Boards",
  layout: "list",
  title: "Club Champions",
  subtitle: "Senior club champion by season",
  entries: [
    { season: "2025/26", primaryText: "S. Duarte", detail: "812 runs · 3 centuries", playerId: 102, meta: { grade: "A Grade" } },
    { season: "2024/25", primaryText: "T. Nguyen", detail: "41 wickets @ 14.2", playerId: 103, meta: { grade: "A Grade" } },
    { season: "2023/24", primaryText: "R. Callaghan", detail: "689 runs · 12 catches", playerId: 101, meta: { grade: "A Grade" } },
    { season: "2022/23", primaryText: "M. Osei", detail: "512 runs · 28 wickets", playerId: 105, meta: { grade: "B Grade" } },
    { season: "2021/22", primaryText: "K. Te Rangi", detail: "24 dismissals · 455 runs", playerId: 106 },
    { season: "2020/21", primaryText: "J. Whitfield", detail: "734 runs · 2 centuries", playerId: 104 },
  ],
  display: { columns: 1, transition: "slide", fit: false },
};

const centuryMakers = {
  id: "century-makers",
  category: "Records",
  layout: "list",
  title: "Century Makers",
  subtitle: "Every senior century since 2019/20",
  entries: [
    { season: "2025/26", primaryText: "S. Duarte", detail: "148* v Dunes CC", playerId: 102 },
    { season: "2025/26", primaryText: "J. Whitfield", detail: "121 v Mandurah", playerId: 104 },
    { season: "2024/25", primaryText: "R. Callaghan", detail: "133 v Estuary CC", playerId: 101 },
    { season: "2024/25", primaryText: "S. Duarte", detail: "104 v Baypoint CC", playerId: 102 },
    { season: "2023/24", primaryText: "D. Okafor", detail: "117 v Dunes CC", playerId: 109 },
    { season: "2022/23", primaryText: "M. Osei", detail: "102* v Mandurah", playerId: 105 },
    { season: "2021/22", primaryText: "J. Whitfield", detail: "156 v Estuary CC", playerId: 104 },
    { season: "2021/22", primaryText: "A. Fitzgerald", detail: "109 v Baypoint CC", playerId: 108 },
    { season: "2020/21", primaryText: "R. Callaghan", detail: "125 v Dunes CC", playerId: 101 },
    { season: "2019/20", primaryText: "T. Nguyen", detail: "101 v Mandurah", playerId: 103 },
    { season: "2019/20", primaryText: "S. Duarte", detail: "138 v Estuary CC", playerId: 102 },
    { season: "2019/20", primaryText: "K. Te Rangi", detail: "115* v Baypoint CC", playerId: 106 },
  ],
  display: { columns: 2, transition: "scroll", fit: false },
};

export function ClubChampions() {
  return (
    <div className="hb" style={{ maxWidth: 720, padding: 8 }}>
      <ListBoard board={champions as any} brand={brand as any} />
    </div>
  );
}

// display.columns = 2 flows the rows into newspaper-style columns.
export function CenturyMakersTwoColumns() {
  return (
    <div className="hb" style={{ maxWidth: 960, padding: 8 }}>
      <ListBoard board={centuryMakers as any} brand={brand as any} />
    </div>
  );
}
