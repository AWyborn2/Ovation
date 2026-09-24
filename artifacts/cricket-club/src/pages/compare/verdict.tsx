import { verdictText, type Verdict } from "./compare-data";
import { slotColor, type ComparedPlayer } from "./shared";

/**
 * "X leads 6 of 10 categories" (or "Level at the top…") with a segmented bar
 * sized by each player's category wins, plus a grey segment for ties.
 */
export function VerdictBar({
  verdict,
  players,
}: {
  verdict: Verdict;
  players: ReadonlyArray<ComparedPlayer>;
}) {
  const text = verdictText(
    verdict,
    players.map((p) => p.name),
  );
  const total = Math.max(1, verdict.total);
  const summary = players
    .map((p, i) => `${p.name} ${verdict.wins[i]}`)
    .concat(verdict.ties ? [`tied ${verdict.ties}`] : [])
    .join(", ");

  return (
    <section
      data-testid="compare-verdict"
      className="flex flex-wrap items-center gap-5 rounded-[16px] border bg-card p-[22px]"
    >
      <p className="min-w-[240px] flex-1 font-serif text-[24px] font-extrabold uppercase leading-[1.05]">
        {text}
      </p>
      <div className="flex min-w-[260px] flex-[1.4] flex-col gap-2.5">
        <div
          role="img"
          aria-label={`Category wins: ${summary}`}
          className="flex h-3.5 gap-[3px] overflow-hidden rounded-full"
        >
          {players.map((p, i) =>
            verdict.wins[i] > 0 ? (
              <div
                key={p.slot}
                data-testid="verdict-segment"
                style={{
                  width: `${(verdict.wins[i] / total) * 100}%`,
                  background: slotColor(p),
                }}
              />
            ) : null,
          )}
          {verdict.ties > 0 && (
            <div className="bg-muted" style={{ width: `${(verdict.ties / total) * 100}%` }} />
          )}
        </div>
        <ul className="flex flex-wrap gap-4 text-[12.5px] text-muted-foreground">
          {players.map((p, i) => (
            <li key={p.slot} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: slotColor(p) }}
              />
              {p.short} · {verdict.wins[i]}
            </li>
          ))}
          {verdict.ties > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-muted" />
              Tied · {verdict.ties}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
