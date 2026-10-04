import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import {
  useGetPlatformPlayerPrivacy,
  useSetPlayerPrivacyOverride,
  useDeletePlayerPrivacyOverride,
  getGetPlatformPlayerPrivacyQueryKey,
  type PlayerPrivacyPlayer,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/stat-badge";
import { useConfirm } from "@/components/confirm-dialog";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Player privacy overrides (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md,
 * D4 / P8). Central players are shared by every club, so privacy is set here, per PlayHQ
 * participant. PlayHQ syncs only ever make a player private; an override here is the only way to
 * make one public again.
 */
export default function PlayerPrivacyPage() {
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const params = q.length >= 2 ? { q } : undefined;
  const { data, isLoading, isError } = useGetPlatformPlayerPrivacy(params, {
    query: { queryKey: getGetPlatformPlayerPrivacyQueryKey(params) },
  });
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: getGetPlatformPlayerPrivacyQueryKey().slice(0, 1) });
  const set = useSetPlayerPrivacyOverride({
    mutation: {
      onSuccess: () => {
        setError(null);
        void refresh();
      },
      onError: () => setError("Couldn't save the override."),
    },
  });
  const remove = useDeletePlayerPrivacyOverride({ mutation: { onSuccess: () => void refresh() } });

  async function onSet(p: PlayerPrivacyPlayer, isPrivate: boolean) {
    const name = p.displayName ?? p.participantId;
    if (
      !(await confirm({
        title: isPrivate ? `Make ${name} private?` : `Make ${name} public?`,
        description: isPrivate
          ? "Their name disappears from public stats, leaderboards and records on every club's site."
          : "Their name and stats become visible on every club's site. Only do this with the player's consent.",
        confirmText: isPrivate ? "Make private" : "Make public",
        destructive: !isPrivate,
      }))
    )
      return;
    set.mutate({ participantId: p.participantId, data: { isPrivate } });
  }

  async function onRemove(participantId: string, name: string | null) {
    if (
      !(await confirm({
        title: "Remove this override?",
        description: `${name ?? participantId}'s current privacy stays as it is; syncs stop enforcing the override.`,
        confirmText: "Remove",
      }))
    )
      return;
    remove.mutate({ participantId });
  }

  return (
    <div>
      <h1 className="mb-2 text-[clamp(38px,4.6vw,64px)] leading-none">Player privacy</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Private players are hidden from public stats on every club&rsquo;s site. PlayHQ syncs only
        ever make a player private; an override here can make one public again.
        {data && !data.projectorConfigured
          ? " The stats projector isn't configured on this server, so overrides apply on the next sync."
          : ""}
      </p>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Find a player</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Name or PlayHQ participant ID"
                aria-label="Search players"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {q.length < 2 ? (
              <p className="py-4 text-sm text-muted-foreground">Type at least two characters.</p>
            ) : isLoading ? (
              <div className="flex items-center py-4 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : !data?.players.length ? (
              <p className="py-4 text-sm text-muted-foreground">No players match.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.players.map((p) => (
                  <li
                    key={p.participantId}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.displayName ?? "(no name)"}</span>
                        <StatusPill tone={p.isPrivate ? "danger" : "live"}>
                          {p.isPrivate ? "Private" : "Public"}
                        </StatusPill>
                        {p.override !== null ? (
                          <StatusPill tone="pilot">Override</StatusPill>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {p.participantId} · {p.matches ?? 0} matches
                        {p.lastSeason ? ` · ${p.lastSeason}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={set.isPending}
                      onClick={() => onSet(p, !p.isPrivate)}
                    >
                      {p.isPrivate ? "Make public" : "Make private"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            {isError ? (
              <p className="py-8 text-center text-muted-foreground">
                Couldn&rsquo;t load overrides.
              </p>
            ) : !data ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : data.overrides.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No overrides yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.overrides.map((o) => (
                  <li key={o.participantId} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{o.displayName ?? o.participantId}</span>
                        <StatusPill tone={o.isPrivate ? "danger" : "live"}>
                          {o.isPrivate ? "Private" : "Public"}
                        </StatusPill>
                        {!o.applied ? <StatusPill tone="pilot">Pending sync</StatusPill> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(o.setAt).toLocaleDateString("en-AU", { dateStyle: "medium" })}
                        {o.reason ? ` · ${o.reason}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove override for ${o.displayName ?? o.participantId}`}
                      disabled={remove.isPending}
                      onClick={() => onRemove(o.participantId, o.displayName)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
