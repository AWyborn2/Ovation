import { Link } from "wouter";
import { useMemo } from "react";
import { useBrand } from "@/lib/brand-context";
import {
  useListJuniorOfficeBearers,
  type JuniorOfficeBearer,
} from "@workspace/api-client-react";
import { Users } from "lucide-react";
import { JUNIOR_ACCENT } from "@/lib/juniors";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

// Canonical display order for junior office-bearer roles. Anything not listed
// falls to the end, alphabetically.
const ROLE_ORDER = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Registrar",
  "Junior Coordinator",
  "Coaching Coordinator",
  "Committee Member",
];

function roleRank(role: string): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

const BearerName = ({ bearer }: { bearer: JuniorOfficeBearer }) =>
  bearer.participantId != null ? (
    <Link
      href={`/juniors/players/${bearer.participantId}`}
      className="font-semibold text-[#bc8c6b] hover:underline"
    >
      {bearer.name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{bearer.name}</span>
  );

type SeasonGroup = { season: number; bearers: JuniorOfficeBearer[] };

export default function JuniorsOfficeBearers() {
  const brand = useBrand();
  const { data: bearers, isLoading, isError, refetch } = useListJuniorOfficeBearers();

  const seasons = useMemo<SeasonGroup[]>(() => {
    const bySeason = new Map<number, JuniorOfficeBearer[]>();
    for (const r of bearers ?? []) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season)!.push(r);
    }
    return [...bySeason.entries()]
      .map(([season, rs]) => ({
        season,
        bearers: [...rs].sort(
          (a, b) =>
            a.displayOrder - b.displayOrder ||
            roleRank(a.role) - roleRank(b.role) ||
            a.role.localeCompare(b.role),
        ),
      }))
      .sort((a, b) => b.season - a.season);
  }, [bearers]);

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bc8c6b] mb-2">
          Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary flex items-center gap-2">
          <Users className="h-7 w-7 text-[#bc8c6b]" /> Junior Office Bearers
        </h1>
        <p className="text-muted-foreground mt-1">
          Season-by-season record of the people who run {brand.name} juniors.
        </p>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : seasons.length === 0 ? (
        <EmptyState
          title="No office bearers yet"
          message="No junior office bearers have been published yet."
        />
      ) : (
        <div className="grid gap-4">
          {seasons.map((g) => (
            <div
              key={g.season}
              className="bg-card border border-border rounded-md overflow-hidden shadow-md"
            >
              <div className="bg-[#42342b] text-white px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm flex items-center justify-between gap-3">
                <span>{formatSeason(g.season)}</span>
                <span className="text-xs whitespace-nowrap">
                  {g.bearers.length}{" "}
                  {g.bearers.length === 1 ? "office bearer" : "office bearers"}
                </span>
              </div>
              <div className="p-4 md:p-6">
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {g.bearers.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-baseline justify-between gap-4 border-b ${JUNIOR_ACCENT.borderSoft} pb-2 last:border-0 sm:last:border-b sm:[&:nth-last-child(2)]:border-0`}
                    >
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground shrink-0">
                        {r.role}
                      </dt>
                      <dd className="text-right m-0">
                        <BearerName bearer={r} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
