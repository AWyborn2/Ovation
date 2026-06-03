import { Link } from "wouter";
import {
  useGetRecordsLeaderboards,
  type RecordLeaderboard,
  type RecordLeaderboardEntry,
} from "@workspace/api-client-react";

const EntryName = ({ entry }: { entry: RecordLeaderboardEntry }) =>
  entry.playerId != null ? (
    <Link
      href={`/players/${entry.playerId}`}
      className="font-semibold text-primary hover:underline"
    >
      {entry.name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{entry.name}</span>
  );

const LeaderboardCard = ({ board }: { board: RecordLeaderboard }) => {
  const leadCount = board.entries[0]?.count ?? 0;
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden shadow-lg">
      <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm flex items-center justify-between gap-3">
        <span>{board.title}</span>
        <span className="text-xs whitespace-nowrap">
          {leadCount} {board.unit}
        </span>
      </div>
      <div className="p-2 md:p-3">
        <div className="divide-y divide-border/60">
          {board.entries.map((e) => (
            <div
              key={`${e.rank}-${e.name}`}
              className="flex items-baseline gap-3 px-2 py-2"
            >
              <span className="font-mono font-bold text-primary w-7 shrink-0 text-center">
                {e.rank}
              </span>
              <span className="flex-1 min-w-0 truncate">
                <EntryName entry={e} />
              </span>
              <span className="font-mono font-bold shrink-0 tabular-nums">
                {e.count}
              </span>
              <span className="text-xs text-muted-foreground shrink-0 w-16 hidden sm:inline">
                {e.count === 1 ? board.unit.replace(/s$/, "") : board.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Section = ({
  title,
  subtitle,
  boards,
  emptyText,
}: {
  title: string;
  subtitle: string;
  boards: RecordLeaderboard[];
  emptyText: string;
}) => (
  <div className="space-y-4">
    <div className="bg-card border border-border rounded-md p-6 shadow-md">
      <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
        {title}
      </h2>
      <div className="w-20 h-[3px] bg-primary mt-3" />
      <p className="text-muted-foreground italic mt-3 mb-0">{subtitle}</p>
    </div>
    {boards.length === 0 ? (
      <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
        {emptyText}
      </div>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {boards.map((b) => (
          <LeaderboardCard key={b.key} board={b} />
        ))}
      </div>
    )}
  </div>
);

export function RecordsTab() {
  const { data, isLoading } = useGetRecordsLeaderboards();

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
        Loading records…
      </div>
    );
  }

  const roleRecords = data?.roleRecords ?? [];
  const awardRecords = data?.awardRecords ?? [];

  return (
    <div className="space-y-8">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
          Notable Honour Board Records
        </h2>
        <div className="w-20 h-[3px] bg-primary mt-3" />
        <p className="text-muted-foreground italic mt-3 mb-0">
          Automatically tallied from the club's published office bearers and
          award winners — these leaderboards update themselves as new seasons are
          recorded.
        </p>
      </div>

      <Section
        title="Most Seasons in Office"
        subtitle="The longest-serving holders of each committee role since 1991."
        boards={roleRecords}
        emptyText="No committee records have been published yet."
      />

      <Section
        title="Most Award Wins"
        subtitle="Members who have won a club award more than once."
        boards={awardRecords}
        emptyText="No repeat award winners have been published yet."
      />
    </div>
  );
}
