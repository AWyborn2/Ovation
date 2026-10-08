import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

const fixtures = [
  { id: 1, grade: "A Grade", opponentName: "Mandurah", startAt: "2025-11-08T02:00:00Z", isHome: true, source: "manual", createdAt: "" },
  { id: 2, grade: "B Grade", opponentName: "Rockingham", startAt: "2025-11-08T02:00:00Z", isHome: false, source: "manual", createdAt: "" },
];
const mutateAsync = vi.fn(async (_request: unknown) => ({ id: 123, status: "awaiting_review" }));
const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));
const queuedRequest = () => mutateAsync.mock.calls[0][0] as {
  data: { caption: string; cardInput: { weekendCarousel: { size: string; submissionId: string; slides: { id: string; data: unknown }[] } } };
};
const coverPhoto = { id: 10, grade: null, season: 2026, photoTypes: ["team"], url: "/cover.jpg", thumbUrl: "/cover-thumb.jpg" };
let coverPhotos = [coverPhoto];
let teamPhotos: { id: number; grade: string; photoTypes: string[]; url: string }[] = [];
const refetch = vi.fn(async () => ({ data: { coverPhotos }, isError: false }));

vi.mock("@workspace/api-client-react", () => ({
  useGetWeekendCarouselSources: (p: { from: string }) => ({
    data: {
      timeZone: "Australia/Perth",
      fixtures: p.from === "2025-11-07" ? fixtures : [],
      photos: teamPhotos,
      coverPhotos,
      warnings: ["PlayHQ status could not be checked for 1 fixture"],
    },
    isLoading: false,
    isError: false,
    refetch,
  }),
  getGetWeekendCarouselSourcesQueryKey: (p: unknown) => ["sources", p],
  useGetSocialSettings: () => ({ data: { settings: {}, activeSponsors: [] }, isLoading: false, isError: false }),
  getGetSocialSettingsQueryKey: () => ["settings"],
  useCreateSocialDraft: () => ({ mutateAsync }),
  getListSocialDraftsQueryKey: () => ["drafts"],
  getGetPendingSocialDraftCountQueryKey: () => ["pending"],
}));
vi.mock("@/components/pack-card", () => ({ PackCard: ({ data }: { data: unknown }) => <div data-testid="pack-card" data-card={JSON.stringify(data)} /> }));
vi.mock("./model", async (importOriginal) => ({
  ...await importOriginal<typeof import("./model")>(),
  weekendRange: () => ({ from: "2025-11-07", to: "2025-11-09" }),
}));

const { WeekendCarouselBody, WeekendCarousel } = await import("./weekend-carousel");
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
  coverPhotos = [coverPhoto];
  teamPhotos = [];
});

describe("WeekendCarousel", () => {
  it("opens a full-screen editor", () => {
    render(<WeekendCarousel />);
    fireEvent.click(screen.getByTestId("button-open-weekend-carousel"));
    expect(screen.getByTestId("weekend-fullscreen-editor")).toHaveClass("h-[100dvh]", "w-full", "max-w-none");
  });

  it("edits each team's photo beside its live preview and queues the same crop", async () => {
    teamPhotos = [{ id: 11, grade: "A Grade", photoTypes: ["batting"], url: "/team.jpg" }];
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    const editor = within(screen.getByTestId("team-1"));
    expect(editor.getByTestId("slide-fixture-1")).toBeTruthy();
    fireEvent.click(editor.getByTestId("button-photo-1-11"));
    fireEvent.change(editor.getByLabelText("A Grade horizontal"), { target: { value: "0.25" } });
    fireEvent.change(editor.getByLabelText("A Grade vertical"), { target: { value: "0.75" } });
    fireEvent.change(editor.getByLabelText("A Grade zoom"), { target: { value: "1.8" } });
    const preview = () => JSON.parse(editor.getByTestId("pack-card").getAttribute("data-card")!);
    expect(preview()).toMatchObject({ photoUrl: "/team.jpg", photoTransform: { focalX: .25, focalY: .75, zoom: 1.8 } });
    fireEvent.click(screen.getByTestId("button-size-portrait"));
    expect(preview().photoTransform.zoom).toBe(1.8);
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const slides = queuedRequest().data.cardInput.weekendCarousel.slides;
    expect(slides.find(sl => sl.id === "fixture-1")?.data).toEqual(preview());
    await waitFor(() => expect(editor.getByRole("button", { name: "Reset" })).not.toBeDisabled());
    fireEvent.click(editor.getByRole("button", { name: "Reset" }));
    expect(preview().photoTransform).toEqual({ focalX: .5, focalY: .5, zoom: 1 });
    fireEvent.click(editor.getByTestId("button-no-photo-1"));
    expect(editor.queryByLabelText("A Grade zoom")).toBeNull();
    expect(preview().photoUrl).toBeNull();
  });
  it("selects every fixture by default and shows the Perth timezone", () => {
    mount();
    expect((screen.getByTestId("checkbox-fixture-1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("checkbox-fixture-2") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("text-timezone").textContent).toContain("Australia/Perth");
    expect(screen.getByTestId("list-source-warnings").textContent).toContain("PlayHQ status");
  });

  it("queues one carousel with an editable caption and size, then blocks duplicate submissions", async () => {
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    expect(screen.getAllByTestId("pack-card")).toHaveLength(4);
    expect(screen.getByTestId("text-no-sponsors")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-size-story"));
    expect((screen.getByTestId("input-weekend-caption") as HTMLTextAreaElement).value).toContain("A Grade v Mandurah");
    fireEvent.change(screen.getByTestId("input-weekend-caption"), { target: { value: "Match day! Come support our teams." } });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(screen.getByTestId("status-weekend-queued")).toBeTruthy());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(queuedRequest().data.caption).toBe("Match day! Come support our teams.");
    expect(queuedRequest().data.cardInput.weekendCarousel.size).toBe("story");
    expect(queuedRequest().data.cardInput.weekendCarousel.slides.map(s => s.id)).toEqual(["title", "fixture-1", "fixture-2", "sponsors"]);
    expect(screen.getByTestId("button-queue-weekend")).toBeDisabled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drafts"] });
    expect(screen.getByRole("link", { name: "View in review queue" })).toHaveAttribute("href", "/admin/social/queue?draft=123");

    fireEvent.click(screen.getByTestId("checkbox-fixture-2"));
    expect(screen.getByTestId("text-weekend-stale")).toBeTruthy();
    expect(screen.queryByTestId("button-queue-weekend")).toBeNull();
  });

  it("reorders fixtures with accessible up/down controls", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Move B Grade at Rockingham up"));
    const rows = screen.getAllByTestId(/^row-fixture-/);
    expect(rows[0].getAttribute("data-testid")).toBe("row-fixture-2");
  });
  it("keeps cover and crop through title, size, order, regeneration and queueing; supports removal", async () => {
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    fireEvent.click(screen.getByTestId("button-cover-photo-10"));
    fireEvent.change(screen.getByLabelText("Cover horizontal"), { target: { value: "0.2" } });
    fireEvent.change(screen.getByLabelText("Cover vertical"), { target: { value: "0.7" } });
    fireEvent.change(screen.getByLabelText("Cover zoom"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("input-weekend-title"), { target: { value: "Our weekend" } });
    fireEvent.click(screen.getByTestId("button-size-story"));
    fireEvent.click(screen.getAllByLabelText("Move B Grade at Rockingham up")[1]);
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    const getCover = () => JSON.parse(screen.getAllByTestId("pack-card")[0].getAttribute("data-card")!);
    expect(getCover()).toMatchObject({ photoUrl: "/cover.jpg", photoTransform: { focalX: .2, focalY: .7, zoom: 2 } });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(refetch).toHaveBeenCalledTimes(1);
    const slides = queuedRequest().data.cardInput.weekendCarousel.slides;
    expect(slides[0].data).toEqual(getCover());
    await waitFor(() => expect((screen.getByTestId("button-no-cover-photo") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-no-cover-photo"));
    expect(getCover().photoUrl).toBeUndefined();
  });
  it("stops queueing when fresh source data no longer permits the selected cover", async () => {
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    fireEvent.click(screen.getByTestId("button-cover-photo-10"));
    refetch.mockResolvedValueOnce({ data: { coverPhotos: [] }, isError: false });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(screen.getByTestId("text-queue-error").textContent).toContain("no longer available"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
  it("shows an actionable empty state without preventing no-photo queueing", async () => {
    coverPhotos = [];
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    expect(screen.getByTestId("text-no-cover-photos").textContent).toContain("Season 2026");
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });
  it("keeps selections after an error and reuses the same submission ID on retry", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
    mount();
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(screen.getByTestId("text-queue-error")).toHaveTextContent("Network unavailable"));
    const firstId = queuedRequest().data.cardInput.weekendCarousel.submissionId;
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(screen.getByTestId("status-weekend-queued")).toBeTruthy());
    const second = mutateAsync.mock.calls[1][0] as ReturnType<typeof queuedRequest>;
    expect(second.data.cardInput.weekendCarousel.submissionId).toBe(firstId);
  });
});
