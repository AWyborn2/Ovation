import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, Loader2, Search } from "lucide-react";
import { useListDirectoryClubs } from "@workspace/api-client-react";
import type { DirectoryClub } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Public club directory. Rendered on the apex host (platform mode) so anyone
 * exploring Ovation can browse every club on the platform and click through to
 * its site. Standalone chrome (no club Layout) so it isn't themed with any one
 * tenant's colours — it's the platform's own surface, like the landing page.
 */

/** Initials for the fallback logo tile (up to two words). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** A single club card, tinted with the club's own colours. */
function ClubCard({ club }: { club: DirectoryClub }) {
  const accent = club.primaryColour ?? club.backgroundColour ?? undefined;
  return (
    <a
      href={club.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-lg border bg-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="flex items-center gap-3 border-b p-4"
        style={
          accent ? { background: `linear-gradient(90deg, ${accent}14, transparent)` } : undefined
        }
      >
        {club.logoUrl ? (
          <img src={club.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-contain" />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
            style={{ backgroundColor: accent ?? "#334155" }}
            aria-hidden
          >
            {initials(club.name)}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-tight">{club.name}</h3>
          {club.shortName && club.shortName !== club.name ? (
            <p className="truncate text-xs text-muted-foreground">{club.shortName}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {club.tagline ? (
          <p className="text-sm text-muted-foreground">{club.tagline}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Stats, records and honour boards on Ovation.
          </p>
        )}
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Visit site
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </a>
  );
}

export default function DirectoryPage() {
  const { data, isLoading, isError, refetch } = useListDirectoryClubs();
  const [q, setQ] = useState("");

  const clubs = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.shortName ?? "").toLowerCase().includes(needle) ||
        c.slug.toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/">
            <span className="cursor-pointer text-lg font-semibold tracking-tight">Ovation</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/platform-admin">
              <Button size="sm" variant="ghost">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Clubs on Ovation</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Browse the clubs running their stats and history on Ovation. Pick one to visit its site.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clubs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              aria-label="Search clubs"
            />
          </div>
        </div>

        <div className="mt-10">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading clubs…
            </div>
          ) : isError ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground">Couldn't load the directory.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : clubs.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {q.trim() ? `No clubs match “${q}”.` : "No clubs are listed yet — check back soon."}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {clubs.map((club) => (
                <ClubCard key={club.slug} club={club} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-16 border-t pt-10 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Don't see your club?</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Any club can join in seconds — your full history is populated automatically.
          </p>
          <div className="mt-6">
            <Link href="/signup">
              <Button className="gap-2">
                Find your club <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Ovation. A white-label cricket stats platform.
        </div>
      </footer>
    </div>
  );
}
