import { useMemo, useState } from "react";
import { useListPremierships } from "@workspace/api-client-react";
import type { Premiership, PremiershipPlayer } from "@workspace/api-client-react";
import {
  PLAQUE_STYLES,
  PlaqueFrame,
  PlaqueLine,
  PlaqueMom,
  PlaqueResult,
  PremiershipBoard,
  formatPlaqueDate,
} from "@/components/premierships";

const PlayerLine = ({ p }: { p: PremiershipPlayer }) => {
  const display = p.name.replace(/\s+/g, " ").trim().toUpperCase();
  const label = p.isCaptain ? `${display} (CAPT)` : display;
  return <PlaqueLine href={p.playerId ? `/players/${p.playerId}` : null} label={label} />;
};

const Plaque = ({ prem }: { prem: Premiership }) => (
  <PlaqueFrame>
    <div style={PLAQUE_STYLES.title} className="text-[12px] font-bold">
      {prem.grade.toUpperCase()}
    </div>

    {(prem.venue || prem.matchDate) && (
      <div style={{ ...PLAQUE_STYLES.meta, marginTop: "2px" }}>
        {prem.venue && <div className="text-[10px]">{prem.venue.toUpperCase()}</div>}
        {prem.matchDate && (
          <div className="text-[10px] mt-[2px] mb-[2px]">{formatPlaqueDate(prem.matchDate)}</div>
        )}
      </div>
    )}

    <ul className="list-none p-0 m-0" style={{ ...PLAQUE_STYLES.roster, marginTop: "4px" }}>
      {prem.players.map((p) => (
        <PlayerLine key={p.id} p={p} />
      ))}
    </ul>

    <div className="flex-1" />

    <PlaqueMom mom={prem.mom} />
    <PlaqueResult
      result={prem.result}
      href={prem.matchId ? `/matches/${prem.matchId}` : null}
      title="View Grand Final scorecard"
    />
  </PlaqueFrame>
);

export default function Premierships() {
  const { data: premierships, isLoading, isError, refetch } = useListPremierships();
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
    <PremiershipBoard
      heading="PREMIERSHIPS"
      filter={{ label: "Grade", value: selectedGrade, options: grades, onChange: setSelectedGrade }}
      total={premierships?.length ?? 0}
      items={filtered}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      empty={{
        title: "No premierships found",
        message: "No premierships match the selected grade.",
      }}
      renderPlaque={(p) => <Plaque prem={p} />}
      plaqueLabel={(p) => `Enlarge ${p.grade} premiership plaque`}
      focusRingClass="focus-visible:ring-white/70"
      exportFileName={(p) =>
        `hhcc-${p.grade}-${p.year}-premiership`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      }
    />
  );
}
