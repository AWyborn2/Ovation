import { useMemo, useState } from "react";
import {
  useListJuniorPremierships,
  type JuniorPremiership,
} from "@workspace/api-client-react";
import { useBrand } from "@/lib/brand-context";
import {
  PLAQUE_STYLES,
  PlaqueFrame,
  PlaqueLine,
  PlaqueMom,
  PlaqueResult,
  PremiershipBoard,
  formatPlaqueDate,
} from "@/components/premierships";

// Junior premierships carry NO captain or man-of-the-match data in the source
// dump — admins add them by hand via /admin/junior-premierships, after which the
// plaque shows "(CAPT)" beside the captain and an "M.O.M - NAME" line, matching
// the senior board. Roster names that resolve to a known participant link to the
// player page.
const PlayerLine = ({ p }: { p: JuniorPremiership["players"][number] }) => {
  const display = p.playerName.replace(/\s+/g, " ").trim().toUpperCase();
  const label = p.isCaptain ? `${display} (CAPT)` : display;
  return (
    <PlaqueLine
      href={p.participantId ? `/juniors/players/${p.participantId}` : null}
      label={label}
    />
  );
};

const Plaque = ({ prem }: { prem: JuniorPremiership }) => {
  const brand = useBrand();
  const title = [prem.ageGroup ?? "Junior", prem.season].filter(Boolean).join(" · ");
  const result =
    prem.resultText ||
    (prem.opponent
      ? `${brand.name} def ${prem.opponent}`
      : prem.hhScore || prem.oppScore
        ? `${prem.hhScore ?? "—"} def ${prem.oppScore ?? "—"}`
        : "");
  return (
    <PlaqueFrame>
      <div style={PLAQUE_STYLES.title} className="text-[12px] font-bold uppercase">{title}</div>

      {(prem.association || prem.competition) && (
        <div style={{ ...PLAQUE_STYLES.meta, marginTop: "2px" }} className="text-[10px]">
          {(prem.association || prem.competition)!.toUpperCase()}
        </div>
      )}

      {prem.matchDate && (
        <div style={{ ...PLAQUE_STYLES.meta, marginTop: "2px" }} className="text-[10px]">
          {formatPlaqueDate(prem.matchDate)}
        </div>
      )}

      {(prem.venueOval || prem.venue) && (
        <div style={{ ...PLAQUE_STYLES.meta, marginTop: "1px" }} className="text-[9px]">
          {prem.venueOval || prem.venue}
        </div>
      )}

      {prem.players.length > 0 && (
        <ul className="list-none p-0 m-0" style={{ ...PLAQUE_STYLES.roster, marginTop: "4px" }}>
          {prem.players.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </ul>
      )}

      <div className="flex-1" />

      <PlaqueMom mom={prem.mom} />
      <PlaqueResult
        result={result}
        href={prem.matchId != null ? `/juniors/matches/${prem.matchId}` : null}
        title="View deciding scorecard"
      />
    </PlaqueFrame>
  );
};

/** Juniors premiership wall — reads only `/api/juniors/*` (juniors isolation). */
export default function JuniorsPremierships() {
  const { data, isLoading, isError, refetch } = useListJuniorPremierships();
  const [ageGroup, setAgeGroup] = useState("All");

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
    <PremiershipBoard
      heading="JUNIOR PREMIERSHIPS"
      eyebrow={
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-[#e7c9b1] mb-1">
          Juniors
        </div>
      }
      filter={{
        label: "Age Group",
        value: ageGroup,
        options: ageGroups,
        onChange: setAgeGroup,
        testId: "select-age-group",
      }}
      total={data?.length ?? 0}
      items={filtered}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      empty={{
        title: "No junior premierships found",
        message: "There are no junior premierships to show for this filter.",
      }}
      renderPlaque={(p) => <Plaque prem={p} />}
      plaqueLabel={(p) =>
        `Enlarge ${[p.ageGroup, p.season].filter(Boolean).join(" ")} premiership plaque`
      }
      focusRingClass="focus-visible:ring-primary"
      lightboxTheme="gold"
      exportFileName={(p) =>
        `hhcc-junior-${p.ageGroup ?? "premiership"}-${p.season ?? ""}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      }
    />
  );
}
