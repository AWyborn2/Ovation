import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DebutCard } from "@workspace/cricket-club";

// DebutCard renders a ShareButton, which reads social settings via react-query
// — a QueryClientProvider (no data; the fetch silently fails and the button
// renders in its default state) is all it needs.
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const debuts = [
  { playerId: 111, name: "Harsha Patel", grade: "A Grade", category: "male", capNumber: 214, season: 2025, round: 3 },
  { playerId: 112, name: "Isla McKenzie", grade: "Female A Grade", category: "female", capNumber: 41, season: 2025, round: 5 },
  { playerId: 113, name: "Eddie Bramley", grade: "A Grade", category: "male", capNumber: 118, season: null, round: null },
];

export function RecentDebuts() {
  return (
    <QueryClientProvider client={qc}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
          gap: 12,
          maxWidth: 860,
        }}
      >
        {debuts.map((d) => (
          <DebutCard key={d.playerId} entry={d as any} />
        ))}
      </div>
    </QueryClientProvider>
  );
}
