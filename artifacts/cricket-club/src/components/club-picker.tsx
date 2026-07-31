import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { AvailableClub } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";

/**
 * Search-and-pick list over a set of central PCA clubs. Presentational only —
 * callers supply the club list (and its loading/error state) from whichever
 * available-clubs source fits their flow (concierge provisioning, self-serve
 * signup, the provisioning-exclusions picker), so the same search/pick UX
 * works against different underlying endpoints without duplicating it.
 */
export function ClubPicker({
  clubs,
  isLoading,
  isError,
  errorMessage = "No central clubs available (is the central DB configured?).",
  onPick,
}: {
  clubs: AvailableClub[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onPick: (c: AvailableClub) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const all = clubs ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((c) => c.name.toLowerCase().includes(needle)) : all;
  }, [clubs, q]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading clubs…
      </div>
    );
  }
  if (isError) {
    return <p className="py-16 text-center text-muted-foreground">{errorMessage}</p>;
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search for a club…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <ul className="mt-4 max-h-96 divide-y overflow-y-auto rounded-md border bg-background">
        {filtered.map((c) => (
          <li key={c.centralClubId}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted"
            >
              <span className="font-medium">{c.name}</span>
              {c.shortName ? (
                <span className="text-sm text-muted-foreground">{c.shortName}</span>
              ) : null}
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No clubs match "{q}".
          </li>
        ) : null}
      </ul>
    </div>
  );
}
