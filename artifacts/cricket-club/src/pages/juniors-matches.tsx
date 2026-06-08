import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListJuniorMatches,
  useGetJuniorsFilters,
  useGetJuniorMatchDisplaySettings,
  getListJuniorMatchesQueryKey,
  type JuniorMatchSummary,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin } from "lucide-react";
import { JUNIOR_ACCENT, fmtJuniorDate } from "@/lib/juniors";

// Compact opposition crest for junior match cards; falls back silently to
// nothing (the opponent name is always shown beside it). Most metro junior
// opponents are absent from the Peel-focused clubs register, so opponentClub is
// usually null.
function MatchCardCrest({ club }: { club: JuniorMatchSummary["opponentClub"] }) {
  const [errored, setErrored] = useState(false);
  const src = club?.logoUrl128 || club?.logoUrl;
  if (!club || !src || errored) return null;
  return (
    <img
      src={src}
      alt={`${club.name} logo`}
      title={club.name}
      width={28}
      height={28}
      onError={() => setErrored(true)}
      className="h-7 w-7 shrink-0 rounded-sm object-contain bg-white/90 p-0.5 shadow-sm"
      data-testid="img-junior-match-crest"
    />
  );
}

/** Parse the start year out of a junior season string ("2024/25" → 2024). */
function seasonStartYear(s: string | null | undefined): number {
  if (!s) return -1;
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : -1;
}

/** Order age-group tokens by the admin-configured order, appending the rest. */
function orderAgeGroups(saved: string[], all: string[]): string[] {
  const present = saved.filter((a) => all.includes(a));
  const rest = all.filter((a) => !present.includes(a));
  return [...present, ...rest];
}

export default function JuniorsMatches() {
  // `null` = not yet initialised from saved admin defaults.
  const [season, setSeason] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);

  const { data: filters } = useGetJuniorsFilters();
  const { data: settings } = useGetJuniorMatchDisplaySettings();

  const ageGroupOptions = useMemo(
    () => orderAgeGroups(settings?.ageGroupOrder ?? [], filters?.ageGroups ?? []),
    [settings?.ageGroupOrder, filters?.ageGroups],
  );

  // Newest season (by parsed start year) drives the "latest" default mode.
  const latestSeason = useMemo(() => {
    const seasons = filters?.seasons ?? [];
    if (seasons.length === 0) return "";
    return [...seasons].sort((a, b) => seasonStartYear(b) - seasonStartYear(a))[0];
  }, [filters?.seasons]);

  // Apply saved admin defaults once both settings and filters have loaded.
  useEffect(() => {
    if (!settings || !filters) return;
    setAgeGroup((prev) => (prev === null ? settings.defaultAgeGroup ?? "" : prev));
    setSeason((prev) => {
      if (prev !== null) return prev;
      if (settings.defaultSeasonMode === "all") return "";
      if (settings.defaultSeasonMode === "specific") {
        const s = settings.defaultSeason;
        return s && (filters.seasons ?? []).includes(s) ? s : latestSeason;
      }
      return latestSeason;
    });
  }, [settings, filters, latestSeason]);

  const seasonArg = season || undefined;
  const ageArg = ageGroup || undefined;
  const ready = season !== null && ageGroup !== null;

  const { data: matches, isLoading } = useListJuniorMatches(
    { season: seasonArg, ageGroup: ageArg },
    {
      query: {
        enabled: ready,
        queryKey: getListJuniorMatchesQueryKey({ season: seasonArg, ageGroup: ageArg }),
      },
    },
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
          Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Junior Matches</h1>
        <p className="text-muted-foreground mt-1">Browse junior game-by-game scorecards.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-primary">Age Group</label>
          <select
            value={ageGroup ?? ""}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[10rem]"
            data-testid="select-age-group"
          >
            <option value="">All age groups</option>
            {ageGroupOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-primary">Season</label>
          <select
            value={season ?? ""}
            onChange={(e) => setSeason(e.target.value)}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[8rem]"
            data-testid="select-season"
          >
            <option value="">All seasons</option>
            {(filters?.seasons ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {!ready || isLoading ? (
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/40 rounded px-2 py-0.5">
                      {m.ageGroup}
                    </span>
                  )}
                  <MatchCardCrest club={m.opponentClub} />
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-bold text-primary group-hover:text-primary truncate">
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
