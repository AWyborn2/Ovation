import { ApproachingCard } from "@workspace/cricket-club";

const approaching = [
  {
    playerId: 104,
    surname: "Whitfield",
    givenName: "James",
    boardKey: "games",
    boardLabel: "Games",
    tierLabel: "100 Games Club",
    tierIndex: 2,
    currentValue: 92,
    threshold: 100,
    gap: 8,
  },
  {
    playerId: 105,
    surname: "Osei",
    givenName: "Marcus",
    boardKey: "runs",
    boardLabel: "Runs",
    tierLabel: "5,000 Runs Club",
    tierIndex: 0,
    currentValue: 4876,
    threshold: 5000,
    gap: 124,
  },
  {
    playerId: 110,
    surname: "Marsh",
    givenName: "Charlie",
    boardKey: "wickets",
    boardLabel: "Wickets",
    tierLabel: "200 Wickets Club",
    tierIndex: 1,
    currentValue: 194,
    threshold: 200,
    gap: 6,
  },
];

export function ApproachingMilestones() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
        gap: 12,
        maxWidth: 860,
      }}
    >
      {approaching.map((p) => (
        <ApproachingCard key={p.playerId} entry={p as any} />
      ))}
    </div>
  );
}
