import { Link } from "wouter";
import { useMemo } from "react";
import { useListClubRoles, type ClubRole } from "@workspace/api-client-react";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

// Canonical display order for club office-bearer roles. Anything not listed
// falls to the end, alphabetically.
const ROLE_ORDER = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Director of Cricket",
  "Club Captain",
  "Coach",
];

function roleRank(role: string): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

const RoleName = ({ role }: { role: ClubRole }) => {
  const href =
    role.playerId != null
      ? `/players/${role.playerId}`
      : role.nonPlayerId != null
        ? `/people/${role.nonPlayerId}`
        : null;
  return href != null ? (
    <Link href={href} className="font-semibold text-primary hover:underline">
      {role.name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{role.name}</span>
  );
};

type SeasonGroup = { season: number; roles: ClubRole[] };

export function CommitteeTab() {
  const { data: roles, isLoading } = useListClubRoles();

  const seasons = useMemo<SeasonGroup[]>(() => {
    // Office bearers only — grade captains (grade set) are surfaced per grade.
    const officeBearers = (roles ?? []).filter((r) => r.grade == null);
    const bySeason = new Map<number, ClubRole[]>();
    for (const r of officeBearers) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season)!.push(r);
    }
    return [...bySeason.entries()]
      .map(([season, rs]) => ({
        season,
        roles: [...rs].sort(
          (a, b) =>
            roleRank(a.role) - roleRank(b.role) ||
            a.displayOrder - b.displayOrder ||
            a.role.localeCompare(b.role),
        ),
      }))
      .sort((a, b) => b.season - a.season);
  }, [roles]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
          Office Bearers
        </h2>
        <div className="w-20 h-[3px] bg-primary mt-3" />
        <p className="text-muted-foreground italic mt-3 mb-0">
          Season-by-season record of the people who have led Halls Head Cricket
          Club since 1991. Grade captains are listed on each grade's page.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading committee…
        </div>
      ) : seasons.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
          No committee records have been published yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {seasons.map((g) => (
            <div
              key={g.season}
              className="bg-card border border-border rounded-md overflow-hidden shadow-md"
            >
              <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm flex items-center justify-between gap-3">
                <span>{formatSeason(g.season)}</span>
                <span className="text-xs whitespace-nowrap">
                  {g.roles.length}{" "}
                  {g.roles.length === 1 ? "office bearer" : "office bearers"}
                </span>
              </div>
              <div className="p-4 md:p-6">
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {g.roles.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-baseline justify-between gap-4 border-b border-border/50 pb-2 last:border-0 sm:last:border-b sm:[&:nth-last-child(2)]:border-0"
                    >
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground shrink-0">
                        {r.role}
                      </dt>
                      <dd className="text-right m-0">
                        <RoleName role={r} />
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
