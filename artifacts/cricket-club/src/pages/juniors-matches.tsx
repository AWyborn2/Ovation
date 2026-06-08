import { useState } from "react";
import { Link } from "wouter";
import {
  useListJuniorMatches,
  useGetJuniorsFilters,
  getListJuniorMatchesQueryKey,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin } from "lucide-react";
import { JUNIOR_ACCENT, fmtJuniorDate } from "@/lib/juniors";

export default function JuniorsMatches() {
  const [season, setSeason] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  const { data: filters } = useGetJuniorsFilters();

  const seasonArg = season || undefined;
  const ageArg = ageGroup || undefined;

  const { data: matches, isLoading } = useListJuniorMatches(
    { season: seasonArg, ageGroup: ageArg },
    { query: { queryKey: getListJuniorMatchesQueryKey({ season: seasonArg, ageGroup: ageArg }) } },
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bc8c6b] mb-2">
          Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Junior Matches</h1>
        <p className="text-muted-foreground mt-1">Browse junior game-by-game scorecards.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Age Group</label>
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm font-medium min-w-[10rem]"
            data-testid="select-age-group"
          >
            <option value="">All age groups</option>
            {(filters?.ageGroups ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Season</label>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm font-medium min-w-[8rem]"
            data-testid="select-season"
          >
            <option value="">All seasons</option>
            {(filters?.seasons ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : !matches || matches.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No junior matches found for these filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m) => (
            <Link key={m.id} href={`/juniors/matches/${m.id}`}>
              <div className={`bg-card border border-border rounded-md p-4 shadow-sm cursor-pointer group h-full flex flex-col gap-3 ${JUNIOR_ACCENT.hoverBorder} transition-colors`}>
                <div className="flex items-center gap-2">
                  {m.ageGroup && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#bc8c6b] bg-[#bc8c6b]/10 border border-[#bc8c6b]/40 rounded px-2 py-0.5">
                      {m.ageGroup}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-bold text-primary group-hover:text-[#bc8c6b] truncate">
                      vs {m.opponentName ?? "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      {m.season ?? ""}{m.round ? ` · ${m.round}` : ""}
                    </div>
                  </div>
                  {m.status && !/^(final|completed)$/i.test(m.status.trim()) && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/15 border border-amber-600/40 rounded px-2 py-0.5 shrink-0">
                      {m.status}
                    </span>
                  )}
                </div>
                {(m.hhScore || m.opponentScore) && (
                  <div className="text-sm font-mono text-foreground/90">
                    {m.hhScore ?? "—"} <span className="text-muted-foreground">vs</span> {m.opponentScore ?? "—"}
                  </div>
                )}
                {m.hhResult && <div className="text-sm text-foreground/90 leading-snug">{m.hhResult}</div>}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {fmtJuniorDate(m.matchDate) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> {fmtJuniorDate(m.matchDate)}
                    </span>
                  )}
                  {m.venue && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {m.venue}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
