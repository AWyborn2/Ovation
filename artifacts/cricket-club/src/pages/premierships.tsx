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

const PLAQUE_REF_W = 564;
const cqw = (px: number) => `${((px / PLAQUE_REF_W) * 100).toFixed(3)}cqw`;
const TRACK = "0.0103em";

const PlayerLine = ({ p }: { p: PremiershipPlayer }) => {
  const display = p.name.replace(/\s+/g, " ").trim().toUpperCase();
  const label = p.isCaptain ? `${display} (CAPT)` : display;
  const baseCls = "block whitespace-nowrap text-slate-900";
  return (
    <li>
      {p.playerId ? (
        <Link href={`/players/${p.playerId}`} className={`${baseCls} hover:underline`}>
          {label}
        </Link>
      ) : (
        <span className={baseCls}>{label}</span>
      )}
    </li>
  );
};

const Plaque = ({ prem }: { prem: Premiership }) => {
  const venueDateStyle = {
    fontSize: cqw(23.7),
    letterSpacing: TRACK,
    lineHeight: 1.4,
    fontWeight: 700,
  } as const;
  const teamStyle = {
    fontSize: cqw(25),
    letterSpacing: TRACK,
    lineHeight: 1.0,
    fontWeight: 700,
  } as const;
  const resultStyle = {
    fontSize: cqw(25),
    letterSpacing: TRACK,
    lineHeight: 1.4,
    fontWeight: 700,
  } as const;
  return (
    <div
      className="relative shadow-xl border border-slate-900/60 overflow-hidden [container-type:inline-size]"
      style={{
        width: "564px",
        height: "965px",
        background:
          "linear-gradient(135deg, #c8ccd1 0%, #e8ebee 20%, #b8bdc4 40%, #d8dce0 60%, #aeb3ba 80%, #c8ccd1 100%)",
        fontFamily: PLAQUE_FONT,
        padding: cqw(16),
      }}
    >
      <div
        className="h-full border-slate-800"
        style={{ borderWidth: cqw(3), padding: cqw(4) }}
      >
        <div
          className="h-full text-center flex flex-col border border-slate-800 overflow-hidden"
          style={{
            color: "#0f172a",
            fontFamily: PLAQUE_FONT,
            paddingInline: cqw(20),
            paddingBlock: cqw(24),
          }}
        >
          <div
            style={{
              fontSize: cqw(40.4),
              letterSpacing: 0,
              lineHeight: 1.4,
              fontWeight: 700,
            }}
          >
            {prem.grade.toUpperCase()}
          </div>

          {(prem.venue || prem.matchDate) && (
            <div style={{ ...venueDateStyle, marginTop: cqw(8) }}>
              {prem.venue && <div>{prem.venue.toUpperCase()}</div>}
              {prem.matchDate && <div>{formatDate(prem.matchDate)}</div>}
            </div>
          )}

          <ul
            className="list-none p-0 m-0"
            style={{ ...teamStyle, marginTop: cqw(16) }}
          >
            {prem.players.map((p) => (
              <PlayerLine key={p.id} p={p} />
            ))}
          </ul>

          <div className="flex-1" />

          {prem.mom && (
            <div style={{ ...resultStyle, marginBottom: cqw(14) }}>
              M.O.M - {prem.mom.toUpperCase()}
            </div>
          )}

          {prem.result && (
            <div style={{ ...resultStyle, whiteSpace: "pre-line" }}>
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
          <div className="grid gap-4 justify-center [grid-template-columns:repeat(auto-fill,564px)]">
            {filtered.map((p) => (
              <Plaque key={p.id} prem={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
