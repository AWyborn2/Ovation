import { Link, useParams } from "wouter";
import { useGetJuniorMatch, getGetJuniorMatchQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { JuniorScorecard } from "@/components/scorecard/junior-scorecard";
import { fmtJuniorDate } from "@/lib/juniors";

export default function JuniorsMatchDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data: match, isLoading, isError } = useGetJuniorMatch(id, {
    query: { enabled: Number.isFinite(id), queryKey: getGetJuniorMatchQueryKey(id) },
  });

  return (
    <div className="space-y-6">
      <Link href="/juniors/matches">
        <span className="inline-flex items-center gap-1 text-sm text-[#bc8c6b] hover:underline cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back to junior matches
        </span>
      </Link>

      {isLoading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : isError || !match ? (
        <div className="p-8 text-center text-muted-foreground">Match not found.</div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-md p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {match.ageGroup && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#bc8c6b] bg-[#bc8c6b]/10 border border-[#bc8c6b]/40 rounded px-2 py-0.5">
                  {match.ageGroup}
                </span>
              )}
              {match.status && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
                  {match.status}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-primary">
              Halls Head <span className="text-muted-foreground font-normal">vs</span> {match.opponentName ?? "Unknown"}
            </h1>
            <div className="text-sm text-muted-foreground uppercase tracking-wider">
              {match.season ?? ""}
              {match.round ? ` · ${match.round}` : ""}
              {match.competition ? ` · ${match.competition}` : ""}
            </div>
            {(match.hhScore || match.opponentScore) && (
              <div className="text-lg font-mono text-foreground">
                {match.hhScore ?? "—"} <span className="text-muted-foreground text-sm">vs</span> {match.opponentScore ?? "—"}
              </div>
            )}
            {match.hhResult && <div className="text-base font-semibold text-[#bc8c6b]">{match.hhResult}</div>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
              {fmtJuniorDate(match.matchDate) && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {fmtJuniorDate(match.matchDate)}
                </span>
              )}
              {match.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {match.venue}
                </span>
              )}
            </div>
          </div>

          <JuniorScorecard match={match} />
        </>
      )}
    </div>
  );
}
