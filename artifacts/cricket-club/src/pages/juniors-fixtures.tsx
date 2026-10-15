import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  useListJuniorFixtures,
  useGetJuniorFixture,
  getListJuniorFixturesQueryKey,
  type JuniorFixture,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin, ArrowLeft, Users } from "lucide-react";
import { JUNIOR_ACCENT } from "@/lib/juniors";
import { fixtureAgeGroups, fmtJuniorStart, juniorFixtureTitle } from "@/lib/junior-fixtures";
import { CardGridSkeleton, ListSkeleton, QueryError, EmptyState } from "@/components/data-states";

/**
 * Upcoming junior games (junior PlayHQ sync plan U6; R8, R9, R15, R23). The list and
 * each game's published team list come from /api/juniors/fixtures, which names
 * players in the club's junior naming style and withholds private players; it is
 * empty while the club's junior sync is switched off.
 */

function Kicker() {
  return (
    <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-text">
      Juniors
    </div>
  );
}

function FixtureMeta({ f }: { f: JuniorFixture }) {
  const when = fmtJuniorStart(f.startAt);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {when && (
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" /> {when}
        </span>
      )}
      {f.venue && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {f.venue}
        </span>
      )}
    </div>
  );
}

export default function JuniorsFixtures() {
  const [ageGroup, setAgeGroup] = useState("");
  const allQ = useListJuniorFixtures();
  const ageArg = ageGroup || undefined;
  const listQ = useListJuniorFixtures(
    { ageGroup: ageArg },
    {
      query: {
        enabled: !!ageArg,
        queryKey: getListJuniorFixturesQueryKey({ ageGroup: ageArg }),
      },
    },
  );
  const q = ageArg ? listQ : allQ;
  const options = useMemo(() => fixtureAgeGroups(allQ.data ?? []), [allQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <Kicker />
        <h1 className="text-[clamp(38px,4.6vw,64px)] leading-none">Junior Fixtures</h1>
        <p className="text-muted-foreground mt-1">
          Upcoming junior games and the teams named for them.
        </p>
      </div>

      {options.length > 0 && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="junior-fixtures-age-group"
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Age Group
          </label>
          <select
            id="junior-fixtures-age-group"
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="h-10 w-fit rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground min-w-[10rem]"
            data-testid="select-age-group"
          >
            <option value="">All age groups</option>
            {options.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      {q.isError ? (
        <QueryError onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <CardGridSkeleton />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState
          title="No upcoming junior games"
          message="Junior games appear here once they are scheduled."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="junior-fixture-list">
          {q.data.map((f) => (
            <Link key={f.id} href={`/juniors/fixtures/${f.id}`}>
              <div
                className={`rounded-lg border bg-card p-4 cursor-pointer group h-full flex flex-col gap-3 ${JUNIOR_ACCENT.hoverBorder} transition-colors`}
                data-testid={`junior-fixture-${f.id}`}
              >
                <div className="flex items-center gap-2">
                  {f.ageGroup && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-text bg-primary/10 border border-primary/40 rounded px-2 py-0.5">
                      {f.ageGroup}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-bold text-primary-text truncate">
                      {juniorFixtureTitle(f)}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      {f.grade ?? ""}
                      {f.isHome === true ? " · Home" : f.isHome === false ? " · Away" : ""}
                    </div>
                  </div>
                  {f.hasTeamList && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary-text">
                      <Users className="h-3.5 w-3.5" /> Team named
                    </span>
                  )}
                </div>
                <div className="mt-auto">
                  <FixtureMeta f={f} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function JuniorsFixtureDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const q = useGetJuniorFixture(id);

  const back = (
    <Link
      href="/juniors/fixtures"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> All junior fixtures
    </Link>
  );

  if (q.isLoading) return <ListSkeleton />;
  if (q.isError || !q.data) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState title="Fixture not found" message="This junior game is not available." />
      </div>
    );
  }
  const { fixture: f, teamList } = q.data;
  return (
    <div className="space-y-6">
      {back}
      <div>
        <Kicker />
        <h1 className="text-[clamp(32px,4vw,52px)] leading-none">{juniorFixtureTitle(f)}</h1>
        <p className="text-muted-foreground mt-1">
          {[f.ageGroup, f.grade].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2">
          <FixtureMeta f={f} />
        </div>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">Team list</h2>
        {!teamList || teamList.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="no-team-list">
            The team for this game has not been named yet.
          </p>
        ) : (
          <ol className="divide-y" data-testid="junior-team-list">
            {teamList.map((p) => (
              <li key={p.order} className="flex items-center gap-3 py-2">
                <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">
                  {p.order}.
                </span>
                <span className="w-8 text-center font-semibold tabular-nums text-primary-text">
                  {p.shirtNumber ?? ""}
                </span>
                {p.participantId ? (
                  <Link
                    href={`/juniors/players/${p.participantId}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {p.name}
                  </Link>
                ) : (
                  <span className="font-medium text-muted-foreground">{p.name}</span>
                )}
                {p.role && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary-text">
                    {p.role}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
