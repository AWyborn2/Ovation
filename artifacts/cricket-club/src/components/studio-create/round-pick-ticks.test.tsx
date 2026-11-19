/**
 * Round 9 retest, A5: the Season and Round picker drives the Weekend Carousel's real
 * state, and "Use dates instead" keeps the admin's per-game ticks both ways. The
 * extra games the dates bring in come in unticked, and no automatic tick ever goes
 * past the carousel's maximum.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type {
  CarouselRounds,
  Fixture,
  SocialSettingsBundle,
  WeekendCarouselSources,
} from "@workspace/api-client-react";
import { sourcesFor } from "@/test/carousel-sources";

type SourceParams = { from: string; to: string; ids?: string };
const api = vi.hoisted(() => ({ sources: vi.fn(), settings: vi.fn(), rounds: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  useGetWeekendCarouselSources: (params: SourceParams) =>
    useQuery({
      queryKey: ["/api/weekend-carousel/sources", params],
      queryFn: () => api.sources(params),
    }),
  getGetWeekendCarouselSourcesQueryKey: (params?: unknown) => [
    "/api/weekend-carousel/sources",
    ...(params ? [params] : []),
  ],
  useGetSocialSettings: () => useQuery({ queryKey: ["settings"], queryFn: api.settings }),
  getGetSocialSettingsQueryKey: () => ["settings"],
  useCreateSocialDraft: () => ({ mutateAsync: vi.fn() }),
  getListSocialDraftsQueryKey: () => ["drafts"],
  getGetPendingSocialDraftCountQueryKey: () => ["pending"],
  useGetCarouselRounds: (params: unknown, o: { query: { enabled: boolean } }) =>
    useQuery({ queryKey: ["rounds", params], queryFn: api.rounds, enabled: o.query.enabled }),
  getGetCarouselRoundsQueryKey: (params: unknown) => ["rounds", params],
  useGetJuniorCarouselRounds: (params: unknown, o: { query: { enabled: boolean } }) =>
    useQuery({
      queryKey: ["junior-rounds", params],
      queryFn: api.rounds,
      enabled: o.query.enabled,
    }),
  getGetJuniorCarouselRoundsQueryKey: (params: unknown) => ["junior-rounds", params],
}));
vi.mock("@/components/weekend-carousel/template-choice", async () =>
  (await import("@/test/carousel-template-stub")).carouselTemplateStub(),
);

const { useWeekendCarousel, nextPicks, MAX_CAROUSEL_GAMES } =
  await import("@/components/weekend-carousel/use-weekend-carousel");

describe("nextPicks", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const none = { remembered: new Map<number, boolean>(), order: [] as number[] };
  const on = (ps: { id: number; included: boolean }[]) =>
    ps.filter((p) => p.included).map((p) => p.id);

  it("ticks a new range's games; under a rounds pick never past the maximum", () => {
    expect(on(nextPicks([], ids(5), { reset: true, keep: null, ...none }))).toEqual(ids(5));
    // The Weekend Carousel page ticks them all and shows the limit.
    expect(on(nextPicks([], ids(25), { reset: true, keep: null, ...none }))).toEqual(ids(25));
    const many = nextPicks([], ids(25), { reset: true, keep: "ticked", ...none });
    expect(many).toHaveLength(25);
    expect(on(many)).toEqual(ids(MAX_CAROUSEL_GAMES));
  });

  it("keeps a refreshed range's picks, new games unticked", () => {
    const previous = [
      { id: 2, included: false },
      { id: 1, included: true },
    ];
    expect(nextPicks(previous, [1, 2, 3], { reset: false, keep: null, ...none })).toEqual([
      { id: 2, included: false },
      { id: 1, included: true },
      { id: 3, included: false },
    ]);
  });

  it("under a rounds pick keeps every remembered tick, in the order last shown", () => {
    const remembered = new Map([
      [3, true],
      [1, false],
      [2, true],
    ]);
    const o = { reset: true, remembered, order: [3, 1, 2] };
    expect(nextPicks([], [1, 2, 3, 4], { ...o, keep: "unticked" })).toEqual([
      { id: 3, included: true },
      { id: 1, included: false },
      { id: 2, included: true },
      { id: 4, included: false },
    ]);
    expect(on(nextPicks([], [1, 2, 3, 4], { ...o, keep: "ticked" }))).toEqual([3, 2, 4]);
    // The admin's own ticks count towards the maximum before any automatic one.
    const full = new Map(ids(MAX_CAROUSEL_GAMES).map((id) => [id, true] as const));
    const filled = nextPicks([], ids(25), {
      reset: true,
      keep: "ticked",
      remembered: full,
      order: [],
    });
    expect(on(filled)).toEqual(ids(MAX_CAROUSEL_GAMES));
  });
});
const { useRoundPick } = await import("./round-picker");

/** 25 games on 7 and 8 Nov: Round 4 is games 1 to 6, Round 5 games 7 to 25. */
const fixtures = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  grade: `Grade ${i + 1}`,
  roundLabel: i < 6 ? "4" : "5",
  opponentName: "Visitors",
  startAt: i % 2 ? "2026-11-08T02:00:00Z" : "2026-11-07T02:00:00Z",
  venue: "Oval",
})) as Fixture[];
const ROUNDS: CarouselRounds = {
  seasons: [
    {
      season: 2026,
      label: "2026/27",
      rounds: [
        {
          key: "r:round 4",
          label: "Round 4",
          from: "2026-11-07",
          to: "2026-11-08",
          other: false,
          gameIds: fixtures.slice(0, 6).map((f) => f.id),
        },
        {
          key: "r:round 5",
          label: "Round 5",
          from: "2026-11-07",
          to: "2026-11-08",
          other: false,
          gameIds: fixtures.slice(6).map((f) => f.id),
        },
      ],
    },
  ],
  defaultSeason: 2026,
  defaultRounds: ["r:round 4"],
};

/** The sources route: the games in the dates, limited to `ids` when given. */
const sourcesFor_ = ({ from, to, ids }: SourceParams): WeekendCarouselSources => {
  const only = ids ? new Set(ids.split(",").map(Number)) : null;
  const games = fixtures.filter((f) => {
    const day = f.startAt.slice(0, 10);
    return day >= from && day <= to && (!only || only.has(f.id));
  });
  return {
    fixtures: games,
    photos: [],
    coverPhotos: [],
    timeZone: "Australia/Perth",
    warnings: [],
    content: sourcesFor("teamList", games, (f) => ({
      kind: "teamList",
      grade: f.grade,
      players: [],
    })),
  } as unknown as WeekendCarouselSources;
};

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});

async function mount() {
  api.sources.mockImplementation(async (p: SourceParams) => sourcesFor_(p));
  api.settings.mockResolvedValue({
    settings: {},
    activeSponsors: [],
  } as unknown as SocialSettingsBundle);
  api.rounds.mockResolvedValue(ROUNDS);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => {
      const s = useWeekendCarousel("teamList", "senior");
      const pick = useRoundPick(s, "teamList", "senior");
      return { s, pick };
    },
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.s.orderedPicks).toHaveLength(6));
  return hook;
}

const ticked = (h: Awaited<ReturnType<typeof mount>>) =>
  h.result.current.s.selected.map((f) => f.id).sort((a, b) => a - b);

describe("Use dates instead keeps the admin's ticks", () => {
  it("never re-ticks an unticked game, either way", async () => {
    const h = await mount();
    expect(ticked(h)).toEqual([1, 2, 3, 4, 5, 6]);
    act(() => h.result.current.s.togglePick(3));
    expect(ticked(h)).toEqual([1, 2, 4, 5, 6]);

    // Dates: all 25 games show, and only the admin's five are ticked.
    act(() => h.result.current.pick.setMode("dates"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(25));
    expect(ticked(h)).toEqual([1, 2, 4, 5, 6]);

    // A game ticked by hand in dates mode stays ticked while there.
    act(() => h.result.current.s.togglePick(20));
    expect(ticked(h)).toEqual([1, 2, 4, 5, 6, 20]);

    // Back to rounds: Round 4 again, still without game 3.
    act(() => h.result.current.pick.setMode("rounds"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(6));
    expect(ticked(h)).toEqual([1, 2, 4, 5, 6]);

    // And to dates once more: every tick as the admin left it.
    act(() => h.result.current.pick.setMode("dates"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(25));
    expect(ticked(h)).toEqual([1, 2, 4, 5, 6, 20]);
  });

  it("never ticks past the maximum on its own", async () => {
    const h = await mount();
    act(() => h.result.current.s.togglePick(2));
    // Round 5 brings 19 more games: they fill up to the maximum and no further.
    act(() => h.result.current.pick.toggle("r:round 5"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(25));
    expect(ticked(h)).toHaveLength(MAX_CAROUSEL_GAMES);
    expect(ticked(h)).not.toContain(2);
    expect(ticked(h).slice(0, 5)).toEqual([1, 3, 4, 5, 6]);

    // Dates over the same games: the same ticks, nothing added.
    const before = ticked(h);
    act(() => h.result.current.pick.setMode("dates"));
    await waitFor(() => expect(h.result.current.s.onlyIds).toBeNull());
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(25));
    expect(ticked(h)).toEqual(before);
  });

  it("keeps the ticks when the dates change in dates mode, adding only new games", async () => {
    const h = await mount();
    act(() => h.result.current.s.togglePick(1));
    act(() => h.result.current.pick.setMode("dates"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(25));
    // Narrow to Saturday 7 Nov: game 1 stays unticked, the admin's others stay ticked.
    act(() => h.result.current.s.setTo("2026-11-07"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(13));
    expect(ticked(h)).toEqual([3, 5]);
    // Widen again: Sunday's games already seen keep their ticks (2, 4, 6 ticked, Round 5's not).
    act(() => h.result.current.s.setTo("2026-11-08"));
    await waitFor(() => expect(h.result.current.s.orderedPicks).toHaveLength(25));
    expect(ticked(h)).toEqual([2, 3, 4, 5, 6]);
  });
});
