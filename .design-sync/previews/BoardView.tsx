import { BoardView } from "@workspace/cricket-club";

const runsBoard = {
  key: "runs",
  label: "Runs",
  title: "Most Runs Scored",
  subtitle: "Career batting aggregates",
  headlineLabel: "Runs",
  supportingLabel: "Avg",
};

const gamesBoard = {
  key: "games",
  label: "Games",
  title: "Most Games Played",
  subtitle: "Career appearances across all grades",
  headlineLabel: "Games",
  supportingLabel: "Runs",
};

const runsTiers = [
  {
    label: "5,000 Run Club",
    tierIndex: 0,
    startRank: 1,
    rows: [
      { playerId: 101, surname: "Callaghan", givenName: "Ryan", headline: "7,412", supporting: "34.63", sortValue: 7412, gradesPlayed: [] },
      { playerId: 102, surname: "Duarte", givenName: "Sofia", headline: "6,102", supporting: "38.14", sortValue: 6102, gradesPlayed: [] },
      { playerId: 104, surname: "Whitfield", givenName: "James", headline: "5,231", supporting: "29.55", sortValue: 5231, gradesPlayed: [] },
    ],
  },
  {
    label: "2,500 Run Club",
    tierIndex: 1,
    startRank: 4,
    rows: [
      { playerId: 105, surname: "Osei", givenName: "Marcus", headline: "4,876", supporting: "31.06", sortValue: 4876, gradesPlayed: [] },
      { playerId: 109, surname: "Okafor", givenName: "Daniel", headline: "3,540", supporting: "27.87", sortValue: 3540, gradesPlayed: [] },
      { playerId: 106, surname: "Te Rangi", givenName: "Kahu", headline: "2,988", supporting: "25.98", sortValue: 2988, gradesPlayed: [] },
      { playerId: 108, surname: "Fitzgerald", givenName: "Aoife", headline: "2,611", supporting: "24.63", sortValue: 2611, gradesPlayed: [] },
    ],
  },
];

const gamesTiers = [
  {
    label: "300 Games Club",
    tierIndex: 0,
    startRank: 1,
    rows: [
      { playerId: 101, surname: "Callaghan", givenName: "Ryan", headline: "342", supporting: "7,412", sortValue: 342, gradesPlayed: ["A Grade", "B Grade"] },
      { playerId: 105, surname: "Osei", givenName: "Marcus", headline: "308", supporting: "4,876", sortValue: 308, gradesPlayed: ["A Grade", "B Grade", "C Grade"] },
    ],
  },
  {
    label: "200 Games Club",
    tierIndex: 1,
    startRank: 3,
    rows: [
      { playerId: 103, surname: "Nguyen", givenName: "Thanh", headline: "261", supporting: "1,904", sortValue: 261, gradesPlayed: ["A Grade"] },
      { playerId: 102, surname: "Duarte", givenName: "Sofia", headline: "223", supporting: "6,102", sortValue: 223, gradesPlayed: ["Female A Grade", "A Grade"] },
      { playerId: 106, surname: "Te Rangi", givenName: "Kahu", headline: "207", supporting: "2,988", sortValue: 207, gradesPlayed: ["B Grade", "C Grade"] },
    ],
  },
];

const premMap = new Map([
  [101, { won: 3, captained: 1 }],
  [105, { won: 2, captained: 1 }],
  [103, { won: 1, captained: 0 }],
  [102, { won: 1, captained: 0 }],
  [106, { won: 0, captained: 0 }],
]);

export function RunsBoard() {
  return (
    <div style={{ maxWidth: 860 }}>
      <BoardView tiers={runsTiers as any} board={runsBoard as any} />
    </div>
  );
}

// The Games board swaps the supporting column for grade badges and adds the
// premiership-count column.
export function GamesBoardWithPremierships() {
  return (
    <div style={{ maxWidth: 920 }}>
      <BoardView tiers={gamesTiers as any} board={gamesBoard as any} premMap={premMap as any} />
    </div>
  );
}
