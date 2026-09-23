import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useBrand } from "@/lib/brand-context";
import { useGetPerson, getGetPersonQueryKey, useListClubRoles } from "@workspace/api-client-react";
import { LoadingState, QueryError, EmptyState } from "@/components/data-states";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export default function PersonDetail() {
  const brand = useBrand();
  const params = useParams();
  const id = Number(params.id);
  const {
    data: person,
    isLoading,
    isError,
    refetch,
  } = useGetPerson(id, {
    query: { queryKey: getGetPersonQueryKey(id), enabled: Number.isFinite(id) },
  });
  const { data: roles } = useListClubRoles();

  const service = useMemo(() => {
    return (roles ?? [])
      .filter((r) => r.nonPlayerId === id)
      .sort((a, b) => b.season - a.season || a.displayOrder - b.displayOrder)
      .map((r) => ({
        id: r.id,
        season: r.season,
        label: r.grade != null ? `${r.grade} Captain` : r.role,
      }));
  }, [roles, id]);

  if (isError) {
    return <QueryError onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return <LoadingState label="Loading…" />;
  }

  if (!person) {
    return (
      <div className="space-y-4">
        <EmptyState title="Person not found" message="This person could not be found." />
        <Link href="/honour-boards" className="text-primary-text hover:underline">
          ← Back to honour boards
        </Link>
      </div>
    );
  }

  const initials = person.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted font-serif text-3xl font-bold text-muted-foreground">
            {initials || "?"}
          </div>
          <div>
            <h1 className="m-0 text-[clamp(38px,5vw,72px)] leading-[.95]">{person.name}</h1>
            <p className="mt-2 mb-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-text">
              Club official · {brand.name}
            </p>
          </div>
        </div>
        {person.bio ? (
          <p className="text-foreground mt-4 mb-0 whitespace-pre-line leading-relaxed">
            {person.bio}
          </p>
        ) : (
          <p className="text-muted-foreground italic mt-4 mb-0">
            A valued contributor to the club.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b px-4 md:px-6 py-3 font-serif text-[22px] font-bold uppercase leading-none">
          Service to the Club
        </div>
        <div className="p-4 md:p-6">
          {service.length === 0 ? (
            <p className="text-muted-foreground italic m-0">No published roles recorded yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {service.map((s) => (
                <div key={s.id} className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className="tabular-nums font-bold text-primary-text w-20 shrink-0">
                    {formatSeason(s.season)}
                  </span>
                  <span className="font-semibold text-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link href="/honour-boards" className="inline-block text-primary-text hover:underline">
        ← Back to honour boards
      </Link>
    </div>
  );
}
