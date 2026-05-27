import { Link } from "wouter";
import { useMemo, useState } from "react";
import { useListPremierships } from "@workspace/api-client-react";
import type { Premiership, PremiershipPlayer } from "@workspace/api-client-react";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";

const PLAQUE_FONT = "'Inter', sans-serif";

const formatDate = (d: string | null | undefined) => {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const PlayerLine = ({ p }: { p: PremiershipPlayer }) => {
  const display = p.name.replace(/\s+/g, " ").trim().toUpperCase();
  const label = p.isCaptain ? `${display} (CAPT)` : display;
  const justified =
    "block leading-snug text-justify [text-align-last:justify] whitespace-nowrap overflow-hidden";
  return (
    <li>
      {p.playerId ? (
        <Link
          href={`/players/${p.playerId}`}
          className={`${justified} hover:underline text-slate-900`}
        >
          {label}
        </Link>
      ) : (
        <span className={`${justified} text-slate-900`}>{label}</span>
      )}
    </li>
  );
};

const Plaque = ({ prem }: { prem: Premiership }) => {
  return (
    <div
      className="relative shadow-xl border border-slate-900/60 p-2 aspect-[564/965] overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #c8ccd1 0%, #e8ebee 20%, #b8bdc4 40%, #d8dce0 60%, #aeb3ba 80%, #c8ccd1 100%)",
        fontFamily: PLAQUE_FONT,
      }}
    >
      <div className="h-full border-[3px] border-slate-800 p-[3px]">
        <div
          className="h-full px-3 py-3 text-center flex flex-col border border-slate-800 overflow-hidden"
          style={{
            color: "#0f172a",
            fontFamily: PLAQUE_FONT,
          }}
        >
        <div className="text-[15px] font-bold tracking-wide leading-tight">
          {prem.grade.toUpperCase()}
        </div>

        {prem.venue && (
          <div className="text-[12px] font-bold mt-3 leading-tight">
            {prem.venue.toUpperCase()}
          </div>
        )}
        {prem.matchDate && (
          <div className="text-[12px] font-bold leading-tight">
            {formatDate(prem.matchDate)}
          </div>
        )}

        <ul className="text-[12px] font-semibold list-none p-0 mt-3 mb-0 flex-1 space-y-0.5">
          {prem.players.map((p) => (
            <PlayerLine key={p.id} p={p} />
          ))}
        </ul>

        {prem.mom && (
          <div className="text-[12px] font-bold mt-3 leading-tight">
            M.O.M - {prem.mom.toUpperCase()}
          </div>
        )}

        {prem.result && (
          <div className="text-[12px] font-bold mt-3 leading-tight whitespace-pre-line">
            {prem.result.replace(/\s+def\s+/i, "\nDEF\n").toUpperCase()}
          </div>
        )}

        </div>
      </div>
    </div>
  );
};

export default function Premierships() {
  const { data: premierships, isLoading } = useListPremierships();
  const [selectedGrade, setSelectedGrade] = useState<string>("All");

  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const p of premierships ?? []) set.add(p.grade);
    return ["All", ...Array.from(set).sort()];
  }, [premierships]);

  const filtered = useMemo(() => {
    if (!premierships) return [];
    const list =
      selectedGrade === "All"
        ? premierships
        : premierships.filter((p) => p.grade === selectedGrade);
    return [...list].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return (a.matchDate ?? "").localeCompare(b.matchDate ?? "");
    });
  }, [premierships, selectedGrade]);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-md p-6 md:p-8 flex items-center gap-4 md:gap-6 shadow-lg">
        <img src={logoUrl} alt="HHCC" className="h-16 md:h-20 w-auto drop-shadow-lg" />
        <div>
          <h1 className="text-2xl md:text-4xl font-serif font-bold text-primary m-0 leading-tight">
            Premierships Honour Board
          </h1>
          <div className="text-xs md:text-sm uppercase tracking-widest text-muted-foreground mt-2">
            {premierships?.length ?? 0} premiership{(premierships?.length ?? 0) === 1 ? "" : "s"} since 1991
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md p-4 flex items-center gap-3 flex-wrap shadow-md">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">Grade</span>
        <select
          value={selectedGrade}
          onChange={(e) => setSelectedGrade(e.target.value)}
          className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
        >
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground italic ml-auto">
          {filtered.length} shown
        </span>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading premierships…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground italic">
          No premierships found.
        </div>
      ) : (
        <div
          className="rounded-md p-4 md:p-6 shadow-inner mx-[calc(50%-50vw)] w-screen"
          style={{
            background:
              "linear-gradient(180deg, #1a1410 0%, #2a201a 50%, #1a1410 100%)",
          }}
        >
          <div className="grid gap-3 md:gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] items-stretch">
            {filtered.map((p) => (
              <Plaque key={p.id} prem={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
