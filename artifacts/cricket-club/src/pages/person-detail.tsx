import { useMemo } from "react";
import { useParams, Link } from "wouter";
import {
  useGetPerson,
  getGetPersonQueryKey,
  useListClubRoles,
} from "@workspace/api-client-react";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export default function PersonDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data: person, isLoading, error } = useGetPerson(id, {
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

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
          This person could not be found.
        </div>
        <Link href="/honour-boards" className="text-primary hover:underline">
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
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-serif font-bold text-primary-foreground">
            {initials || "?"}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
              {person.name}
            </h1>
            <p className="text-muted-foreground italic mt-1 mb-0">
              Club official · Halls Head Cricket Club
            </p>
          </div>
        </div>
        <div className="w-20 h-[3px] bg-primary mt-4" />
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

      <div className="bg-card border border-border rounded-md overflow-hidden shadow-md">
        <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm">
          Service to the Club
        </div>
        <div className="p-4 md:p-6">
          {service.length === 0 ? (
            <p className="text-muted-foreground italic m-0">
              No published roles recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {service.map((s) => (
                <div
                  key={s.id}
                  className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="font-mono font-bold text-primary w-20 shrink-0">
                    {formatSeason(s.season)}
                  </span>
                  <span className="font-semibold text-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link href="/honour-boards" className="inline-block text-primary hover:underline">
        ← Back to honour boards
      </Link>
    </div>
  );
}
