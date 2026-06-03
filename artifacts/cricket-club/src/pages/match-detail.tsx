import { useParams, Link } from "wouter";
import { useGetMatch, getGetMatchQueryKey, type MatchScorecardLine } from "@workspace/api-client-react";
import { GradeBadge } from "@/components/grade-badge";
import { CalendarDays, MapPin, ChevronLeft } from "lucide-react";

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const matchId = parseInt(id, 10);
  const { data: match, isLoading } = useGetMatch(matchId, {
    query: { enabled: !!matchId, queryKey: getGetMatchQueryKey(matchId) },
  });

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!match) return <div className="p-8 text-center text-muted-foreground">Match not found.</div>;

  const batting = match.lines
    .filter((l) => l.batted)
    .sort((a, b) => (a.battingPos ?? 99) - (b.battingPos ?? 99));
  const bowling = match.lines.filter((l) => l.bowled);
  const fielding = match.lines.filter(
    (l) => (l.catches ?? 0) + (l.stumpings ?? 0) + (l.runOuts ?? 0) > 0,
  );

  const playerLink = (l: MatchScorecardLine) => (
    <Link href={`/players/${l.playerId}`} className="font-medium text-primary hover:underline">
      {l.givenName} {l.surname}
    </Link>
  );

  return (
    <div className="space-y-6">
      <Link href="/matches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> All matches
      </Link>

      {/* Header */}
      <div className="bg-card border border-border rounded-md p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <GradeBadge grade={match.grade} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-serif font-bold text-primary">
              Halls Head vs {match.opponent ?? "Unknown"}
            </h1>
            <div className="text-sm text-muted-foreground uppercase tracking-wider mt-0.5">
              {match.grade} · {fmtSeason(match.season)}
              {match.round != null ? ` · Round ${match.round}` : ""}
            </div>
            {match.competition && (
              <div className="text-xs text-muted-foreground mt-0.5">{match.competition}</div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
              {fmtDate(match.matchDate) && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {fmtDate(match.matchDate)}
                </span>
              )}
              {match.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {match.venue}
                </span>
              )}
            </div>
          </div>
          {match.abandoned && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/15 border border-amber-600/40 rounded px-2 py-0.5">
              Abandoned
            </span>
          )}
        </div>
        {(match.result || match.hhccScore || match.opponentScore) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center gap-4">
            {match.result && (
              <div className="font-semibold text-foreground/90">{match.result}</div>
            )}
            <div className="flex items-center gap-4 ml-auto font-mono text-sm">
              {match.hhccScore && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Halls Head</div>
                  <div className="font-bold text-primary text-lg">{match.hhccScore}</div>
                </div>
              )}
              {match.opponentScore && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate max-w-[10rem]">{match.opponent ?? "Opponent"}</div>
                  <div className="font-bold text-foreground text-lg">{match.opponentScore}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Batting */}
      <ScorecardSection title="Batting">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium p-3">Batter</th>
              <th className="text-left font-medium p-3">Dismissal</th>
              <th className="text-right font-medium p-3">R</th>
              <th className="text-right font-medium p-3">B</th>
              <th className="text-right font-medium p-3">4s</th>
              <th className="text-right font-medium p-3">6s</th>
            </tr>
          </thead>
          <tbody>
            {batting.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground italic">No batting recorded.</td></tr>
            ) : (
              batting.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3">{playerLink(l)}{l.notOut && <span className="text-primary font-bold"> *</span>}</td>
                  <td className="p-3 text-muted-foreground">{l.dismissal || "—"}</td>
                  <td className="p-3 text-right font-mono font-bold">{l.runs ?? 0}</td>
                  <td className="p-3 text-right font-mono">{l.balls ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{l.fours ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{l.sixes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScorecardSection>

      {/* Bowling */}
      <ScorecardSection title="Bowling">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium p-3">Bowler</th>
              <th className="text-right font-medium p-3">O</th>
              <th className="text-right font-medium p-3">M</th>
              <th className="text-right font-medium p-3">R</th>
              <th className="text-right font-medium p-3">W</th>
              <th className="text-right font-medium p-3">Wd</th>
              <th className="text-right font-medium p-3">Nb</th>
            </tr>
          </thead>
          <tbody>
            {bowling.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground italic">No bowling recorded.</td></tr>
            ) : (
              bowling.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3">{playerLink(l)}</td>
                  <td className="p-3 text-right font-mono">{l.overs || "—"}</td>
                  <td className="p-3 text-right font-mono">{l.maidens ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{l.runsConceded ?? "—"}</td>
                  <td className="p-3 text-right font-mono font-bold">{l.wickets ?? 0}</td>
                  <td className="p-3 text-right font-mono">{l.wides ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{l.noBalls ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScorecardSection>

      {/* Fielding */}
      {fielding.length > 0 && (
        <ScorecardSection title="Fielding">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium p-3">Fielder</th>
                <th className="text-right font-medium p-3">Ct</th>
                <th className="text-right font-medium p-3">St</th>
                <th className="text-right font-medium p-3">RO</th>
              </tr>
            </thead>
            <tbody>
              {fielding.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3">{playerLink(l)}</td>
                  <td className="p-3 text-right font-mono">{l.catches || "—"}</td>
                  <td className="p-3 text-right font-mono">{l.stumpings || "—"}</td>
                  <td className="p-3 text-right font-mono">{l.runOuts || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScorecardSection>
      )}
    </div>
  );
}

function ScorecardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md p-5 shadow-sm">
      <h2 className="text-lg font-serif font-bold text-primary m-0">{title}</h2>
      <div className="w-12 h-[2px] bg-primary mt-1 mb-4" />
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
