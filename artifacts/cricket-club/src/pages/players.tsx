import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useListPlayers,
  useListGrades,
  useCreatePlayer,
  getListPlayersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { QueryError } from "@/components/data-states";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { useBrand } from "@/lib/brand-context";
import { useSearchParamState } from "@/lib/use-search-param";
import {
  Container,
  FilterChips,
  InitialsAvatar,
  PageHeader,
  PageStack,
  RowsSkeleton,
  TableCard,
  Td,
  Th,
  Tr,
  formatStat,
} from "@/components/broadcast";

const PAGE_SIZE = 20;

function AddPlayerDialog() {
  const [open, setOpen] = useState(false);
  const [surname, setSurname] = useState("");
  const [givenName, setGivenName] = useState("");
  const queryClient = useQueryClient();
  const createPlayer = useCreatePlayer();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createPlayer.mutate(
      { data: { surname, givenName } },
      {
        onSuccess: () => {
          setOpen(false);
          setSurname("");
          setGivenName("");
          queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey() });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-[46px] rounded-full px-5">
          Add player
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new player</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="givenName">Given name</Label>
            <Input
              id="givenName"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="surname">Surname</Label>
            <Input
              id="surname"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={createPlayer.isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Players() {
  const brand = useBrand();
  const me = useCurrentAdmin();
  const [, navigate] = useLocation();
  const [q, setQ] = useSearchParamState("q", "");
  const [grade, setGrade] = useSearchParamState("grade", "all");
  const [draft, setDraft] = useState(q);
  const [page, setPage] = useState(1);

  // Live filter: debounce typing into the URL-synced query.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() !== q) {
        setQ(draft.trim());
        setPage(1);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [draft, q, setQ]);

  const { data, isLoading, isError, refetch } = useListPlayers({
    search: q,
    ...(grade !== "all" ? { grade } : {}),
    page,
    limit: PAGE_SIZE,
  });
  const { data: grades } = useListGrades();
  const gradeOptions = sortGradesBySeniority((grades ?? []).map((g) => g.grade));

  const players = data?.players ?? [];
  const total = data?.total;

  return (
    <Container page className="py-[var(--gap-section)]">
      <PageStack>
        <PageHeader
          eyebrow="Stats"
          title="Players"
          subtitle={
            total == null
              ? `Everyone who has represented ${brand.name}.`
              : grade !== "all"
                ? `${total.toLocaleString()} ${grade} players.`
                : `${total.toLocaleString()} players who have represented ${brand.name}.`
          }
          actions={
            <>
              <label className="relative block w-full max-w-[340px] sm:w-[340px]">
                <span className="sr-only">Search players</span>
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Search by name"
                  className="h-[46px] w-full rounded-full border bg-card pl-10 pr-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                  data-testid="players-search"
                />
              </label>
              {me.data && <AddPlayerDialog />}
            </>
          }
        />

        {gradeOptions.length > 0 && (
          <FilterChips
            label="Grade"
            value={grade}
            onChange={(g) => {
              setGrade(g);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              ...gradeOptions.map((g) => ({ value: g, label: g })),
            ]}
          />
        )}

        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <RowsSkeleton rows={8} />
        ) : (
          <TableCard stickyFirst minWidth={620}>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th num>M</Th>
                <Th num>Runs</Th>
                <Th num>Wkts</Th>
                <Th num>Flags</Th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No players match that filter.
                  </td>
                </tr>
              ) : (
                players.map((p) => {
                  const name = `${p.givenName} ${p.surname}`.trim();
                  return (
                    <Tr key={p.id} onClick={() => navigate(`/players/${p.id}`)}>
                      <Td>
                        <a
                          href={`/players/${p.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/players/${p.id}`);
                          }}
                          className="flex items-center gap-3"
                        >
                          <InitialsAvatar name={name} src={p.imageUrl} size={38} />
                          <span className="min-w-0">
                            <span className="block font-semibold">
                              {p.surname}, {p.givenName}
                            </span>
                            {p.gradesPlayed && (
                              <span className="block max-w-[260px] truncate text-xs text-muted-foreground">
                                {p.gradesPlayed.split(",").join(" · ")}
                              </span>
                            )}
                          </span>
                        </a>
                      </Td>
                      <Td num>{formatStat(p.totalGames ?? 0)}</Td>
                      <Td num strong>
                        {formatStat(p.totalRuns ?? 0)}
                      </Td>
                      <Td num strong>
                        {formatStat(p.totalWickets ?? 0)}
                      </Td>
                      <Td num className="text-primary-text">
                        {p.premiershipsWon ? formatStat(p.premiershipsWon) : "–"}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </TableCard>
        )}

        {(page > 1 || players.length === PAGE_SIZE) && (
          <div className="flex items-center justify-between">
            <Button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              variant="outline"
              className="rounded-full"
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              disabled={players.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
              variant="outline"
              className="rounded-full"
            >
              Next
            </Button>
          </div>
        )}
      </PageStack>
    </Container>
  );
}
