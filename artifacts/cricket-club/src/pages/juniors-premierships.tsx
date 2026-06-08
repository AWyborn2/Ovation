import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListJuniorPremierships,
  type JuniorPremiership,
} from "@workspace/api-client-react";
import { useBrandLogo } from "@/lib/use-brand";
import { PlaqueLightbox } from "@/components/plaque-lightbox";

const PLAQUE_FONT = "'Inter', sans-serif";
const TRACK = "0.0103em";

const formatDate = (d: string | null | undefined) => {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const titleStyle = {
  fontSize: "10.9px",
  letterSpacing: 0,
  lineHeight: 1.4,
  fontWeight: 700,
} as const;
const metaStyle = {
  fontSize: "6.4px",
  letterSpacing: TRACK,
  lineHeight: 1.4,
  fontWeight: 700,
} as const;
const rosterStyle = {
  fontSize: "6.7px",
  letterSpacing: TRACK,
  lineHeight: 1.0,
  fontWeight: 700,
} as const;
const resultStyle = {
  fontSize: "6.7px",
  letterSpacing: TRACK,
  lineHeight: 1.4,
  fontWeight: 700,
} as const;

// Junior premierships carry NO captain or man-of-the-match data in the source
// dump, so plaques omit those lines (unlike the senior board). Roster names that
// resolve to a known participant link to the player page.
const PlayerLine = ({ p }: { p: JuniorPremiership["players"][number] }) => {
  const display = p.playerName.replace(/\s+/g, " ").trim().toUpperCase();
  return (
    <li>
      {p.participantId ? (
        <Link
          href={`/juniors/players/${p.participantId}`}
          className="block whitespace-nowrap text-slate-900 hover:underline font-semibold text-[9px]"
        >
          {display}
        </Link>
      ) : (
        <span className="block whitespace-nowrap text-slate-900 font-semibold text-[9px]">{display}</span>
      )}
    </li>
  );
};

const Plaque = ({ prem }: { prem: JuniorPremiership }) => {
  const title = [prem.ageGroup ?? "Junior", prem.season].filter(Boolean).join(" · ");
  const result =
    prem.resultText ||
    (prem.opponent
      ? `Halls Head def ${prem.opponent}`
      : prem.hhScore || prem.oppScore
        ? `${prem.hhScore ?? "—"} def ${prem.oppScore ?? "—"}`
        : "");
  return (
    <div
      className="relative shadow-md border border-slate-900/60 overflow-hidden"
      style={{
        width: "151px",
        height: "259px",
        background:
          "linear-gradient(135deg, #c8ccd1 0%, #e8ebee 20%, #b8bdc4 40%, #d8dce0 60%, #aeb3ba 80%, #c8ccd1 100%)",
        fontFamily: PLAQUE_FONT,
        padding: "4px",
      }}
    >
      <div className="h-full border-slate-800" style={{ borderWidth: "1px", padding: "1px" }}>
        <div
          className="h-full text-center flex flex-col border border-slate-800 overflow-hidden"
          style={{ color: "#0f172a", fontFamily: PLAQUE_FONT, paddingInline: "5px", paddingBlock: "6px" }}
        >
          <div style={titleStyle} className="text-[12px] font-bold uppercase">{title}</div>

          {prem.competition && (
            <div style={{ ...metaStyle, marginTop: "2px" }} className="text-[10px]">
              {prem.competition.toUpperCase()}
            </div>
          )}

          {prem.matchDate && (
            <div style={{ ...metaStyle, marginTop: "2px" }} className="text-[10px]">
              {formatDate(prem.matchDate)}
            </div>
          )}

          {prem.players.length > 0 && (
            <ul className="list-none p-0 m-0" style={{ ...rosterStyle, marginTop: "4px" }}>
              {prem.players.map((p, i) => (
                <PlayerLine key={i} p={p} />
              ))}
            </ul>
          )}

          <div className="flex-1" />

          {result &&
            (prem.matchId != null ? (
              <Link
                href={`/juniors/matches/${prem.matchId}`}
                style={{ ...resultStyle, whiteSpace: "pre-line" }}
                className="text-[12px] font-bold block hover:underline cursor-pointer"
                title="View deciding scorecard"
              >
                {result.replace(/\s+def\s+/i, "\nDEF\n").toUpperCase()}
              </Link>
            ) : (
              <div style={{ ...resultStyle, whiteSpace: "pre-line" }} className="text-[12px] font-bold">
                {result.replace(/\s+def\s+/i, "\nDEF\n").toUpperCase()}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default function JuniorsPremierships() {
  const logoUrl = useBrandLogo();
  const { data, isLoading } = useListJuniorPremierships();
  const [ageGroup, setAgeGroup] = useState("All");
  const [enlarged, setEnlarged] = useState<JuniorPremiership | null>(null);

  const ageGroups = useMemo(() => {
    const set = new Set<string>();
    for (const p of data ?? []) if (p.ageGroup) set.add(p.ageGroup);
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const list = ageGroup === "All" ? data : data.filter((p) => p.ageGroup === ageGroup);
    return [...list].sort((a, b) => {
      const ay = a.season ?? "";
      const by = b.season ?? "";
      if (ay !== by) return ay.localeCompare(by);
      return (a.matchDate ?? "").localeCompare(b.matchDate ?? "");
    });
  }, [data, ageGroup]);

  return (
    <div
      className="mx-[calc(50%-50vw)] w-screen min-h-screen overflow-x-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #3a4654 0%, #2a3540 60%, #1f2832 100%)",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
          <img src={logoUrl} alt="HHCC" className="h-14 md:h-20 w-auto drop-shadow" />
          <div className="text-center text-white">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-[#e7c9b1] mb-1">
              Juniors
            </div>
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
              JUNIOR PREMIERSHIPS
            </div>
          </div>
          <img src={logoUrl} alt="HHCC" className="h-14 md:h-20 w-auto drop-shadow" />
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-4 text-white/90">
          <span className="text-xs font-bold uppercase tracking-widest">Age Group</span>
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="px-3 py-1.5 rounded border border-white/30 bg-black/30 text-white text-sm font-medium"
            data-testid="select-age-group"
          >
            {ageGroups.map((a) => (
              <option key={a} value={a} className="text-black">{a}</option>
            ))}
          </select>
          <span className="text-xs italic ml-auto text-white/70">
            {filtered.length} of {data?.length ?? 0} shown
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-white/70">Loading premierships…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-white/70 italic">No junior premierships found.</div>
        ) : (
          <div
            className="grid gap-[3px] justify-center"
            style={{ gridTemplateColumns: "repeat(auto-fill, 151px)" }}
          >
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEnlarged(p)}
                aria-label={`Enlarge ${[p.ageGroup, p.season].filter(Boolean).join(" ")} premiership plaque`}
                className="block p-0 m-0 bg-transparent border-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-testid={`button-plaque-${p.id}`}
              >
                <div className="pointer-events-none">
                  <Plaque prem={p} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {enlarged && (
        <PlaqueLightbox theme="gold" onClose={() => setEnlarged(null)}>
          <Plaque prem={enlarged} />
        </PlaqueLightbox>
      )}
    </div>
  );
}
