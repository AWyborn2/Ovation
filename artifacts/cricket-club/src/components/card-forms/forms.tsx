/**
 * Card form router (U8).
 *
 * Dispatches to the bespoke Match Summary editor (nested teams + innings) or the
 * generic descriptor form for every other kind. All editors are controlled off a
 * single `CardFormState`, so prefill and hand editing share one path (R14).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import type {
  CardKind,
  MatchSummaryTeam,
  MatchSummaryInnings,
} from "@/lib/share-card";
import type { CardFormState } from "./logic";
import { DESCRIPTORS } from "./descriptors";
import { GenericCardForm, selectClass } from "./fields";

type SetState = (patch: CardFormState) => void;

export function CardFormRouter({
  kind,
  state,
  setState,
}: {
  kind: CardKind;
  state: CardFormState;
  setState: SetState;
}) {
  if (kind === "matchSummary") {
    return <MatchSummaryForm state={state} setState={setState} />;
  }
  return (
    <GenericCardForm
      kind={kind}
      descriptor={DESCRIPTORS[kind]}
      state={state}
      setState={setState}
    />
  );
}

/* ------------------------------------------------------------ Match Summary */

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function MatchSummaryForm({
  state,
  setState,
}: {
  state: CardFormState;
  setState: SetState;
}) {
  const club = (state.club ?? {}) as MatchSummaryTeam;
  const opposition = (state.opposition ?? {}) as MatchSummaryTeam;
  const innings = (Array.isArray(state.innings) ? state.innings : []) as MatchSummaryInnings[];
  const resultWinner = str(state.resultWinner || "club") as "club" | "opposition" | "draw";

  const setInn = (idx: number, patch: Partial<MatchSummaryInnings>) =>
    setState({ innings: innings.map((inn, i) => (i === idx ? { ...inn, ...patch } : inn)) });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Match details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Title" value={str(state.matchTitle)} onChange={(v) => setState({ matchTitle: v })} placeholder="A Grade • Round 5" />
          <TextField label="Type / competition" value={str(state.matchType)} onChange={(v) => setState({ matchType: v || null })} placeholder="One Day" />
          <TextField label="Date" value={str(state.date)} onChange={(v) => setState({ date: v || null })} placeholder="5 Apr 2025" />
          <TextField label="Venue" value={str(state.venue)} onChange={(v) => setState({ venue: v || null })} placeholder="Sample Oval" />
          <TextField label="Result text" value={str(state.result)} onChange={(v) => setState({ result: v })} placeholder="Won by 5 wickets" />
          <div className="space-y-1">
            <Label>Winner</Label>
            <select
              className={selectClass}
              value={resultWinner}
              onChange={(e) => setState({ resultWinner: e.target.value })}
            >
              <option value="club">{club.name || "Club"}</option>
              <option value="opposition">Opposition</option>
              <option value="draw">Draw / Tie</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamCard title={club.name || "Club"} team={club} onChange={(t) => setState({ club: t })} />
        <TeamCard title="Opposition" team={opposition} onChange={(t) => setState({ opposition: t })} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Innings</CardTitle>
          {innings.length < 4 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setState({
                  innings: [
                    ...innings,
                    emptyInnings(
                      innings.length % 2 === 0 ? "club" : "opposition",
                      (innings.length + 1) as 1 | 2,
                    ),
                  ],
                })
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
              clubName={club.name || "Club"}
              oppName={opposition.name || "Opposition"}
              onChange={(patch) => setInn(idx, patch)}
              onRemove={
                innings.length > 1
                  ? () => setState({ innings: innings.filter((_, i) => i !== idx) })
                  : undefined
              }
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

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

function TextField({
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
          value={team[key] || "#000000"}
          onChange={(e) => set(key, e.target.value)}
          className="h-9 w-10 rounded border bg-transparent p-0.5"
        />
        <Input
          value={team[key] ?? ""}
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
          <TextField label="Name" value={team.name ?? ""} onChange={(v) => set("name", v)} />
          <TextField
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
        <TextField
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
            <option value="club">{clubName}</option>
            <option value="opposition">{oppName}</option>
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
