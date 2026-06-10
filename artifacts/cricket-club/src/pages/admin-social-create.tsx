import { useMemo, useState } from "react";
import {
  useListMatches,
  useGetMatch,
  getGetMatchQueryKey,
  type MatchSummary as MatchSummaryDto,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Loader2, Image as ImageIcon } from "lucide-react";
import { ShareCardModal } from "@/components/share-card-modal";
import { LoadingState, QueryError } from "@/components/data-states";
import { matchToSummaryInput, seasonLabel } from "@/lib/match-summary";
import type {
  ShareCardInput,
  MatchSummaryTeam,
  MatchSummaryInnings,
} from "@/lib/share-card";

const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function AdminSocialCreate() {
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
          Build a branded Match Summary card from a stored match or from scratch,
          then preview, theme and export it.
        </p>
      </div>

      <Tabs defaultValue="match">
        <TabsList>
          <TabsTrigger value="match">From a match</TabsTrigger>
          <TabsTrigger value="manual">Build manually</TabsTrigger>
        </TabsList>
        <TabsContent value="match" className="mt-4">
          <FromMatch onOpen={openWith} />
        </TabsContent>
        <TabsContent value="manual" className="mt-4">
          <ManualBuilder onOpen={openWith} />
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

/* ---------------------------------------------------------------- From match */

function FromMatch({ onOpen }: { onOpen: (i: ShareCardInput) => void }) {
  const [grade, setGrade] = useState<string>(GRADES[0]);
  const [season, setSeason] = useState<number | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);

  const matchesQ = useListMatches({ grade });
  const matches = (matchesQ.data ?? []) as MatchSummaryDto[];

  const seasons = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((m) => set.add(m.season));
    return [...set].sort((a, b) => b - a);
  }, [matches]);

  const effectiveSeason = season ?? seasons[0] ?? null;

  // Preserve the API's ordering (honours the admin round-direction setting and
  // positions finals consistently); only narrow to the selected season.
  const filtered = useMemo(
    () => matches.filter((m) => m.season === effectiveSeason),
    [matches, effectiveSeason],
  );

  const detailQ = useGetMatch(matchId ?? 0, {
    query: { enabled: matchId != null, queryKey: getGetMatchQueryKey(matchId ?? 0) },
  });

  const matchLabel = (m: MatchSummaryDto) => {
    const round = m.stage ?? (m.round != null ? `Round ${m.round}` : "Match");
    return `${round} — vs ${m.opponent ?? "Unknown"}${m.result ? ` (${m.result})` : ""}`;
  };

  const build = () => {
    if (detailQ.data) onOpen(matchToSummaryInput(detailQ.data));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a match</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Grade</Label>
            <select
              className={selectClass}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setSeason(null);
                setMatchId(null);
              }}
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Season</Label>
            <select
              className={selectClass}
              value={effectiveSeason ?? ""}
              disabled={seasons.length === 0}
              onChange={(e) => {
                setSeason(e.target.value ? Number(e.target.value) : null);
                setMatchId(null);
              }}
            >
              {seasons.length === 0 && <option value="">No matches</option>}
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
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

        {matchesQ.isError ? (
          <QueryError onRetry={() => matchesQ.refetch()} />
        ) : matchesQ.isLoading ? (
          <LoadingState label="Loading matches…" />
        ) : null}

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

/* -------------------------------------------------------------- Manual build */

const HHCC_TEAM: MatchSummaryTeam = {
  name: "Halls Head",
  shortName: "HHCC",
  primaryColor: "#00305c",
  secondaryColor: "#f5a623",
  textColor: "#f5a623",
  logoUrl: null,
};

const OPP_TEAM: MatchSummaryTeam = {
  name: "Opposition",
  shortName: null,
  primaryColor: "#1f2733",
  secondaryColor: "#9aa6b2",
  textColor: "#ffffff",
  logoUrl: null,
};

function emptyInnings(teamKey: "club" | "opposition", num: 1 | 2): MatchSummaryInnings {
  return {
    teamKey,
    inningsNum: num,
    totalRuns: "",
    wickets: "",
    overs: "",
    topBatters: [{ name: "", runs: 0, balls: null, notOut: false }],
    topBowlers: [{ name: "", wickets: 0, runs: 0, overs: "" }],
  };
}

function ManualBuilder({ onOpen }: { onOpen: (i: ShareCardInput) => void }) {
  const [matchTitle, setMatchTitle] = useState("A Grade • Round 1");
  const [matchType, setMatchType] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [result, setResult] = useState("");
  const [resultWinner, setResultWinner] = useState<"club" | "opposition" | "draw">("club");
  const [club, setClub] = useState<MatchSummaryTeam>({ ...HHCC_TEAM });
  const [opposition, setOpposition] = useState<MatchSummaryTeam>({ ...OPP_TEAM });
  const [innings, setInnings] = useState<MatchSummaryInnings[]>([
    emptyInnings("club", 1),
    emptyInnings("opposition", 2),
  ]);

  const setInn = (idx: number, patch: Partial<MatchSummaryInnings>) =>
    setInnings((arr) => arr.map((inn, i) => (i === idx ? { ...inn, ...patch } : inn)));

  const build = () => {
    const cleaned: MatchSummaryInnings[] = innings.map((inn) => ({
      ...inn,
      topBatters: inn.topBatters.filter((b) => b.name.trim()),
      topBowlers: inn.topBowlers.filter((b) => b.name.trim()),
    }));
    onOpen({
      kind: "matchSummary",
      matchTitle: matchTitle.trim() || "Match Summary",
      matchType: matchType.trim() || null,
      date: date.trim() || null,
      venue: venue.trim() || null,
      result: result.trim() || "Result unavailable",
      resultWinner,
      club,
      opposition,
      innings: cleaned,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Match details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Title" value={matchTitle} onChange={setMatchTitle} placeholder="A Grade • Round 5" />
          <Field label="Type / competition" value={matchType} onChange={setMatchType} placeholder="One Day" />
          <Field label="Date" value={date} onChange={setDate} placeholder="5 Apr 2025" />
          <Field label="Venue" value={venue} onChange={setVenue} placeholder="Halls Head Oval" />
          <Field label="Result text" value={result} onChange={setResult} placeholder="Halls Head won by 5 wickets" />
          <div className="space-y-1">
            <Label>Winner</Label>
            <select
              className={selectClass}
              value={resultWinner}
              onChange={(e) => setResultWinner(e.target.value as typeof resultWinner)}
            >
              <option value="club">Halls Head</option>
              <option value="opposition">Opposition</option>
              <option value="draw">Draw / Tie</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamCard title="Halls Head" team={club} onChange={setClub} />
        <TeamCard title="Opposition" team={opposition} onChange={setOpposition} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Innings</CardTitle>
          {innings.length < 4 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setInnings((arr) => [
                  ...arr,
                  emptyInnings(
                    arr.length % 2 === 0 ? "club" : "opposition",
                    (arr.length + 1) as 1 | 2,
                  ),
                ])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add innings
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {innings.map((inn, idx) => (
            <InningsEditor
              key={idx}
              innings={inn}
              clubName={club.name}
              oppName={opposition.name}
              onChange={(patch) => setInn(idx, patch)}
              onRemove={
                innings.length > 1
                  ? () => setInnings((arr) => arr.filter((_, i) => i !== idx))
                  : undefined
              }
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={build}>
          <ImageIcon className="h-4 w-4 mr-2" />
          Preview &amp; export card
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function TeamCard({
  title,
  team,
  onChange,
}: {
  title: string;
  team: MatchSummaryTeam;
  onChange: (t: MatchSummaryTeam) => void;
}) {
  const set = <K extends keyof MatchSummaryTeam>(k: K, v: MatchSummaryTeam[K]) =>
    onChange({ ...team, [k]: v });
  const colorField = (
    key: "primaryColor" | "secondaryColor" | "textColor",
    label: string,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={team[key]}
          onChange={(e) => set(key, e.target.value)}
          className="h-9 w-10 rounded border bg-transparent p-0.5"
        />
        <Input
          value={team[key]}
          onChange={(e) => set(key, e.target.value)}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" value={team.name} onChange={(v) => set("name", v)} />
          <Field
            label="Short name"
            value={team.shortName ?? ""}
            onChange={(v) => set("shortName", v || null)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {colorField("primaryColor", "Primary")}
          {colorField("secondaryColor", "Secondary")}
          {colorField("textColor", "Text")}
        </div>
        <Field
          label="Logo URL (optional)"
          value={team.logoUrl ?? ""}
          onChange={(v) => set("logoUrl", v || null)}
          placeholder="https://…"
        />
      </CardContent>
    </Card>
  );
}

function InningsEditor({
  innings,
  clubName,
  oppName,
  onChange,
  onRemove,
}: {
  innings: MatchSummaryInnings;
  clubName: string;
  oppName: string;
  onChange: (patch: Partial<MatchSummaryInnings>) => void;
  onRemove?: () => void;
}) {
  const setBatter = (i: number, patch: Partial<MatchSummaryInnings["topBatters"][number]>) =>
    onChange({
      topBatters: innings.topBatters.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    });
  const setBowler = (i: number, patch: Partial<MatchSummaryInnings["topBowlers"][number]>) =>
    onChange({
      topBowlers: innings.topBowlers.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    });

  return (
    <div className="border rounded-md p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Batting team</Label>
          <select
            className={selectClass + " w-40"}
            value={innings.teamKey}
            onChange={(e) => onChange({ teamKey: e.target.value as "club" | "opposition" })}
          >
            <option value="club">{clubName || "Halls Head"}</option>
            <option value="opposition">{oppName || "Opposition"}</option>
          </select>
        </div>
        <div className="space-y-1 w-20">
          <Label className="text-xs">Runs</Label>
          <Input value={innings.totalRuns} onChange={(e) => onChange({ totalRuns: e.target.value })} />
        </div>
        <div className="space-y-1 w-20">
          <Label className="text-xs">Wickets</Label>
          <Input value={innings.wickets} onChange={(e) => onChange({ wickets: e.target.value })} />
        </div>
        <div className="space-y-1 w-24">
          <Label className="text-xs">Overs</Label>
          <Input value={innings.overs} onChange={(e) => onChange({ overs: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            checked={innings.declared ?? false}
            onCheckedChange={(v) => onChange({ declared: v })}
          />
          <Label className="text-xs">Declared</Label>
        </div>
        {onRemove && (
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Top batters</Label>
            {innings.topBatters.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    topBatters: [...innings.topBatters, { name: "", runs: 0, balls: null, notOut: false }],
                  })
                }
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
          {innings.topBatters.map((b, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                placeholder="Name"
                value={b.name}
                onChange={(e) => setBatter(i, { name: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="R"
                className="w-14"
                value={b.runs}
                onChange={(e) => setBatter(i, { runs: Number(e.target.value) || 0 })}
              />
              <Input
                placeholder="B"
                className="w-14"
                value={b.balls ?? ""}
                onChange={(e) => setBatter(i, { balls: e.target.value ? Number(e.target.value) : null })}
              />
              <div className="flex items-center gap-1 px-1">
                <Switch
                  checked={b.notOut ?? false}
                  onCheckedChange={(v) => setBatter(i, { notOut: v })}
                />
                <span className="text-[10px] text-muted-foreground">NO</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onChange({ topBatters: innings.topBatters.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Top bowlers</Label>
            {innings.topBowlers.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    topBowlers: [...innings.topBowlers, { name: "", wickets: 0, runs: 0, overs: "" }],
                  })
                }
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
          {innings.topBowlers.map((b, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                placeholder="Name"
                value={b.name}
                onChange={(e) => setBowler(i, { name: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="W"
                className="w-14"
                value={b.wickets}
                onChange={(e) => setBowler(i, { wickets: Number(e.target.value) || 0 })}
              />
              <Input
                placeholder="R"
                className="w-14"
                value={b.runs}
                onChange={(e) => setBowler(i, { runs: Number(e.target.value) || 0 })}
              />
              <Input
                placeholder="Ov"
                className="w-16"
                value={b.overs}
                onChange={(e) => setBowler(i, { overs: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onChange({ topBowlers: innings.topBowlers.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
