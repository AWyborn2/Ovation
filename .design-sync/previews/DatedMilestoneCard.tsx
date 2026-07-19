import { DatedMilestoneCard } from "@workspace/cricket-club";

const items = [
  {
    id: "m1",
    kind: "century",
    playerId: 102,
    playerName: "Sofia Duarte",
    grade: "A Grade",
    matchDate: "2026-02-07",
    label: "Century — 124 v Dunes CC",
    detail: "124 off 98 balls at Seacrest Oval",
    value: 124,
    significance: 3,
    recent: true,
  },
  {
    id: "m2",
    kind: "fiveFor",
    playerId: 103,
    playerName: "Thanh Nguyen",
    grade: "B Grade",
    matchDate: "2026-01-17",
    label: "Five-for — 6/24 v Mandurah",
    detail: "Career-best figures",
    value: 6,
    significance: 3,
    recent: true,
  },
  {
    id: "m3",
    kind: "hatTrick",
    playerId: 101,
    playerName: "Ryan Callaghan",
    grade: "A Grade",
    matchDate: "2025-11-29",
    label: "Hat-trick v Estuary CC",
    detail: null,
    value: 3,
    significance: 4,
    recent: false,
  },
  {
    id: "m4",
    kind: "debut",
    playerId: 111,
    playerName: "Harsha Patel",
    grade: "A Grade",
    matchDate: "2025-10-25",
    label: "A Grade debut",
    detail: "Cap #214 · Round 3, 2025/26",
    value: 1,
    significance: 2,
    recent: false,
  },
  {
    id: "m5",
    kind: "career",
    playerId: 105,
    playerName: "Marcus Osei",
    grade: null,
    matchDate: "2026-01-31",
    label: "300 career games",
    detail: "Crossed the mark in Round 9",
    value: 300,
    significance: 4,
    recent: true,
  },
];

// One card per milestone kind (century / five-for / hat-trick / debut / career).
export function MilestoneKinds() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
        gap: 12,
        maxWidth: 860,
      }}
    >
      {items.map((item) => (
        <DatedMilestoneCard key={item.id} item={item as any} />
      ))}
    </div>
  );
}
