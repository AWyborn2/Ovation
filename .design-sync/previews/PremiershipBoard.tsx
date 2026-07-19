import { PremiershipBoard } from "@workspace/cricket-club";

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: null,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
  juniorsColour: "#42342b",
};

const board = {
  id: "premierships",
  category: "Premierships",
  layout: "premiership",
  title: "Premiership Honour Roll",
  subtitle: "Senior premiership-winning sides",
  entries: [
    {
      season: "2019/20",
      primaryText: "A Grade Premiers",
      detail: "def. Dunes CC by 42 runs",
      playerId: 101,
      meta: {
        competition: "A Grade Premiership",
        grade: "A Grade",
        captain: "R. Callaghan",
        motm: "T. Nguyen",
        venue: "Seacrest Oval",
        date: "2020-03-21",
      },
      squad: [
        { name: "R. Callaghan", playerId: 101, isCaptain: true },
        { name: "S. Duarte", playerId: 102, isCaptain: false },
        { name: "T. Nguyen", playerId: 103, isCaptain: false },
        { name: "J. Whitfield", playerId: 104, isCaptain: false },
        { name: "M. Osei", playerId: 105, isCaptain: false },
        { name: "K. Te Rangi", playerId: 106, isCaptain: false },
        { name: "B. Sorensen", playerId: 107, isCaptain: false },
        { name: "A. Fitzgerald", playerId: 108, isCaptain: false },
        { name: "D. Okafor", playerId: 109, isCaptain: false },
        { name: "C. Marsh", playerId: 110, isCaptain: false },
        { name: "H. Patel", playerId: 111, isCaptain: false },
      ],
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
    {
      season: "2004/05",
      primaryText: "B Grade Premiers",
      detail: "def. Mandurah by 18 runs",
      meta: {
        competition: "B Grade Premiership",
        grade: "B Grade",
        captain: "G. Bramley",
        venue: "Seacrest Oval",
        date: "2005-03-19",
      },
    },
    {
      season: "1998/99",
      primaryText: "A Grade Premiers",
      detail: "def. Baypoint CC — 54 runs",
      meta: {
        competition: "A Grade Premiership",
        grade: "A Grade",
        venue: "Estuary Park",
        date: "1999-03-20",
      },
    },
  ],
  display: { columns: 1, transition: "slide", fit: false },
};

export function PremiershipHonourRoll() {
  return (
    <div className="hb" style={{ maxWidth: 960, padding: 8 }}>
      <PremiershipBoard board={board as any} brand={brand as any} />
    </div>
  );
}
