import { useState, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useListPlayers, useGetPlayer, getGetPlayerQueryKey } from "@workspace/api-client-react";
import type { Player, Stat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Side = "a" | "b";

function PlayerPicker({ value, onChange, label }: { value: number | null; onChange: (id: number | null) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data } = useListPlayers({ search, page: 1, limit: 20 });
  const { data: selected } = useGetPlayer(value ?? 0, {
    query: { enabled: !!value, queryKey: getGetPlayerQueryKey(value ?? 0) },
  });

  const buttonLabel = selected ? `${selected.givenName} ${selected.surname}` : `Select ${label}...`;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="flex-1 justify-between font-normal">
              <span className={cn("truncate", !selected && "text-muted-foreground")}>{buttonLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Search players..." value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>No players found.</CommandEmpty>
                <CommandGroup>
                  {data?.players.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={String(p.id)}
                      onSelect={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1">{p.surname}, {p.givenName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{p.gradesPlayed || ""}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value && (
          <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

type Row = {
  label: string;
  aValue: number | null;
  bValue: number | null;
  format?: (v: number) => string;
  higherIsBetter?: boolean;
};

function compareRow({ aValue, bValue, higherIsBetter = true }: Row): "a" | "b" | "tie" | "none" {
  if (aValue == null && bValue == null) return "none";
  if (aValue == null) return "b";
  if (bValue == null) return "a";
  if (aValue === bValue) return "tie";
  if (higherIsBetter) return aValue > bValue ? "a" : "b";
  return aValue < bValue ? "a" : "b";
}

function formatVal(v: number | null, fmt?: (v: number) => string) {
  if (v == null) return "-";
  return fmt ? fmt(v) : String(v);
}

function StatRow({ row }: { row: Row }) {
  const winner = compareRow(row);
  const aClass = winner === "a" ? "bg-primary/15 text-primary font-bold" : "";
  const bClass = winner === "b" ? "bg-primary/15 text-primary font-bold" : "";
  return (
    <tr className="border-b last:border-0">
      <td className={cn("p-3 text-right font-mono w-1/3", aClass)}>{formatVal(row.aValue, row.format)}</td>
      <td className="p-3 text-center text-sm text-muted-foreground w-1/3">{row.label}</td>
      <td className={cn("p-3 text-left font-mono w-1/3", bClass)}>{formatVal(row.bValue, row.format)}</td>
    </tr>
  );
}

function aggregateCareer(stats: Stat[] | undefined) {
  if (!stats) return null;
  let games = 0, innings = 0, runs = 0, wickets = 0, catches = 0, stumpings = 0, runOuts = 0, hundreds = 0, fifties = 0, fiveWickets = 0;
  for (const s of stats) {
    games += s.games ?? 0;
    innings += s.innings ?? 0;
    runs += s.runs ?? 0;
    wickets += s.wickets ?? 0;
    catches += s.catches ?? 0;
    stumpings += s.stumpings ?? 0;
    runOuts += s.runOuts ?? 0;
    hundreds += s.hundreds ?? 0;
    fifties += s.fifties ?? 0;
    fiveWickets += s.fiveWickets ?? 0;
  }
  return { games, innings, runs, wickets, catches, stumpings, runOuts, hundreds, fifties, fiveWickets };
}

const STAT_FIELDS: Array<{ key: keyof Stat; label: string; higherIsBetter?: boolean; format?: (v: number) => string }> = [
  { key: "games", label: "Matches" },
  { key: "innings", label: "Innings" },
  { key: "notOuts", label: "Not Outs" },
  { key: "runs", label: "Runs" },
  { key: "batAvg", label: "Batting Avg", format: (v) => v.toFixed(2) },
  { key: "hundreds", label: "100s" },
  { key: "fifties", label: "50s" },
  { key: "wickets", label: "Wickets" },
  { key: "bowlAvg", label: "Bowling Avg", format: (v) => v.toFixed(2), higherIsBetter: false },
  { key: "fiveWickets", label: "5WI" },
  { key: "catches", label: "Catches" },
  { key: "stumpings", label: "Stumpings" },
  { key: "runOuts", label: "Run Outs" },
];

export default function Compare() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const initialA = params.get("a") ? parseInt(params.get("a")!, 10) : null;
  const initialB = params.get("b") ? parseInt(params.get("b")!, 10) : null;
  const [a, setA] = useState<number | null>(initialA);
  const [b, setB] = useState<number | null>(initialB);

  useEffect(() => {
    const next = new URLSearchParams();
    if (a) next.set("a", String(a));
    if (b) next.set("b", String(b));
    const qs = next.toString();
    const desired = qs ? `/compare?${qs}` : "/compare";
    if (location + (search ? `?${search}` : "") !== desired) {
      setLocation(desired, { replace: true });
    }
  }, [a, b, location, search, setLocation]);

  const { data: playerA } = useGetPlayer(a ?? 0, { query: { enabled: !!a, queryKey: getGetPlayerQueryKey(a ?? 0) } });
  const { data: playerB } = useGetPlayer(b ?? 0, { query: { enabled: !!b, queryKey: getGetPlayerQueryKey(b ?? 0) } });

  const careerA = aggregateCareer(playerA?.stats);
  const careerB = aggregateCareer(playerB?.stats);

  const careerRows: Row[] = useMemo(() => {
    if (!careerA && !careerB) return [];
    const safe = (o: ReturnType<typeof aggregateCareer> | null, k: keyof NonNullable<ReturnType<typeof aggregateCareer>>) =>
      o ? o[k] : null;
    const batAvgA = careerA && (careerA.innings ?? 0) > 0 ? careerA.runs / careerA.innings : null;
    const batAvgB = careerB && (careerB.innings ?? 0) > 0 ? careerB.runs / careerB.innings : null;
    const bowlAvgA = careerA && careerA.wickets > 0 ? (playerA?.stats.reduce((s, x) => s + (x.runsConceded ?? 0), 0) ?? 0) / careerA.wickets : null;
    const bowlAvgB = careerB && careerB.wickets > 0 ? (playerB?.stats.reduce((s, x) => s + (x.runsConceded ?? 0), 0) ?? 0) / careerB.wickets : null;
    return [
      { label: "Matches", aValue: safe(careerA, "games"), bValue: safe(careerB, "games") },
      { label: "Innings", aValue: safe(careerA, "innings"), bValue: safe(careerB, "innings") },
      { label: "Runs", aValue: safe(careerA, "runs"), bValue: safe(careerB, "runs") },
      { label: "Batting Avg", aValue: batAvgA, bValue: batAvgB, format: (v) => v.toFixed(2) },
      { label: "100s", aValue: safe(careerA, "hundreds"), bValue: safe(careerB, "hundreds") },
      { label: "50s", aValue: safe(careerA, "fifties"), bValue: safe(careerB, "fifties") },
      { label: "Wickets", aValue: safe(careerA, "wickets"), bValue: safe(careerB, "wickets") },
      { label: "Bowling Avg", aValue: bowlAvgA, bValue: bowlAvgB, format: (v) => v.toFixed(2), higherIsBetter: false },
      { label: "5WI", aValue: safe(careerA, "fiveWickets"), bValue: safe(careerB, "fiveWickets") },
      { label: "Catches", aValue: safe(careerA, "catches"), bValue: safe(careerB, "catches") },
      { label: "Stumpings", aValue: safe(careerA, "stumpings"), bValue: safe(careerB, "stumpings") },
      { label: "Run Outs", aValue: safe(careerA, "runOuts"), bValue: safe(careerB, "runOuts") },
    ];
  }, [careerA, careerB, playerA, playerB]);

  const allGrades = useMemo(() => {
    const set = new Set<string>();
    playerA?.stats.forEach((s) => set.add(s.grade));
    playerB?.stats.forEach((s) => set.add(s.grade));
    return Array.from(set).sort();
  }, [playerA, playerB]);

  function statFor(stats: Stat[] | undefined, grade: string): Stat | undefined {
    return stats?.find((s) => s.grade === grade);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Head-to-Head</h1>
        <p className="text-muted-foreground mt-1">Pick any two players and compare their careers side-by-side.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-card border rounded-lg p-4 shadow-sm">
        <PlayerPicker value={a} onChange={setA} label="Player A" />
        <PlayerPicker value={b} onChange={setB} label="Player B" />
      </div>

      {!a || !b ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          Select two players to see a head-to-head comparison.
        </div>
      ) : (
        <>
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 border-b bg-muted/50">
              <div className="p-4 text-right font-serif text-lg font-bold text-primary">
                {playerA ? `${playerA.givenName} ${playerA.surname}` : "..."}
              </div>
              <div className="p-4 text-center font-serif uppercase tracking-wider text-sm text-muted-foreground self-center">
                Career Totals
              </div>
              <div className="p-4 text-left font-serif text-lg font-bold text-primary">
                {playerB ? `${playerB.givenName} ${playerB.surname}` : "..."}
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {careerRows.map((row) => (
                  <StatRow key={row.label} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          {allGrades.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-serif font-bold">By Grade</h2>
              {allGrades.map((grade) => {
                const sa = statFor(playerA?.stats, grade);
                const sb = statFor(playerB?.stats, grade);
                const rows: Row[] = STAT_FIELDS.map(({ key, label, higherIsBetter, format }) => ({
                  label,
                  aValue: (sa?.[key] as number | null | undefined) ?? null,
                  bValue: (sb?.[key] as number | null | undefined) ?? null,
                  higherIsBetter,
                  format,
                }));
                return (
                  <div key={grade} className="bg-card border rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/50 font-semibold text-primary">{grade}</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {rows.map((row) => (
                          <StatRow key={row.label} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
