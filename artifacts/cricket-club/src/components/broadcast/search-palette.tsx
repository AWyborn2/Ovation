import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useListPlayers,
  useListJuniorPlayers,
  getListPlayersQueryKey,
  getListJuniorPlayersQueryKey,
} from "@workspace/api-client-react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { navIcon } from "@/lib/nav-icons";
import type { ResolvedNavItem } from "@/lib/use-nav";
import type { Section } from "@/lib/nav-groups";
import { InitialsAvatar } from "./rows";

/** Debounce a changing value. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Global ⌘K / Ctrl+K shortcut that opens the palette. */
export function useSearchShortcut(open: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

interface PlayerHit {
  key: string;
  name: string;
  href: string;
  image?: string | null;
  meta: string;
  figures: string;
}

const MIN_QUERY = 2;

function useSeniorHits(query: string, enabled: boolean): { hits: PlayerHit[]; loading: boolean } {
  const params = useMemo(() => ({ search: query, page: 1, limit: 5 }), [query]);
  const { data, isFetching } = useListPlayers(params, {
    query: { enabled, queryKey: getListPlayersQueryKey(params) },
  });
  const hits = (data?.players ?? []).slice(0, 5).map((p) => ({
    key: `s-${p.id}`,
    name: `${p.givenName} ${p.surname}`.trim(),
    href: `/players/${p.id}`,
    image: p.imageUrl,
    meta: p.gradesPlayed ?? "",
    figures: `${(p.totalRuns ?? 0).toLocaleString()} runs · ${p.totalWickets ?? 0} wkts`,
  }));
  return { hits, loading: enabled && isFetching };
}

function useJuniorHits(query: string, enabled: boolean): { hits: PlayerHit[]; loading: boolean } {
  const params = useMemo(() => ({ search: query }), [query]);
  const { data, isFetching } = useListJuniorPlayers(params, {
    query: { enabled, queryKey: getListJuniorPlayersQueryKey(params) },
  });
  const hits = (data ?? []).slice(0, 5).map((p) => ({
    key: `j-${p.participantId}`,
    name: p.displayName,
    href: `/juniors/players/${p.participantId}`,
    meta: p.teams ?? "",
    figures: `${(p.runs ?? 0).toLocaleString()} runs · ${p.wickets ?? 0} wkts`,
  }));
  return { hits, loading: enabled && isFetching };
}

/**
 * ⌘K search palette: players for the current section (juniors search junior
 * players only — the isolation invariant) plus "Jump to" links from the nav.
 * cmdk supplies ↑/↓/Enter; Esc closes via the dialog.
 */
export function SearchPalette({
  open,
  onOpenChange,
  section,
  jumpTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: Section;
  jumpTo: ResolvedNavItem[];
}) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const searching = open && debounced.length >= MIN_QUERY;

  const senior = useSeniorHits(debounced, searching && section === "seniors");
  const junior = useJuniorHits(debounced, searching && section === "juniors");
  const { hits, loading } = section === "juniors" ? junior : senior;
  const pending = loading || query.trim() !== debounced;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (href: string, external?: boolean) => {
    onOpenChange(false);
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else navigate(href);
  };

  const q = query.trim().toLowerCase();
  const links = jumpTo.filter((l) => !q || l.label.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[84px] w-[min(640px,calc(100%-24px))] max-w-none translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
          <div className="flex h-[60px] items-center gap-3 border-b px-4">
            <Search className="h-[19px] w-[19px] shrink-0 text-muted-foreground" aria-hidden />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search players, matches, honours"
              className="h-full flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
              data-testid="search-input"
            />
            <kbd className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              ESC
            </kbd>
          </div>
          <CommandPrimitive.List className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
            {searching && !pending && hits.length === 0 && links.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results for “{query.trim()}”.
              </div>
            )}
            {hits.length > 0 && (
              <CommandPrimitive.Group
                heading="Players"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {hits.map((h) => (
                  <CommandPrimitive.Item
                    key={h.key}
                    value={h.key}
                    onSelect={() => go(h.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 data-[selected=true]:bg-muted"
                  >
                    <InitialsAvatar name={h.name} src={h.image} size={32} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{h.name}</span>
                      {h.meta && <span className="text-muted-foreground"> · {h.meta}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {h.figures}
                    </span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
            {links.length > 0 && (
              <CommandPrimitive.Group
                heading="Jump to"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {links.map((l) => {
                  const Icon = navIcon(l.iconKey);
                  return (
                    <CommandPrimitive.Item
                      key={`${l.target}-${l.label}`}
                      value={`link-${l.target}-${l.label}`}
                      onSelect={() => go(l.target, l.isExternal)}
                      className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 data-[selected=true]:bg-muted"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-sm border bg-muted text-primary-text">
                        {Icon && <Icon className="h-4 w-4" aria-hidden />}
                      </span>
                      <span className="font-medium">{l.label}</span>
                    </CommandPrimitive.Item>
                  );
                })}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
