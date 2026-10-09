import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { ClubPhoto, Fixture, WeekendCarouselSources, SocialSettingsBundle } from "@workspace/api-client-react";
import { invalidateTeamListCarouselSources } from "@/lib/team-list-carousel-cache";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";

const api = vi.hoisted(() => ({ sources: vi.fn(), settings: vi.fn(), queue: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  useGetWeekendCarouselSources: (params: unknown) => useQuery({
    queryKey: ["/api/weekend-carousel/sources", params], queryFn: api.sources,
  }),
  getGetWeekendCarouselSourcesQueryKey: (params?: unknown) =>
    ["/api/weekend-carousel/sources", ...(params ? [params] : [])],
  useGetSocialSettings: () => useQuery({ queryKey: ["settings"], queryFn: api.settings }),
  getGetSocialSettingsQueryKey: () => ["settings"],
  useCreateSocialDraft: () => ({ mutateAsync: api.queue }),
  getListSocialDraftsQueryKey: () => ["drafts"],
  getGetPendingSocialDraftCountQueryKey: () => ["pending"],
}));

const { useWeekendCarousel } = await import("./use-weekend-carousel");
const fixtures = [
  { id: 1, grade: "A Grade", roundLabel: "5", opponentName: "Visitors", startAt: "2026-10-10T02:00:00Z", venue: "Oval" },
  { id: 2, grade: "B Grade", roundLabel: "5", opponentName: "Visitors", startAt: "2026-10-10T02:00:00Z", venue: "Oval" },
] as Fixture[];
const photoDefaults = { thumbUrl: "", width: 100, height: 100, takenAt: null,
  createdAt: "2026-10-01T00:00:00Z", playerIds: [], matchFormat: null };
const photos: ClubPhoto[] = [
  { ...photoDefaults, id: 10, grade: "A Grade", season: 2026, photoTypes: ["batting"], url: "/a.jpg" },
  { ...photoDefaults, id: 11, grade: "A Grade", season: 2026, photoTypes: ["bowling"], url: "/a2.jpg" },
];
const source = (number: string | null = "36", enabled = true): WeekendCarouselSources => ({
  fixtures, photos, coverPhotos: [], timeZone: "Australia/Perth", warnings: [],
  content: Object.fromEntries(fixtures.map(f => [f.id, {
    kind: "teamList", grade: f.grade, ...(enabled ? { numbering: "shirt" } : {}),
    players: [{ order: 1, surname: "SMITH", role: "C/WK", ...(number && enabled ? { shirtNumber: number } : {}) },
      { order: 2, surname: "UNNUMBERED" }],
  }])),
}) as WeekendCarouselSources;
const bundle = { settings: {}, activeSponsors: [] } as unknown as SocialSettingsBundle;
const clients: QueryClient[] = [];
const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useWeekendCarousel("teamList"), { wrapper });
  await waitFor(() => expect(hook.result.current.selected).toHaveLength(2));
  return { ...hook, client };
};
const teamInput = (hook: Awaited<ReturnType<typeof mount>>) =>
  hook.result.current.slides[1].input as { numbering?: string; players: { shirtNumber?: string; order: number }[] };
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.resetAllMocks(); });

describe("fresh playing numbers in carousel previews", () => {
  const setup = () => {
    api.sources.mockResolvedValue(source());
    api.settings.mockResolvedValue(bundle);
    api.queue.mockResolvedValue({ id: 123 });
  };

  it("carries all recovered Held numbers from fresh sources into every pack and the frozen queue item", async () => {
    setup();
    const hook = await mount();
    const fresh = source(null);
    const recovered = ["77", "18", "39", "102", "75", "105"];
    fresh.content![1] = {
      kind: "teamList", grade: "A Grade", numbering: "shirt",
      players: [...recovered.map((shirtNumber, i) => ({
        order: i === 5 ? 12 : i + 1, surname: `HELD${i}`, shirtNumber,
      })), { order: 6, surname: "UNNUMBERED" }],
    };
    api.sources.mockResolvedValue(fresh);
    await act(() => hook.result.current.generate());
    for (const pack of CAROUSEL_PACK_IDS) {
      act(() => hook.result.current.setPackId(pack));
      expect(teamInput(hook).players.slice(0, 6).map(p => p.shirtNumber)).toEqual(recovered);
      expect(teamInput(hook).players[6]).not.toHaveProperty("shirtNumber");
    }
    await act(() => hook.result.current.runQueue());
    const saved = api.queue.mock.calls[0][0].data.cardInput.weekendCarousel;
    expect(saved.slides[1].input).toEqual({ ...fresh.content![1], carouselContent: true });
    api.sources.mockResolvedValue(source(null));
    await act(() => hook.result.current.generate());
    expect(saved.slides[1].input.players.slice(0, 6).map((p: { shirtNumber: string }) => p.shirtNumber)).toEqual(recovered);
  });

  it("fetches another admin's edit even with an infinitely fresh local cache, then queues the same numbers", async () => {
    setup();
    const hook = await mount();
    api.sources.mockResolvedValue(source("88"));
    await act(() => hook.result.current.generate());
    expect(teamInput(hook).players[0].shirtNumber).toBe("88");
    expect(teamInput(hook).players[1]).not.toHaveProperty("shirtNumber");
    expect(hook.result.current.stale).toBe(false);
    for (const pack of CAROUSEL_PACK_IDS) {
      act(() => hook.result.current.setPackId(pack));
      expect(teamInput(hook).players[0].shirtNumber).toBe("88");
    }
    await act(() => hook.result.current.runQueue());
    const saved = api.queue.mock.calls[0][0].data.cardInput.weekendCarousel;
    expect(saved.slides[1].input.players[0].shirtNumber).toBe("88");
    api.sources.mockResolvedValue(source("99"));
    await act(() => invalidateTeamListCarouselSources(hook.client));
    await waitFor(() => expect(hook.result.current.stale).toBe(true));
    expect(hook.result.current.canQueue).toBe(false);
    expect(saved.slides[1].input.players[0].shirtNumber).toBe("88");
    expect(teamInput(hook).players[0].shirtNumber).toBe("88");
  });

  it("marks a register-invalidated preview stale and regenerates without losing photo/crop/order/pack choices", async () => {
    setup();
    const hook = await mount();
    await act(() => hook.result.current.generate());
    act(() => {
      hook.result.current.patchTeam(0, { photoId: 11, transform: { focalX: .2, focalY: .7, zoom: 1.8 } });
      hook.result.current.moveTeamAt(0, 1);
      hook.result.current.setPackId("gold-foil-v1");
      hook.result.current.setSize("story");
      hook.result.current.setCaption("Keep this caption");
    });
    api.sources.mockResolvedValue(source("88"));
    await act(() => invalidateTeamListCarouselSources(hook.client));
    await waitFor(() => expect(hook.result.current.stale).toBe(true));
    await act(() => hook.result.current.generate());
    expect(hook.result.current.stale).toBe(false);
    expect(hook.result.current.generated?.teams.map(t => t.fixture.id)).toEqual([2, 1]);
    expect(hook.result.current.generated?.teams[1]).toMatchObject({
      photoId: 11, transform: { focalX: .2, focalY: .7, zoom: 1.8 },
      input: { players: [{ shirtNumber: "88" }, {}] },
    });
    expect(hook.result.current.packId).toBe("gold-foil-v1");
    expect(hook.result.current.size).toBe("story");
    expect(hook.result.current.caption).toBe("Keep this caption");
  });

  it("refreshes disabled/unnumbered inputs without restoring old shirt numbers", async () => {
    setup();
    const hook = await mount();
    await act(() => hook.result.current.generate());
    api.sources.mockResolvedValue(source(null));
    await act(() => hook.result.current.generate());
    expect(teamInput(hook).numbering).toBe("shirt");
    expect(teamInput(hook).players[0]).not.toHaveProperty("shirtNumber");
    api.sources.mockResolvedValue(source("88", false));
    await act(() => hook.result.current.generate());
    expect(teamInput(hook)).not.toHaveProperty("numbering");
    expect(teamInput(hook).players[0]).not.toHaveProperty("shirtNumber");
  });
  it("retains selected teams and an explicit no-photo choice when sources gain another team", async () => {
    setup();
    const hook = await mount();
    act(() => hook.result.current.togglePick(2));
    await act(() => hook.result.current.generate());
    act(() => hook.result.current.patchTeam(0, { photoId: null }));
    api.sources.mockResolvedValue({
      ...source("88"), fixtures: [...fixtures, { ...fixtures[0], id: 3 }],
      content: { ...source("88").content, 3: source("88").content![1] },
    });
    await act(() => hook.result.current.generate());
    await waitFor(() => expect(hook.result.current.orderedPicks).toHaveLength(3));
    expect(hook.result.current.selected.map(f => f.id)).toEqual([1]);
    expect(hook.result.current.generated?.teams[0].photoId).toBeNull();
    expect(hook.result.current.stale).toBe(false);
  });

  it.each(["sources", "settings"] as const)("does not generate from stale data when refreshing %s fails; retry works", async failing => {
    setup();
    const hook = await mount();
    await act(() => hook.result.current.generate());
    api[failing].mockRejectedValueOnce(new Error("Offline"));
    await act(() => hook.result.current.generate());
    expect(hook.result.current.generationError).toContain("Could not refresh");
    expect(hook.result.current.stale).toBe(true);
    expect(hook.result.current.canQueue).toBe(false);
    expect(teamInput(hook).players[0].shirtNumber).toBe("36");
    api.sources.mockResolvedValue(source("88"));
    await act(() => hook.result.current.generate());
    expect(hook.result.current.generationError).toBeNull();
    expect(teamInput(hook).players[0].shirtNumber).toBe("88");
  });

  it("locks composition changes while refreshing and coalesces double generation", async () => {
    setup();
    const hook = await mount();
    let finish!: (value: WeekendCarouselSources) => void;
    api.sources.mockReturnValueOnce(new Promise<WeekendCarouselSources>(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.generate(); });
    expect(hook.result.current.generating).toBe(true);
    await act(async () => {
      hook.result.current.togglePick(1);
      hook.result.current.changeType("results");
      await hook.result.current.generate();
    });
    expect(hook.result.current.selected).toHaveLength(2);
    expect(hook.result.current.setType).toBe("teamList");
    await act(async () => { finish(source("88")); await pending; });
    expect(api.sources).toHaveBeenCalledTimes(2);
    expect(teamInput(hook).players[0].shirtNumber).toBe("88");
  });

  it("refuses to regenerate a removed source rather than reusing an old team list", async () => {
    setup();
    const hook = await mount();
    await act(() => hook.result.current.generate());
    api.sources.mockResolvedValue({ ...source(), fixtures: [fixtures[0]], content: { 1: source().content![1] } });
    await act(() => hook.result.current.generate());
    expect(hook.result.current.generationError).toContain("no longer available");
    expect(hook.result.current.canQueue).toBe(false);
    expect(hook.result.current.generated?.teams).toHaveLength(2);
  });
});
