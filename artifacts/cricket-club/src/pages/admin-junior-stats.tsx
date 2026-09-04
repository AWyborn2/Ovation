import { useMemo, useState } from "react";
import {
  useGetJuniorsFilters,
  useListJuniorMatches,
  getListJuniorMatchesQueryKey,
} from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { fmtJuniorDate } from "@/lib/juniors";
import { JuniorMatchEditor } from "@/components/junior-stats";

/**
 * Admin editor for junior scorecards. Junior stats are loaded read-only from
 * PlayHQ exports, so this page is the only place source errors can be fixed:
 * match metadata, batting/bowling line figures, player attribution, missing or
 * duplicate lines, and roster membership. Every edit is journalled server-side
 * (junior_stat_corrections) so it survives a juniors data reload, and the
 * journal panel below the editor lets admins review + revert past edits.
 * All derived junior aggregates recompute automatically because they are
 * computed live from the line tables.
 */

export default function AdminJuniorStats() {
  const initialMatchId = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("matchId");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, []);

  const [season, setSeason] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [matchId, setMatchId] = useState<number | null>(initialMatchId);

  const { data: filters } = useGetJuniorsFilters();

  const listParams = {
    season: season || undefined,
    ageGroup: ageGroup || undefined,
  };
  const {
    data: matches,
    isLoading,
    isError,
    refetch,
  } = useListJuniorMatches(listParams, {
    query: {
      enabled: matchId == null,
      queryKey: getListJuniorMatchesQueryKey(listParams),
    },
  });

  if (matchId != null) {
    return <JuniorMatchEditor matchId={matchId} onBack={() => setMatchId(null)} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Fix errors in the junior scorecard data — match details, batting and bowling figures, player
        attribution and match rosters. Every change is journalled and survives a juniors data
        reload.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider">Season</Label>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All seasons</option>
            {(filters?.seasons ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider">Age group</Label>
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All age groups</option>
            {(filters?.ageGroups ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={8} />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !matches?.length ? (
        <EmptyState
          title="No junior matches found"
          message="Try different season or age-group filters."
        />
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMatchId(m.id)}
              className="w-full text-left bg-card border border-border rounded-md p-3 shadow-sm hover:border-primary transition-colors flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <span className="font-medium text-primary">vs {m.opponentName ?? "Unknown"}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {m.season ?? ""}
                {m.ageGroup ? ` · ${m.ageGroup}` : ""}
                {m.round ? ` · ${m.round}` : ""}
              </span>
              {fmtJuniorDate(m.matchDate) && (
                <span className="text-xs text-muted-foreground">{fmtJuniorDate(m.matchDate)}</span>
              )}
              <span className="ml-auto text-xs font-mono text-muted-foreground">
                {m.hhScore ?? "—"} vs {m.opponentScore ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
