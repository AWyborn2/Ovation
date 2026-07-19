import { BoardRenderer } from "@workspace/cricket-club";

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: null,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
  juniorsColour: "#42342b",
};

// An admin "custom:" skin resolved by the renderer via boardSkinStyle, plus a
// per-board admin config (heading override, small text, compact rows).
const customSkins = [
  {
    id: "custom:oak",
    name: "Oak & Cream",
    background: "#f2ead9",
    boardBg: "#fbf6ea",
    ink: "#3b2f1e",
    muted: "#8a7a5f",
    accent: "#7c5c2e",
    accentInk: "#ffffff",
    font: '"Georgia", "Times New Roman", serif',
  },
];

const champions = {
  id: "club-champions",
  category: "Honour Boards",
  layout: "list",
  title: "Club Champions",
  subtitle: "Senior club champion by season",
  skin: "custom:oak",
  footnote: "Awarded on aggregate championship points since 1998/99.",
  entries: [
    { season: "2025/26", primaryText: "S. Duarte", detail: "812 runs · 3 centuries", playerId: 102, meta: { grade: "A Grade" } },
    { season: "2024/25", primaryText: "T. Nguyen", detail: "41 wickets @ 14.2", playerId: 103, meta: { grade: "A Grade" } },
    { season: "2023/24", primaryText: "R. Callaghan", detail: "689 runs · 12 catches", playerId: 101, meta: { grade: "A Grade" } },
    { season: "2022/23", primaryText: "M. Osei", detail: "512 runs · 28 wickets", playerId: 105, meta: { grade: "B Grade" } },
    { season: "2021/22", primaryText: "K. Te Rangi", detail: "24 dismissals · 455 runs", playerId: 106 },
    { season: "2020/21", primaryText: "J. Whitfield", detail: "734 runs · 2 centuries", playerId: 104 },
    { season: "2019/20", primaryText: "R. Callaghan", detail: "702 runs · 9 catches", playerId: 101 },
  ],
  display: { columns: 1, transition: "scroll", fit: false },
};

const championsCfg = {
  heading: "Champions Honour Roll",
  textSize: "sm",
  density: "compact",
};

const premiershipP2 = {
  id: "premierships-p2",
  category: "Premierships",
  layout: "premiership",
  title: "Premierships",
  subtitle: "Painted-plaque skin in the club colours",
  skin: "p2",
  footnote: "Premierships before 2002/03 verified from association yearbooks.",
  entries: [
    {
      season: "2019/20",
      primaryText: "A Grade Premiers",
      detail: "def. Dunes CC by 42 runs",
      meta: {
        competition: "A Grade Premiership",
        grade: "A Grade",
        captain: "R. Callaghan",
        motm: "T. Nguyen",
        venue: "Seacrest Oval",
        date: "2020-03-21",
      },
    },
    {
      season: "2011/12",
      primaryText: "A Grade Premiers",
      detail: "def. Estuary CC — 9 wickets",
      meta: {
        competition: "A Grade Premiership",
        grade: "A Grade",
        captain: "M. Osei",
        venue: "Baypoint Reserve",
        date: "2012-03-17",
      },
    },
  ],
  display: { columns: 1, transition: "slide", fit: false },
};

// Renderer resolving a per-board admin "custom:" skin (inline --hb-* vars) and
// applying the admin config: heading override + small text + compact density,
// with the footnote rendered under the board.
export function CustomSkinWithAdminConfig() {
  return (
    <div className="hb" style={{ maxWidth: 860, padding: 8 }}>
      <BoardRenderer
        board={champions as any}
        brand={brand as any}
        cfg={championsCfg as any}
        skins={customSkins as any}
      />
    </div>
  );
}

// Per-board built-in skin override (p2 · Club Colours) plus a footnote; the
// dark page backdrop is what the skin sits on in the kiosk.
export function PremiershipWithSkinAndFootnote() {
  return (
    <div
      className="hb"
      style={
        {
          maxWidth: 940,
          padding: 16,
          background: "#10203a",
          borderRadius: 12,
          "--club-primary": "#1e3a5f",
          "--club-accent": "#c8a951",
        } as any
      }
    >
      <BoardRenderer board={premiershipP2 as any} brand={brand as any} />
    </div>
  );
}
