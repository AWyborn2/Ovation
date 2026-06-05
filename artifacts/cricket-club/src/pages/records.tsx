import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useGetRecords,
  useListGrades,
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  useGetPartnerships,
  useListCenturies,
  useListFiveWicketHauls,
  type Stat,
  type PartnershipRecord,
  type Century,
  type FiveWicketHaul,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Award } from "lucide-react";
import { GradeBadge } from "@/components/grade-badge";
import { ShareButton } from "@/components/share-card-modal";
import type { ShareCardInput } from "@/lib/share-card";

type Tab = "total" | "by-grade" | "partnerships" | "centuries" | "five-for";

type RecordRow = {
  title: string;
  value: string | number;
  stat: { playerId: number; givenName: string; surname: string; grade?: string } | null;
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
            {row.stat.grade && (
              <div className="mt-1 flex items-center gap-2">
                <GradeBadge grade={row.stat.grade} size="sm" />
                <span className="text-xs text-muted-foreground">{row.stat.grade}</span>
              </div>
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

const HistoryTable = ({
  columns,
  empty,
  children,
}: {
  columns: string[];
  empty: boolean;
  children: ReactNode;
}) => (
  <div className="bg-card border border-border rounded-md overflow-hidden shadow-md">
    {empty ? (
      <div className="p-12 text-center text-muted-foreground">No records yet.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              {columns.map((c) => (
                <th key={c} className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    )}
  </div>
);

const PartnershipsSection = () => {
  const { data, isLoading } = useGetPartnerships();
  if (isLoading) {
    return <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>;
  }
  const records = data?.records ?? [];
  const fiftyPlus = data?.fiftyPlus ?? [];
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
  const cols = ["Grade", "Wicket", "Runs", "Batsmen", "Opposition", "Season"];
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xl font-serif font-bold">Highest Partnership per Wicket</h2>
        <HistoryTable columns={cols} empty={records.length === 0}>{records.map(row)}</HistoryTable>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-serif font-bold">All 50+ Partnerships</h2>
        <HistoryTable columns={cols} empty={fiftyPlus.length === 0}>{fiftyPlus.map(row)}</HistoryTable>
      </section>
    </div>
  );
};

const CenturiesSection = () => {
  const { data, isLoading } = useListCenturies();
  if (isLoading) {
    return <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>;
  }
  const rows = data ?? [];
  return (
    <HistoryTable columns={["Grade", "Batsman", "Score", "Season"]} empty={rows.length === 0}>
      {rows.map((c: Century) => (
        <tr key={c.id} className="hover:bg-muted/30">
          <td className="px-4 py-3"><GradeBadge grade={c.grade} size="sm" /></td>
          <td className="px-4 py-3"><PlayerName playerId={c.playerId} name={c.batsman} /></td>
          <td className="px-4 py-3 font-serif font-bold text-primary">{c.score ?? "-"}</td>
          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{c.season ?? "-"}</td>
        </tr>
      ))}
    </HistoryTable>
  );
};

const FiveForSection = () => {
  const { data, isLoading } = useListFiveWicketHauls();
  if (isLoading) {
    return <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">Loading…</div>;
  }
  const rows = data ?? [];
  return (
    <HistoryTable columns={["Grade", "Bowler", "Figures", "Season"]} empty={rows.length === 0}>
      {rows.map((f: FiveWicketHaul) => (
        <tr key={f.id} className="hover:bg-muted/30">
          <td className="px-4 py-3"><GradeBadge grade={f.grade} size="sm" /></td>
          <td className="px-4 py-3"><PlayerName playerId={f.playerId} name={f.bowler} /></td>
          <td className="px-4 py-3 font-serif font-bold text-primary">{f.figures ?? "-"}</td>
          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{f.season ?? "-"}</td>
        </tr>
      ))}
    </HistoryTable>
  );
};

export default function Records() {
  const [tab, setTab] = useState<Tab>("total");
  const [selectedGrade, setSelectedGrade] = useState<string>("");

  const { data: records, isLoading: loadingTotal } = useGetRecords();
  const { data: gradesList } = useListGrades();
  const grades = useMemo(() => (gradesList ?? []).map((g) => g.grade), [gradesList]);

  useEffect(() => {
    if (!selectedGrade && grades.length > 0) setSelectedGrade(grades[0]);
  }, [grades, selectedGrade]);

  const { data: gradeStats, isLoading: loadingGrade } = useGetGradeLeaderboard(selectedGrade, {
    query: { enabled: tab === "by-grade" && !!selectedGrade, queryKey: getGetGradeLeaderboardQueryKey(selectedGrade) },
  });

  const totalRows: RecordRow[] = useMemo(() => {
    if (!records) return [];
    const agg = (title: string, r: { playerId: number; givenName: string; surname: string; value: number }): RecordRow =>
      ({ title, value: r.value || 0, stat: { playerId: r.playerId, givenName: r.givenName, surname: r.surname } });
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
        <PartnershipsSection />
      ) : tab === "centuries" ? (
        <CenturiesSection />
      ) : tab === "five-for" ? (
        <FiveForSection />
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
