import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import type * as Model from "./model";
import { matchDayFixtureContent } from "@workspace/scorecard/card-content";
import { sourcesFor } from "@/test/carousel-sources";

const fixtures = [
  {
    id: 1,
    grade: "A Grade",
    roundLabel: "5",
    opponentName: "Mandurah",
    startAt: "2025-11-08T02:00:00Z",
    isHome: true,
    source: "manual",
    createdAt: "",
  },
  {
    id: 2,
    grade: "B Grade",
    roundLabel: "R5",
    opponentName: "Rockingham",
    startAt: "2025-11-08T02:00:00Z",
    isHome: false,
    source: "manual",
    createdAt: "",
  },
];
const mutateAsync = vi.fn(async (_request: unknown) => ({ id: 123, status: "awaiting_review" }));
const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));
const queuedRequest = () =>
  mutateAsync.mock.calls[0][0] as {
    data: {
      packId: string;
      caption: string;
      cardInput: {
        weekendCarousel: {
          packId: string;
          size: string;
          submissionId: string;
          slides: { id: string; data: unknown }[];
        };
      };
    };
  };
const coverPhoto = {
  id: 10,
  grade: null,
  season: 2026,
  photoTypes: ["team"],
  url: "/cover.jpg",
  thumbUrl: "/cover-thumb.jpg",
};
let coverPhotos = [coverPhoto];
const stockPhoto = {
  ...coverPhoto,
  id: 77,
  season: null,
  photoTypes: [],
  juniorStock: true,
  playerIds: [],
  url: "/saved-stock.jpg",
  thumbUrl: "/saved-stock-thumb.jpg",
};
let stockPhotos: Array<typeof stockPhoto> = [];
let teamPhotos: { id: number; grade: string; photoTypes: string[]; url: string }[] = [];
/** The server's automatic Match Day photos (ADR-010 P4); undefined = none sent. */
let photoPicks: { cover: number | null; fixtures: Record<string, number | null> } | undefined;
const summary = {
  kind: "matchSummary",
  matchTitle: "A Grade • Round 5",
  result: "Won by 40 runs",
  club: { name: "Our Club" },
  opposition: { name: "Visitors" },
  innings: [
    {
      teamKey: "club",
      totalRuns: "200",
      wickets: "6",
      overs: "40",
      inningsNum: 1,
      topBatters: [{ name: "Smith", runs: 80 }],
      topBowlers: [{ name: "Jones", wickets: 3, runs: 20, overs: "8" }],
    },
  ],
};
const inputFor = (type: string) =>
  type === "teamList"
    ? {
        kind: "teamList",
        grade: "A Grade",
        venueDateTime: "Ground • Saturday",
        players: [{ surname: "SMITH", order: 1, role: "C/WK" }],
      }
    : { ...summary, carouselDetail: type === "matchSummary" };
let activeType = "matchDay";
let many = false;
/** Team list and result slides come from the server's content builders (ADR-010 P7). */
const content = () =>
  activeType === "matchDay"
    ? {}
    : sourcesFor(activeType as "teamList" | "results" | "matchSummary", fixtures, () =>
        inputFor(activeType),
      );
/** Match Day slides come from the server's content builder (ADR-010). */
const matchDayContent = (list: typeof fixtures) =>
  activeType === "matchDay"
    ? Object.fromEntries(
        list.map((f) => [
          f.id,
          matchDayFixtureContent({
            ...f,
            opponentLogoUrl: null,
            venue: null,
            startAt: new Date(f.startAt),
          }),
        ]),
      )
    : undefined;
const refetch = vi.fn(async (): Promise<{ data: Record<string, unknown>; isError: boolean }> => ({
  data: {
    fixtures,
    coverPhotos,
    photos: teamPhotos,
    juniorStockPhotos: stockPhotos,
    content: content(),
    matchDayContent: matchDayContent(fixtures),
    ...(activeType === "matchDay" && photoPicks ? { photoPicks } : {}),
  },
  isError: false,
}));
const settingsRefetch = vi.fn(async () => ({
  data: { settings: {}, activeSponsors: [] },
  isError: false,
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetWeekendCarouselSources: (p: { from: string; setType: string }) => {
    activeType = p.setType;
    const list =
      p.from === "2025-11-07"
        ? many
          ? Array.from({ length: 19 }, (_, i) => ({ ...fixtures[0], id: i + 1 }))
          : fixtures
        : [];
    return {
      data: {
        timeZone: "Australia/Perth",
        fixtures: list,
        content: content(),
        matchDayContent: matchDayContent(list),
        photos: teamPhotos,
        coverPhotos,
        juniorStockPhotos: stockPhotos,
        ...(activeType === "matchDay" && photoPicks ? { photoPicks } : {}),
        warnings: ["PlayHQ status could not be checked for 1 fixture"],
      },
      isLoading: false,
      isError: false,
      refetch,
    };
  },
  getGetWeekendCarouselSourcesQueryKey: (p: unknown) => ["sources", p],
  useGetSocialSettings: () => ({
    data: { settings: {}, activeSponsors: [] },
    isLoading: false,
    isError: false,
    refetch: settingsRefetch,
  }),
  getGetSocialSettingsQueryKey: () => ["settings"],
  useCreateSocialDraft: () => ({ mutateAsync }),
  getListSocialDraftsQueryKey: () => ["drafts"],
  getGetPendingSocialDraftCountQueryKey: () => ["pending"],
}));
vi.mock("@/components/pack-card", () => ({
  PackCard: ({ data, packId }: { data: unknown; packId: string }) => (
    <div data-testid="pack-card" data-pack={packId} data-card={JSON.stringify(data)} />
  ),
}));
vi.mock("./model", async (importOriginal) => ({
  ...(await importOriginal<typeof Model>()),
  weekendRange: () => ({ from: "2025-11-07", to: "2025-11-09" }),
  rangeForSet: () => ({ from: "2025-11-07", to: "2025-11-09" }),
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

it("lets admins choose juniors for match-day and team-list tiles without selecting senior teams", async () => {
  const junior = { ...fixtures[0], id: -2_000_000_001, grade: "Year 5" };
  fixtures.push(junior);
  try {
    mount();
    fireEvent.click(screen.getByTestId("button-carousel-audience-junior"));
    await waitFor(() => expect(screen.getByTestId(`checkbox-fixture-${junior.id}`)).toBeTruthy());
    expect(screen.queryByTestId("checkbox-fixture-1")).toBeNull();
    expect(screen.getByTestId("button-carousel-audience-junior")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByTestId("button-carousel-type-teamList"));
    await waitFor(() => expect(screen.getByTestId(`checkbox-fixture-${junior.id}`)).toBeTruthy());
    expect(screen.queryByTestId("checkbox-fixture-1")).toBeNull();
    expect(screen.getByText(/published list from Junior fixtures/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-carousel-audience-senior"));
    await waitFor(() => expect(screen.getByTestId("checkbox-fixture-1")).toBeTruthy());
    expect(screen.queryByTestId(`checkbox-fixture-${junior.id}`)).toBeNull();
  } finally {
    fixtures.pop();
  }
});

const generatePreview = async () => {
  fireEvent.click(screen.getByTestId("button-generate-weekend"));
  await waitFor(() => expect(screen.getByTestId("button-generate-weekend")).not.toBeDisabled());
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  coverPhotos = [coverPhoto];
  teamPhotos = [];
  stockPhotos = [];
  photoPicks = undefined;
  activeType = "matchDay";
  many = false;
});

describe("WeekendCarousel automatic photos (ADR-010 P4)", () => {
  const savedCarousel = () =>
    queuedRequest().data.cardInput.weekendCarousel as unknown as {
      contentOverride?: unknown;
      slides: Array<{ id: string; photoId: number | null; data: { photoUrl?: string | null } }>;
    };
  const slide = (id: string) => savedCarousel().slides.find((sl) => sl.id === id)!;

  it("starts on the auto picks and queues them with no override", async () => {
    teamPhotos = [
      { id: 20, grade: "A Grade", photoTypes: ["batting"], url: "/a20.jpg" },
      { id: 21, grade: "A Grade", photoTypes: ["bowling"], url: "/a21.jpg" },
    ];
    photoPicks = { cover: 10, fixtures: { "1": 20, "2": null } };
    mount();
    await generatePreview();
    expect(screen.getByTestId("auto-photo-1").textContent).toMatch(/Auto-picked/);
    expect(screen.getByTestId("auto-photo-2").textContent).toMatch(/club's colours/);
    expect(screen.getByTestId("auto-photo-cover").textContent).toMatch(/Auto-picked/);
    // The choices stay closed until the admin asks to swap.
    expect(screen.queryByTestId("button-photo-1-21")).toBeNull();
    expect(screen.queryByTestId("button-cover-photo-10")).toBeNull();
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(savedCarousel()).not.toHaveProperty("contentOverride");
    expect(slide("title").photoId).toBe(10);
    expect(slide("fixture-1")).toMatchObject({ photoId: 20, data: { photoUrl: "/a20.jpg" } });
    expect(slide("fixture-2").photoId).toBeNull();
  });

  it("saves a swap in the carousel override, and Use auto pick goes back", async () => {
    teamPhotos = [
      { id: 20, grade: "A Grade", photoTypes: ["batting"], url: "/a20.jpg" },
      { id: 21, grade: "A Grade", photoTypes: ["bowling"], url: "/a21.jpg" },
    ];
    photoPicks = { cover: 10, fixtures: { "1": 20, "2": null } };
    mount();
    await generatePreview();
    fireEvent.click(screen.getByTestId("button-swap-photo-1"));
    fireEvent.click(screen.getByTestId("button-photo-1-21"));
    expect(screen.getByTestId("auto-photo-1").textContent).toMatch(/Swapped photo/);
    fireEvent.click(screen.getByTestId("button-swap-photo-cover"));
    fireEvent.click(screen.getByTestId("button-no-cover-photo"));
    expect(screen.getByTestId("auto-photo-cover").textContent).toMatch(/Swapped to no photo/);
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(savedCarousel().contentOverride).toEqual({
      photos: { cover: null, fixtures: { "1": 21 } },
    });
    expect(slide("fixture-1").photoId).toBe(21);
    expect(slide("title").photoId).toBeNull();

    cleanup();
    mutateAsync.mockClear();
    mount();
    await generatePreview();
    fireEvent.click(screen.getByTestId("button-swap-photo-1"));
    fireEvent.click(screen.getByTestId("button-photo-1-21"));
    fireEvent.click(screen.getByTestId("button-use-auto-photo-1"));
    expect(screen.getByTestId("auto-photo-1").textContent).toMatch(/Auto-picked/);
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(savedCarousel()).not.toHaveProperty("contentOverride");
    expect(slide("fixture-1").photoId).toBe(20);
  });
});

describe("WeekendCarousel", () => {
  it("changes what this carousel shows without touching the club's setting, and saves the change", async () => {
    mount();
    await generatePreview();
    const panel = screen.getByTestId("weekend-content-panel");
    expect(panel.textContent).toContain("Club setting (Standard)");
    // Minimal for this carousel only: the round and crest switch off, core fields stay on.
    fireEvent.click(screen.getByTestId("weekend-content-preset-minimal"));
    expect(screen.getByTestId("weekend-content-field-fixture.round")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByTestId("weekend-content-field-fixture.venue")).toBeDisabled();
    // Then the round back on, on top of Minimal.
    fireEvent.click(screen.getByTestId("weekend-content-field-fixture.round"));
    expect(screen.getByTestId("weekend-content-panel").textContent).toContain(
      "Changed for this carousel",
    );
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const saved = queuedRequest().data.cardInput.weekendCarousel as unknown as {
      contentOverride: unknown;
      slides: Array<{ id: string; visibleFields: string[]; content: { roundLabel: string } }>;
    };
    expect(saved.contentOverride).toEqual({
      preset: "minimal",
      fields: { "fixture.round": true },
    });
    const fixtureSlide = saved.slides.find((sl) => sl.id === "fixture-1")!;
    expect(fixtureSlide.visibleFields).toContain("fixture.round");
    expect(fixtureSlide.visibleFields).not.toContain("fixture.oppositionCrest");
    expect(fixtureSlide.visibleFields).not.toContain("fixture.photo");
    // The content snapshot is whole; visibility decides what prints.
    expect(fixtureSlide.content.roundLabel).toBe("ROUND 5");
  });

  it("a Match Day override does not follow the admin to another set type", async () => {
    mount();
    await generatePreview();
    fireEvent.click(screen.getByTestId("weekend-content-preset-minimal"));
    fireEvent.click(screen.getByTestId("button-carousel-type-results"));
    await generatePreview();
    expect(screen.queryByTestId("weekend-content-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(queuedRequest().data.cardInput.weekendCarousel).not.toHaveProperty("contentOverride");
  });

  it("goes back to the club setting", async () => {
    mount();
    await generatePreview();
    fireEvent.click(screen.getByTestId("weekend-content-preset-full"));
    fireEvent.click(screen.getByTestId("weekend-content-reset"));
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(queuedRequest().data.cardInput.weekendCarousel).not.toHaveProperty("contentOverride");
  });

  it.each(["matchDay", "teamList", "results", "matchSummary"])(
    "offers upload and saves a stock image on senior team cards and the cover for %s",
    async (type) => {
      stockPhotos = [stockPhoto];
      mount();
      fireEvent.click(screen.getByTestId("button-carousel-audience-senior"));
      fireEvent.click(screen.getByTestId(`button-carousel-type-${type}`));
      expect(screen.getByLabelText("Upload carousel stock image")).not.toBeDisabled();
      await generatePreview();
      fireEvent.click(screen.getByRole("button", { name: "Use stock image 1 for all team cards" }));
      fireEvent.click(screen.getByTestId(`button-cover-photo-${stockPhoto.id}`));
      fireEvent.click(screen.getByTestId("button-queue-weekend"));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
      const saved = queuedRequest().data.cardInput.weekendCarousel;
      expect(saved).toMatchObject({ setType: type });
      expect(
        saved.slides
          .slice(0, -1)
          .every((slide) => (slide.data as { photoUrl?: string }).photoUrl === stockPhoto.url),
      ).toBe(true);
    },
  );
  it.each(["matchDay", "teamList", "results", "matchSummary"])(
    "switches every pack without resetting the %s composition",
    async (type) => {
      teamPhotos = [{ id: 20, grade: "A Grade", photoTypes: ["batting"], url: "/team.jpg" }];
      mount();
      fireEvent.click(screen.getByTestId(`button-carousel-type-${type}`));
      await generatePreview();
      fireEvent.click(screen.getByTestId("button-cover-photo-10"));
      fireEvent.change(screen.getByLabelText("Cover zoom"), { target: { value: "1.7" } });
      fireEvent.click(
        within(screen.getByTestId("team-1")).getByLabelText("Move A Grade vs Mandurah down"),
      );
      fireEvent.change(screen.getByTestId("input-weekend-caption"), {
        target: { value: "Keep my caption" },
      });
      const before = screen.getAllByTestId("pack-card").map((el) => el.getAttribute("data-card"));
      expect(screen.getByTestId("select-carousel-pack").querySelectorAll("option")).toHaveLength(
        CAROUSEL_PACK_IDS.length,
      );
      for (const packId of CAROUSEL_PACK_IDS) {
        fireEvent.change(screen.getByTestId("select-carousel-pack"), { target: { value: packId } });
        expect(
          screen.getAllByTestId("pack-card").map((el) => el.getAttribute("data-pack")),
        ).toEqual(Array(4).fill(packId));
        expect(
          screen.getAllByTestId("pack-card").map((el) => el.getAttribute("data-card")),
        ).toEqual(before);
        expect(screen.getByTestId("input-weekend-caption")).toHaveValue("Keep my caption");
        expect(screen.queryByTestId("text-weekend-stale")).toBeNull();
      }
      fireEvent.change(screen.getByTestId("select-carousel-pack"), {
        target: { value: "neon-night-v1" },
      });
      fireEvent.click(screen.getByTestId("button-queue-weekend"));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(queuedRequest().data.packId).toBe("neon-night-v1");
      expect(queuedRequest().data.cardInput.weekendCarousel.packId).toBe("neon-night-v1");
      expect(queuedRequest().data.cardInput.weekendCarousel.slides.map((s) => s.id)).toEqual([
        "title",
        "fixture-2",
        "fixture-1",
        "sponsors",
      ]);
      expect(queuedRequest().data.cardInput.weekendCarousel.slides[0].data).toMatchObject({
        photoTransform: { zoom: 1.7 },
      });
      // Version 2: the title saves its content snapshot (ADR-010), not a derived input.
      expect(queuedRequest().data.cardInput.weekendCarousel).toMatchObject({ version: 2 });
      expect(queuedRequest().data.cardInput.weekendCarousel.slides[0]).toMatchObject({
        content: { page: "title", roundLabel: "ROUND 5" },
      });
      expect(queuedRequest().data.cardInput.weekendCarousel.slides[0]).not.toHaveProperty("input");
      fireEvent.change(screen.getByTestId("select-carousel-pack"), {
        target: { value: "sunset-v1" },
      });
      expect(screen.getByTestId("button-queue-weekend")).not.toBeDisabled();
    },
  );
  it.each(["teamList", "results", "matchSummary"])(
    "queues an ordered frozen %s set with its own caption and type",
    async (type) => {
      mount();
      fireEvent.click(screen.getByTestId(`button-carousel-type-${type}`));
      fireEvent.click(screen.getByLabelText("Move B Grade at Rockingham up"));
      await generatePreview();
      const caption = screen.getByTestId("input-weekend-caption") as HTMLTextAreaElement;
      expect(caption.value).toContain(type === "teamList" ? "SMITH (C/WK)" : "Won by 40 runs");
      fireEvent.change(caption, { target: { value: `Edited ${type} caption` } });
      fireEvent.click(screen.getByTestId("button-size-landscape"));
      fireEvent.click(screen.getByTestId("button-queue-weekend"));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
      const request = queuedRequest().data;
      expect(request.caption).toBe(`Edited ${type} caption`);
      expect(request.cardInput.weekendCarousel).toMatchObject({ setType: type, size: "landscape" });
      expect(request.cardInput.weekendCarousel.slides[0]).toMatchObject({
        content: { page: "title", roundLabel: "ROUND 5" },
      });
      expect(request.cardInput.weekendCarousel.slides.map((s) => s.id)).toEqual([
        "title",
        "fixture-2",
        "fixture-1",
        "sponsors",
      ]);
      // Version 2: the slide saves its content snapshot (ADR-010 P7), not a derived input.
      const slide = request.cardInput.weekendCarousel.slides[1];
      expect(slide).not.toHaveProperty("input");
      expect(slide).toMatchObject({
        content: {
          kind: type,
          page: type === "teamList" ? "team" : "result",
          source: { kind: inputFor(type).kind },
        },
        visibleFields: expect.arrayContaining([
          type === "teamList" ? "team.photo" : "result.photo",
        ]),
      });
    },
  );
  it("blocks a changed source at submission rather than queuing stale results", async () => {
    mount();
    fireEvent.click(screen.getByTestId("button-carousel-type-results"));
    await generatePreview();
    refetch.mockResolvedValueOnce({
      data: { fixtures, coverPhotos, photos: [], juniorStockPhotos: [], content: {} },
      isError: false,
    });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() =>
      expect(screen.getByTestId("text-queue-error")).toHaveTextContent("Regenerate"),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });
  it("shows the selection limit without silently dropping any teams", () => {
    many = true;
    mount();
    expect(screen.getAllByTestId(/^checkbox-fixture-/)).toHaveLength(19);
    expect(screen.getByTestId("button-generate-weekend")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("19 selected");
  });
  it("shows refresh loading and failure without creating a preview from cached data, then allows retry", async () => {
    mount();
    let finish!: () => void;
    refetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          finish = () => reject(new Error("Source refresh unavailable. Retry generating."));
        }),
    );
    fireEvent.click(screen.getByTestId("button-generate-weekend"));
    expect(screen.getByTestId("button-generate-weekend")).toHaveTextContent("Refreshing sources");
    expect(screen.getByTestId("button-generate-weekend")).toBeDisabled();
    expect(screen.getByTestId("select-carousel-pack")).toBeDisabled();
    expect(screen.getByTestId("checkbox-fixture-1")).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(screen.getByTestId("text-generation-error")).toHaveTextContent("Retry generating"),
    );
    expect(screen.queryByTestId("pack-card")).toBeNull();
    expect(screen.queryByTestId("button-queue-weekend")).toBeNull();
    await generatePreview();
    expect(screen.queryByTestId("text-generation-error")).toBeNull();
    expect(screen.getAllByTestId("pack-card")).toHaveLength(4);
  });
  it("opens a full-screen editor", () => {
    render(<WeekendCarousel />);
    fireEvent.click(screen.getByTestId("button-open-weekend-carousel"));
    expect(screen.getByTestId("weekend-fullscreen-editor")).toHaveClass(
      "h-[100dvh]",
      "w-full",
      "max-w-none",
    );
  });

  it("edits each team's photo beside its live preview and queues the same crop", async () => {
    teamPhotos = [{ id: 11, grade: "A Grade", photoTypes: ["batting"], url: "/team.jpg" }];
    mount();
    await generatePreview();
    const editor = within(screen.getByTestId("team-1"));
    expect(editor.getByTestId("slide-fixture-1")).toBeTruthy();
    fireEvent.click(editor.getByTestId("button-photo-1-11"));
    fireEvent.change(editor.getByLabelText("A Grade horizontal"), { target: { value: "0.25" } });
    fireEvent.change(editor.getByLabelText("A Grade vertical"), { target: { value: "0.75" } });
    fireEvent.change(editor.getByLabelText("A Grade zoom"), { target: { value: "1.8" } });
    const preview = () => JSON.parse(editor.getByTestId("pack-card").getAttribute("data-card")!);
    expect(preview()).toMatchObject({
      photoUrl: "/team.jpg",
      photoTransform: { focalX: 0.25, focalY: 0.75, zoom: 1.8 },
    });
    fireEvent.click(screen.getByTestId("button-size-portrait"));
    expect(preview().photoTransform.zoom).toBe(1.8);
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const slides = queuedRequest().data.cardInput.weekendCarousel.slides;
    expect(slides.find((sl) => sl.id === "fixture-1")?.data).toEqual(preview());
    await waitFor(() => expect(editor.getByRole("button", { name: "Reset" })).not.toBeDisabled());
    fireEvent.click(editor.getByRole("button", { name: "Reset" }));
    expect(preview().photoTransform).toEqual({ focalX: 0.5, focalY: 0.5, zoom: 1 });
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
    await generatePreview();
    expect(screen.getAllByTestId("pack-card")).toHaveLength(4);
    expect(screen.getByTestId("text-no-sponsors")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-size-story"));
    expect((screen.getByTestId("input-weekend-caption") as HTMLTextAreaElement).value).toContain(
      "A Grade v Mandurah",
    );
    fireEvent.change(screen.getByTestId("input-weekend-caption"), {
      target: { value: "Match day! Come support our teams." },
    });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(screen.getByTestId("status-weekend-queued")).toBeTruthy());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(queuedRequest().data.caption).toBe("Match day! Come support our teams.");
    expect(queuedRequest().data.cardInput.weekendCarousel.size).toBe("story");
    expect(queuedRequest().data.cardInput.weekendCarousel.slides.map((s) => s.id)).toEqual([
      "title",
      "fixture-1",
      "fixture-2",
      "sponsors",
    ]);
    expect(screen.getByTestId("button-queue-weekend")).toBeDisabled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["drafts"] });
    expect(screen.getByRole("link", { name: "View in review queue" })).toHaveAttribute(
      "href",
      "/admin/social/queue?draft=123",
    );

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
    await generatePreview();
    fireEvent.click(screen.getByTestId("button-cover-photo-10"));
    fireEvent.change(screen.getByLabelText("Cover horizontal"), { target: { value: "0.2" } });
    fireEvent.change(screen.getByLabelText("Cover vertical"), { target: { value: "0.7" } });
    fireEvent.change(screen.getByLabelText("Cover zoom"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("input-weekend-title"), {
      target: { value: "Our weekend" },
    });
    fireEvent.click(screen.getByTestId("button-size-story"));
    fireEvent.click(screen.getAllByLabelText("Move B Grade at Rockingham up")[1]);
    await generatePreview();
    const getCover = () =>
      JSON.parse(screen.getAllByTestId("pack-card")[0].getAttribute("data-card")!);
    expect(getCover()).toMatchObject({
      photoUrl: "/cover.jpg",
      photoTransform: { focalX: 0.2, focalY: 0.7, zoom: 2 },
    });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(refetch).toHaveBeenCalledTimes(3);
    const slides = queuedRequest().data.cardInput.weekendCarousel.slides;
    expect(slides[0].data).toEqual(getCover());
    await waitFor(() =>
      expect((screen.getByTestId("button-no-cover-photo") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByTestId("button-no-cover-photo"));
    expect(getCover().photoUrl).toBeUndefined();
  });
  it("stops queueing when fresh source data no longer permits the selected cover", async () => {
    mount();
    await generatePreview();
    fireEvent.click(screen.getByTestId("button-cover-photo-10"));
    refetch.mockResolvedValueOnce({
      data: { fixtures, coverPhotos: [], photos: [], juniorStockPhotos: [], content: {} },
      isError: false,
    });
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() =>
      expect(screen.getByTestId("text-queue-error").textContent).toContain("no longer available"),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });
  it("shows an actionable empty state without preventing no-photo queueing", async () => {
    coverPhotos = [];
    mount();
    await generatePreview();
    expect(screen.getByTestId("text-no-cover-photos").textContent).toContain("Season 2026");
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });
  it("keeps selections after an error and reuses the same submission ID on retry", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Network unavailable"));
    mount();
    await generatePreview();
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() =>
      expect(screen.getByTestId("text-queue-error")).toHaveTextContent("Network unavailable"),
    );
    const firstId = queuedRequest().data.cardInput.weekendCarousel.submissionId;
    fireEvent.click(screen.getByTestId("button-queue-weekend"));
    await waitFor(() => expect(screen.getByTestId("status-weekend-queued")).toBeTruthy());
    const second = mutateAsync.mock.calls[1][0] as ReturnType<typeof queuedRequest>;
    expect(second.data.cardInput.weekendCarousel.submissionId).toBe(firstId);
  });
});
