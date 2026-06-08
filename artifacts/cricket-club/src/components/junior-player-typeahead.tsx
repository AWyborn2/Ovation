import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListJuniorPlayers,
  getListJuniorPlayersQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type SelectedJuniorPlayer = { participantId: string; displayName: string };

export function JuniorPlayerTypeahead({
  value,
  onChange,
  placeholder = "Search junior players…",
}: {
  value: SelectedJuniorPlayer | null;
  onChange: (p: SelectedJuniorPlayer | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const params = useMemo(() => ({ search: query }), [query]);
  const { data } = useListJuniorPlayers(params, {
    query: {
      enabled: open && query.trim().length > 0,
      queryKey: getListJuniorPlayersQueryKey(params),
    },
  });

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">{value.displayName}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
        >
          Unlink
        </Button>
      </div>
    );
  }

  const results = (data ?? []).slice(0, 10);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim().length > 0 && data && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground italic">
              No junior players matched.
            </div>
          ) : (
            results.map((p) => (
              <button
                key={p.participantId}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange({
                    participantId: p.participantId,
                    displayName: p.displayName,
                  });
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="font-semibold">{p.displayName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
