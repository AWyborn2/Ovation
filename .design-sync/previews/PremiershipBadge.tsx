import { PremiershipBadge } from "@workspace/cricket-club";

export function Counts() {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      <PremiershipBadge count={{ won: 1, captained: 0 }} />
      <PremiershipBadge count={{ won: 3, captained: 0 }} />
      <PremiershipBadge count={{ won: 5, captained: 2 }} />
      <PremiershipBadge count={{ won: 0, captained: 0 }} />
    </div>
  );
}

export function InBoardColumn() {
  const rows = [
    { name: "R. Hargreaves", games: 214, count: { won: 4, captained: 1 } },
    { name: "S. Patel", games: 187, count: { won: 2, captained: 0 } },
    { name: "L. Whitford", games: 162, count: { won: 0, captained: 0 } },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <span style={{ fontSize: 14 }}>
            {r.name} <span style={{ opacity: 0.6, fontSize: 12 }}>{r.games} games</span>
          </span>
          <PremiershipBadge count={r.count} />
        </div>
      ))}
    </div>
  );
}
