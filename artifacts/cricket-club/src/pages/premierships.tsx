import { Link } from "wouter";
import { useMemo, useState } from "react";
import { useListPremierships } from "@workspace/api-client-react";
import type { Premiership, PremiershipPlayer } from "@workspace/api-client-react";
import { Trophy } from "lucide-react";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";

const formatDate = (d: string | null | undefined) => {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
};

const PlayerLine = ({ p }: { p: PremiershipPlayer }) => {
  const display = p.name.replace(/\s+/g, " ").trim();
  const inner = (
    <span>
      {display}
      {p.isCaptain && (
        <span className="ml-1 font-bold text-amber-900">(CAPT)</span>
      )}
    </span>
  );
  return (
    <li className="py-0.5">
      {p.playerId ? (
        <Link
          href={`/players/${p.playerId}`}
          className="hover:underline text-stone-800"
        >
          {inner}
        </Link>
      ) : (
        <span className="text-stone-700 italic">{inner}</span>
      )}
    </li>
  );
};

const Plaque = ({ prem }: { prem: Premiership }) => {
  return (
    <div className="relative rounded-md p-[3px] bg-gradient-to-b from-amber-900 via-amber-700 to-amber-900 shadow-2xl">
      <div
        className="rounded-[5px] px-3 py-3 text-center"
        style={{
          background:
            "linear-gradient(180deg, #f5f0e6 0%, #e9e1cf 50%, #d9cdb1 100%)",
          color: "#3b2f1c",
          fontFamily: '"Times New Roman", "Cormorant Garamond", Georgia, serif',
        }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Trophy className="h-3.5 w-3.5 text-amber-900 shrink-0" />
          <div className="text-base font-extrabold tracking-[0.12em] uppercase leading-tight">
            {prem.grade}
          </div>
          <Trophy className="h-3.5 w-3.5 text-amber-900 shrink-0" />
        </div>
        {prem.competition && prem.competition !== prem.grade.toUpperCase() && (
          <div className="text-[9px] uppercase tracking-widest text-stone-700 leading-tight">
            {prem.competition}
          </div>
        )}
        <div className="text-sm font-bold mt-1.5 leading-tight">
          {prem.year} PREMIERS
        </div>
        {prem.venue && (
          <div className="text-[10px] uppercase tracking-wider text-stone-700 mt-1 leading-tight">
            {prem.venue}
          </div>
        )}
        {prem.matchDate && (
          <div className="text-[10px] text-stone-700 leading-tight">
            {formatDate(prem.matchDate)}
          </div>
        )}
        {prem.result && (
          <div className="text-xs font-semibold mt-1.5 leading-snug">
            {prem.result}
          </div>
        )}
        <div className="my-2 h-px bg-amber-900/40" />
        <ul className="text-[11px] text-left list-none p-0 m-0">
          {prem.players.map((p) => (
            <PlayerLine key={p.id} p={p} />
          ))}
        </ul>
        {prem.mom && (
          <>
            <div className="my-2 h-px bg-amber-900/40" />
            <div className="text-[10px]">
              <span className="uppercase tracking-widest text-stone-700">
                M.O.M:
              </span>{" "}
              <span className="font-bold uppercase">{prem.mom}</span>
            </div>
          </>
        )}
        {prem.notes && (
          <div className="text-[10px] italic text-stone-700 mt-1.5">{prem.notes}</div>
        )}
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
    return selectedGrade === "All"
      ? premierships
      : premierships.filter((p) => p.grade === selectedGrade);
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
          <div className="grid gap-3 md:gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            {filtered.map((p) => (
              <Plaque key={p.id} prem={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
