import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useGetRecords,
  useListGrades,
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  useGetPartnerships,
  useListCenturies,
  useListFiveWicketHauls,
  useGetRecordsDisplaySettings,
  type Stat,
  type PartnershipRecord,
  type Century,
  type FiveWicketHaul,
  type RecordsDisplaySettings,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Award, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { GradeBadge, GradeBadgeList, sortGradesBySeniority } from "@/components/grade-badge";
import { ShareButton } from "@/components/share-card-modal";
import type { ShareCardInput } from "@/lib/share-card";

type Tab = "total" | "by-grade" | "partnerships" | "centuries" | "five-for";

type RecordRow = {
  title: string;
  value: string | number;
  stat: {
    playerId: number;
    givenName: string;
    surname: string;
    grade?: string;
    grades?: string[];
  } | null;
};

const parseHs = (hs: string | null | undefined): number => {
  if (!hs) return 0;
  const n = parseInt(String(hs).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};
const parseBb = (bb: string | null | undefined): { wkts: number; runs: number } => {
  if (!bb) return { wkts: 0, runs: 0 };
  const m = String(bb).match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { wkts: parseInt(m[1], 10), runs: parseInt(m[2], 10) } : { wkts: 0, runs: 0 };
};
// Master seasons are display strings like "2024/25"; sort on the leading year.
const seasonYear = (s: string | null | undefined): number => {
  if (!s) return -Infinity;
  const m = String(s).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : -Infinity;
};
// Partnership wickets are ordinals ("1st".."10th"); sort numerically.
const wicketOrd = (w: string | null | undefined): number => {
  if (!w) return 999;
  const m = String(w).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
};
// Rank best-bowling so "more wickets, fewer runs" sorts highest.
const figuresRank = (f: string | null | undefined): number => {
  const { wkts, runs } = parseBb(f);
  return wkts * 1000 - runs;
};

// --- Sorting infrastructure ------------------------------------------------

type Dir = "asc" | "desc";
type SortState = { col: string; dir: Dir };

const parseSort = (s: string | undefined, fallbackCol: string): SortState => {
  if (!s) return { col: fallbackCol, dir: "desc" };
  const i = s.lastIndexOf("-");
  if (i < 0) return { col: s, dir: "desc" };
  const dir = s.slice(i + 1);
  return { col: s.slice(0, i), dir: dir === "asc" ? "asc" : "desc" };
};

function applySort<T>(
  rows: T[],
  sort: SortState,
  getVal: (row: T, col: string) => number | string,
): T[] {
  return [...rows].sort((a, b) => {
    const va = getVal(a, sort.col);
    const vb = getVal(b, sort.col);
    let c: number;
    if (typeof va === "number" && typeof vb === "number") {
      c = va === vb ? 0 : va < vb ? -1 : 1;
    } else {
      c = String(va).localeCompare(String(vb));
    }
    return sort.dir === "asc" ? c : -c;
  });
}

const SortHeader = ({
  label,
  col,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  col: string;
  sort: SortState;
  onSort: (col: string) => void;
  className?: string;
}) => {
  const active = sort.col === col;
  return (
    <th className={`px-4 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-xs ${
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`sort-${col}`}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
};

const useSort = (initial: SortState): [SortState, (col: string) => void] => {
  const [sort, setSort] = useState<SortState>(initial);
  // Re-sync when the admin default arrives after first render.
  useEffect(() => setSort(initial), [initial.col, initial.dir]);
  const onSort = (col: string) =>
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" },
    );
  return [sort, onSort];
};

const computeGradeRecords = (stats: Stat[]): RecordRow[] => {
  if (!stats?.length) {
    return [
      "Most Games","Most Runs","Highest Score","Most Fifties",
      "Most Hundreds","Most Wickets","Best Bowling","Most Catches",
    ].map((title) => ({ title, value: "-", stat: null }));
  }
  const meta = (s: Stat) => ({ playerId: s.playerId, givenName: s.givenName, surname: s.surname, grade: s.grade });
  const max = (key: keyof Stat): RecordRow => {
    let best: Stat | null = null;
    let bestV = -1;
    for (const s of stats) {
      const v = (s[key] as number | null | undefined) ?? 0;
      if (v > bestV) { bestV = v; best = s; }
    }
    return best ? { title: "", value: bestV, stat: meta(best) } : { title: "", value: 0, stat: null };
  };

  let bestHs: Stat | null = null;
  let bestHsV = -1;
  for (const s of stats) {
    const v = parseHs(s.highScore);
    if (v > bestHsV) { bestHsV = v; bestHs = s; }
  }

  let bestBbStat: Stat | null = null;
  let bestBb = { wkts: -1, runs: Infinity };
  for (const s of stats) {
    const b = parseBb(s.bestBowling);
    if (b.wkts > bestBb.wkts || (b.wkts === bestBb.wkts && b.runs < bestBb.runs)) {
      bestBb = b; bestBbStat = s;
    }
  }

  const g = max("games");
  const r = max("runs");
  const f = max("fifties");
  const h = max("hundreds");
  const w = max("wickets");
  const c = max("catches");

  const guard = (row: RecordRow): RecordRow =>
    typeof row.value === "number" && row.value <= 0 ? { ...row, value: "-", stat: null } : row;

  return [
    guard({ title: "Most Games", value: g.value || 0, stat: g.stat }),
    guard({ title: "Most Runs", value: r.value || 0, stat: r.stat }),
    bestHsV > 0 && bestHs
      ? { title: "Highest Score", value: bestHs.highScore ?? "-", stat: meta(bestHs) }
      : { title: "Highest Score", value: "-", stat: null },
    guard({ title: "Most Fifties", value: f.value || 0, stat: f.stat }),
    guard({ title: "Most Hundreds", value: h.value || 0, stat: h.stat }),
    guard({ title: "Most Wickets", value: w.value || 0, stat: w.stat }),
    bestBb.wkts > 0 && bestBbStat
      ? { title: "Best Bowling", value: bestBbStat.bestBowling ?? "-", stat: meta(bestBbStat) }
      : { title: "Best Bowling", value: "-", stat: null },
    guard({ title: "Most Catches", value: c.value || 0, stat: c.stat }),
  ];
};

const RecordCard = ({ row }: { row: RecordRow }) => {
  const shareInput: ShareCardInput | null = row.stat
    ? {
        kind: "record",
        title: row.title,
        playerName: `${row.stat.givenName} ${row.stat.surname}`.trim(),
        value: row.value,
        grade: row.stat.grade ?? null,
      }
    : null;
  return (
    <Card className="hover:border-primary transition-colors group">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{row.title}</CardTitle>
        {shareInput && (
          <ShareButton
            input={shareInput}
            appPath={`/players/${row.stat!.playerId}`}
            playerId={row.stat!.playerId}
            variant="ghost"
            label=""
          />
        )}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-serif font-bold text-primary mb-1 group-hover:scale-105 transition-transform origin-left">
          {typeof row.value === "number" ? row.value.toLocaleString() : row.value}
        </div>
        {row.stat ? (
          <>
            <Link href={`/players/${row.stat.playerId}`} className="text-sm font-medium hover:underline text-foreground">
              {row.stat.givenName} {row.stat.surname}
            </Link>
            {row.stat.grades && row.stat.grades.length > 0 ? (
              <div className="mt-2">
                <GradeBadgeList
                  grades={sortGradesBySeniority(row.stat.grades)}
                  size="sm"
                />
              </div>
            ) : (
              row.stat.grade && (
                <div className="mt-1 flex items-center gap-2">
                  <GradeBadge grade={row.stat.grade} size="sm" />
                  <span className="text-xs text-muted-foreground">{row.stat.grade}</span>
                </div>
              )
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground italic">No data</div>
        )}
      </CardContent>
    </Card>
  );
};

const PlayerName = ({
  playerId,
  name,
}: {
  playerId: number | null | undefined;
  name: string;
}) =>
  playerId != null ? (
    <Link href={`/players/${playerId}`} className="font-medium hover:underline text-foreground">
      {name}
    </Link>
  ) : (
    <span className="text-foreground">{name}</span>
  );

const TableShell = ({
  head,
  empty,
  children,
}: {
  head: ReactNode;
  empty: boolean;
  children: ReactNode;
}) => (
  <div className="bg-card border border-border rounded-md overflow-hidden shadow-md">
    {empty ? (
      <div className="p-12 text-center text-muted-foreground">No records yet.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm sticky-id-col">
          <thead>
            <tr className="bg-muted/50 text-left">{head}</tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    )}
  </div>
);

// Reusable grade filter dropdown shown above the records tables.
const GradeFilter = ({
  grades,
  value,
  onChange,
  allLabel = "All grades",
}: {
  grades: string[];
  value: string;
  onChange: (g: string) => void;
  allLabel?: string;
}) => (
  <div className="bg-card border border-border rounded-md p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap shadow-md">
    <span className="text-xs font-bold uppercase tracking-widest text-primary">Grade</span>
    <div className="flex items-center gap-3 self-start">
      {value && <GradeBadge grade={value} size="md" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
        data-testid="select-records-grade"
      >
        <option value="">{allLabel}</option>
        {grades.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
    </div>
  </div>
);

const PartnershipsSection = ({
  settings,
  gradeRank,
}: {
  settings: RecordsDisplaySettings | undefined;
  gradeRank: (g: string) => number;
}) => {
  const { data, isLoading } = useGetPartnerships();
  const records = useMemo(() => data?.records ?? [], [data]);
  const fiftyPlus = useMemo(() => data?.fiftyPlus ?? [], [data]);

  // Grades present across both partnership lists, in seniority order.
  const grades = useMemo(
    () =>
      sortGradesBySeniority(
        new Set([...records, ...fiftyPlus].map((p) => p.grade)),
      ),
    [records, fiftyPlus],
  );

  const [grade, setGrade] = useState<string>("");
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (!applied && settings) {
      setGrade(settings.partnershipsDefaultGrade);
      setApplied(true);
    }
  }, [settings, applied]);

  const getVal = (p: PartnershipRecord, col: string): number | string => {
    switch (col) {
      case "grade": return gradeRank(p.grade);
      case "wicket": return wicketOrd(p.wicket);
      case "runs": return p.runs;
      case "batsmen": return p.batsmen.toLowerCase();
      case "opposition": return (p.opposition ?? "").toLowerCase();
      case "season": return seasonYear(p.season);
      default: return 0;
    }
  };

  // "All grades": the single highest stand for each wicket across every grade,
  // ordered 1st → 10th. A specific grade: that grade's highest stand per wicket.
  const bestPerWicket = useMemo(() => {
    const pool = grade ? records.filter((p) => p.grade === grade) : records;
    const byWicket = new Map<number, PartnershipRecord>();
    for (const p of pool) {
      const ord = wicketOrd(p.wicket);
      const cur = byWicket.get(ord);
      if (!cur || p.runs > cur.runs) byWicket.set(ord, p);
    }
    return [...byWicket.values()].sort((a, b) => wicketOrd(a.wicket) - wicketOrd(b.wicket));
  }, [records, grade]);

  const [fiftySort, onFiftySort] = useSort({ col: "runs", dir: "desc" });
  const fiftyRows = useMemo(() => {
    const pool = grade ? fiftyPlus.filter((p) => p.grade === grade) : fiftyPlus;
    return applySort(pool, fiftySort, getVal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiftyPlus, grade, fiftySort]);

  if (isLoading) {
    return <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>;
  }

  const row = (p: PartnershipRecord) => (
    <tr key={p.id} className="hover:bg-muted/30">
      <td className="px-4 py-3"><GradeBadge grade={p.grade} size="sm" /></td>
      <td className="px-4 py-3 whitespace-nowrap">{p.wicket}</td>
      <td className="px-4 py-3 font-serif font-bold text-primary">{p.runs}</td>
      <td className="px-4 py-3">{p.batsmen}</td>
      <td className="px-4 py-3 text-muted-foreground">{p.opposition ?? "-"}</td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.season ?? "-"}</td>
    </tr>
  );

  const staticHead = ["Grade", "Wicket", "Runs", "Batsmen", "Opposition", "Season"].map((c) => (
    <th key={c} className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-muted-foreground">
      {c}
    </th>
  ));

  return (
    <div className="space-y-6">
      <GradeFilter grades={grades} value={grade} onChange={setGrade} />
      <section className="space-y-3">
        <h2 className="text-xl font-serif font-bold">
          {grade
            ? `Highest Partnership per Wicket — ${grade}`
            : "Highest Partnership per Wicket (all grades)"}
        </h2>
        <TableShell head={staticHead} empty={bestPerWicket.length === 0}>
          {bestPerWicket.map(row)}
        </TableShell>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-serif font-bold">
          {grade ? `All 50+ Partnerships — ${grade}` : "All 50+ Partnerships"}
        </h2>
        <TableShell
          head={
            <>
              <SortHeader label="Grade" col="grade" sort={fiftySort} onSort={onFiftySort} />
              <SortHeader label="Wicket" col="wicket" sort={fiftySort} onSort={onFiftySort} />
              <SortHeader label="Runs" col="runs" sort={fiftySort} onSort={onFiftySort} />
              <SortHeader label="Batsmen" col="batsmen" sort={fiftySort} onSort={onFiftySort} />
              <SortHeader label="Opposition" col="opposition" sort={fiftySort} onSort={onFiftySort} />
              <SortHeader label="Season" col="season" sort={fiftySort} onSort={onFiftySort} />
            </>
          }
          empty={fiftyRows.length === 0}
        >
          {fiftyRows.map(row)}
        </TableShell>
      </section>
    </div>
  );
};

const CenturiesSection = ({
  settings,
  gradeRank,
  grades,
}: {
  settings: RecordsDisplaySettings | undefined;
  gradeRank: (g: string) => number;
  grades: string[];
}) => {
  const { data, isLoading } = useListCenturies();
  const all = useMemo(() => data ?? [], [data]);
  const [grade, setGrade] = useState<string>("");
  const [sort, onSort] = useSort(parseSort(settings?.centuriesSort, "season"));

  const getVal = (c: Century, col: string): number | string => {
    switch (col) {
      case "grade": return gradeRank(c.grade);
      case "batsman": return c.batsman.toLowerCase();
      case "score": return parseHs(c.score);
      case "season": return seasonYear(c.season);
      default: return 0;
    }
  };

  const rows = useMemo(() => {
    const pool = grade ? all.filter((c) => c.grade === grade) : all;
    return applySort(pool, sort, getVal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, grade, sort]);

  if (isLoading) {
    return <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <GradeFilter grades={grades} value={grade} onChange={setGrade} />
      <TableShell
        head={
          <>
            <SortHeader label="Grade" col="grade" sort={sort} onSort={onSort} />
            <SortHeader label="Batsman" col="batsman" sort={sort} onSort={onSort} />
            <SortHeader label="Score" col="score" sort={sort} onSort={onSort} />
            <SortHeader label="Season" col="season" sort={sort} onSort={onSort} />
          </>
        }
        empty={rows.length === 0}
      >
        {rows.map((c: Century) => (
          <tr key={c.id} className="hover:bg-muted/30">
            <td className="px-4 py-3"><GradeBadge grade={c.grade} size="sm" /></td>
            <td className="px-4 py-3"><PlayerName playerId={c.playerId} name={c.batsman} /></td>
            <td className="px-4 py-3 font-serif font-bold text-primary">{c.score ?? "-"}</td>
            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{c.season ?? "-"}</td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
};

const FiveForSection = ({
  settings,
  gradeRank,
  grades,
}: {
  settings: RecordsDisplaySettings | undefined;
  gradeRank: (g: string) => number;
  grades: string[];
}) => {
  const { data, isLoading } = useListFiveWicketHauls();
  const all = useMemo(() => data ?? [], [data]);
  const [grade, setGrade] = useState<string>("");
  const [sort, onSort] = useSort(parseSort(settings?.fiveForSort, "season"));

  const getVal = (f: FiveWicketHaul, col: string): number | string => {
    switch (col) {
      case "grade": return gradeRank(f.grade);
      case "bowler": return f.bowler.toLowerCase();
      case "figures": return figuresRank(f.figures);
      case "season": return seasonYear(f.season);
      default: return 0;
    }
  };

  const rows = useMemo(() => {
    const pool = grade ? all.filter((f) => f.grade === grade) : all;
    return applySort(pool, sort, getVal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, grade, sort]);

  if (isLoading) {
    return <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <GradeFilter grades={grades} value={grade} onChange={setGrade} />
      <TableShell
        head={
          <>
            <SortHeader label="Grade" col="grade" sort={sort} onSort={onSort} />
            <SortHeader label="Bowler" col="bowler" sort={sort} onSort={onSort} />
            <SortHeader label="Figures" col="figures" sort={sort} onSort={onSort} />
            <SortHeader label="Season" col="season" sort={sort} onSort={onSort} />
          </>
        }
        empty={rows.length === 0}
      >
        {rows.map((f: FiveWicketHaul) => (
          <tr key={f.id} className="hover:bg-muted/30">
            <td className="px-4 py-3"><GradeBadge grade={f.grade} size="sm" /></td>
            <td className="px-4 py-3"><PlayerName playerId={f.playerId} name={f.bowler} /></td>
            <td className="px-4 py-3 font-serif font-bold text-primary">{f.figures ?? "-"}</td>
            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{f.season ?? "-"}</td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
};

export default function Records() {
  const settingsQuery = useGetRecordsDisplaySettings();
  const settings = settingsQuery.data;
  const settingsSettled = !settingsQuery.isLoading;
  const [tab, setTab] = useState<Tab>("total");
  const [selectedGrade, setSelectedGrade] = useState<string>("");
  const [tabApplied, setTabApplied] = useState(false);
  const [gradeApplied, setGradeApplied] = useState(false);

  const { data: records, isLoading: loadingTotal } = useGetRecords();
  const { data: gradesList } = useListGrades();
  const grades = useMemo(() => (gradesList ?? []).map((g) => g.grade), [gradesList]);

  // Rank grades by seniority so a "Grade" sort column orders A → Colts.
  const gradeRank = useMemo(() => {
    const order = sortGradesBySeniority(grades);
    const idx = new Map(order.map((g, i) => [g, i]));
    return (g: string) => idx.get(g) ?? order.length;
  }, [grades]);

  // Apply the admin default tab once (visitor can still switch afterwards).
  useEffect(() => {
    if (!tabApplied && settings) {
      setTab(settings.defaultTab);
      setTabApplied(true);
    }
  }, [settings, tabApplied]);

  // By Grade default applied ONCE, after settings are settled, so a slow
  // settings fetch can't be pre-empted by grades arriving first. Admin-chosen
  // grade wins when set & still valid; otherwise fall back to the first grade.
  useEffect(() => {
    if (gradeApplied || grades.length === 0 || !settingsSettled) return;
    const preferred = settings?.byGradeDefaultGrade;
    setSelectedGrade(preferred && grades.includes(preferred) ? preferred : grades[0]);
    setGradeApplied(true);
  }, [grades, settingsSettled, settings, gradeApplied]);

  const { data: gradeStats, isLoading: loadingGrade } = useGetGradeLeaderboard(selectedGrade, {
    query: { enabled: tab === "by-grade" && !!selectedGrade, queryKey: getGetGradeLeaderboardQueryKey(selectedGrade) },
  });

  const totalRows: RecordRow[] = useMemo(() => {
    if (!records) return [];
    const agg = (title: string, r: { playerId: number; givenName: string; surname: string; value: number; grades: string[] }): RecordRow =>
      ({ title, value: r.value || 0, stat: { playerId: r.playerId, givenName: r.givenName, surname: r.surname, grades: r.grades } });
    const peak = (title: string, value: string | number, s: { playerId: number; givenName: string; surname: string; grade: string }): RecordRow =>
      ({ title, value, stat: { playerId: s.playerId, givenName: s.givenName, surname: s.surname, grade: s.grade } });
    return [
      agg("Most Games", records.mostGames),
      agg("Most Runs", records.mostRuns),
      peak("Highest Score", records.highestScore.highScore || "-", records.highestScore),
      agg("Most Fifties", records.mostFifties),
      agg("Most Hundreds", records.mostHundreds),
      agg("Most Wickets", records.mostWickets),
      peak("Best Bowling", records.bestBowling.bestBowling || "-", records.bestBowling),
      agg("Most Catches", records.mostCatches),
    ];
  }, [records]);

  const gradeRows = useMemo(() => computeGradeRecords(gradeStats ?? []), [gradeStats]);

  const rows = tab === "total" ? totalRows : gradeRows;
  const loading = tab === "total" ? loadingTotal : loadingGrade;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Award className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-serif font-bold">Club Records</h1>
          <p className="text-muted-foreground mt-1">
            {tab === "total"
              ? "All-time leading performances across all grades."
              : tab === "by-grade"
                ? `Leading performances in ${selectedGrade || "the selected grade"}.`
                : tab === "partnerships"
                  ? "Record stands per wicket and every recorded 50+ partnership."
                  : tab === "centuries"
                    ? "Individual centuries recorded across the club's history."
                    : "Five-wicket hauls recorded across the club's history."}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md flex flex-wrap overflow-hidden shadow-md">
        {[
          { key: "total" as Tab, label: "Total Club Records" },
          { key: "by-grade" as Tab, label: "By Grade" },
          { key: "partnerships" as Tab, label: "Partnerships" },
          { key: "centuries" as Tab, label: "Centuries" },
          { key: "five-for" as Tab, label: "5-Wicket Hauls" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 md:px-5 py-3 text-xs md:text-sm font-bold uppercase tracking-wider transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "by-grade" && (
        <div className="bg-card border border-border rounded-md p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap shadow-md">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Grade</span>
          <div className="flex items-center gap-3 self-start">
            {selectedGrade && <GradeBadge grade={selectedGrade} size="md" />}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
            >
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {tab === "partnerships" ? (
        <PartnershipsSection settings={settings} gradeRank={gradeRank} />
      ) : tab === "centuries" ? (
        <CenturiesSection settings={settings} gradeRank={gradeRank} grades={grades} />
      ) : tab === "five-for" ? (
        <FiveForSection settings={settings} gradeRank={gradeRank} grades={grades} />
      ) : loading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {rows.map((r) => <RecordCard key={r.title} row={r} />)}
        </div>
      )}
    </div>
  );
}
