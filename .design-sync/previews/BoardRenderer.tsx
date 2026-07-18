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

// 90 rows > LIST_PAGE_SIZE (80): the renderer paginates and shows the pager.
const SURNAMES = ["Callaghan", "Duarte", "Nguyen", "Whitfield", "Osei", "Te Rangi", "Sorensen", "Fitzgerald", "Okafor", "Marsh", "Patel", "Bramley", "Lindqvist", "Hartigan", "Kaur"];
const GIVEN = ["R.", "S.", "T.", "J.", "M.", "K.", "B.", "A.", "D.", "C.", "H.", "G."];

const longList = {
  id: "life-members",
  category: "Honour Boards",
  layout: "list",
  title: "100 Games Club",
  subtitle: "Every player to reach 100 senior games",
  entries: Array.from({ length: 90 }, (_, i) => ({
    season: `${1999 + Math.floor(i / 3)}/${String((2000 + Math.floor(i / 3)) % 100).padStart(2, "0")}`,
    primaryText: `${GIVEN[i % GIVEN.length]} ${SURNAMES[i % SURNAMES.length]}`,
    detail: `${350 - i * 2} games`,
    playerId: 500 + i,
  })),
  display: { columns: 3, transition: "scroll", fit: false },
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

// Long list board: BoardRenderer paginates at 80 rows and renders the pager.
export function ListBoardWithPager() {
  return (
    <div className="hb" style={{ maxWidth: 980, padding: 8 }}>
      <BoardRenderer board={longList as any} brand={brand as any} />
    </div>
  );
}

// Per-board built-in skin override (p2 · Club Colours) plus a footnote; the
// club vars feed the skin's plaque background and accents.
export function PremiershipWithSkinAndFootnote() {
  return (
    <div
      className="hb"
      style={
        {
          maxWidth: 940,
          padding: 8,
          "--club-primary": "#1e3a5f",
          "--club-accent": "#c8a951",
        } as any
      }
    >
      <BoardRenderer board={premiershipP2 as any} brand={brand as any} />
    </div>
  );
}
