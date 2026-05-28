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
      className="relative shadow-xl border border-slate-900/60 overflow-hidden [container-type:inline-size] aspect-[564/965] w-full"
      style={{
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
    <div
      className="mx-[calc(50%-50vw)] w-screen min-h-screen"
      style={{
        background:
          "radial-gradient(ellipse at center, #3a4654 0%, #2a3540 60%, #1f2832 100%)",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
          <img src={logoUrl} alt="HHCC" className="h-14 md:h-20 w-auto drop-shadow" />
          <div className="text-center text-white">
            <h1
              className="m-0 font-bold tracking-[0.08em] leading-tight text-xl md:text-3xl lg:text-4xl"
              style={{ fontFamily: PLAQUE_FONT }}
            >
              HALLS HEAD CRICKET CLUB
            </h1>
            <div
              className="mt-1 font-semibold tracking-[0.25em] text-sm md:text-base lg:text-lg text-white/90"
              style={{ fontFamily: PLAQUE_FONT }}
            >
              PREMIERSHIPS
            </div>
          </div>
          <img src={logoUrl} alt="HHCC" className="h-14 md:h-20 w-auto drop-shadow" />
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-4 text-white/90">
          <span className="text-xs font-bold uppercase tracking-widest">Grade</span>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-3 py-1.5 rounded border border-white/30 bg-black/30 text-white text-sm font-medium"
          >
            {grades.map((g) => (
              <option key={g} value={g} className="text-black">{g}</option>
            ))}
          </select>
          <span className="text-xs italic ml-auto text-white/70">
            {filtered.length} of {premierships?.length ?? 0} shown
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-white/70">Loading premierships…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-white/70 italic">No premierships found.</div>
        ) : (
          <div className="grid gap-2 md:gap-3 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))] items-start">
            {filtered.map((p) => (
              <Plaque key={p.id} prem={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
