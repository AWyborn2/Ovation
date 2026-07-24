/**
 * Prefill panels (U8).
 *
 * Per data-source pickers that fetch via the generated hooks and hand the DTOs
 * to the pure mappers in `prefill.ts`, applying the resulting patch to the
 * builder's form state. Everything they fill remains editable in the form (R14).
 */

import { useMemo, useState } from "react";
import {
  useListMatches,
  useGetMatch,
  getGetMatchQueryKey,
  getListMatchesQueryKey,
  useListFixtures,
  useGetFixtureTeamList,
  getGetFixtureTeamListQueryKey,
  useGetSocialLadderPrefill,
  getGetSocialLadderPrefillQueryKey,
  useGetSocialClubSeasonTotals,
  getGetSocialClubSeasonTotalsQueryKey,
  useGetSocialWeekendWrapPrefill,
  getGetSocialWeekendWrapPrefillQueryKey,
  type MatchSummary as MatchSummaryDto,
  type Fixture,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { matchToSummaryInput, seasonLabel } from "@/lib/match-summary";
import type { CardKind } from "@/lib/share-card";
import type { CardFormState } from "./logic";
import { DESCRIPTORS } from "./descriptors";
import {
  matchContextPatch,
  fixtureToMatchDayState,
  fixtureToCountdownState,
  fixtureToTeamListMeta,
  teamListPlayersToState,
  ladderRowsToState,
  clubSeasonTotalsToState,
  weekendWrapToState,
} from "./prefill";

/** Senior grade list shared by the prefill pickers. */
export const GRADES = [
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

/** Default season-start year for a cricket season (rolls over in October). */
function defaultSeasonYear(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

type Apply = (patch: CardFormState) => void;

/** Dispatch to the right prefill panel for a kind, or nothing when form-only. */
export function PrefillPanel({
  kind,
  onApply,
}: {
  kind: CardKind;
  onApply: Apply;
}) {
  const source = DESCRIPTORS[kind].prefill;
  if (source === "match") return <MatchPrefillPanel kind={kind} onApply={onApply} />;
  if (source === "fixture") return <FixturePrefillPanel kind={kind} onApply={onApply} />;
  if (source === "stats") {
    if (kind === "ladder") return <LadderPrefillPanel onApply={onApply} />;
    if (kind === "clubLeaderboard") return <ClubTotalsPrefillPanel onApply={onApply} />;
    if (kind === "weekendWrap") return <WeekendWrapPrefillPanel onApply={onApply} />;
  }
  return null;
}

/* --------------------------------------------------------------- From match */

function MatchPrefillPanel({ kind, onApply }: { kind: CardKind; onApply: Apply }) {
  const [grade, setGrade] = useState<string>(GRADES[0]);
  const [season, setSeason] = useState<number | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);

  const params = useMemo(() => ({ grade }), [grade]);
  const matchesQ = useListMatches(params, {
    query: { queryKey: getListMatchesQueryKey(params) },
  });
  const matches = (matchesQ.data ?? []) as MatchSummaryDto[];

  const seasons = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((m) => set.add(m.season));
    return [...set].sort((a, b) => b - a);
  }, [matches]);
  const effectiveSeason = season ?? seasons[0] ?? null;

  const filtered = useMemo(
    () => matches.filter((m) => m.season === effectiveSeason),
    [matches, effectiveSeason],
  );
  const selected = filtered.find((m) => m.id === matchId) ?? null;

  const detailQ = useGetMatch(matchId ?? 0, {
    query: { enabled: matchId != null, queryKey: getGetMatchQueryKey(matchId ?? 0) },
  });

  const matchLabel = (m: MatchSummaryDto) => {
    const round = m.stage ?? (m.round != null ? `Round ${m.round}` : "Match");
    return `${round} — vs ${m.opponent ?? "Unknown"}${m.result ? ` (${m.result})` : ""}`;
  };

  const apply = () => {
    if (kind === "matchSummary") {
      if (!detailQ.data) return;
      const { kind: _k, ...rest } = matchToSummaryInput(detailQ.data) as Record<string, unknown>;
      onApply(rest as CardFormState);
      return;
    }
    if (selected) onApply(matchContextPatch(kind, grade, selected));
  };

  const needsDetail = kind === "matchSummary";
  const disabled = matchId == null || (needsDetail && (detailQ.isLoading || !detailQ.data));

  return (
    <PrefillCard
      title="Prefill from a match"
      hint={
        needsDetail
          ? "Loads the full scorecard for the Match Result card."
          : "Fills the match context (grade, opponent, round); enter the player and figures below."
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SelectField label="Grade" value={grade} onChange={(v) => { setGrade(v); setSeason(null); setMatchId(null); }}>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <SelectField
          label="Season"
          value={effectiveSeason == null ? "" : String(effectiveSeason)}
          disabled={seasons.length === 0}
          onChange={(v) => { setSeason(v ? Number(v) : null); setMatchId(null); }}
        >
          {seasons.length === 0 && <option value="">No matches</option>}
          {seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
        </SelectField>
        <SelectField
          label="Match"
          value={matchId == null ? "" : String(matchId)}
          disabled={filtered.length === 0}
          onChange={(v) => setMatchId(v ? Number(v) : null)}
        >
          <option value="">{filtered.length === 0 ? "No matches" : "Select a match…"}</option>
          {filtered.map((m) => <option key={m.id} value={m.id}>{matchLabel(m)}</option>)}
        </SelectField>
      </div>
      <ApplyButton onClick={apply} disabled={disabled} loading={needsDetail && detailQ.isLoading} />
    </PrefillCard>
  );
}

/* ------------------------------------------------------------- From fixture */

function FixturePrefillPanel({ kind, onApply }: { kind: CardKind; onApply: Apply }) {
  const [grade, setGrade] = useState<string>("");
  const [fixtureId, setFixtureId] = useState<number | null>(null);

  const params = useMemo(() => (grade ? { grade } : {}), [grade]);
  const fixturesQ = useListFixtures(params);
  const fixtures = (fixturesQ.data ?? []) as Fixture[];
  const selected = fixtures.find((f) => f.id === fixtureId) ?? null;

  const teamListQ = useGetFixtureTeamList(fixtureId ?? 0, {
    query: {
      enabled: kind === "teamList" && fixtureId != null,
      queryKey: getGetFixtureTeamListQueryKey(fixtureId ?? 0),
    },
  });

  const apply = () => {
    if (!selected) return;
    if (kind === "matchDay") return onApply(fixtureToMatchDayState(selected));
    if (kind === "countdown") return onApply(fixtureToCountdownState(selected));
    if (kind === "teamList") {
      const meta = fixtureToTeamListMeta(selected);
      const players = teamListQ.data ? teamListPlayersToState(teamListQ.data.players) : {};
      return onApply({ ...meta, ...players });
    }
  };

  const label = (f: Fixture) =>
    `${f.roundLabel ? `${f.roundLabel} — ` : ""}${f.grade} vs ${f.opponentName}`;

  return (
    <PrefillCard
      title="Prefill from a fixture"
      hint={
        kind === "teamList"
          ? "Pulls the fixture heading and the saved team list (fill-in players excluded)."
          : "Fills the fixture details; hype / note lines stay for you to write."
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField label="Grade" value={grade} onChange={(v) => { setGrade(v); setFixtureId(null); }}>
          <option value="">All grades</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <SelectField
          label="Fixture"
          value={fixtureId == null ? "" : String(fixtureId)}
          disabled={fixtures.length === 0}
          onChange={(v) => setFixtureId(v ? Number(v) : null)}
        >
          <option value="">{fixtures.length === 0 ? "No fixtures" : "Select a fixture…"}</option>
          {fixtures.map((f) => <option key={f.id} value={f.id}>{label(f)}</option>)}
        </SelectField>
      </div>
      <ApplyButton
        onClick={apply}
        disabled={fixtureId == null || (kind === "teamList" && teamListQ.isLoading)}
        loading={kind === "teamList" && teamListQ.isLoading}
      />
    </PrefillCard>
  );
}

/* --------------------------------------------------------------- From stats */

function LadderPrefillPanel({ onApply }: { onApply: Apply }) {
  const [grade, setGrade] = useState<string>(GRADES[0]);
  const [seasonYear, setSeasonYear] = useState<number>(defaultSeasonYear());

  const params = useMemo(() => ({ grade, season: seasonYear }), [grade, seasonYear]);
  const q = useGetSocialLadderPrefill(params, {
    query: { enabled: false, queryKey: getGetSocialLadderPrefillQueryKey(params) },
  });

  const apply = async () => {
    const res = await q.refetch();
    if (res.data) onApply(ladderRowsToState(grade, res.data));
  };

  return (
    <PrefillCard title="Prefill from the ladder" hint="Loads the current standings for the grade.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField label="Grade" value={grade} onChange={setGrade}>
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <YearField value={seasonYear} onChange={setSeasonYear} />
      </div>
      <ApplyButton onClick={apply} disabled={q.isFetching} loading={q.isFetching} />
    </PrefillCard>
  );
}

function ClubTotalsPrefillPanel({ onApply }: { onApply: Apply }) {
  const [seasonYear, setSeasonYear] = useState<number>(defaultSeasonYear());
  const [category, setCategory] = useState<"Runs" | "Wickets">("Runs");

  const params = useMemo(() => ({ season: seasonYear }), [seasonYear]);
  const q = useGetSocialClubSeasonTotals(params, {
    query: { enabled: false, queryKey: getGetSocialClubSeasonTotalsQueryKey(params) },
  });

  const apply = async () => {
    const res = await q.refetch();
    if (res.data) onApply(clubSeasonTotalsToState(seasonYear, category, res.data));
  };

  return (
    <PrefillCard title="Prefill club leaders" hint="Loads the top player per grade for the season.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <YearField value={seasonYear} onChange={setSeasonYear} />
        <SelectField label="Category" value={category} onChange={(v) => setCategory(v as "Runs" | "Wickets")}>
          <option value="Runs">Runs</option>
          <option value="Wickets">Wickets</option>
        </SelectField>
      </div>
      <ApplyButton onClick={apply} disabled={q.isFetching} loading={q.isFetching} />
    </PrefillCard>
  );
}

function WeekendWrapPrefillPanel({ onApply }: { onApply: Apply }) {
  const [seasonYear, setSeasonYear] = useState<number>(defaultSeasonYear());
  const [round, setRound] = useState<number>(1);

  const params = useMemo(() => ({ season: seasonYear, round }), [seasonYear, round]);
  const q = useGetSocialWeekendWrapPrefill(params, {
    query: { enabled: false, queryKey: getGetSocialWeekendWrapPrefillQueryKey(params) },
  });

  const apply = async () => {
    const res = await q.refetch();
    if (res.data) onApply(weekendWrapToState(res.data));
  };

  return (
    <PrefillCard title="Prefill the weekend wrap" hint="Loads each grade's result for the round.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <YearField value={seasonYear} onChange={setSeasonYear} />
        <div className="space-y-1">
          <Label>Round</Label>
          <Input
            type="number"
            value={String(round)}
            onChange={(e) => setRound(Number(e.target.value) || 1)}
          />
        </div>
      </div>
      <ApplyButton onClick={apply} disabled={q.isFetching} loading={q.isFetching} />
    </PrefillCard>
  );
}

/* ------------------------------------------------------------------ Shared */

function PrefillCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select
        className={selectClass}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

function YearField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label>Season start year</Label>
      <Input
        type="number"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value) || value)}
      />
    </div>
  );
}

function ApplyButton({
  onClick,
  disabled,
  loading,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={onClick} disabled={disabled}>
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        Prefill
      </Button>
    </div>
  );
}
