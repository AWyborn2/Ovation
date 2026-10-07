import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const fixtures = [
  { id: 1, grade: "A Grade", opponentName: "Mandurah", startAt: "2025-11-08T02:00:00Z", isHome: true, source: "manual", createdAt: "" },
  { id: 2, grade: "B Grade", opponentName: "Rockingham", startAt: "2025-11-08T02:00:00Z", isHome: false, source: "manual", createdAt: "" },
];
const mutateAsync = vi.fn(async () => new Blob(["png"]));
const download = vi.fn(async () => {});

vi.mock("@workspace/api-client-react", () => ({
  useGetWeekendCarouselSources: (p: { from: string }) => ({
    data: {
      timeZone: "Australia/Perth",
      fixtures: p.from === "2025-11-07" ? fixtures : [],
      photos: [],
      warnings: ["PlayHQ status could not be checked for 1 fixture"],
    },
    isLoading: false,
    isError: false,
  }),
  getGetWeekendCarouselSourcesQueryKey: (p: unknown) => ["sources", p],
  useGetSocialSettings: () => ({ data: { settings: {} }, isLoading: false, isError: false }),
  getGetSocialSettingsQueryKey: () => ["settings"],
  useCreateCardRenderStill: () => ({ mutateAsync }),
}));
vi.mock("@/components/pack-card", () => ({ PackCard: () => <div data-testid="pack-card" /> }));
vi.mock("./export", () => ({ downloadWeekendZip: download }));
vi.mock("./model", () => ({
  CLUB_TIME_ZONE: "Australia/Perth",
  weekendRange: () => ({ from: "2025-11-07", to: "2025-11-09" }),
  eligiblePhotos: () => [],
  createTeamSlides: (fx: { id: number }[]) =>
    fx.map((fixture) => ({ fixture, photoId: null, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 } })),
  buildWeekendSlides: (teams: { fixture: { id: number } }[]) => [
    { id: "title", label: "Title", input: {}, data: {}, junior: false, sponsorsOn: false, warnings: [] },
    ...teams.map((t) => ({ id: `t${t.fixture.id}`, label: `Team ${t.fixture.id}`, input: {}, data: {}, junior: false, sponsorsOn: false, warnings: ["No photo"] })),
  ],
  moveTeam: (t: unknown[], a: number, b: number) => {
    const n = [...t];
    const [m] = n.splice(a, 1);
    n.splice(b, 0, m);
    return n;
  },
}));

const { WeekendCarouselBody } = await import("./weekend-carousel");
const { Dialog, DialogContent } = await import("@/components/ui/dialog");

const mount = () =>
  render(
    <Dialog open>
      <DialogContent>
        <WeekendCarouselBody />
      </DialogContent>
    </Dialog>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WeekendCarousel", () => {
  it("selects every fixture by default and shows the Perth timezone", () => {
    mount();
    expect((screen.getByTestId("checkbox-fixture-1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("checkbox-fixture-2") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("text-timezone").textContent).toContain("Australia/Perth");
    expect(screen.getByTestId("list-source-warnings").textContent).toContain("PlayHQ status");
  });

  it("generates slides, exports with the selected size, and marks stale on selection change", async () => {
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    expect(screen.getAllByTestId("pack-card")).toHaveLength(3);
    expect(screen.getByTestId("text-no-sponsors")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-size-story"));
    fireEvent.click(screen.getByTestId("button-export-weekend"));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect((download.mock.calls[0] as unknown[])[1]).toBe("story");
    const renderFn = (download.mock.calls[0] as unknown[])[2] as (sl: unknown, sz: string) => Promise<Blob>;
    await renderFn({ input: {}, data: { photoTransform: { focalX: 0.3, focalY: 0.4, zoom: 2 } }, junior: false, sponsorsOn: true }, "story");
    const opts = (mutateAsync.mock.calls[0] as unknown as [{ data: { options: Record<string, unknown> } }])[0].data.options;
    expect(opts).toMatchObject({ size: "story", packId: "club-kit-v1", strictImages: true, adjustments: { photo: { story: { focalX: 0.3, focalY: 0.4, zoom: 2 } } } });

    fireEvent.click(screen.getByTestId("checkbox-fixture-2"));
    expect(screen.getByTestId("text-weekend-stale")).toBeTruthy();
    expect(screen.queryByTestId("button-export-weekend")).toBeNull();
  });

  it("reorders fixtures with accessible up/down controls", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Move B Grade at Rockingham up"));
    const rows = screen.getAllByTestId(/^row-fixture-/);
    expect(rows[0].getAttribute("data-testid")).toBe("row-fixture-2");
  });
});
