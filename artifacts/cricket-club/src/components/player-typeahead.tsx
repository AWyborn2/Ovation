import { useEffect, useMemo, useRef, useState } from "react";
import { useListPlayers, getListPlayersQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type SelectedPlayer = { id: number; surname: string; givenName: string };

export function PlayerTypeahead({
  value,
  onChange,
  placeholder = "Search players…",
}: {
  value: SelectedPlayer | null;
  onChange: (p: SelectedPlayer | null) => void;
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

  const params = useMemo(() => ({ search: query, page: 1, limit: 10 }), [query]);
  const { data } = useListPlayers(params, {
    query: {
      enabled: open && query.trim().length > 0,
      queryKey: getListPlayersQueryKey(params),
    },
  });

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">
            {value.surname}, {value.givenName}
          </span>{" "}
          <span className="text-muted-foreground">#{value.id}</span>
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
      {open && query.trim().length > 0 && data?.players && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {data.players.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground italic">No players matched.</div>
          ) : (
            data.players.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange({ id: p.id, surname: p.surname, givenName: p.givenName });
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="font-semibold">{p.surname}, {p.givenName}</span>
                <span className="ml-2 text-xs text-muted-foreground">#{p.id}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
