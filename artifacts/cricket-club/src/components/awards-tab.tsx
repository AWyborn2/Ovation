import { Link } from "wouter";
import {
  useListAwards,
  useListPublicTallies,
  type Award,
  type AwardWinner,
  type AwardTally,
} from "@workspace/api-client-react";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

type SeasonGroup = { season: number; winners: AwardWinner[] };

function groupBySeason(winners: AwardWinner[]): SeasonGroup[] {
  const bySeason = new Map<number, AwardWinner[]>();
  for (const w of winners) {
    if (!bySeason.has(w.season)) bySeason.set(w.season, []);
    bySeason.get(w.season)!.push(w);
  }
  return [...bySeason.entries()]
    .map(([season, ws]) => ({
      season,
      winners: [...ws].sort(
        (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
      ),
    }))
    .sort((a, b) => b.season - a.season);
}

const WinnerName = ({ winner }: { winner: AwardWinner }) =>
  winner.playerId != null ? (
    <Link
      href={`/players/${winner.playerId}`}
      className="font-semibold text-primary hover:underline"
    >
      {winner.name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{winner.name}</span>
  );

function formatSeasonRange(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

const LiveTally = ({ tally }: { tally: AwardTally }) => {
  const winners = new Set(tally.winnerPlayerIds);
  const top = tally.entries.slice(0, 10);
  return (
    <div className="px-4 md:px-6 pt-4 pb-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          Live {formatSeasonRange(tally.season)} tally
        </span>
        {tally.finalised && (
          <span className="text-xs text-muted-foreground">· finalised</span>
        )}
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No votes counted yet.
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {top.map((e, i) => (
            <div
              key={e.playerId}
              className="flex items-baseline justify-between gap-3 py-1.5"
            >
              <span className="flex items-baseline gap-3 min-w-0">
                <span className="font-mono text-xs text-muted-foreground w-5 shrink-0">
                  {i + 1}
                </span>
                <span
                  className={`truncate ${winners.has(e.playerId) ? "font-bold text-primary" : "font-medium"}`}
                >
                  {e.name}
                  {winners.has(e.playerId) && tally.votingOpen && (
                    <span className="ml-2 text-xs font-normal">● leading</span>
                  )}
                </span>
              </span>
              <span className="font-mono font-bold shrink-0">{e.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AwardBoardCard = ({
  award,
  tally,
}: {
  award: Award;
  tally?: AwardTally;
}) => {
  const groups = groupBySeason(award.winners);
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden shadow-lg">
      <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm flex items-center justify-between gap-3">
        <span>{award.title}</span>
        <span className="text-xs whitespace-nowrap">
          {groups.length} {groups.length === 1 ? "season" : "seasons"}
        </span>
      </div>
      {award.description && (
        <p className="px-4 md:px-6 pt-4 text-sm italic text-muted-foreground m-0">
          {award.description}
        </p>
      )}
      {tally && <LiveTally tally={tally} />}
      {groups.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground italic text-sm">
          No winners recorded yet.
        </div>
      ) : (
        <div className="p-4 md:p-6">
          <div className="divide-y divide-border/60">
            {groups.map((g) => (
              <div
                key={g.season}
                className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="font-mono font-bold text-primary w-20 shrink-0">
                  {formatSeason(g.season)}
                </span>
                <span className="flex flex-wrap gap-x-2 gap-y-1">
                  {g.winners.map((w, i) => (
                    <span key={w.id}>
                      <WinnerName winner={w} />
                      {i < g.winners.length - 1 && (
                        <span className="text-muted-foreground">,</span>
                      )}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export function AwardsTab() {
  const { data: awards, isLoading } = useListAwards();
  const { data: tallies } = useListPublicTallies();

  const tallyByAward = new Map<number, AwardTally>();
  for (const t of tallies ?? []) tallyByAward.set(t.awardId, t);

  const sorted = [...(awards ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
  );

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
          Club Awards
        </h2>
        <div className="w-20 h-[3px] bg-primary mt-3" />
        <p className="text-muted-foreground italic mt-3 mb-0">
          Halls Head Cricket Club's honour rolls — recognising the players and
          members awarded each season.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading awards…
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
          No awards have been added yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((a) => (
            <AwardBoardCard key={a.id} award={a} tally={tallyByAward.get(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
