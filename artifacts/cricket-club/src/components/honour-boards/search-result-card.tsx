import { Link } from "wouter";
import { useGetPlayer, getGetPlayerQueryKey } from "@workspace/api-client-react";
import { aggregateCareer } from "@/lib/honour-boards";
import { GradeBadge, GradeBadgeListFromString } from "@/components/grade-badge";

const Chip = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-background/60 border border-border rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="font-mono font-semibold text-primary">{value}</div>
  </div>
);

export const SearchResultCard = ({ playerId }: { playerId: number }) => {
  const { data: player } = useGetPlayer(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerQueryKey(playerId) },
  });
  if (!player) return null;
  const agg = aggregateCareer(player.stats);
  const a = agg[0] ?? null;
  const grades = player.gradesPlayed || "—";
  return (
    <div className="bg-card border border-border rounded-md p-5 md:p-6 shadow-md">
      <Link href={`/players/${player.id}`} className="block group">
        <h3 className="font-serif text-xl font-bold text-primary group-hover:underline m-0 uppercase">
          {player.givenName} {player.surname}
        </h3>
      </Link>
      <div className="mt-1 mb-4">
        {player.gradesPlayed ? (
          <GradeBadgeListFromString gradesPlayed={player.gradesPlayed} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground italic">{grades}</span>
        )}
      </div>
      {a && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
          <Chip label="Games" value={a.games} />
          <Chip label="Runs" value={a.runs} />
          <Chip label="Wickets" value={a.wickets} />
          <Chip label="Bat Avg" value={a.innings - a.notOuts > 0 ? (a.runs / (a.innings - a.notOuts)).toFixed(2) : "-"} />
          <Chip label="High Score" value={a.highScoreDisplay} />
          <Chip label="Bowl Avg" value={a.wickets > 0 ? (a.runsConceded / a.wickets).toFixed(2) : "-"} />
          <Chip label="Best Bowling" value={a.bestBowling} />
          <Chip label="Catches" value={a.catches} />
        </div>
      )}
      {player.stats.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs sticky-id-col">
            <thead>
              <tr className="bg-black/25">
                <th className="text-left font-serif uppercase tracking-wider text-primary p-2">Grade</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">Mat</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">Runs</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">HS</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">Wkts</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">BB</th>
              </tr>
            </thead>
            <tbody>
              {player.stats.filter((s) => s.grade !== "CLUB TOTAL").map((s) => (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={s.grade} size="sm" />
                      <span className="font-semibold text-primary">{s.grade}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right font-mono">{s.games ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.runs ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.highScore ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.wickets ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.bestBowling ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
