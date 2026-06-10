import { useMemo, useState } from "react";
import {
  useListJuniorMatches,
  useGetJuniorMatch,
  getGetJuniorMatchQueryKey,
  useListJuniorSocialMilestones,
  type JuniorMatchSummary,
  type JuniorSocialMilestone,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Image as ImageIcon, Trophy } from "lucide-react";
import { ShareCardModal } from "@/components/share-card-modal";
import { juniorMatchToSummaryInput } from "@/lib/junior-match-summary";
import type { ShareCardInput } from "@/lib/share-card";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function AdminJuniorSocial() {
  const [input, setInput] = useState<ShareCardInput | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openWith = (i: ShareCardInput) => {
    setInput(i);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Generate brown-branded junior milestone and match-summary cards for
          Instagram, Facebook, TikTok and X. Private junior players are never
          shown. Junior stats stay completely separate from the senior side.
        </p>
      </div>

      <Tabs defaultValue="match">
        <TabsList>
          <TabsTrigger value="match">Junior match</TabsTrigger>
          <TabsTrigger value="milestone">Junior milestones</TabsTrigger>
        </TabsList>
        <TabsContent value="match" className="mt-4">
          <FromJuniorMatch onOpen={openWith} />
        </TabsContent>
        <TabsContent value="milestone" className="mt-4">
          <JuniorMilestones onOpen={openWith} />
        </TabsContent>
      </Tabs>

      <ShareCardModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        input={input}
        engine="ondemand"
        playerId={null}
      />
    </div>
  );
}

/* --------------------------------------------------------- From junior match */

function FromJuniorMatch({ onOpen }: { onOpen: (i: ShareCardInput) => void }) {
  const [season, setSeason] = useState<string>("");
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [matchId, setMatchId] = useState<number | null>(null);

  // Pull the whole list once; derive the season + age-group menus client-side so
  // they never collapse to the current selection.
  const matchesQ = useListJuniorMatches();
  const matches = (matchesQ.data ?? []) as JuniorMatchSummary[];

  const seasons = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => m.season && set.add(m.season));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [matches]);

  const ageGroups = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => m.ageGroup && set.add(m.ageGroup));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [matches]);

  const filtered = useMemo(
    () =>
      matches.filter(
        (m) =>
          (!season || m.season === season) &&
          (!ageGroup || m.ageGroup === ageGroup),
      ),
    [matches, season, ageGroup],
  );

  const detailQ = useGetJuniorMatch(matchId ?? 0, {
    query: { enabled: matchId != null, queryKey: getGetJuniorMatchQueryKey(matchId ?? 0) },
  });

  const matchLabel = (m: JuniorMatchSummary) => {
    const round = m.round ? `Round ${m.round}` : "Match";
    const ag = m.ageGroup ? `${m.ageGroup} • ` : "";
    return `${ag}${round} — vs ${m.opponentName ?? "Unknown"}${
      m.hhResult ? ` (${m.hhResult})` : ""
    }`;
  };

  const build = () => {
    if (detailQ.data) onOpen(juniorMatchToSummaryInput(detailQ.data));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a junior match</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Season</Label>
            <select
              className={selectClass}
              value={season}
              onChange={(e) => {
                setSeason(e.target.value);
                setMatchId(null);
              }}
            >
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Age group</Label>
            <select
              className={selectClass}
              value={ageGroup}
              onChange={(e) => {
                setAgeGroup(e.target.value);
                setMatchId(null);
              }}
            >
              <option value="">All age groups</option>
              {ageGroups.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Match</Label>
            <select
              className={selectClass}
              value={matchId ?? ""}
              disabled={filtered.length === 0}
              onChange={(e) =>
                setMatchId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">
                {filtered.length === 0 ? "No matches" : "Select a match…"}
              </option>
              {filtered.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {matchesQ.isLoading && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading matches…
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={build}
            disabled={matchId == null || detailQ.isLoading || !detailQ.data}
          >
            {detailQ.isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4 mr-2" />
            )}
            Preview &amp; export card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------- Junior milestones */

const STAT_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All milestones" },
  { value: "runs", label: "Runs" },
  { value: "wickets", label: "Wickets" },
  { value: "games", label: "Games" },
];

function milestoneToInput(m: JuniorSocialMilestone): ShareCardInput {
  return {
    kind: "milestone",
    junior: true,
    playerName: m.playerName,
    tierLabel: m.tierLabel,
    tierIndex: m.tierIndex,
    milestoneLabel: m.statLabel,
    currentValue: m.value,
    threshold: m.threshold,
  };
}

function JuniorMilestones({ onOpen }: { onOpen: (i: ShareCardInput) => void }) {
  const [stat, setStat] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const milestonesQ = useListJuniorSocialMilestones();
  const all = (milestonesQ.data ?? []) as JuniorSocialMilestone[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (m) =>
        (!stat || m.statKey === stat) &&
        (!q || m.playerName.toLowerCase().includes(q)),
    );
  }, [all, stat, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Career milestones reached</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Stat</Label>
            <select
              className={selectClass}
              value={stat}
              onChange={(e) => setStat(e.target.value)}
            >
              {STAT_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Search player</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a name…"
            />
          </div>
        </div>

        {milestonesQ.isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading milestones…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No milestones match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((m) => (
              <button
                key={`${m.participantId}-${m.statKey}`}
                onClick={() => onOpen(milestoneToInput(m))}
                className="text-left border rounded-md p-3 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium truncate">{m.playerName}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {m.tierLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.value} {m.statLabel.toLowerCase()}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
