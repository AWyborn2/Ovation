import { TeamOfDecadeBoard } from "@workspace/cricket-club";

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: null,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
  juniorsColour: "#42342b",
};

const XI = [
  ["D. Okafor", "Opening batter"],
  ["J. Whitfield", "Opening batter"],
  ["R. Callaghan", "Captain · Top order"],
  ["S. Duarte", "Middle order"],
  ["M. Osei", "All-rounder"],
  ["A. Fitzgerald", "All-rounder"],
  ["K. Te Rangi", "Wicket-keeper"],
  ["T. Nguyen", "Spin bowler"],
  ["B. Sorensen", "Pace bowler"],
  ["H. Patel", "Pace bowler"],
  ["C. Marsh", "Pace bowler"],
];

const board = {
  id: "team-of-decade",
  category: "Honour Boards",
  layout: "teamOfDecade",
  title: "Team of the Decade",
  subtitle: "2010/11 – 2019/20 · selected by the club committee",
  entries: XI.map(([name, role], i) => ({
    season: "",
    primaryText: name,
    detail: role,
    playerId: 200 + i,
  })),
  display: { columns: 1, transition: "slide", fit: false },
};

// Heritage Timber skin (p1) — the classic carved-board look for a Team of the
// Decade lineup. hb-compact keeps all eleven rows inside the capture cell.
export function TeamOfTheDecade() {
  return (
    <div className="hb skin-p1 hb-compact" style={{ maxWidth: 700 }}>
      <TeamOfDecadeBoard board={board as any} brand={brand as any} />
    </div>
  );
}
