import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PromotionCard } from "@workspace/cricket-club";

// PromotionCard renders a ShareButton (react-query social-settings read) — a
// bare QueryClientProvider is enough; with no data the button renders as-is.
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const promotions = [
  {
    playerId: 103,
    surname: "Nguyen",
    givenName: "Thanh",
    boardKey: "wickets",
    boardLabel: "Wickets",
    tierLabel: "500 Wickets Club",
    tierIndex: 0,
    currentValue: 502,
    threshold: 500,
    excess: 2,
    recencyScore: 0.004,
  },
  {
    playerId: 105,
    surname: "Osei",
    givenName: "Marcus",
    boardKey: "games",
    boardLabel: "Games",
    tierLabel: "300 Games Club",
    tierIndex: 1,
    currentValue: 308,
    threshold: 300,
    excess: 8,
    recencyScore: 0.027,
  },
  {
    playerId: 102,
    surname: "Duarte",
    givenName: "Sofia",
    boardKey: "runs",
    boardLabel: "Runs",
    tierLabel: "6,000 Runs Club",
    tierIndex: 2,
    currentValue: 6102,
    threshold: 6000,
    excess: 102,
    recencyScore: 0.017,
  },
];

export function JustPromoted() {
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
        {promotions.map((p) => (
          <PromotionCard key={p.playerId} entry={p as any} />
        ))}
      </div>
    </QueryClientProvider>
  );
}
