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
import { PremiershipGrid } from "@/components/premierships/premiership-cards";
import { slugify, useShareFilePrefix } from "@/lib/share-filename";
import { useSearchParamState } from "@/lib/use-search-param";
import { Container, PageHeader, PageStack, SegmentedControl } from "@/components/broadcast";

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

type View = "cards" | "plaques";

/** The original plaque wall (enlarge + image export), kept as an alternate view. */
function PlaqueWall({
  premierships,
  isLoading,
  isError,
  onRetry,
}: {
  premierships: Premiership[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const prefix = useShareFilePrefix();
  const [selectedGrade, setSelectedGrade] = useState<string>("All");
  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const p of premierships ?? []) set.add(p.grade);
    return ["All", ...Array.from(set).sort()];
  }, [premierships]);
  const filtered = useMemo(() => {
    const list =
      selectedGrade === "All"
        ? (premierships ?? [])
        : (premierships ?? []).filter((p) => p.grade === selectedGrade);
    return [...list].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : (a.matchDate ?? "").localeCompare(b.matchDate ?? ""),
    );
  }, [premierships, selectedGrade]);

  return (
    <PremiershipBoard
      heading="PREMIERSHIPS"
      filter={{ label: "Grade", value: selectedGrade, options: grades, onChange: setSelectedGrade }}
      total={premierships?.length ?? 0}
      items={filtered}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={{
        title: "No premierships found",
        message: "No premierships match the selected grade.",
      }}
      renderPlaque={(p) => <Plaque prem={p} />}
      plaqueLabel={(p) => `Enlarge ${p.grade} premiership plaque`}
      focusRingClass="focus-visible:ring-white/70"
      exportFileName={(p) => slugify(`${prefix}-${p.grade}-${p.year}-premiership`)}
    />
  );
}

export default function Premierships() {
  const q = useListPremierships();
  const [view, setView] = useSearchParamState("view", "cards");
  const total = q.data?.length ?? 0;

  return (
    <>
      <Container page className="pt-[var(--gap-section)]">
        <PageHeader
          eyebrow="History"
          title="Premierships"
          subtitle={
            total > 0
              ? `${total} premiership${total === 1 ? "" : "s"} across every grade.`
              : "Every premiership-winning side."
          }
          actions={
            <SegmentedControl<View>
              label="View"
              value={view === "plaques" ? "plaques" : "cards"}
              onChange={(v) => setView(v)}
              options={[
                { value: "cards", label: "Cards" },
                { value: "plaques", label: "Plaques" },
              ]}
            />
          }
        />
      </Container>
      {view === "plaques" ? (
        <PlaqueWall
          premierships={q.data}
          isLoading={q.isLoading}
          isError={q.isError}
          onRetry={() => q.refetch()}
        />
      ) : (
        <Container className="py-[var(--gap-section)]">
          <PageStack>
            <PremiershipGrid
              premierships={q.data}
              isLoading={q.isLoading}
              isError={q.isError}
              onRetry={() => q.refetch()}
            />
          </PageStack>
        </Container>
      )}
    </>
  );
}
